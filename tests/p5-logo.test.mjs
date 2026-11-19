// The app logo is "the bus with a face" (concept 3): a bus seen head-on whose destination board reads 相棒.
// The kanji is drawn as dot-matrix dots so the SVG does not depend on any installed font.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const url = (f) => new URL('../' + f, import.meta.url);
const read = (f) => readFileSync(url(f), 'utf8');

test('icon.svg is a self-contained 100x100 bus-face logo with a title', () => {
  const svg = read('icon.svg');
  assert.match(svg, /<svg[^>]*viewBox="0 0 100 100"/);
  assert.match(svg, /<title>Bus stop aibou<\/title>/);
  assert.doesNotMatch(svg, /<text|font-family/i, 'the kanji must be dots, not live text');
});

test('icon.svg draws the destination board as a dot matrix of at least 300 dots', () => {
  const dots = (read('icon.svg').match(/<circle[^>]*class="d"/g) || []).length;
  assert.ok(dots >= 300, `found ${dots} dots`);
});

test('the dot pattern source is a 48 x 19 grid with enough lit dots', () => {
  const rows = read('scripts/aibou-dots.txt').trim().split('\n');
  assert.equal(rows.length, 19);
  for (const r of rows) assert.match(r, /^[.#]{48}$/);
  assert.ok(rows.join('').split('#').length - 1 >= 300);
});

// ---- the PNG icons must be rendered from the new logo ----
function decodePng(file) {
  const b = readFileSync(url(file));
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; assert.equal(data[8], 8, '8-bit only'); assert.equal(data[12], 0, 'not interlaced'); }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  assert.ok(ct === 2 || ct === 6, `colour type ${ct} not supported by this test`);
  const bpp = ct === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let r;
      if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + up; else if (f === 3) r = v + ((a + up) >> 1);
      else { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c); }
      px[y * stride + x] = r & 255;
    }
  }
  return { w, h, at: (fx, fy) => { const o = (Math.min(h - 1, Math.floor(fy * h)) * w + Math.min(w - 1, Math.floor(fx * w))) * bpp; return [px[o], px[o + 1], px[o + 2]]; } };
}
const near = (c, t, tol) => c.every((v, i) => Math.abs(v - t[i]) <= tol);

for (const f of ['icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png']) {
  test(`${f} is rendered from the bus-face logo`, () => {
    const img = decodePng(f);
    assert.ok(near(img.at(0.02, 0.02), [20, 32, 59], 6), 'corner is navy #14203b');
    assert.ok(near(img.at(0.5, 0.56), [207, 233, 255], 14), 'windshield is light blue #cfe9ff');
    assert.ok(near(img.at(0.275, 0.76), [255, 255, 255], 14), 'the white of the left headlight eye (away from the pupil)');
    assert.ok(near(img.at(0.5, 0.78), [255, 180, 84], 22), 'bus body is amber between the eyes');
  });
}

test('the landing page shows the logo before the heading', () => {
  const html = read('index.html');
  assert.match(html, /<section id="landing"[^>]*>\s*<div class="brand">\s*<img class="logo" src="icon\.svg" alt="" width="64" height="64">\s*<h1>/);
});
