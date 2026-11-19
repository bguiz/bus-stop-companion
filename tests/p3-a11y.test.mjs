import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { announcements, nextTab } from '../fixes/a11y.js';

const svc = (no, ms) => ({ no, next: ms == null ? null : { duration_ms: ms } });
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

test('announces a first bus that becomes arriving', () => {
  assert.deepEqual(announcements([svc('55', 120000)], [svc('55', 20000)]), ['Bus 55 is arriving']);
});
test('stays quiet when only minutes change or already arriving', () => {
  assert.deepEqual(announcements([svc('55', 300000)], [svc('55', 240000)]), []);
  assert.deepEqual(announcements([svc('55', 10000)], [svc('55', 5000)]), []);
});
test('announces services added and removed', () => {
  const out = announcements([svc('55', 300000), svc('12', 300000)], [svc('55', 300000), svc('96', 300000)]);
  assert.deepEqual(out, ['Bus 96 now serving this stop', 'Bus 12 no longer shown']);
});
test('no announcements without a previous list', () => {
  assert.deepEqual(announcements(null, [svc('55', 0)]), []);
});
test('nextTab handles arrows, Home and End with wrapping', () => {
  const o = ['board', 'scene', 'collection'];
  assert.equal(nextTab('ArrowRight', 'board', o), 'scene');
  assert.equal(nextTab('ArrowRight', 'collection', o), 'board');
  assert.equal(nextTab('ArrowLeft', 'board', o), 'collection');
  assert.equal(nextTab('Home', 'scene', o), 'board');
  assert.equal(nextTab('End', 'scene', o), 'collection');
  assert.equal(nextTab('a', 'scene', o), null);
});

test('index.html: complete tab pattern', () => {
  for (const t of ['board', 'scene', 'collection']) {
    assert.match(html, new RegExp(`<button[^>]*id="tab-${t}"[^>]*aria-controls="${t}"|<button[^>]*aria-controls="${t}"[^>]*id="tab-${t}"`));
    assert.match(html, new RegExp(`<section id="${t}"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-${t}"`));
  }
  assert.match(html, /data-tab="board"[^>]*tabindex="0"|tabindex="0"[^>]*data-tab="board"/);
  assert.match(html, /data-tab="scene"[^>]*tabindex="-1"|tabindex="-1"[^>]*data-tab="scene"/);
});
test('board is no longer a live region; a status region exists', () => {
  assert.doesNotMatch(html.match(/<section id="board"[^>]*>/)[0], /aria-live/);
  assert.match(html, /<p id="announcer" class="sr" role="status" aria-live="polite"/);
  assert.match(css, /\.sr\s*\{/);
});
test('app.js wires keys and announcer', () => {
  assert.match(app, /keydown/);
  assert.match(app, /announcements\(/);
  assert.match(app, /tabIndex/);
});
