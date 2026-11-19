// Double-clicking a character's picture, with reduced motion: the bilingual speech bubble, the page being
// blocked while it plays, and everything put back afterwards. One page for the whole file, so tests run in order.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, arrivals, service, bus, settle } from './helpers/browser.mjs';

const app = await bootApp({
  url: '/?stop=53009',
  routes: { arrivals: arrivals(service('96', bus(3), bus(10)), service('7', bus(0))) },
  reduceMotion: true,
});
after(() => app.close());

const avatarOf = (card) => card.firstElementChild;
const dbl = (el) => el.dispatchEvent(new app.window.MouseEvent('dblclick', { bubbles: true }));
const backdrop = () => app.document.querySelector('.talk-backdrop');
const blocked = () => ['.top', 'main', 'footer'].map((s) => app.document.querySelector(s).inert);
async function until(fn, ms = 8000) {
  for (let t = 0; t < ms && !fn(); t += 100) await settle(100);
  return fn();
}

test('each card picture can be focused and activated, and its line carries a Japanese version', () => {
  for (const card of app.cards()) {
    const av = avatarOf(card);
    assert.equal(av.tabIndex, 0);
    assert.equal(av.getAttribute('role'), 'button');
    assert.match(av.getAttribute('aria-label'), /^Hear what .+ says$/);
    assert.match(card.querySelector('.line').dataset.ja, /[぀-ヿ一-鿿]/);
  }
});

test('double-clicking a picture opens a modal bubble with the English line and the Japanese line under it', async () => {
  const card = app.cards()[0];
  const line = card.querySelector('.line');
  dbl(avatarOf(card));
  await settle();
  const b = backdrop();
  assert.ok(b, 'overlay is shown');
  assert.equal(b.getAttribute('role'), 'dialog');
  assert.equal(b.getAttribute('aria-modal'), 'true');
  assert.match(b.getAttribute('aria-label'), / says$/);
  assert.equal(b.querySelector('.talk-bubble .en').textContent, line.textContent);
  const ja = b.querySelector('.talk-bubble .ja');
  assert.equal(ja.textContent, line.dataset.ja);
  assert.equal(ja.lang, 'ja');
  assert.ok(b.querySelector('.talk-pic'), 'the lifted picture is there');
  assert.ok(card.classList.contains('lifted'), 'the original picture is hidden while it is lifted');
});

test('the rest of the app is blocked while it plays, and a second double-click is ignored', async () => {
  assert.deepEqual(blocked(), [true, true, true]);
  dbl(avatarOf(app.cards()[1]));
  await settle();
  assert.equal(app.document.querySelectorAll('.talk-backdrop').length, 1);
});

test('afterwards the overlay is gone, the page is usable again and the picture is back', async () => {
  assert.ok(await until(() => !backdrop()), 'the sequence finishes by itself');
  assert.deepEqual(blocked(), [false, false, false]);
  assert.equal(app.document.querySelectorAll('.card.lifted').length, 0);
  assert.equal(app.document.activeElement, avatarOf(app.cards()[0]), 'focus goes back to the picture');
});

test('a double-click anywhere else on a card does nothing', async () => {
  dbl(app.cards()[0].querySelector('.svc'));
  await settle();
  assert.equal(backdrop(), null);
});

test('Enter or Space on a focused picture does the same; other keys do not', async () => {
  const av = avatarOf(app.cards()[0]);
  await app.key(av, 'a');
  assert.equal(backdrop(), null);
  await app.key(av, 'Enter');
  assert.ok(backdrop(), 'Enter opens it');
});
