// app.js at a stop: arrivals, polling, failures, boarding, tabs, scene, collection, picker and navigation.
// One page for the whole file (Node's coverage counts only one copy of app.js per process), so tests run in order.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, arrivals, service, bus, forecast, taxis, settle } from './helpers/browser.mjs';

const STOP = '53009'; // Bishan Int: 103.84988, 1.35046
const near = [[103.851, 1.351], [103.849, 1.349]];
const far = [[104.2, 1.45]];

const initial = arrivals(
  service('96', bus(3), bus(10), bus(20)),
  service('7', bus(0, { type: 'DD' })),
  service('14', bus(8, { monitored: 0, load: 'LSD', lat: 0, lng: 0 })),
  service('36', null, bus(12, { type: 'BD', load: 'SDA' })),
  service('999', null, null),
);

const app = await bootApp({
  url: `/?stop=${STOP}`,
  routes: { arrivals: initial, forecast: forecast('Showers'), taxis: taxis([...near, ...far]) },
  geolocation: { coords: { latitude: 1.3505, longitude: 103.8499 } },
});
after(() => app.close());

const cardFor = (no) => app.cards().find((c) => c.dataset.svc === no);
const count = (key) => app.calls.filter((c) => c.key === key).length;
const sceneText = () => app.contexts[0].calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);

test('stop view shows the stop and one card per service with a bus, soonest first', () => {
  assert.equal(app.$('stop-name').textContent, 'Bishan Int');
  assert.equal(app.$('stop-meta').textContent, `Bishan St 13 · ${STOP}`);
  assert.equal(app.$('tabs').hidden, false);
  assert.equal(app.$('landing').hidden, true);
  assert.deepEqual(app.cards().map((c) => c.dataset.svc), ['7', '96', '14', '36']);
});

test('cards show ETA, crowd, bus type, GPS state and the character from AniList', () => {
  const c96 = cardFor('96');
  assert.match(c96.querySelector('.eta').textContent, /^3min.*then 10, 20$/);
  assert.match(c96.querySelector('.char').textContent, /^Char \d+$/);
  assert.equal(c96.querySelector('img.avatar').getAttribute('referrerpolicy'), 'no-referrer');
  assert.ok(c96.querySelector('.line').textContent.length > 0);
  assert.equal(cardFor('7').querySelector('.big').textContent, 'Arr');
  assert.match(cardFor('7').textContent, /Double deck/);
  assert.match(cardFor('14').textContent, /Limited standing.*No live GPS yet/);
  assert.match(cardFor('36').textContent, /Standing available.*Bendy/);
});

test('weather sets the theme and the line under the header', () => {
  assert.equal(app.document.body.dataset.weather, 'rain');
  assert.equal(app.$('weather').textContent, 'Near Bishan: Showers');
});

test('a stop view records the day and the last stop', () => {
  assert.equal(app.storage('last-stop'), STOP);
  assert.equal(app.storage('open-days').length, 1);
  assert.equal(app.$('open-days').textContent, 'Used at a stop on 1 day so far.');
});

test('character details are cached and not fetched again on the next poll', async () => {
  const before = count('anilist');
  await app.tickIntervals();
  assert.equal(count('anilist'), before);
  assert.ok(Object.keys(app.storage('chars-v1')).length >= 4);
});

test('a poll updates cards in place and announces only meaningful changes', async () => {
  const card96 = cardFor('96');
  app.routes.arrivals = arrivals(service('96', bus(0)), service('7', bus(9)), service('36', null, bus(11)), service('99', bus(4)));
  await app.tickIntervals();
  assert.equal(cardFor('96'), card96, 'same element kept');
  assert.deepEqual(app.cards().map((c) => c.dataset.svc), ['96', '99', '7', '36']);
  assert.equal(app.$('announcer').textContent, 'Bus 96 is arriving. Bus 99 now serving this stop. Bus 14 no longer shown');
});

test('polling pauses while the page is hidden and refreshes when it is shown again', async () => {
  await app.setHidden(true);
  const before = count('arrivals');
  await app.tickIntervals();
  assert.equal(count('arrivals'), before);
  await app.setHidden(false);
  assert.equal(count('arrivals'), before + 1);
});

test('a failed poll keeps the last list with a status line, and the next success clears it', async () => {
  app.routes.arrivals = new Error('down');
  await app.tickIntervals();
  assert.equal(app.$('board-status').hidden, false);
  assert.equal(app.$('board-status').textContent, 'Could not refresh. Showing times from under a minute ago.');
  assert.equal(app.cards().length, 4);
  app.routes.arrivals = initial;
  await app.click(app.$('refresh'));
  assert.equal(app.$('board-status').hidden, true);
});

test('an HTTP error from arrivals is treated as a failure too', async () => {
  app.routes.arrivals = { __status: 503 };
  await app.tickIntervals();
  assert.equal(app.$('board-status').hidden, false);
  app.routes.arrivals = initial;
  await app.tickIntervals();
});

