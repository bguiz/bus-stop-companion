// Regression: when the forecast service stays down, the last forecast is used for at most 30 minutes.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, arrivals, service, bus, forecast } from './helpers/browser.mjs';

const app = await bootApp({
  url: '/?stop=53009',
  routes: { arrivals: arrivals(service('96', bus(8))), forecast: forecast('Thundery Showers') },
});
const realNow = Date.now;
after(() => { Date.now = realNow; app.close(); });
const at = (mins) => { Date.now = () => realNow() + mins * 60000; };

test('a fresh forecast sets the line and the theme', () => {
  assert.equal(app.$('weather').textContent, 'Near Bishan: Thundery Showers');
  assert.equal(app.document.body.dataset.weather, 'storm');
});

test('within 30 minutes of the last good forecast, a failed refresh keeps it', async () => {
  app.routes.forecast = new Error('down');
  at(20);
  await app.tickIntervals();
  assert.equal(app.$('weather').hidden, false);
  assert.equal(app.document.body.dataset.weather, 'storm');
});

test('after 30 minutes without a forecast, the old one is no longer shown or used', async () => {
  const stormLine = app.cards()[0].querySelector('.line').textContent;
  at(31);
  await app.tickIntervals();
  assert.equal(app.$('weather').hidden, true, 'no weather line');
  assert.equal(app.document.body.dataset.weather, 'fair', 'theme back to the default');
  assert.notEqual(app.cards()[0].querySelector('.line').textContent, stormLine, 'dialogue no longer talks about the storm');
});

test('when the service comes back the new forecast is shown', async () => {
  app.routes.forecast = forecast('Fair');
  at(32);
  await app.tickIntervals();
  assert.equal(app.$('weather').textContent, 'Near Bishan: Fair');
});
