// Test harness: runs the real index.html and app.js inside happy-dom, with the network faked.
// Each call to bootApp() builds a fresh page and imports a fresh copy of app.js.
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const INDEX_HTML = read('index.html');
export const STOPS = JSON.parse(read('data/stops.json'));
export const POOL = JSON.parse(read('data/characters.json'));

// ---------- fake API payloads ----------
export function bus(mins, extra = {}) {
  return { duration_ms: mins * 60000, load: 'SEA', type: 'SD', monitored: 1, lat: 1.3521, lng: 103.8198, ...extra };
}
export function service(no, next, subsequent, next3, operator = 'SBST') {
  return { no, operator, next, subsequent, next3 };
}
export function arrivals(...services) {
  return { services };
}
export function forecast(text = 'Fair', area = 'Bishan', lat = 1.35, lng = 103.84) {
  return {
    data: {
      area_metadata: [{ name: area, label_location: { latitude: lat, longitude: lng } }, { name: 'Far Away', label_location: { latitude: 9, longitude: 9 } }],
      items: [{ forecasts: [{ area, forecast: text }, { area: 'Far Away', forecast: 'Fair' }] }],
    },
  };
}
export function taxis(points) {
  return { features: [{ geometry: { coordinates: points } }] };
}
export function anilist(ids) {
  return { data: { Page: { characters: ids.map((id) => ({ id, name: { full: `Char ${id}` }, image: { large: `https://img.example/${id}.png` } })) } } };
}

// ---------- network ----------
const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/**
 * routes: { arrivals, forecast, taxis, anilist, stops, characters }, each a value, a function (url, init) => value,
 * an Error (rejects) or { status } (HTTP error). Missing routes use sensible defaults.
 */
function makeFetch(routes, calls) {
  return async (url, init = {}) => {
    const u = String(url);
    let key;
    if (u.includes('data/stops.json')) key = 'stops';
    else if (u.includes('data/characters.json')) key = 'characters';
    else if (u.includes('arrivelah2')) key = 'arrivals';
    else if (u.includes('two-hr-forecast')) key = 'forecast';
    else if (u.includes('taxi-availability')) key = 'taxis';
    else if (u.includes('anilist')) key = 'anilist';
    else throw new Error(`unexpected fetch ${u}`);
    calls.push({ key, url: u, init });
    let r = routes[key];
    if (typeof r === 'function') r = await r(u, init);
    if (r instanceof Error) throw r;
    if (r && r.__status) return json({}, r.__status);
    return json(r);
  };
}
export const httpError = (status) => ({ __status: status });

// ---------- canvas ----------
function fakeContext() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return ctx;
}

// ---------- timers ----------
// Track every timer the app starts, so a test can run them or clear them all at the end.
const live = new Set();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;

function installTimers(intervals) {
  globalThis.setTimeout = (fn, ms, ...a) => { const id = realSetTimeout(() => { live.delete(id); fn(...a); }, ms, ...a); live.add(id); return id; };
  globalThis.clearTimeout = (id) => { live.delete(id); realClearTimeout(id); };
  // Intervals never fire on their own; tests call tickIntervals() to run them.
  globalThis.setInterval = (fn, ms) => { const id = { fn, ms }; intervals.add(id); return id; };
  globalThis.clearInterval = (id) => { intervals.delete(id); };
}

export function restoreTimers() {
  for (const id of live) realClearTimeout(id);
  live.clear();
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
}

/** Let pending promises and short timers settle. */
export async function settle(ms = 20) {
  for (let i = 0; i < 5; i++) await new Promise((r) => realSetTimeout(r, ms / 5));
}

let copy = 0;

/**
 * Boot a fresh page. Options: url (path + query), routes, storage (initial localStorage values),
 * geolocation ({ coords } | 'deny' | 'none'), reduceMotion, onLine.
 */
export async function bootApp({ url = '/', routes = {}, storage = {}, geolocation, reduceMotion = false, onLine = true } = {}) {
  const window = new Window({ url: `http://localhost:8765${url}`, width: 400, height: 800 });
  const document = window.document;
  document.write(INDEX_HTML.replace(/<script[^>]*><\/script>/, ''));

  for (const [k, v] of Object.entries(storage)) window.localStorage.setItem(k, JSON.stringify(v));

  const calls = [];
  const fullRoutes = {
    stops: STOPS, characters: POOL, arrivals: arrivals(), forecast: forecast(), taxis: taxis([]),
    anilist: (u, init) => anilist(JSON.parse(init.body).variables.ids),
    ...routes,
  };
  const intervals = new Set();
  installTimers(intervals);

  const contexts = [];
  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    this.__ctx ??= fakeContext();
    contexts.push(this.__ctx);
    return this.__ctx;
  };
  window.matchMedia = (q) => ({ matches: q.includes('reduce') ? reduceMotion : false, addEventListener() {}, removeEventListener() {} });
  let rafQueue = [];
  window.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  window.cancelAnimationFrame = () => { rafQueue = []; };
  const resizeObservers = [];
  window.ResizeObserver = class { constructor(cb) { this.cb = cb; resizeObservers.push(this); } observe() {} disconnect() {} };
  const env = { onLine, geolocation };
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => env.onLine });
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    get: () => (env.geolocation === 'none' ? undefined : {
      getCurrentPosition(ok, fail) {
        const g = env.geolocation;
        realSetTimeout(() => (g && g !== 'deny' ? ok(g) : fail(new Error('denied'))), 0);
      },
    }),
  });
  window.HTMLElement.prototype.scrollTo = function scrollTo(opts) { this.__scrolledTo = opts; };

  const globals = {
    window, document, location: window.location, history: window.history, navigator: window.navigator,
    localStorage: window.localStorage, requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame, ResizeObserver: window.ResizeObserver, Image: window.Image,
    fetch: makeFetch(fullRoutes, calls),
  };
  for (const [k, v] of Object.entries(globals)) Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });

  copy += 1;
  await import(`../../app.js?copy=${copy}`);
  await settle();

  const $ = (id) => document.getElementById(id);
  return {
    window, document, $, calls, routes: fullRoutes, contexts, resizeObservers, env,
    storage: (key) => JSON.parse(window.localStorage.getItem(key)),
    cards: () => [...$('board').querySelectorAll('.card')],
    async tickIntervals(minMs = 0) {
      for (const id of [...intervals]) if (id.ms >= minMs) id.fn();
      await settle();
    },
    intervalCount: () => intervals.size,
    async frame(t = 1000) { const q = rafQueue; rafQueue = []; for (const fn of q) fn(t); },
    rafPending: () => rafQueue.length,
    async click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await settle(); },
    async key(el, key) { el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })); await settle(); },
    async type(el, value) { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); await settle(); },
    async setHidden(hidden) {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new window.Event('visibilitychange'));
      await settle();
    },
    async back(path) {
      window.history.replaceState({}, '', path);
      window.dispatchEvent(new window.PopStateEvent('popstate'));
      await settle();
    },
    close() { restoreTimers(); window.happyDOM?.abort?.(); },
  };
}
