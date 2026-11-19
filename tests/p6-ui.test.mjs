// UI changes: (1) home layout, (2) pill text centring, (4) logo in the home button. The double-click talk is in p6-talk.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const html = read('index.html'), css = read('style.css'), app = read('app.js');
const at = (id) => html.indexOf(`id="${id}"`);

// ---- (1) home page order: logo + heading, "Pick a bus stop" bar, search, location button, carousel ----
test('(1) the "Pick a bus stop" bar sits inside the picker, directly above the search field', () => {
  assert.ok(at('pickbar') > at('picker'), 'bar is inside the picker section');
  assert.ok(at('pickbar') < at('stop-search'), 'bar comes before the search field');
  assert.match(html, /id="pickbar"[^>]*>Pick a bus stop</);
});
test('(1) the carousel comes after the "Use my location" button', () => {
  assert.ok(at('nearest') > 0 && at('carousel') > at('nearest'));
  assert.ok(at('landing') < at('picker'), 'heading block stays on top');
});
test('(1) the carousel lives in its own section that is shown and hidden with the landing page', () => {
  assert.match(html, /<section id="peek"[^>]*>[\s\S]*id="carousel"/);
  assert.match(app, /\$\('peek'\)\.hidden/);
});
test('(1) the top bar is hidden on the home page (its text moved into the picker)', () => {
  assert.match(css, /body\[data-view="home"\]\s+\.top\s*\{[^}]*display:\s*none/);
  assert.match(app, /dataset\.view = 'home'/);
  assert.match(app, /dataset\.view = 'stop'/);
});

// ---- (2) pill text is vertically centred ----
const rule = (sel) => { const m = css.match(new RegExp(`(?:^|\\n|})\\s*${sel.replace(/[.[\]()#]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[1] : ''; };
test('(2) the tag row centres its items, so tags are not stretched to the 44px button height', () => {
  assert.match(rule('.tags'), /align-items:\s*center/);
});
test('(2) a tag centres its own text', () => {
  assert.match(rule('.tag'), /display:\s*inline-flex/);
  assert.match(rule('.tag'), /align-items:\s*center/);
});

// ---- (4) the home button shows the logo ----
test('(4) the home button contains the app logo and keeps its accessible name', () => {
  assert.match(html, /<button id="home"[^>]*aria-label="Home"[^>]*>\s*<img[^>]*src="icon\.svg"[^>]*alt=""/);
  assert.doesNotMatch(html, /id="home"[^>]*>\s*&#8962;/);
});
