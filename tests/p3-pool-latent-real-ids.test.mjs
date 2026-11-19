// Found while verifying the merged app in a browser: stored collection keys are strings, but the real pool
// (data/characters.json) has numeric ids. The helper must match them, or every collected character vanishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectionForPool } from '../fixes/pool-latent.js';

const pool = JSON.parse(readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8'));

test('the real pool has numeric ids', () => assert.equal(typeof pool[0].id, 'number'));

test('a collected character from the real pool is kept (keys are strings after JSON round trip)', () => {
  const stored = JSON.parse(JSON.stringify({ [pool[0].id]: { svc: '53', first: 'd', last: 'd', rides: 1 } }));
  assert.deepEqual(Object.keys(collectionForPool(pool, stored)), [String(pool[0].id)]);
});

test('an id that is not in the real pool is still dropped from the view, and the input is not changed', () => {
  const stored = { [pool[0].id]: { rides: 1 }, 999999: { rides: 3 } };
  const view = collectionForPool(pool, stored);
  assert.deepEqual(Object.keys(view), [String(pool[0].id)]);
  assert.ok(stored['999999'], 'stored data must stay');
});
