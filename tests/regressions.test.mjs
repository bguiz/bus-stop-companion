// Regression tests for the three P1 bugs found in the code review (see the review artifact).
// Each test states the behaviour we want; they were run against the unfixed code first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findStop, createRefreshGate, assignPoolIndexes, fnv1a } from '../lib.js';

const pool = JSON.parse(readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8'));
const stops = { '53009': [103.84, 1.35, 'Bishan Int', 'Bishan St 13'], '54009': [103.85, 1.37, 'Ang Mo Kio Int', 'AMK Ave 3'] };

// ---- Bug 2: stop codes that are names of inherited object properties ----
test('bug 2: findStop returns the entry for a known code', () => {
  assert.deepEqual(findStop(stops, '53009'), stops['53009']);
});
test('bug 2: findStop rejects inherited object keys such as constructor and __proto__', () => {
  for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.equal(findStop(stops, key), null, `${key} must not count as a stop`);
  }
});
test('bug 2: findStop rejects unknown, empty and missing codes', () => {
  for (const code of ['00000', '', null, undefined]) assert.equal(findStop(stops, code), null);
});

// ---- Bug 1: a refresh for an old stop must not draw over a newer one ----
test('bug 1: a new stop gets its own refresh while another stop is still loading', () => {
  const gate = createRefreshGate();
  const a = gate.begin('53009');
  const b = gate.begin('54009');
  assert.ok(a);
  assert.ok(b, 'the second stop must not be dropped by the busy lock');
});
test('bug 1: the earlier stop stops being current once a newer one begins', () => {
  const gate = createRefreshGate();
  const a = gate.begin('53009');
  const b = gate.begin('54009');
  assert.equal(gate.isCurrent(a), false, 'stop A must not draw after the user moved to stop B');
  assert.equal(gate.isCurrent(b), true);
});
test('bug 1: going home makes the in-flight refresh stale', () => {
  const gate = createRefreshGate();
  const a = gate.begin('53009');
  gate.cancel();
  assert.equal(gate.isCurrent(a), false, 'a refresh finishing on the home page must not draw');
});
test('bug 1: overlapping polls for the same stop are not duplicated', () => {
  const gate = createRefreshGate();
  assert.ok(gate.begin('53009'));
  assert.equal(gate.begin('53009'), null);
});
test('bug 1: finishing a stale refresh does not release the newer one', () => {
  const gate = createRefreshGate();
  const a = gate.begin('53009');
  const b = gate.begin('54009');
  gate.end(a);
  assert.equal(gate.begin('54009'), null, 'stop B is still loading');
  gate.end(b);
  assert.ok(gate.begin('54009'), 'after B finishes a new poll may start');
});
test('bug 1: a finished refresh lets the same stop refresh again', () => {
  const gate = createRefreshGate();
  gate.end(gate.begin('53009'));
  assert.ok(gate.begin('53009'));
});

// ---- Bug 3: a bus keeps its character whichever other buses share the stop ----
function collidingPair() {
  for (let a = 1; a < 500; a++) {
    for (let b = a + 1; b < 500; b++) {
      if (fnv1a(String(a)) % pool.length === fnv1a(String(b)) % pool.length) return [String(a), String(b)];
    }
  }
  throw new Error('no colliding pair found');
}
test('bug 3: a service keeps its slot whether or not a colliding service is at the stop', () => {
  const [a, b] = collidingPair();
  const alone = assignPoolIndexes([b], pool.length);
  const together = assignPoolIndexes([a, b], pool.length);
  assert.equal(together[b], alone[b], `bus ${b} changed character because bus ${a} was also at the stop`);
});
test('bug 3: the slot does not depend on the order services are listed', () => {
  const nos = ['96', '15', '855', '12e', '12A', '7'];
  assert.deepEqual(assignPoolIndexes(nos, pool.length), assignPoolIndexes([...nos].reverse(), pool.length));
});
test('bug 3: every slot is inside the pool', () => {
  const nos = Array.from({ length: 300 }, (_, i) => String(i + 1));
  for (const slot of Object.values(assignPoolIndexes(nos, pool.length))) assert.ok(slot >= 0 && slot < pool.length);
});
