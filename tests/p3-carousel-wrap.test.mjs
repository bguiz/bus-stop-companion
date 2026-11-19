import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slideStep } from '../fixes/carousel-wrap.js';

test('ordinary steps are smooth', () => {
  assert.deepEqual(slideStep(3, 12, 1), { index: 4, smooth: true });
  assert.deepEqual(slideStep(3, 12, -1), { index: 2, smooth: true });
  assert.deepEqual(slideStep(0, 12, 1), { index: 1, smooth: true });
  assert.deepEqual(slideStep(11, 12, -1), { index: 10, smooth: true });
});

test('wrapping forward and backward is not smooth', () => {
  assert.deepEqual(slideStep(11, 12, 1), { index: 0, smooth: false });
  assert.deepEqual(slideStep(0, 12, -1), { index: 11, smooth: false });
});

test('single-slide carousel does not move', () => {
  assert.deepEqual(slideStep(0, 1, 1), { index: 0, smooth: false });
  assert.deepEqual(slideStep(0, 1, -1), { index: 0, smooth: false });
});

test('invalid input is handled', () => {
  assert.deepEqual(slideStep(0, 0, 1), { index: 0, smooth: false });
  assert.deepEqual(slideStep(0, NaN, 1), { index: 0, smooth: false });
  assert.deepEqual(slideStep(NaN, 5, 1), { index: 1, smooth: true });
  assert.deepEqual(slideStep(99, 5, 1), { index: 0, smooth: false });
  assert.deepEqual(slideStep(-4, 5, -1), { index: 4, smooth: false });
});

test('app.js uses slideStep for auto-advance and arrows', () => {
  const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(src, /slideStep\(/);
  assert.doesNotMatch(src, /\+ 1\) % PEEK_SERVICES\.length/);
});
