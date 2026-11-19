// (3) Double-clicking a character's picture lifts it out of the page, pulses twice and shows a speech bubble
// with the English line and its Japanese version. The rest of the app is blocked while it plays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHETYPES, DIALOGUE } from '../dialogue.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const css = read('style.css'), app = read('app.js');

import { DIALOGUE_JA } from '../dialogue.js';
import { pickLine, pickLinePair } from '../lib.js';
import { liftLayout, talkTimings } from '../talk.js';

test('(3) every English line has a Japanese line with the same keys and count', () => {
  for (const a of ARCHETYPES) {
    assert.deepEqual(Object.keys(DIALOGUE_JA[a]).sort(), Object.keys(DIALOGUE[a]).sort(), a);
    for (const k of Object.keys(DIALOGUE[a])) {
      assert.equal(DIALOGUE_JA[a][k].length, DIALOGUE[a][k].length, `${a}.${k}`);
      for (const line of DIALOGUE_JA[a][k]) assert.match(line, /[぀-ヿ一-鿿]/, `${a}.${k} should be Japanese: ${line}`);
    }
  }
});
test('(3) the pair uses the same line index, so the English text is exactly what the card shows', () => {
  const ctxs = [{ mins: 0, load: 'SEA', weather: 'fair', monitored: 1 }, { mins: 7, load: 'LSD', weather: 'rain', monitored: 1 }, { mins: 3, load: 'SDA', weather: 'hazy', monitored: 0 }, { mins: 20, load: 'SEA', weather: 'fair', monitored: 1 }];
  for (const no of ['7', '14', '55B', '96', '124', '410W', '855', '960']) for (const ctx of ctxs) {
    const p = pickLinePair(no, ctx);
    assert.equal(p.en, pickLine(no, ctx));
    assert.ok(p.ja && p.ja !== p.en);
  }
});
test('(3) the lifted picture and its bubble fit on screen for phone, tablet and short landscape viewports', () => {
  for (const [vw, vh] of [[375, 812], [768, 1024], [812, 375], [1280, 720]]) {
    const L = liftLayout({ vw, vh, from: { x: 20, y: 300, w: 76, h: 100 }, bubbleH: 120 });
    assert.ok(L.x >= 0 && L.x + L.w <= vw, `x fits at ${vw}x${vh}`);
    assert.ok(L.y >= 0 && L.y + L.h <= vh, `y fits at ${vw}x${vh}`);
    assert.ok(L.bubbleTop >= 4, `bubble is not cut off at the top at ${vw}x${vh} (${L.bubbleTop})`);
    assert.ok(L.bubbleTop + 120 <= L.y, 'bubble sits above the picture');
  }
});
test('(3) the picture starts exactly over the original (same centre, same size) and ends bigger', () => {
  const from = { x: 20, y: 300, w: 76, h: 100 };
  const L = liftLayout({ vw: 375, vh: 812, from, bubbleH: 120 });
  assert.ok(Math.abs(L.start.dx - (from.x + from.w / 2 - (L.x + L.w / 2))) < 0.01);
  assert.ok(Math.abs(L.start.dy - (from.y + from.h / 2 - (L.y + L.h / 2))) < 0.01);
  assert.ok(Math.abs(L.start.scale - from.w / L.w) < 0.001);
  assert.ok(L.w > from.w);
});
test('(3) the timeline floats, pulses twice, shows the bubble, then returns; reduced motion skips the movement', () => {
  const t = talkTimings({ reduceMotion: false, textLength: 60 });
  assert.ok(t.float > 0 && t.pulse > 0 && t.pulses === 2 && t.hold >= 1800 && t.back > 0);
  const r = talkTimings({ reduceMotion: true, textLength: 60 });
  assert.equal(r.float, 0); assert.equal(r.pulse, 0); assert.equal(r.back, 0); assert.ok(r.hold >= 1800);
  assert.ok(talkTimings({ reduceMotion: false, textLength: 200 }).hold > t.hold, 'longer text is shown longer');
});
test('(3) the cards listen for a double click and keep the Japanese line with the English one', () => {
  assert.match(app, /addEventListener\('dblclick'/);
  assert.match(app, /from '\.\/talk\.js'/);
  assert.match(app, /dataset\.ja/);
});
test('(3) the talk overlay blocks the rest of the app while it plays', () => {
  const talk = read('talk.js');
  assert.match(talk, /inert/);
  assert.match(talk, /aria-modal/);
  assert.match(css, /\.talk-backdrop\s*\{[^}]*position:\s*fixed/);
});

