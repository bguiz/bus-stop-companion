// talk.js on its own, for the cases the app tests do not reach: a picture that failed to load (an initial in a div),
// a picture outside a card with no name, the overlay blocking scrolling, and calls with nothing to show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ width: 400, height: 800 });
Object.assign(globalThis, { window, document: window.document });
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0); // skip the reading pause
const { playTalk } = await import('../talk.js');

const document = window.document;
document.body.innerHTML = '<header class="top"></header><main></main><footer></footer>';

function initial(letter) {
  const div = document.createElement('div');
  div.className = 'avatar';
  div.textContent = letter;
  div.tabIndex = 0;
  document.querySelector('main').append(div);
  return div;
}

test('with no picture there is nothing to play', async () => {
  await playTalk({ source: null, en: 'Hi', ja: 'やあ' });
  assert.equal(document.querySelector('.talk-backdrop'), null);
});

test('a picture that failed to load lifts out as its initial, with a generic label when there is no name', async () => {
  const source = initial('G');
  let seen;
  const done = playTalk({ source, en: 'Hello', ja: 'こんにちは', reduceMotion: true });
  const backdrop = document.querySelector('.talk-backdrop');
  seen = {
    label: backdrop.getAttribute('aria-label'),
    pic: backdrop.querySelector('.talk-pic'),
    inert: ['.top', 'main', 'footer'].map((s) => document.querySelector(s).inert),
  };
  // Scrolling the page underneath is blocked while it plays.
  const wheel = new window.Event('wheel', { cancelable: true });
  backdrop.dispatchEvent(wheel);
  const touch = new window.Event('touchmove', { cancelable: true });
  backdrop.dispatchEvent(touch);
  // A second call while it plays is ignored.
  await playTalk({ source, en: 'Again', ja: 'もう一度', reduceMotion: true });
  assert.equal(document.querySelectorAll('.talk-backdrop').length, 1);
  await done;

  assert.equal(seen.label, 'Speech bubble');
  assert.equal(seen.pic.tagName, 'DIV');
  assert.equal(seen.pic.textContent, 'G');
  assert.deepEqual(seen.inert, [true, true, true]);
  assert.ok(wheel.defaultPrevented && touch.defaultPrevented, 'wheel and touchmove are cancelled');
  assert.equal(document.querySelector('.talk-backdrop'), null, 'overlay removed');
  assert.deepEqual(['.top', 'main', 'footer'].map((s) => document.querySelector(s).inert), [false, false, false]);
  assert.equal(document.activeElement, source, 'focus goes back to the picture');
});

test('a picture removed from the page while it plays does not get focus back', async () => {
  const source = initial('K');
  source.tabIndex = -1;
  const done = playTalk({ source, en: 'Bye', ja: 'またね', name: 'Kirito', reduceMotion: true });
  assert.equal(document.querySelector('.talk-backdrop').getAttribute('aria-label'), 'Kirito says');
  source.remove();
  await done;
  assert.notEqual(document.activeElement, source);
});
