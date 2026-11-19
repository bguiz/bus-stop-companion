import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard, reconcileKeys } from '../board.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const arr = deferred(), wx = deferred(), ch = deferred();
  const draws = [];
  let current = true;
  const opts = {
    fetchArrivals: () => arr.promise,
    fetchWeather: () => wx.promise,
    fetchChars: () => ch.promise,
    cachedChars: () => ({ 1: { img: 'cached' } }),
    lastWeather: () => ({ kind: 'old' }),
    prepare: () => [1, 2],
    render: (d) => draws.push(d),
    isCurrent: () => current,
  };
  return { arr, wx, ch, draws, run: () => loadBoard(opts), stale: () => { current = false; } };
}

test('draws as soon as arrivals resolve while weather and artwork are pending', async () => {
  const t = setup();
  t.run();
  t.arr.resolve({ services: [] });
  await tick();
  assert.equal(t.draws.length, 1);
});

test('first draw uses cached artwork and last known weather', async () => {
  const t = setup();
  t.run();
  t.arr.resolve({});
  await tick();
  assert.deepEqual(t.draws[0].chars, { 1: { img: 'cached' } });
  assert.deepEqual(t.draws[0].weather, { kind: 'old' });
});

test('weather is added when it arrives', async () => {
  const t = setup();
  t.run();
  t.arr.resolve({});
  await tick();
  t.wx.resolve({ kind: 'rain' });
  await tick();
  assert.equal(t.draws.length, 2);
  assert.equal(t.draws.at(-1).weather.kind, 'rain');
});

test('artwork is added when it arrives', async () => {
  const t = setup();
  t.run();
  t.arr.resolve({});
  await tick();
  t.ch.resolve({ 1: { img: 'a' }, 2: { img: 'b' } });
  await tick();
  assert.equal(t.draws.length, 2);
  assert.equal(t.draws.at(-1).chars[2].img, 'b');
});

test('weather and artwork rejection do not stop the board', async () => {
  const t = setup();
  const done = t.run();
  t.arr.resolve({});
  t.wx.reject(new Error('boom'));
  t.ch.reject(new Error('boom'));
  await tick();
  assert.equal(t.draws.length >= 1, true);
  await done;
});

test('stale results are not drawn', async () => {
  const t = setup();
  t.run();
  t.stale();
  t.arr.resolve({});
  t.wx.resolve({ kind: 'rain' });
  t.ch.resolve({});
  await tick();
  assert.equal(t.draws.length, 0);
});

test('arrivals rejection propagates', async () => {
  const t = setup();
  const p = t.run();
  t.arr.reject(new Error('down'));
  await assert.rejects(p, /down/);
});

test('reconcileKeys: unchanged kept, new added, gone removed, order follows new list', () => {
  const r = reconcileKeys(['1', '2', '3'], ['3', '4', '1']);
  assert.deepEqual(r.keep, ['3', '1']);
  assert.deepEqual(r.add, ['4']);
  assert.deepEqual(r.remove, ['2']);
  assert.deepEqual(r.order, ['3', '4', '1']);
});

test('reconcileKeys: first poll adds everything', () => {
  const r = reconcileKeys([], ['1', '2']);
  assert.deepEqual(r, { keep: [], add: ['1', '2'], remove: [], order: ['1', '2'] });
});
