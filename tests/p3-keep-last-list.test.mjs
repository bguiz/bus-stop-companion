import test from 'node:test';
import assert from 'node:assert/strict';
import { failureMode, staleLabel } from '../fixes/keep-last-list.js';
import { readFileSync } from 'node:fs';

test('failureMode keeps the list only when one is on screen for the same stop', () => {
  assert.equal(failureMode({ hasList: true, sameStop: true }), 'keep-list');
  assert.equal(failureMode({ hasList: false, sameStop: true }), 'full-error');
  assert.equal(failureMode({ hasList: true, sameStop: false }), 'full-error');
  assert.equal(failureMode({ hasList: false, sameStop: false }), 'full-error');
  assert.equal(failureMode(), 'full-error');
});

test('staleLabel: under a minute, minutes, hours', () => {
  const s = (ms) => staleLabel(ms);
  assert.equal(s(0), 'Could not refresh. Showing times from under a minute ago.');
  assert.equal(s(59000), 'Could not refresh. Showing times from under a minute ago.');
  assert.equal(s(60000), 'Could not refresh. Showing times from 1 min ago.');
  assert.equal(s(125000), 'Could not refresh. Showing times from 2 min ago.');
  assert.equal(s(59 * 60000), 'Could not refresh. Showing times from 59 min ago.');
  assert.equal(s(60 * 60000), 'Could not refresh. Showing times from 1 hr ago.');
  assert.equal(s(3 * 3600000 + 5000), 'Could not refresh. Showing times from 3 hr ago.');
  assert.equal(s(-5), 'Could not refresh. Showing times from under a minute ago.');
  assert.equal(s(NaN), 'Could not refresh. Showing times from under a minute ago.');
});

test('index.html has a role=status line above the board', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = html.match(/<p[^>]*id="board-status"[^>]*>/);
  assert.ok(m, 'board-status element');
  assert.match(m[0], /role="status"/);
  assert.ok(html.indexOf('id="board-status"') < html.indexOf('id="board"'));
});
