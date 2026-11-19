import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findStops, historyAction, orderPool, recordOpen } from '../lib.js';

// ---- P2-3: tap targets ----
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
function minHeightPx(selector) {
  let found = null;
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue;
    const h = /min-height:\s*([\d.]+)px/.exec(m[2]);
    if (h) found = Number(h[1]);
  }
  return found;
}
test('P2-3: .ride is at least 44px tall', () => {
  assert.ok(minHeightPx('.ride') >= 44);
});
test('P2-3: scenebar label is at least 44px tall', () => {
  assert.ok(minHeightPx('.scenebar label') >= 44);
});
test('P2-3: taxi checkbox is about 22px', () => {
  assert.match(css, /\.scenebar input[^{]*\{[^}]*width:\s*22px/);
});

// ---- P2-4: search ----
const stops = {
  '10000': [0, 0, 'Bishan Int', 'Bishan Rd'],
  '20000': [0, 0, 'Opp Bishan', 'Main Rd'],
  '30000': [0, 0, 'Bishan', 'Other Rd'],
  '40000': [0, 0, 'Blk 5', 'Bishan St'],
  '50000': [0, 0, 'Tampines Mall', 'Tampines Ave'],
};
test('P2-4: ranked order', () => {
  const r = findStops(stops, 'bishan');
  assert.deepEqual(r.codes, ['30000', '10000', '20000', '40000']);
  assert.equal(r.total, 4);
});
test('P2-4: code prefix ranks above name contains', () => {
  const s = { '11111': [0, 0, 'Opp 11 Rd', 'X'], '22222': [0, 0, '1111 thing', 'X'], '33333': [0, 0, 'A', 'B'] };
  assert.deepEqual(findStops(s, '1111').codes, ['22222', '11111']);
});
test('P2-4: short query returns nothing', () => {
  assert.deepEqual(findStops(stops, 'b'), { codes: [], total: 0 });
  assert.deepEqual(findStops(stops, ' '), { codes: [], total: 0 });
});
test('P2-4: limit caps codes but total counts all', () => {
  const r = findStops(stops, 'bishan', 2);
  assert.equal(r.codes.length, 2);
  assert.equal(r.total, 4);
});
test('P2-4: real data', () => {
  const real = JSON.parse(readFileSync(new URL('../data/stops.json', import.meta.url), 'utf8'));
  const r = findStops(real, 'tampines');
  assert.ok(r.total > 25);
  assert.equal(r.codes.length, 25);
  assert.ok(real[r.codes[0]][2].toLowerCase().startsWith('tampines'));
});

// ---- P2-5 ----
test('P2-5: historyAction', () => {
  assert.equal(historyAction('12345', '12345'), 'replace');
  assert.equal(historyAction('12345', '54321'), 'push');
  assert.equal(historyAction(null, '12345'), 'push');
});

// ---- P2-6 ----
test('P2-6: orderPool puts collected first by first date, then locked in pool order', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const col = { d: { first: '2026-01-01' }, b: { first: '2026-02-01' }, e: { first: '2026-02-01' } };
  assert.deepEqual(orderPool(pool, col).map((c) => c.id), ['d', 'b', 'e', 'a', 'c']);
  assert.deepEqual(orderPool(pool, {}).map((c) => c.id), ['a', 'b', 'c', 'd', 'e']);
});

// ---- P2-7 ----
test('P2-7: recordOpen ignores the home page', () => {
  assert.deepEqual(recordOpen([], '2026-05-01', 'home'), []);
});
test('P2-7: recordOpen adds today for a stop view, once', () => {
  assert.deepEqual(recordOpen(['2026-04-30'], '2026-05-01', 'stop'), ['2026-04-30', '2026-05-01']);
  assert.deepEqual(recordOpen(['2026-05-01'], '2026-05-01', 'stop'), ['2026-05-01']);
});
