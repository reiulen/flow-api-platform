import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenApiSpec, renderScalarHtml } from '../src/openapi.js';

test('createOpenApiSpec generates complete OpenAPI 3.1 structure', () => {
  const spec = createOpenApiSpec({ host: '127.0.0.1', port: 8787 });
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.info.title, 'Flow API Platform');
  assert.equal(spec.servers[0].url, '/');
  assert.equal(spec.servers[1].url, 'http://127.0.0.1:8787');

  // Verify tags
  const tags = spec.tags.map((t) => t.name);
  assert.ok(tags.includes('Generations'));
  assert.ok(tags.includes('Jobs'));
  assert.ok(tags.includes('Accounts'));
  assert.ok(tags.includes('Routing & Projects'));
  assert.ok(tags.includes('Flow Reads'));
  assert.ok(tags.includes('System'));

  // Verify paths
  const paths = Object.keys(spec.paths);
  assert.ok(paths.includes('/healthz'));
  assert.ok(paths.includes('/openapi.json'));
  assert.ok(paths.includes('/v1/images'));
  assert.ok(paths.includes('/v1/videos'));
  assert.ok(paths.includes('/v1/jobs'));
  assert.ok(paths.includes('/v1/jobs/{id}'));
  assert.ok(paths.includes('/v1/jobs/{id}/cancel'));
  assert.ok(paths.includes('/v1/accounts'));
  assert.ok(paths.includes('/v1/accounts/{id}'));
  assert.ok(paths.includes('/v1/accounts/{id}/setup'));
  assert.ok(paths.includes('/v1/accounts/{id}/setup/status'));
  assert.ok(paths.includes('/v1/accounts/{id}/credits/refresh'));
  assert.ok(paths.includes('/v1/accounts/{id}/verify'));
  assert.ok(paths.includes('/v1/routing'));
  assert.ok(paths.includes('/v1/project-bindings'));
  assert.ok(paths.includes('/v1/models'));
  assert.ok(paths.includes('/v1/credits'));
  assert.ok(paths.includes('/v1/projects'));
  assert.ok(paths.includes('/v1/projects/{id}/contents'));

  // Verify security schemes
  assert.ok(spec.components.securitySchemes.bearerAuth);
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');

  // Verify mutation endpoints have requestBody with schemas
  assert.ok(spec.paths['/v1/images'].post.requestBody);
  assert.ok(spec.paths['/v1/videos'].post.requestBody);
  assert.ok(spec.paths['/v1/accounts'].post.requestBody);
  assert.ok(spec.paths['/v1/accounts/{id}'].patch.requestBody);
  assert.ok(spec.paths['/v1/routing'].put.requestBody);
  assert.ok(spec.paths['/v1/project-bindings'].put.requestBody);
});

test('renderScalarHtml produces valid HTML with OpenAPI url', () => {
  const html = renderScalarHtml('/openapi.json', 'Custom Title');
  assert.ok(html.includes('<title>Custom Title</title>'));
  assert.ok(html.includes('data-url="/openapi.json"'));
  assert.ok(html.includes('@scalar/api-reference'));
});
