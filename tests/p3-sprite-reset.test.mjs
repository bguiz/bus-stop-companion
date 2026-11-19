import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSprites } from '../fixes/sprite-reset.js';

const bus = (key, x, y) => ({ key, x, y });
const seed = () => reconcileSprites(new Map(), null, 'A', [bus('12#0', 10, 20), bus('14#0', 5, 5)]).sprites;

test('same stop keeps sprites and updates targets', () => {
  const prev = seed();
  const old = prev.get('12#0');
  old.x = 3; old.y = 4;
  const r = reconcileSprites(prev, 'A', 'A', [bus('12#0', 50, 60)]);
  assert.equal(r.reset, false);
  assert.equal(r.sprites.get('12#0'), old);
  assert.deepEqual([old.x, old.y, old.tx, old.ty], [3, 4, 50, 60]);
});

test('different stop drops sprites so same service appears in place', () => {
  const prev = seed();
  const r = reconcileSprites(prev, 'A', 'B', [bus('12#0', 500, 600)]);
  assert.equal(r.reset, true);
  const s = r.sprites.get('12#0');
  assert.deepEqual([s.x, s.y, s.tx, s.ty], [500, 600, 500, 600]);
});

test('sprites for services no longer present are dropped', () => {
  const r = reconcileSprites(seed(), 'A', 'A', [bus('12#0', 1, 1)]);
  assert.deepEqual([...r.sprites.keys()], ['12#0']);
});

test('first update (no previous stop) is a reset', () => {
  assert.equal(reconcileSprites(new Map(), null, 'A', []).reset, true);
});
