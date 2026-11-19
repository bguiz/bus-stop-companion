import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionForPool, selectedEntry } from '../fixes/pool-latent.js';
import { collectionStats, orderPool } from '../lib.js';

const pool = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const stored = {
  a: { first: '2026-01-02', rides: 2, svc: '10' },
  gone: { first: '2026-01-01', rides: 5, svc: '12' },
  c: { first: '2026-01-01', rides: 1, svc: '14' },
};

test('ids missing from the pool are excluded', () => {
  assert.deepEqual(Object.keys(collectionForPool(pool, stored)).sort(), ['a', 'c']);
});

test('stats count only pool ids', () => {
  const { met, rides } = collectionStats(collectionForPool(pool, stored));
  assert.equal(met, 2);
  assert.equal(rides, 3);
  assert.ok(met <= pool.length);
});

test('stored object is not mutated and the id returns with the pool', () => {
  const snapshot = JSON.parse(JSON.stringify(stored));
  collectionForPool(pool, stored);
  assert.deepEqual(stored, snapshot);
  const back = collectionForPool([...pool, { id: 'gone', name: 'G' }], stored);
  assert.equal(back.gone.rides, 5);
});

test('orderPool still works on the filtered collection', () => {
  assert.deepEqual(orderPool(pool, collectionForPool(pool, stored)).map((c) => c.id), ['c', 'a', 'b']);
});

test('selectedEntry returns null for a vanished id, entry otherwise', () => {
  assert.equal(selectedEntry(pool, 'gone'), null);
  assert.equal(selectedEntry(pool, null), null);
  assert.equal(selectedEntry(pool, 'b').name, 'B');
});
