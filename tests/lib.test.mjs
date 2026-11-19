import test from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, assignPoolIndexes, archetypeFor, minutesAway, classifyForecast, nearest, situationKey, pickLine, logOpen, sgDate } from '../lib.js';

test('hash is stable', () => { assert.equal(fnv1a('96'), fnv1a('96')); assert.notEqual(fnv1a('96'), fnv1a('97')); });
test('same service maps to same slot regardless of order or neighbours when no collision', () => {
  const a = assignPoolIndexes(['96', '15'], 150), b = assignPoolIndexes(['15', '96'], 150);
  assert.deepEqual(a, b);
});
test('no two services at one stop share a slot', () => {
  const nos = Array.from({ length: 40 }, (_, i) => String(i + 1));
  const idx = Object.values(assignPoolIndexes(nos, 50));
  assert.equal(new Set(idx).size, idx.length);
});
test('collision probes to next slot', () => {
  const idx = assignPoolIndexes(['1', '2', '3'], 1 + 2); // tiny pool forces collisions
  assert.equal(new Set(Object.values(idx)).size, 3);
});
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

import { metersFrom, recordSeen, toggleRode, collectionStats, sceneRadius, ringStep } from '../lib.js';

test('metersFrom: north and east offsets', () => {
  const n = metersFrom(1.3, 103.8, 1.301, 103.8);
  assert.ok(Math.abs(n.y - 111.2) < 1 && Math.abs(n.x) < 0.001);
  const e = metersFrom(1.3, 103.8, 1.3, 103.801);
  assert.ok(Math.abs(e.x - 111.2 * Math.cos(1.3 * Math.PI / 180)) < 1 && Math.abs(e.y) < 0.001);
});
test('recordSeen: new ids are fresh, repeat days increment once per day', () => {
  let r = recordSeen({}, [{ id: 1, svc: '96' }, { id: 2, svc: '15' }], '2026-11-19');
  assert.deepEqual(r.fresh, [1, 2]);
  r = recordSeen(r.collection, [{ id: 1, svc: '96' }], '2026-11-19');
  assert.deepEqual(r.fresh, []); assert.equal(r.collection[1].days, 1);
  r = recordSeen(r.collection, [{ id: 1, svc: '96' }], '2026-11-20');
  assert.equal(r.collection[1].days, 2); assert.equal(r.collection[1].first, '2026-11-19');
});
test('toggleRode and stats', () => {
  let c = recordSeen({}, [{ id: 1, svc: '96' }], '2026-11-19').collection;
  c = toggleRode(c, 1);
  assert.deepEqual(collectionStats(c), { met: 1, rode: 1 });
  assert.deepEqual(toggleRode(c, 999), c);
  assert.deepEqual(collectionStats(toggleRode(c, 1)), { met: 1, rode: 0 });
});
test('sceneRadius clamps and ringStep fits two rings', () => {
  assert.equal(sceneRadius([]), 800); assert.equal(sceneRadius([100]), 600); assert.equal(sceneRadius([9000]), 3000);
  assert.equal(ringStep(3000), 1000); assert.equal(ringStep(600), 200); assert.equal(ringStep(150), 100);
});
