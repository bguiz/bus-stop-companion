import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearestStops, formatDistance, TOO_FAR_METERS, locationOutcome } from '../fixes/geo-far.js';

const stops = JSON.parse(readFileSync(new URL('../data/stops.json', import.meta.url)));

test('point at Bishan Int returns it first with a small distance, sorted', () => {
  const r = nearestStops(stops, 1.35046, 103.84988);
  assert.equal(r.length, 6);
  assert.equal(r[0].code, '53009');
  assert.ok(r[0].meters < 5);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].meters >= r[i - 1].meters);
});

test('count is respected and meters are real metres', () => {
  assert.equal(nearestStops(stops, 1.35, 103.85, 3).length, 3);
  // 0.01 deg of latitude is about 1112 m
  const one = { A: [103.85, 1.36, 'x', 'y'] };
  const [{ meters }] = nearestStops(one, 1.35, 103.85);
  assert.ok(Math.abs(meters - 1112) < 5, String(meters));
});

test('Kuala Lumpur and Sydney are too far', () => {
  for (const [lat, lng] of [[3.139, 101.6869], [-33.8688, 151.2093]]) {
    const o = locationOutcome(stops, lat, lng);
    assert.equal(o.tooFar, true);
    assert.equal(o.codes.length, 0);
    assert.ok(o.km > 100);
    assert.match(o.note, /^You do not seem to be in Singapore \(the nearest stop is \d+ km away\)\. Use search instead\.$/);
  }
});

test('Johor side near the border is judged by the 5 km rule', () => {
  const near = locationOutcome(stops, 1.4927, 103.7414); // by Larkin Ter, JB
  assert.equal(near.tooFar, false);
  assert.ok(near.items[0].meters < TOO_FAR_METERS);
  const far = locationOutcome(stops, 1.56, 103.76); // north of JB, > 5 km from any stop
  assert.equal(far.tooFar, true);
  assert.ok(far.km >= 5);
});

test('in Singapore: six stops, note and distance labels', () => {
  const o = locationOutcome(stops, 1.35046, 103.84988);
  assert.equal(o.tooFar, false);
  assert.equal(o.items.length, 6);
  assert.equal(o.note, 'Nearest stops to you:');
});

test('formatDistance', () => {
  assert.equal(formatDistance(120.4), '120 m');
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(999), '999 m');
  assert.equal(formatDistance(1400), '1.4 km');
  assert.equal(formatDistance(12345), '12.3 km');
});
