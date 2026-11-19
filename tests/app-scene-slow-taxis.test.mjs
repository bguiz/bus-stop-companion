// Regression: the Scene must show the buses even when the taxi list arrives after weather and artwork.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, arrivals, service, bus, taxis, settle } from './helpers/browser.mjs';

let releaseTaxis;
const app = await bootApp({
  url: '/?stop=53009',
  routes: {
    arrivals: arrivals(service('96', bus(3))),
    taxis: () => new Promise((r) => { releaseTaxis = () => r(taxis([[103.851, 1.351]])); }),
  },
});
after(() => app.close());
const sceneText = () => app.contexts[0].calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);

test('buses are on the scene before the taxi list arrives', () => {
  assert.ok(sceneText().includes('96 · 3m'), 'bus drawn without waiting for taxis');
  assert.equal(app.$('scene-note').textContent, '1 bus placed');
});

test('buses are still on the scene once the slow taxi list arrives', async () => {
  app.contexts[0].calls.length = 0;
  releaseTaxis();
  await settle();
  await app.click(app.$('tab-scene'));
  await app.frame(1000);
  const glows = app.contexts[0].calls.filter((c) => c[0] === 'fillRect' && c[3] === 18).length;
  assert.ok(sceneText().includes('96 · 3m'));
  assert.ok(glows >= 1, 'the taxi is drawn');
});

test('a slow taxi list for a stop the rider has left is not drawn on the new stop', async () => {
  app.routes.taxis = () => new Promise((r) => { releaseTaxis = () => r(taxis([[103.851, 1.351]])); });
  const realNow = Date.now;
  Date.now = () => realNow() + 2 * 60000; // taxi cache is stale, so the next draw refetches
  try {
    app.routes.arrivals = arrivals(service('52', bus(6)));
    await app.back('/?stop=53011');
    const pending = releaseTaxis;
    app.routes.arrivals = arrivals(service('7', bus(2)));
    await app.back('/?stop=01012');
    app.contexts[0].calls.length = 0;
    pending();
    await settle();
    await app.frame(2000);
    assert.ok(!sceneText().includes('52 · 6m'), 'old stop buses are not drawn');
    assert.ok(sceneText().includes('Hotel Grand Pacific'));
  } finally {
    Date.now = realNow;
  }
});
