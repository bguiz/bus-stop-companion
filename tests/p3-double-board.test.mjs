import test from 'node:test';
import assert from 'node:assert/strict';
import { recordBoarded, migrateCollection, collectionStats } from '../lib.js';

const T = 1_700_000_000_000;
const MIN = 60000;

test('first boarding is new and stores lastAt', () => {
  const r = recordBoarded({}, { id: 1, svc: '96' }, 'd', T);
  assert.equal(r.isNew, true); assert.equal(r.ignored, false);
  assert.equal(r.collection[1].lastAt, T);
});
test('repeat within 5 minutes is ignored', () => {
  const a = recordBoarded({}, { id: 1, svc: '96' }, 'd', T).collection;
  const r = recordBoarded(a, { id: 1, svc: '96' }, 'd', T + 4 * MIN + 59000);
  assert.equal(r.ignored, true); assert.equal(r.isNew, false);
  assert.equal(r.collection[1].rides, 1); assert.equal(r.collection[1].lastAt, T);
});
test('after 5 minutes it counts again', () => {
  const a = recordBoarded({}, { id: 1, svc: '96' }, 'd', T).collection;
  const r = recordBoarded(a, { id: 1, svc: '96' }, 'd', T + 5 * MIN);
  assert.equal(r.ignored, false); assert.equal(r.isNew, false);
  assert.equal(r.collection[1].rides, 2); assert.equal(r.collection[1].lastAt, T + 5 * MIN);
});
test('other characters are not affected', () => {
  const a = recordBoarded({}, { id: 1, svc: '96' }, 'd', T).collection;
  const r = recordBoarded(a, { id: 2, svc: '15' }, 'd', T + 1000);
  assert.equal(r.isNew, true); assert.equal(collectionStats(r.collection).rides, 2);
});
test('legacy entries without lastAt still count and gain lastAt', () => {
  const legacy = { 1: { svc: '96', first: 'a', last: 'a', rides: 3 } };
  const r = recordBoarded(legacy, { id: 1, svc: '96' }, 'b', T);
  assert.equal(r.ignored, false); assert.equal(r.collection[1].rides, 4); assert.equal(r.collection[1].lastAt, T);
  assert.deepEqual(legacy[1], { svc: '96', first: 'a', last: 'a', rides: 3 });
});
test('migrated entries remain valid and countable', () => {
  const m = migrateCollection({ 1: { svc: '96', first: 'a', rode: true } });
  assert.equal(recordBoarded(m, { id: 1, svc: '96' }, 'b', T).collection[1].rides, 2);
});
test('nowMs defaults to Date.now()', () => {
  const r = recordBoarded({}, { id: 1, svc: '96' }, 'd');
  assert.ok(Math.abs(r.collection[1].lastAt - Date.now()) < 5000);
});
