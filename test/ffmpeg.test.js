import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { extractLastFrame, getVideoInfo, concatenateVideos } from '../src/ffmpeg.js';

test('FFmpeg helper operations', async (t) => {
  const sampleVideo = path.resolve('scratch/test_chain/test_input.mp4');
  if (!fs.existsSync(sampleVideo)) {
    t.skip('sample video does not exist');
    return;
  }

  const outDir = path.resolve('scratch/test_ffmpeg_out');
  fs.mkdirSync(outDir, { recursive: true });

  await t.test('getVideoInfo returns correct duration and dimensions', async () => {
    const info = await getVideoInfo(sampleVideo);
    assert.ok(info.duration > 0, 'duration should be greater than 0');
    assert.equal(info.width, 1280);
    assert.equal(info.height, 720);
    assert.equal(info.codec, 'h264');
  });

  await t.test('extractLastFrame produces a valid PNG', async () => {
    const outPng = path.join(outDir, 'unit_last_frame.png');
    if (fs.existsSync(outPng)) fs.unlinkSync(outPng);
    const result = await extractLastFrame(sampleVideo, outPng);
    assert.equal(result, outPng);
    assert.ok(fs.existsSync(outPng));
    assert.ok(fs.statSync(outPng).size > 10000);
  });

  await t.test('concatenateVideos joins two video clips into master', async () => {
    const outMaster = path.join(outDir, 'unit_master.mp4');
    if (fs.existsSync(outMaster)) fs.unlinkSync(outMaster);
    const masterInfo = await concatenateVideos([sampleVideo, sampleVideo], outMaster);
    assert.ok(fs.existsSync(outMaster));
    assert.ok(masterInfo.duration >= 15.5 && masterInfo.duration <= 16.5);
  });
});
