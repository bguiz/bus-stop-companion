// Found in the browser: getBoundingClientRect() returns { left, top, width, height } but the layout helper
// reads { x, y, w, h }, so every number came out NaN and the lifted picture was never positioned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liftLayout, rectToBox } from '../talk.js';

test('rectToBox turns what getBoundingClientRect() returns into the box the layout uses', () => {
  assert.deepEqual(rectToBox({ left: 213.5, top: 199.4, width: 76, height: 100 }), { x: 213.5, y: 199.4, w: 76, h: 100 });
});

test('a real DOMRect shape gives a layout made only of finite numbers, centred on screen', () => {
  const box = rectToBox({ left: 213.5, top: 199.4, width: 76, height: 100 });
  const L = liftLayout({ vw: 1024, vh: 768, from: box, bubbleH: 73 });
  for (const v of [L.x, L.y, L.w, L.h, L.bubbleTop, L.start.dx, L.start.dy, L.start.scale]) assert.ok(Number.isFinite(v), `got ${v}`);
  assert.ok(Math.abs(L.x + L.w / 2 - 512) < 0.5, 'horizontally centred');
});

test('playTalk converts the measured rectangle with rectToBox before laying out', () => {
  assert.match(readFileSync(new URL('../talk.js', import.meta.url), 'utf8'), /from:\s*rectToBox\(/);
});
