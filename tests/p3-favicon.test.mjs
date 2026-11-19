import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPngSize } from '../fixes/favicon.js';

const root = new URL('../', import.meta.url);
const p = (f) => fileURLToPath(new URL(f, root));
const html = readFileSync(p('index.html'), 'utf8');

test('index.html head links icon, apple-touch-icon, manifest, theme-color (relative)', () => {
  assert.match(html, /<link rel="icon" href="icon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180\.png">/);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-fA-F]{6}">/);
});

test('referenced files exist', () => {
  for (const f of ['icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'manifest.webmanifest', 'scripts/make-logo.py']) {
    assert.ok(existsSync(p(f)), f);
  }
});

test('icon.svg is an svg', () => {
  assert.match(readFileSync(p('icon.svg'), 'utf8'), /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test('PNGs have signature and right size', () => {
  for (const n of [180, 192, 512]) {
    const size = readPngSize(readFileSync(p(`icons/icon-${n}.png`)));
    assert.deepEqual(size, { width: n, height: n });
  }
});

test('readPngSize rejects non-PNG', () => {
  assert.equal(readPngSize(Buffer.from('not a png at all, definitely not')), null);
});

test('manifest is valid with required fields and existing icons', () => {
  const m = JSON.parse(readFileSync(p('manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Bus stop aibou');
  assert.equal(m.short_name, 'Aibou');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  const css = readFileSync(p('style.css'), 'utf8');
  for (const k of ['background_color', 'theme_color']) {
    assert.match(m[k], /^#[0-9a-fA-F]{6}$/);
    assert.ok(css.toLowerCase().includes(m[k].toLowerCase()), `${k} appears in style.css`);
  }
  assert.ok(m.icons.length >= 2);
  for (const i of m.icons) {
    assert.equal(i.type, 'image/png');
    assert.ok(!i.src.startsWith('/'), 'relative');
    assert.ok(existsSync(p(i.src)), i.src);
    const s = readPngSize(readFileSync(p(i.src)));
    assert.equal(i.sizes, `${s.width}x${s.height}`);
  }
});
