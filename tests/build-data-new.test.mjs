import test from 'node:test';
import assert from 'node:assert/strict';
import { runBuildData } from './helpers/build-data.mjs';

const out = await runBuildData();

test('build-data writes the stop list', () => {
  assert.deepEqual(out.stops, { 10009: [103.8, 1.28, 'Bt Merah Int', 'Bt Merah Ctrl'] });
});

test('build-data creates a starter pool of 150 characters, skipping adult media', () => {
  assert.equal(out.characters.length, 150);
  assert.deepEqual(Object.keys(out.characters[0]), ['id', 'name']);
  assert.ok(out.characters.every((c) => ((c.id - 1) % 50) % 3 !== 0));
  const pages = out.requests.filter((r) => r.url.includes('anilist')).map((r) => JSON.parse(r.init.body).variables.page);
  assert.deepEqual(pages, [1, 2, 3, 4, 5]);
  assert.ok(out.logs.includes('characters: 150'));
});