test('boarding needs a confirmation, can be cancelled, and adds the character once', async () => {
  const ask = () => cardFor('96').querySelector('.board-ctl');
  await app.click(ask().querySelector('button'));
  assert.match(ask().textContent, /Boarded bus 96\?/);
  assert.equal(app.document.activeElement, ask().querySelector('.safe'));
  await app.click(ask().querySelector('.safe')); // Cancel
  assert.equal(ask().querySelector('button').textContent, 'I boarded this');

  await app.click(ask().querySelector('button'));
  await app.click(ask().querySelector('.yes'));
  assert.match(cardFor('96').textContent, /Added to your collection!/);
  const col = app.storage('collection-v2');
  const [id] = Object.keys(col);
  assert.equal(col[id].svc, '96');
  assert.equal(col[id].rides, 1);

  // A second confirmation straight away is a double tap.
  await app.click(ask().querySelector('button'));
  await app.click(ask().querySelector('.yes'));
  assert.equal(app.storage('collection-v2')[id].rides, 1);
});

test('the Scene tab starts the animation and draws buses, rings, taxis and the stop name', async () => {
  await app.click(app.$('tab-scene'));
  assert.equal(app.$('scene').hidden, false);
  assert.equal(app.$('board').hidden, true);
  assert.equal(app.$('tab-scene').getAttribute('aria-selected'), 'true');
  assert.ok(app.rafPending() > 0);
  await app.frame(1000);
  await app.frame(1016);
  const text = sceneText();
  assert.ok(text.includes('Bishan Int'));
  assert.ok(text.some((t) => /^96 · \d+m$|^96 · Arr$/.test(t)), 'bus 96 is labelled');
  assert.match(app.$('scene-note').textContent, /placed/);
});

test('the taxi toggle is saved and redraws the scene without refetching arrivals', async () => {
  const before = count('arrivals');
  const toggle = app.$('taxi-toggle');
  toggle.checked = false;
  toggle.dispatchEvent(new app.window.Event('change'));
  await settle();
  assert.equal(app.storage('taxi-spirits'), false);
  toggle.checked = true;
  toggle.dispatchEvent(new app.window.Event('change'));
  await settle();
  assert.equal(app.storage('taxi-spirits'), true);
  assert.equal(count('arrivals'), before);
});

test('arrow keys, Home and End move between tabs; other keys do nothing', async () => {
  await app.key(app.$('tab-scene'), 'ArrowRight');
  assert.equal(app.$('collection').hidden, false);
  assert.equal(app.document.activeElement, app.$('tab-collection'));
  await app.key(app.$('tab-collection'), 'Home');
  assert.equal(app.$('board').hidden, false);
  await app.key(app.$('tab-board'), 'End');
  assert.equal(app.$('collection').hidden, false);
  await app.key(app.$('tab-collection'), 'a');
  assert.equal(app.$('collection').hidden, false);
});

test('the collection lists collected characters first and shows details on tap', async () => {
  assert.match(app.$('collection-stats').textContent, /^1 of 136 collected · 1 boarding\./);
  const first = app.$('collection-grid').firstElementChild;
  assert.equal(first.tagName, 'BUTTON');
  assert.equal(app.$('collection-grid').querySelectorAll('.locked').length, 135);
  await app.click(first);
  assert.equal(app.$('collection-detail').hidden, false);
  assert.match(app.$('collection-detail').textContent, /Last boarded as bus 96 · first collected .* · boarded 1 time$/);
  await app.click(app.$('collection-grid').firstElementChild);
  assert.equal(app.$('collection-detail').hidden, true);
});

test('hiding the page stops the scene; showing it again restarts it on the Scene tab', async () => {
  await app.click(app.$('tab-scene'));
  await app.setHidden(true);
  await app.frame();
  assert.equal(app.rafPending(), 0);
  await app.setHidden(false);
  assert.ok(app.rafPending() > 0);
  await app.click(app.$('tab-board'));
});

test('a broken picture falls back to an initial and is not retried on the next poll', async () => {
  const img = cardFor('96').querySelector('img.avatar');
  img.dispatchEvent(new app.window.Event('error'));
  const fallback = cardFor('96').firstElementChild;
  assert.equal(fallback.tagName, 'DIV');
  assert.equal(fallback.textContent.length, 1);
  await app.tickIntervals();
  assert.equal(cardFor('96').firstElementChild, fallback);
});

test('the picker searches by name, says when there are too few letters or no match, and caps results', async () => {
  await app.click(app.$('change-stop'));
  assert.equal(app.$('picker').hidden, false);
  assert.equal(app.$('picker-cancel').hidden, false);
  await app.type(app.$('stop-search'), 'b');
  assert.equal(app.$('picker-msg').textContent, 'Type at least 2 characters.');
  await app.type(app.$('stop-search'), 'zzqqxx');
  assert.equal(app.$('picker-msg').textContent, 'No stops match that.');
  await app.type(app.$('stop-search'), 'blk');
  assert.match(app.$('picker-msg').textContent, /^Showing 25 of \d+\. Keep typing to narrow\.$/);
  assert.equal(app.$('results').children.length, 25);
});

