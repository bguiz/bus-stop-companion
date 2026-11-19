import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneTaxis, needsTaxiFetch } from '../fixes/taxi-toggle.js';
import { readFileSync } from 'node:fs';

test('sceneTaxis returns [] when hidden, the list when shown', () => {
  const t = [{ x: 1, y: 2 }];
  assert.deepEqual(sceneTaxis(false, t), []);
  assert.equal(sceneTaxis(true, t), t);
  assert.deepEqual(sceneTaxis(true, null), []);
});

test('needsTaxiFetch: only when shown and cache missing or stale', () => {
  const ttl = 60000;
  assert.equal(needsTaxiFetch(false, null, 0, 1000, ttl), false);
  assert.equal(needsTaxiFetch(true, null, 0, 1000, ttl), true);
  assert.equal(needsTaxiFetch(true, [], 1000, 2000, ttl), false);
  assert.equal(needsTaxiFetch(true, [], 1000, 1000 + ttl + 1, ttl), true);
});

test('app.js toggle handler redraws the scene instead of refresh()', () => {
  const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const m = src.match(/\$\('taxi-toggle'\)\.addEventListener\('change'[\s\S]*?\n  \}\);/);
  assert.ok(m, 'handler found');
  assert.match(m[0], /redrawScene\(\)/);
  assert.doesNotMatch(m[0], /\brefresh\(\)/);
});
