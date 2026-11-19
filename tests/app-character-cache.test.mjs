// Regression: two character fetches running at once must not overwrite each other's cache entries.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, arrivals, service, bus, anilist, settle } from './helpers/browser.mjs';

// The first request (the home carousel's 12 characters) is slow; later ones are quick.
const pending = [];
const app = await bootApp({
  url: '/',
  routes: {
    arrivals: arrivals(service('2', bus(3)), service('3', bus(5))),
    anilist: (u, init) => {
      const ids = JSON.parse(init.body).variables.ids;
      if (pending.length === 0) return new Promise((r) => pending.push(() => r(anilist(ids))));
      return anilist(ids);
    },
  },
});
after(() => app.close());

test('characters from a slow request survive a quicker one that started later', async () => {
  const carouselIds = JSON.parse(app.calls.find((c) => c.key === 'anilist').init.body).variables.ids;
  assert.equal(carouselIds.length, 12);
  // Pick a stop while the carousel request is still out: the board fetches its own characters.
  await app.type(app.$('stop-search'), 'Bishan Int');
  await app.click(app.$('results').querySelector('button'));
  const boardIds = JSON.parse(app.calls.filter((c) => c.key === 'anilist')[1].init.body).variables.ids;
  pending[0]();
  await settle();
  const cached = Object.keys(app.storage('chars-v1')).map(Number);
  for (const id of [...carouselIds, ...boardIds]) assert.ok(cached.includes(id), `character ${id} is cached`);
});
