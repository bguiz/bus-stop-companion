// app.js on the home page, with earlier storage and reduced motion.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, POOL } from './helpers/browser.mjs';

const [a, b] = POOL;
const app = await bootApp({
  url: '/',
  reduceMotion: true,
  storage: {
    'last-stop': '53009',
    'open-days': ['2026-11-01', '2026-11-02'],
    'taxi-spirits': false,
    // v1 entries: only ridden ones carry over to v2.
    'collection-v1': { [a.id]: { svc: '96', first: '2026-11-01', rode: true }, [b.id]: { svc: '7', first: '2026-11-01' } },
  },
});
after(() => app.close());

test('the bare URL opens the home page with the carousel, picker and a way back to the last stop', () => {
  assert.equal(app.$('landing').hidden, false);
  assert.equal(app.$('picker').hidden, false);
  assert.equal(app.$('picker-cancel').hidden, true);
  assert.equal(app.$('tabs').hidden, true);
  assert.equal(app.$('recent').textContent, 'Back to Bishan Int');
  assert.equal(app.$('track').children.length, 12);
});

test('opening the home page does not count as a day of use', () => {
  assert.equal(app.$('open-days').textContent, 'Used at a stop on 2 days so far.');
  assert.deepEqual(app.storage('open-days'), ['2026-11-01', '2026-11-02']);
});

test('the saved taxi setting is restored', () => {
  assert.equal(app.$('taxi-toggle').checked, false);
});

test('with reduced motion the carousel does not auto-advance', async () => {
  assert.equal(app.intervalCount(), 0);
});

test('on the home page the picker stays open on Escape', async () => {
  await app.key(app.$('stop-search'), 'Escape');
  assert.equal(app.$('picker').hidden, false);
});

test('a refresh while on the home page does nothing', async () => {
  const before = app.calls.length;
  await app.setHidden(false);
  assert.equal(app.calls.length, before);
});

test('earlier ridden entries are carried over into the collection', async () => {
  await app.click(app.$('recent').querySelector('button'));
  await app.click(app.$('tab-collection'));
  assert.match(app.$('collection-stats').textContent, /^1 of 136 collected · 1 boarding\./);
});

test('the scene is drawn without taxis when they are switched off', async () => {
  await app.click(app.$('tab-scene'));
  await app.frame(500);
  assert.equal(app.calls.filter((c) => c.key === 'taxis').length, 0);
});
