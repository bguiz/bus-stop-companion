// app.js when the bundled stop list cannot be loaded, and when storage and AniList are unavailable.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp } from './helpers/browser.mjs';

const app = await bootApp({ url: '/?stop=53009', routes: { stops: new Error('offline') } });
after(() => app.close());

test('a failed stop list load shows a message instead of a blank page', () => {
  assert.equal(app.$('board').textContent, 'Could not load the bus stop list. Reload to try again.');
});