test('Escape, Cancel and a tab change close the picker when a stop is open', async () => {
  await app.key(app.$('stop-search'), 'Escape');
  assert.equal(app.$('picker').hidden, true);
  await app.click(app.$('change-stop'));
  await app.click(app.$('picker-cancel'));
  assert.equal(app.$('picker').hidden, true);
  await app.click(app.$('change-stop'));
  await app.click(app.$('tab-board'));
  assert.equal(app.$('picker').hidden, true);
});

test('"Use my location" lists the nearest stops with distances', async () => {
  await app.click(app.$('change-stop'));
  await app.click(app.$('nearest'));
  assert.equal(app.$('picker-msg').textContent, 'Nearest stops to you:');
  assert.match(app.$('results').textContent, /Bishan Int.* m/);
});

test('"Use my location" says so when you are far from Singapore or location fails', async () => {
  app.env.geolocation = { coords: { latitude: 51.5, longitude: -0.12 } };
  await app.click(app.$('nearest'));
  assert.match(app.$('picker-msg').textContent, /^You do not seem to be in Singapore/);
  app.env.geolocation = 'deny';
  await app.click(app.$('nearest'));
  assert.equal(app.$('picker-msg').textContent, 'Could not get your location. Use search instead.');
  app.env.geolocation = 'none';
  await app.click(app.$('nearest'));
  assert.equal(app.$('picker-msg').textContent, 'Location is not available here. Use search instead.');
});

test('picking another stop pushes a history entry; picking it again replaces it', async () => {
  app.routes.arrivals = arrivals(service('52', bus(6)));
  await app.type(app.$('stop-search'), "St. Theresa's");
  const pick = () => [...app.$('results').querySelectorAll('button')].find((b) => b.textContent.includes('53011'));
  const len = app.window.history.length;
  await app.click(pick());
  assert.equal(app.window.location.search, '?stop=53011');
  assert.equal(app.window.history.length, len + 1);
  assert.deepEqual(app.cards().map((c) => c.dataset.svc), ['52']);
  await app.click(app.$('change-stop'));
  await app.type(app.$('stop-search'), "St. Theresa's");
  await app.click(pick());
  assert.equal(app.window.history.length, len + 1);
});

test('a stop with no buses due says so and offers to try again', async () => {
  app.routes.arrivals = arrivals();
  await app.tickIntervals();
  assert.match(app.$('board').textContent, /^No buses right now\./);
  assert.equal(app.$('scene-note').textContent, 'No buses due');
  app.routes.arrivals = arrivals(service('52', bus(6)));
  await app.click(app.$('board').querySelector('button'));
  assert.equal(app.cards().length, 1);
});

test('a failed first load at a new stop shows a full error with a retry button', async () => {
  app.routes.arrivals = new Error('down');
  await app.back(`/?stop=${STOP}`);
  assert.match(app.$('board').textContent, /^Could not reach the bus times service/);
  app.env.onLine = false;
  await app.click(app.$('board').querySelector('button'));
  assert.match(app.$('board').textContent, /^You look offline/);
  app.env.onLine = true;
  app.routes.arrivals = initial;
  await app.click(app.$('board').querySelector('button'));
  assert.equal(app.cards().length, 4);
});

test('Home clears the stop view, stops polling and offers the last stop', async () => {
  await app.click(app.$('home'));
  assert.equal(app.window.location.search, '');
  assert.equal(app.$('landing').hidden, false);
  assert.equal(app.$('picker').hidden, false);
  // Known issue, not fixed here: the picker's Cancel button stays visible on Home (and does nothing there).
  assert.equal(app.$('tabs').hidden, true);
  assert.equal(app.$('weather').hidden, true);
  assert.equal(app.$('board').textContent, '');
  assert.equal(app.$('recent').textContent, 'Back to Bishan Int');
  await app.click(app.$('recent').querySelector('button'));
  assert.equal(app.window.location.search, `?stop=${STOP}`);
});

test('back and forward follow the URL', async () => {
  await app.back('/');
  assert.equal(app.$('landing').hidden, false);
  await app.back('/?stop=53011');
  assert.equal(app.$('stop-name').textContent, "St. Theresa's Hme");
  await app.back('/?stop=constructor');
  assert.equal(app.$('landing').hidden, false, 'an inherited key is not a stop');
});

test('the landing carousel shows 12 buses and moves with arrow keys and on a timer', async () => {
  const slides = app.$('track').children;
  assert.equal(slides.length, 12);
  assert.match(slides[0].textContent, /^Bus 7Char \d+/);
  assert.equal(app.$('dots').querySelectorAll('.on').length, 1);
  await app.key(app.$('carousel'), 'ArrowRight');
  assert.ok(app.$('carousel').__scrolledTo);
  await app.key(app.$('carousel'), 'ArrowLeft');
  await app.key(app.$('carousel'), 'Enter');
  app.$('carousel').dispatchEvent(new app.window.Event('scroll'));
  await app.frame();
  // Interaction pauses auto-advance for 8 s; pretend that has passed.
  const realNow = Date.now;
  Date.now = () => realNow() + 10000;
  try {
    delete app.$('carousel').__scrolledTo;
    await app.tickIntervals(3500);
    assert.ok(app.$('carousel').__scrolledTo, 'auto-advanced');
  } finally {
    Date.now = realNow;
  }
});
