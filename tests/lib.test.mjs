import test from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, assignPoolIndexes, archetypeFor, minutesAway, classifyForecast, nearest, situationKey, pickLine, logOpen, sgDate } from '../lib.js';

test('hash is stable', () => { assert.equal(fnv1a('96'), fnv1a('96')); assert.notEqual(fnv1a('96'), fnv1a('97')); });
test('same service maps to the same slot in any company', () => {
  const a = assignPoolIndexes(['96', '15'], 136), b = assignPoolIndexes(['15', '96', '7'], 136);
  assert.equal(a['96'], b['96']); assert.equal(a['15'], b['15']);
});
// The earlier "no two services at one stop share a slot" and "collision probes to next slot" tests
// were removed on purpose: that behaviour made a bus's character depend on the other buses at the stop (review bug 3).
test('archetype is deterministic', () => assert.equal(archetypeFor('96'), archetypeFor('96')));
test('minutesAway clamps negatives and floors', () => {
  assert.equal(minutesAway(-8136), 0); assert.equal(minutesAway(59999), 0); assert.equal(minutesAway(134864), 2);
});
test('classifyForecast', () => {
  assert.equal(classifyForecast('Thundery Showers'), 'storm');
  assert.equal(classifyForecast('Light Rain'), 'rain');
  assert.equal(classifyForecast('Partly Cloudy (Night)'), 'cloudy');
  assert.equal(classifyForecast('Fair (Day)'), 'fair');
  assert.equal(classifyForecast('Hazy'), 'hazy');
});
test('nearest picks closest', () => {
  const items = [{ n: 'a', la: 1.3, lo: 103.8 }, { n: 'b', la: 1.4, lo: 103.9 }];
  assert.equal(nearest(items, 1.31, 103.81, (i) => i.la, (i) => i.lo).n, 'a');
});
test('situation priority', () => {
  assert.equal(situationKey({ mins: 0, load: 'LSD', weather: 'rain', monitored: 1 }), 'arriving');
  assert.equal(situationKey({ mins: 6, load: 'LSD', weather: 'rain', monitored: 1 }), 'packed');
  assert.equal(situationKey({ mins: 6, load: 'SEA', weather: 'rain', monitored: 1 }), 'rain');
  assert.equal(situationKey({ mins: 6, load: 'SEA', weather: 'fair', monitored: 0 }), 'noGps');
  assert.equal(situationKey({ mins: 20, load: 'SEA', weather: 'fair', monitored: 1 }), 'long');
});
test('pickLine returns a string and is stable', () => {
  const ctx = { mins: 3, load: 'SEA', weather: 'fair', monitored: 1 };
  assert.equal(typeof pickLine('96', ctx), 'string'); assert.equal(pickLine('96', ctx), pickLine('96', ctx));
});
test('logOpen is one entry per day', () => {
  assert.deepEqual(logOpen(['2026-11-18'], '2026-11-19'), ['2026-11-18', '2026-11-19']);
  assert.deepEqual(logOpen(['2026-11-19'], '2026-11-19'), ['2026-11-19']);
  assert.match(sgDate(), /^\d{4}-\d{2}-\d{2}$/);
});

import { metersFrom, recordBoarded, migrateCollection, collectionStats, sceneRadius, ringStep } from '../lib.js';

test('metersFrom: north and east offsets', () => {
  const n = metersFrom(1.3, 103.8, 1.301, 103.8);
  assert.ok(Math.abs(n.y - 111.2) < 1 && Math.abs(n.x) < 0.001);
  const e = metersFrom(1.3, 103.8, 1.3, 103.801);
  assert.ok(Math.abs(e.x - 111.2 * Math.cos(1.3 * Math.PI / 180)) < 1 && Math.abs(e.y) < 0.001);
});
test('recordBoarded: first boarding is new, repeats add rides', () => {
  let r = recordBoarded({}, { id: 1, svc: '96' }, '2026-11-19', 0);
  assert.equal(r.isNew, true); assert.equal(r.collection[1].rides, 1);
  r = recordBoarded(r.collection, { id: 1, svc: '96' }, '2026-11-20', 86400000);
  assert.equal(r.isNew, false); assert.equal(r.collection[1].rides, 2);
  assert.equal(r.collection[1].first, '2026-11-19'); assert.equal(r.collection[1].last, '2026-11-20');
});
test('recordBoarded does not mutate its input', () => {
  const before = {}; recordBoarded(before, { id: 1, svc: '96' }, '2026-11-19');
  assert.deepEqual(before, {});
});
test('migrateCollection keeps only ridden entries', () => {
  const old = { 1: { svc: '96', first: 'a', last: 'a', days: 1, rode: true }, 2: { svc: '15', first: 'a', last: 'a', days: 1, rode: false } };
  assert.deepEqual(migrateCollection(old), { 1: { svc: '96', first: 'a', last: 'a', rides: 1 } });
  assert.deepEqual(migrateCollection(null), {});
});
test('collectionStats counts characters and boardings', () => {
  let c = recordBoarded({}, { id: 1, svc: '96' }, 'd', 0).collection;
  c = recordBoarded(c, { id: 1, svc: '96' }, 'd', 600000).collection;
  c = recordBoarded(c, { id: 2, svc: '15' }, 'd', 600000).collection;
  assert.deepEqual(collectionStats(c), { met: 2, rides: 3 });
});
test('sceneRadius clamps and ringStep fits two rings', () => {
  assert.equal(sceneRadius([]), 800); assert.equal(sceneRadius([100]), 600); assert.equal(sceneRadius([9000]), 3000);
  assert.equal(ringStep(3000), 1000); assert.equal(ringStep(600), 200); assert.equal(ringStep(150), 100);
});
