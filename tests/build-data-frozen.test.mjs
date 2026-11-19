import test from 'node:test';
import assert from 'node:assert/strict';
import { runBuildData } from './helpers/build-data.mjs';

const frozen = '[{"id":1,"name":"Kept"}]';
const out = await runBuildData({ existingCharacters: frozen });

test('build-data never overwrites an existing character pool', () => {
  assert.deepEqual(out.characters, [{ id: 1, name: 'Kept' }]);
  assert.equal(out.requests.filter((r) => r.url.includes('anilist')).length, 0);
  assert.ok(out.logs.includes('data/characters.json exists, leaving it frozen'));
});
