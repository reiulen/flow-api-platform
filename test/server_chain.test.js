import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { VideoChainInput, parse } from '../src/schemas.js';
import { AppError } from '../src/errors.js';

test('Server video chaining and media streaming endpoints', async (t) => {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-server-chain-test-'));
  const dummyVideo = path.join(testDir, 'chains', 'job_test123', 'master.mp4');
  fs.mkdirSync(path.dirname(dummyVideo), { recursive: true });
  fs.writeFileSync(dummyVideo, Buffer.alloc(1024, 0x42));

  const app = Fastify();

  // Media route identical to server.js
  app.get('/v1/media/chains/:jobId/:filename', async (request, reply) => {
    const { jobId, filename } = request.params;
    if (!/^job_[a-zA-Z0-9_-]+$/.test(jobId) && !/^[a-zA-Z0-9_-]{1,64}$/.test(jobId)) {
      throw new AppError(400, 'invalid_job_id', 'Job ID tidak valid');
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || filename.includes('..')) {
      throw new AppError(400, 'invalid_filename', 'Nama file tidak valid');
    }

    const filePath = path.resolve(testDir, 'chains', jobId, filename);
    if (!fs.existsSync(filePath)) {
      throw new AppError(404, 'file_not_found', 'File media rantai video tidak ditemukan');
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.mp4' ? 'video/mp4' : (ext === '.png' ? 'image/png' : 'application/octet-stream');

    if (ext === '.mp4') {
      const range = request.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        reply.raw.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        });
        fs.createReadStream(filePath, { start, end }).pipe(reply.raw);
        return reply;
      }
    }

    reply.header('Content-Type', contentType);
    reply.header('Content-Length', stat.size);
    reply.header('Accept-Ranges', 'bytes');
    return reply.send(fs.createReadStream(filePath));
  });

  await t.test('blocks path traversal attempt', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/media/chains/job_test123/..%2F..%2Fpasswd',
    });
    assert.ok(res.statusCode === 400 || res.statusCode === 404);
  });

  await t.test('returns 404 for missing media file', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/media/chains/job_test123/nonexistent.mp4',
    });
    assert.equal(res.statusCode, 404);
  });

  await t.test('serves full video file with correct headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/media/chains/job_test123/master.mp4',
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'video/mp4');
    assert.equal(res.headers['content-length'], '1024');
    assert.equal(res.headers['accept-ranges'], 'bytes');
  });

  await t.test('supports HTTP 206 Partial Content (Range request)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/media/chains/job_test123/master.mp4',
      headers: {
        range: 'bytes=0-499',
      },
    });
    assert.equal(res.statusCode, 206);
    assert.equal(res.headers['content-range'], 'bytes 0-499/1024');
    assert.equal(res.headers['content-length'], '500');
    assert.equal(res.headers['content-type'], 'video/mp4');
  });

  fs.rmSync(testDir, { recursive: true, force: true });
});
