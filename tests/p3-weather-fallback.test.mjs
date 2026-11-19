import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseForecast, needsFetch, themeKind } from '../fixes/weather-fallback.js';

const TTL = 5 * 60e3, STALE = 30 * 60e3, now = 10_000_000;
const base = { ttlMs: TTL, maxStaleMs: STALE, now };

test('fresh cache is used even if a fetch result exists', () => {
  assert.equal(chooseForecast({ ...base, cached: 'old', cachedAt: now - 1000, fetched: 'new' }), 'old');
  assert.equal(needsFetch({ ...base, cached: 'old', cachedAt: now - 1000 }), false);
});
test('expired or missing cache needs a fetch and uses the fetched value', () => {
  assert.equal(needsFetch({ ...base, cached: 'old', cachedAt: now - TTL - 1 }), true);
  assert.equal(needsFetch({ ...base, cached: null, cachedAt: 0 }), true);
  assert.equal(chooseForecast({ ...base, cached: 'old', cachedAt: now - TTL - 1, fetched: 'new' }), 'new');
});
test('failed fetch falls back to a stale-but-recent cache', () => {
  assert.equal(chooseForecast({ ...base, cached: 'old', cachedAt: now - 20 * 60e3, fetched: null }), 'old');
});
test('too-old cache plus failure returns null', () => {
  assert.equal(chooseForecast({ ...base, cached: 'old', cachedAt: now - STALE - 1, fetched: null }), null);
  assert.equal(chooseForecast({ ...base, cached: null, cachedAt: 0, fetched: null }), null);
});
test('a failure never flips the theme to fair', () => {
  assert.equal(themeKind(null, 'rain'), 'rain');
  assert.equal(themeKind({ kind: 'fair' }, 'rain'), 'fair');
  assert.equal(themeKind(null, undefined), 'fair');
});
