// scene.js drawn onto a recording fake canvas, for each weather kind and with reduced motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window();
Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
let rafQueue = [];
const observers = [];
Object.assign(globalThis, {
  window,
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame: () => { rafQueue = []; },
  ResizeObserver: class { constructor(cb) { observers.push(cb); } observe() {} },
});
const images = [];
globalThis.Image = class { constructor() { images.push(this); this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; } };

const { createScene } = await import('../scene.js');

function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push([p, ...args]); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  return { calls, canvas: { getContext: () => ctx, getBoundingClientRect: () => ({ width: 360, height: 360 }), width: 0, height: 0 } };
}

const buses = [
  { key: '96#0', svc: '96', first: true, x: 300, y: 200, mins: 3, load: 'SEA', img: 'https://img.example/1.png', name: 'Gojo' },
  { key: '96#1', svc: '96', first: false, x: -500, y: 900, mins: 0, load: 'LSD', name: '' },
  { key: '7#0', svc: '7', first: true, x: 5000, y: 0, mins: 9, load: 'XYZ', name: 'Levi' },
];
const taxis = [{ x: 100, y: 100 }, { x: 9000, y: 9000 }];
const run = (n, t0 = 1) => { for (let i = 0; i < n; i++) { const q = rafQueue; rafQueue = []; for (const fn of q) fn((t0 + i) * 1000); } };
const texts = (calls) => calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);

test('setData draws a still frame when stopped: rings, the stop name and bus labels', () => {
  const { calls, canvas } = fakeCanvas();
  const scene = createScene(canvas);
  scene.setData({ stopKey: 'A', stopName: 'A very long stop name that will not fit in the little pill at all', buses, taxis, kind: 'fair', showTaxis: true });
  const t = texts(calls);
  assert.ok(t.includes('96 · 3m'));
  assert.ok(t.includes('96 · Arr'));
  assert.ok(t.some((s) => s.endsWith('km')), 'distance ring labels');
  assert.ok(t.some((s) => s.endsWith('…')), 'stop name shortened');
  assert.equal(canvas.width, 720, 'device pixel ratio is capped at 2 and applied');
});

for (const kind of ['fair', 'rain', 'storm', 'cloudy', 'hazy', 'unknown']) {
  test(`the animation loop draws ${kind} weather`, () => {
    const { calls, canvas } = fakeCanvas();
    const scene = createScene(canvas);
    scene.setData({ stopKey: 'A', stopName: 'Stop', buses, taxis, kind, showTaxis: true });
    scene.start();
    scene.start(); // already running: no second loop
    run(30);
    scene.stop();
    assert.equal(rafQueue.length, 0);
    assert.ok(calls.length > 100);
  });
}

test('a loaded picture is drawn inside the avatar circle', () => {
  const { calls, canvas } = fakeCanvas();
  const scene = createScene(canvas);
  scene.setData({ stopKey: 'B', stopName: 'Stop', buses, taxis: [], kind: 'fair' });
  const img = images.findLast((i) => i.src === 'https://img.example/1.png');
  Object.assign(img, { complete: true, naturalWidth: 100, naturalHeight: 150 });
  scene.setData({ buses });
  assert.ok(calls.some((c) => c[0] === 'drawImage'));
});

test('with no buses the scene says there is no live GPS yet', () => {
  const { calls, canvas } = fakeCanvas();
  createScene(canvas).setData({ stopKey: 'C', stopName: '', buses: [], taxis: [], kind: 'storm' });
  assert.ok(texts(calls).includes('No buses with live GPS yet'));
});

test('with reduced motion positions snap and the loop still runs', () => {
  const { calls, canvas } = fakeCanvas();
  const scene = createScene(canvas, { reduceMotion: true });
  scene.setData({ stopKey: 'D', stopName: 'Stop', buses, taxis, kind: 'storm', showTaxis: true });
  scene.setData({ buses: buses.map((b) => ({ ...b, x: b.x + 50 })) });
  scene.start();
  run(3);
  scene.stop();
  assert.ok(calls.length > 0);
});

test('a short canvas puts the stop name below the stop; a resize redraws', () => {
  const { calls, canvas } = fakeCanvas();
  canvas.getBoundingClientRect = () => ({ width: 100, height: 40 });
  const scene = createScene(canvas);
  scene.setData({ stopKey: 'E', stopName: 'Stop', buses, taxis: [], kind: 'fair' });
  const before = calls.length;
  observers.at(-1)();
  assert.ok(calls.length > before);
  scene.start();
  observers.at(-1)();
  scene.stop();
});
