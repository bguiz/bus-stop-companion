import test from 'node:test';
import assert from 'node:assert/strict';
import { stopLabelBox, ellipsize } from '../fixes/stop-label.js';

function overlapsCircle(b, cx, cy, r) {
  const nx = Math.max(b.x, Math.min(cx, b.x + b.width));
  const ny = Math.max(b.y, Math.min(cy, b.y + b.height));
  return Math.hypot(nx - cx, ny - cy) < r;
}
const cases = [
  { w: 800, h: 600, textWidth: 120, avatarRadius: 22 },
  { w: 200, h: 200, textWidth: 150, avatarRadius: 22 },
  { w: 200, h: 200, textWidth: 900, avatarRadius: 22 },
  { w: 360, h: 240, textWidth: 300, avatarRadius: 22 },
];

test('stop label pill stays inside the canvas and clear of a bus avatar at the stop', () => {
  for (const c of cases) {
    const b = stopLabelBox(c);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= c.w && b.y + b.height <= c.h, JSON.stringify([c, b]));
    assert.ok(!overlapsCircle(b, c.w / 2, c.h / 2, c.avatarRadius), `overlaps avatar ${JSON.stringify(c)}`);
  }
});

test('stop label pill is horizontally centred when it fits and fits the text', () => {
  const b = stopLabelBox({ w: 800, h: 600, textWidth: 120, avatarRadius: 22 });
  assert.equal(b.x + b.width / 2, 400);
  assert.ok(b.width >= 120);
});

test('long names are capped so the pill fits a narrow canvas', () => {
  const b = stopLabelBox({ w: 200, h: 200, textWidth: 900, avatarRadius: 22 });
  assert.ok(b.width <= 200);
  assert.ok(b.textMax > 0 && b.textMax < 200);
});

test('ellipsize shortens to fit and leaves short text alone', () => {
  const measure = (s) => s.length * 10;
  assert.equal(ellipsize('Bishan', 100, measure), 'Bishan');
  const out = ellipsize('Bishan Int very long name', 100, measure);
  assert.ok(out.endsWith('…') && measure(out) <= 100);
  assert.equal(ellipsize('', 100, measure), '');
});
