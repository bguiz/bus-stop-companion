// app.js when the decoration services fail: no weather, no artwork, no taxis, broken storage.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, arrivals, service, bus } from './helpers/browser.mjs';

const app = await bootApp({
  url: '/?stop=53009',
  routes: {
    arrivals: arrivals(service('96', bus(3))),
    forecast: new Error('down'), anilist: new Error('down'), taxis: new Error('down'),
  },
});
after(() => app.close());

test('the board still draws, using names from the bundled pool and initials for pictures', () => {
  const [card] = app.cards();
  assert.equal(card.dataset.svc, '96');
  assert.equal(card.firstElementChild.tagName, 'DIV');
  assert.ok(card.querySelector('.char').textContent.length > 1);
});

test('no weather line and the default theme', () => {
  assert.equal(app.$('weather').hidden, true);
  assert.equal(app.document.body.dataset.weather, 'fair');
});

test('the scene draws without taxis', async () => {
  await app.click(app.$('tab-scene'));
  await app.frame();
  assert.match(app.$('scene-note').textContent, /^1 bus placed$/);
});

test('storage that throws never breaks the page', async () => {
  const proto = Object.getPrototypeOf(app.window.localStorage);
  const { getItem, setItem } = proto;
  proto.getItem = () => { throw new Error('blocked'); };
  proto.setItem = () => { throw new Error('blocked'); };
  try {
    await app.click(app.$('tab-board'));
    await app.tickIntervals();
    assert.equal(app.cards().length, 1);
  } finally {
    proto.getItem = getItem;
    proto.setItem = setItem;
  }
});
