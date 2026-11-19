import {
  assignPoolIndexes, minutesAway, classifyForecast, nearest, pickLine, LOAD_LABEL, sgDate, logOpen,
  metersFrom, recordBoarded, migrateCollection, collectionStats,
} from './lib.js';
import { createScene } from './scene.js';

const ARRIVALS_API = 'https://arrivelah2.busrouter.sg/';
const FORECAST_API = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';
const TAXI_API = 'https://api.data.gov.sg/v1/transport/taxi-availability';
const ANILIST_API = 'https://graphql.anilist.co';
const REFRESH_MS = 20000; // arrivelah2 caches for ~15s; never poll faster
const FORECAST_TTL_MS = 5 * 60 * 1000;
const TAXI_TTL_MS = 60 * 1000;
const TAXI_RADIUS_M = 3000;
const MAX_TAXIS = 80;
// Well-known services for the landing carousel (a sneak peek, not tied to any stop).
const PEEK_SERVICES = ['7', '14', '15', '36', '61', '65', '96', '105', '124', '167', '190', '960'];

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// localStorage can throw (private mode, blocked): never let it break the page.
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

const state = {
  stops: {}, pool: [], stopCode: null,
  forecast: null, forecastAt: 0, taxis: null, taxisAt: 0,
  timer: null, busy: false, tab: 'board',
  collection: {}, fresh: new Set(), selectedId: null, latest: null, confirming: null,
  scene: null, showTaxis: true,
};

// ---------- data loading ----------
async function loadData() {
  const [stops, pool] = await Promise.all([
    fetch('data/stops.json').then((r) => r.json()),
    fetch('data/characters.json').then((r) => r.json()),
  ]);
  state.stops = stops;
  state.pool = pool;
}

async function fetchJson(url, options, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- characters (AniList, by frozen ID, cached locally) ----------
async function ensureCharacters(ids) {
  const cache = store.get('chars-v1', {});
  const missing = [...new Set(ids)].filter((id) => !cache[id]);
  if (missing.length) {
    try {
      const query = `query($ids:[Int]){Page(perPage:50){characters(id_in:$ids){id name{full} image{large}}}}`;
      const json = await fetchJson(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { ids: missing } }),
      });
      for (const c of json.data.Page.characters) cache[c.id] = { name: c.name.full, img: c.image.large };
      store.set('chars-v1', cache);
    } catch { /* fall back to names from the repo snapshot */ }
  }
  return cache;
}

function avatar(detail, fallbackName, cls = 'avatar') {
  if (detail && detail.img) {
    const img = el('img', cls);
    img.src = detail.img;
    img.alt = detail.name;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.replaceWith(el('div', cls, fallbackName[0])));
    return img;
  }
  return el('div', cls, fallbackName[0]);
}

// ---------- weather + taxis (data.gov.sg) ----------
async function getWeather(lat, lng) {
  try {
    if (!state.forecast || Date.now() - state.forecastAt > FORECAST_TTL_MS) {
      state.forecast = (await fetchJson(FORECAST_API)).data;
      state.forecastAt = Date.now();
    }
    const { area_metadata: areas, items } = state.forecast;
    const area = nearest(areas, lat, lng, (a) => a.label_location.latitude, (a) => a.label_location.longitude);
    const text = items[0].forecasts.find((f) => f.area === area.name)?.forecast ?? '';
    return { area: area.name, text, kind: classifyForecast(text) };
  } catch {
    return null; // weather is a bonus; the page works without it
  }
}

async function getTaxis(lat, lng) {
  try {
    if (!state.taxis || Date.now() - state.taxisAt > TAXI_TTL_MS) {
      const json = await fetchJson(TAXI_API, undefined, 15000);
      state.taxis = json.features[0].geometry.coordinates; // [lng, lat] pairs
      state.taxisAt = Date.now();
    }
    return state.taxis
      .map(([tlng, tlat]) => metersFrom(lat, lng, tlat, tlng))
      .filter((p) => Math.hypot(p.x, p.y) <= TAXI_RADIUS_M)
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
      .slice(0, MAX_TAXIS);
  } catch {
    return [];
  }
}

function showWeather(w) {
  const node = $('weather');
  document.body.dataset.weather = w ? w.kind : 'fair';
  node.hidden = !w;
  if (!w) return;
  node.textContent = '';
  node.append('Near ', el('b', '', w.area), `: ${w.text}`);
}

// ---------- arrivals ----------
function normaliseBuses(service) {
  return [service.next, service.subsequent, service.next3]
    .filter((b) => b && typeof b.duration_ms === 'number')
    .map((b) => ({
      mins: minutesAway(b.duration_ms), load: b.load, type: b.type,
      monitored: b.monitored === 1 && !(b.lat === 0 && b.lng === 0),
    }));
}

function renderState(message, withRetry) {
  const board = $('board');
  board.textContent = '';
  const box = el('div', 'state', message);
  if (withRetry) {
    const btn = el('button', 'primary', 'Try again');
    btn.type = 'button';
    btn.addEventListener('click', () => refresh());
    box.append(el('br'), btn);
  }
  board.append(box);
}

// Boarding: a character joins the collection only after the rider confirms they boarded that bus.
function rerenderBoard() {
  if (state.latest) renderServices(state.latest);
}

function confirmBoarding(no, entry) {
  const { collection, isNew } = recordBoarded(state.collection, { id: entry.id, svc: no }, sgDate());
  if (isNew) state.fresh.add(entry.id);
  state.confirming = null;
  setCollection(collection);
  rerenderBoard();
}

function boardControl(no, entry) {
  const wrap = el('span', 'board-ctl');
  const button = (label, cls, onClick) => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  if (state.confirming === no) {
    wrap.append(
      el('span', 'ask', `Boarded bus ${no}?`),
      button('Yes, I’m on it', 'ride yes', () => confirmBoarding(no, entry)),
      button('Cancel', 'ride', () => { state.confirming = null; rerenderBoard(); }),
    );
  } else {
    wrap.append(button('I boarded this', 'ride', () => { state.confirming = no; rerenderBoard(); }));
  }
  return wrap;
}

function renderServices({ services, weather, chars, slots }) {
  const board = $('board');
  board.textContent = '';
  const kind = weather ? weather.kind : 'fair';

  for (const s of services) {
    const buses = normaliseBuses(s);
    const first = buses[0];
    const entry = state.pool[slots[s.no]];
    const detail = chars[entry.id];
    const card = el('article', 'card');
    card.append(avatar(detail, entry.name));

    const who = el('div', 'who');
    const svc = el('div', 'svc', s.no);
    if (s.operator) svc.append(el('small', '', s.operator));
    who.append(svc, el('div', 'char', detail ? detail.name : entry.name));
    if (first) who.append(el('p', 'line', pickLine(s.no, { mins: first.mins, load: first.load, weather: kind, monitored: first.monitored })));
    card.append(who);

    const eta = el('div', 'eta');
    if (first) {
      eta.append(el('div', 'big', first.mins <= 0 ? 'Arr' : String(first.mins)));
      if (first.mins > 0) eta.append(el('div', 'unit', 'min'));
      const later = buses.slice(1).map((b) => (b.mins <= 0 ? 'Arr' : `${b.mins}`));
      if (later.length) eta.append(el('div', 'then', `then ${later.join(', ')}`));
    } else {
      eta.append(el('div', 'unit', 'No ETA'));
    }
    card.append(eta);

    const tags = el('div', 'tags');
    if (state.collection[entry.id]) {
      tags.append(el('span', 'tag collected', state.fresh.has(entry.id) ? 'Added to your collection!' : 'In your collection'));
    }
    if (first && LOAD_LABEL[first.load]) tags.append(el('span', `tag ${first.load}`, LOAD_LABEL[first.load]));
    if (first && first.type === 'DD') tags.append(el('span', 'tag', 'Double deck'));
    if (first && first.type === 'BD') tags.append(el('span', 'tag', 'Bendy'));
    if (first && !first.monitored) tags.append(el('span', 'tag', 'No live GPS yet'));
    tags.append(boardControl(s.no, entry));
    card.append(tags);

    board.append(card);
  }
}

// ---------- Stage 3 scene data ----------
async function updateScene({ services, chars, slots, stop }) {
  const [lng, lat] = stop;
  const buses = [];
  let noGps = 0;
  for (const s of services) {
    const entry = state.pool[slots[s.no]];
    const detail = chars[entry.id];
    [s.next, s.subsequent, s.next3].forEach((b, i) => {
      if (!b || typeof b.duration_ms !== 'number') return;
      if (b.monitored !== 1 || (b.lat === 0 && b.lng === 0)) { if (i === 0) noGps++; return; }
      const m = metersFrom(lat, lng, b.lat, b.lng);
      buses.push({
        key: `${s.no}#${i}`, svc: s.no, first: i === 0, x: m.x, y: m.y, mins: minutesAway(b.duration_ms),
        load: b.load, img: detail?.img, name: detail?.name || entry.name,
      });
    });
  }
  const taxis = state.showTaxis ? await getTaxis(lat, lng) : [];
  state.scene.setData({ stopName: stopLabel(state.stopCode).name, buses, taxis, showTaxis: state.showTaxis, kind: document.body.dataset.weather });
  const placed = buses.filter((b) => b.first).length;
  $('scene-note').textContent = noGps ? `${placed} buses placed, ${noGps} without live GPS yet` : `${placed} buses placed`;
}

async function refresh() {
  if (!state.stopCode || state.busy) return;
  state.busy = true;
  const stop = state.stops[state.stopCode];
  const [lng, lat] = stop;
  try {
    const [arrivals, weather] = await Promise.all([
      fetchJson(`${ARRIVALS_API}?id=${encodeURIComponent(state.stopCode)}`),
      getWeather(lat, lng),
    ]);
    showWeather(weather);
    const services = (arrivals.services || []).filter((s) => s.next || s.subsequent);
    if (!services.length) {
      renderState('No buses right now. Service may have ended for tonight, or nothing is due here yet.', true);
      state.scene.setData({ stopName: stopLabel(state.stopCode).name, buses: [], taxis: [], kind: document.body.dataset.weather });
      $('scene-note').textContent = 'No buses due';
      return;
    }
    services.sort((a, b) => (a.next?.duration_ms ?? Infinity) - (b.next?.duration_ms ?? Infinity));
    const slots = assignPoolIndexes(services.map((s) => s.no), state.pool.length);
    const ids = services.map((s) => state.pool[slots[s.no]].id);
    const chars = await ensureCharacters(ids);

    const latest = { services, weather, chars, slots, stop };
    state.latest = latest;
    renderServices(latest);
    await updateScene(latest);
  } catch {
    renderState(navigator.onLine === false
      ? 'You look offline. Reconnect and try again.'
      : 'Could not reach the bus times service. It is a free community service and may be busy.', true);
  } finally {
    state.busy = false;
  }
}

function startPolling() {
  clearInterval(state.timer);
  state.timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
}

// ---------- Stage 2: collection ----------
function setCollection(next) {
  state.collection = next;
  store.set('collection-v2', next);
  if (state.tab === 'collection') renderCollection();
}

function renderCollection() {
  const grid = $('collection-grid');
  grid.textContent = '';
  const chars = store.get('chars-v1', {});
  const { met, rides } = collectionStats(state.collection);
  $('collection-stats').textContent = `${met} of ${state.pool.length} collected · ${rides} boarding${rides === 1 ? '' : 's'}. A character joins your collection when you confirm you boarded their bus.`;

  for (const entry of state.pool) {
    const owned = state.collection[entry.id];
    if (!owned) {
      const cell = el('div', 'cell locked', '?');
      cell.setAttribute('aria-label', 'Not collected yet');
      grid.append(cell);
      continue;
    }
    const detail = chars[entry.id];
    const cell = el('button', 'cell');
    cell.type = 'button';
    cell.setAttribute('aria-pressed', String(state.selectedId === entry.id));
    cell.append(avatar(detail, entry.name, 'cellimg'), el('span', 'cap', detail ? detail.name : entry.name));
    cell.addEventListener('click', () => { state.selectedId = state.selectedId === entry.id ? null : entry.id; renderCollection(); });
    grid.append(cell);
  }

  const detailBox = $('collection-detail');
  const sel = state.selectedId && state.collection[state.selectedId];
  detailBox.hidden = !sel;
  if (!sel) return;
  const entry = state.pool.find((c) => c.id === state.selectedId);
  const d = chars[state.selectedId];
  detailBox.textContent = '';
  detailBox.append(
    el('h2', '', d ? d.name : entry.name),
    el('p', '', `Last boarded as bus ${sel.svc} · first collected ${sel.first} · boarded ${sel.rides} time${sel.rides === 1 ? '' : 's'}`),
  );
}

// ---------- tabs ----------
function showTab(name) {
  state.tab = name;
  for (const btn of document.querySelectorAll('#tabs button')) btn.setAttribute('aria-selected', String(btn.dataset.tab === name));
  $('board').hidden = name !== 'board';
  $('scene').hidden = name !== 'scene';
  $('collection').hidden = name !== 'collection';
  if (name === 'scene') state.scene.start(); else state.scene.stop();
  if (name === 'collection') renderCollection();
}

// ---------- landing carousel ----------
let carouselTimer = null;
let carouselPausedUntil = 0;

async function buildCarousel() {
  const slots = assignPoolIndexes(PEEK_SERVICES, state.pool.length);
  const ids = PEEK_SERVICES.map((no) => state.pool[slots[no]].id);
  const chars = await ensureCharacters(ids);
  const track = $('track');
  const dots = $('dots');
  track.textContent = '';
  dots.textContent = '';
  PEEK_SERVICES.forEach((no, i) => {
    const entry = state.pool[slots[no]];
    const detail = chars[entry.id];
    const slide = el('article', 'slide');
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${i + 1} of ${PEEK_SERVICES.length}`);
    slide.append(avatar(detail, entry.name));
    const body = el('div');
    body.append(
      el('div', 'svc', `Bus ${no}`),
      el('div', 'char', detail ? detail.name : entry.name),
      el('p', 'line', pickLine(no, { mins: 3, load: 'SEA', weather: 'fair', monitored: 1 })),
    );
    slide.append(body);
    track.append(slide);
    dots.append(el('i'));
  });
  updateDots();
}

function carouselIndex() {
  const c = $('carousel');
  const slide = $('track').firstElementChild;
  if (!slide) return 0;
  const step = slide.getBoundingClientRect().width + 12;
  return Math.max(0, Math.min(PEEK_SERVICES.length - 1, Math.round(c.scrollLeft / step)));
}

function updateDots() {
  const i = carouselIndex();
  [...$('dots').children].forEach((d, n) => d.classList.toggle('on', n === i));
}

function goToSlide(i) {
  const c = $('carousel');
  const slide = $('track').children[i];
  if (!slide) return;
  const left = slide.offsetLeft - (c.clientWidth - slide.clientWidth) / 2;
  c.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
}

function startCarousel() {
  const c = $('carousel');
  c.addEventListener('scroll', () => requestAnimationFrame(updateDots), { passive: true });
  const pause = () => { carouselPausedUntil = Date.now() + 8000; };
  for (const ev of ['pointerdown', 'wheel', 'touchstart', 'focusin']) c.addEventListener(ev, pause, { passive: true });
  c.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { pause(); goToSlide((carouselIndex() + 1) % PEEK_SERVICES.length); }
    if (e.key === 'ArrowLeft') { pause(); goToSlide((carouselIndex() + PEEK_SERVICES.length - 1) % PEEK_SERVICES.length); }
  });
  if (reduceMotion) return; // no auto-advance for people who asked for less motion
  clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    if (document.hidden || $('landing').hidden || Date.now() < carouselPausedUntil) return;
    goToSlide((carouselIndex() + 1) % PEEK_SERVICES.length);
  }, 3500);
}

function showLanding(on) {
  $('landing').hidden = !on;
}

// ---------- stop picker ----------
function stopLabel(code) {
  const [, , name, road] = state.stops[code];
  return { name, road };
}

// Each stop has its own URL (?stop=CODE). The bare path always opens an empty home page.
function selectStop(code, { push = true } = {}) {
  state.stopCode = code;
  state.latest = null;
  state.confirming = null;
  store.set('last-stop', code);
  if (push) history.pushState({}, '', `${location.pathname}?stop=${encodeURIComponent(code)}`);
  const { name, road } = stopLabel(code);
  $('stop-name').textContent = name;
  $('stop-meta').textContent = `${road} · ${code}`;
  $('picker').hidden = true;
  $('refresh').hidden = false;
  $('home').hidden = false;
  $('tabs').hidden = false;
  showLanding(false);
  showTab(state.tab);
  renderState('Looking for buses…');
  refresh();
  startPolling();
}

function renderResults(codes, note) {
  const ul = $('results');
  ul.textContent = '';
  $('picker-msg').textContent = note || '';
  for (const code of codes) {
    const { name, road } = stopLabel(code);
    const li = el('li');
    const btn = el('button');
    btn.type = 'button';
    btn.append(el('div', 'n', name), el('div', 'm', `${road} · ${code}`));
    btn.addEventListener('click', () => selectStop(code));
    li.append(btn);
    ul.append(li);
  }
}

function searchStops(q) {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return renderResults([], 'Type at least 2 characters.');
  const hits = [];
  for (const [code, [, , name, road]] of Object.entries(state.stops)) {
    if (code.startsWith(query) || name.toLowerCase().includes(query) || road.toLowerCase().includes(query)) {
      hits.push(code);
      if (hits.length >= 25) break;
    }
  }
  renderResults(hits, hits.length ? '' : 'No stops match that.');
}

function findNearest() {
  if (!navigator.geolocation) return renderResults([], 'Location is not available here. Use search instead.');
  $('picker-msg').textContent = 'Finding where you are…';
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const scored = Object.entries(state.stops).map(([code, [lng, lat]]) => {
        const dLat = lat - coords.latitude;
        const dLng = (lng - coords.longitude) * Math.cos((coords.latitude * Math.PI) / 180);
        return [code, dLat * dLat + dLng * dLng];
      }).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([code]) => code);
      renderResults(scored, 'Nearest stops to you:');
    },
    () => renderResults([], 'Could not get your location. Use search instead.'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

function openPicker() {
  $('picker').hidden = false;
  $('stop-search').focus();
}

let carouselStarted = false;

function goHome({ push = true } = {}) {
  clearInterval(state.timer);
  state.stopCode = null;
  state.latest = null;
  state.confirming = null;
  state.scene.stop();
  if (push) history.pushState({}, '', location.pathname);

  $('stop-name').textContent = 'Pick a bus stop';
  $('stop-meta').textContent = '';
  $('refresh').hidden = true;
  $('home').hidden = true;
  $('tabs').hidden = true;
  $('board').textContent = '';
  for (const id of ['board', 'scene', 'collection']) $(id).hidden = true;
  showWeather(null);

  $('stop-search').value = '';
  $('results').textContent = '';
  $('picker-msg').textContent = '';
  $('picker').hidden = false;
  showLanding(true);

  const last = store.get('last-stop', null);
  const recent = $('recent');
  recent.textContent = '';
  recent.hidden = !(last && state.stops[last]);
  if (!recent.hidden) {
    const btn = el('button', 'ride', `Back to ${stopLabel(last).name}`);
    btn.type = 'button';
    btn.addEventListener('click', () => selectStop(last));
    recent.append(btn);
  }
  if (!carouselStarted) {
    carouselStarted = true;
    buildCarousel().then(startCarousel);
  }
}

function route() {
  const code = new URLSearchParams(location.search).get('stop');
  if (code && state.stops[code]) selectStop(code, { push: false });
  else goHome({ push: false });
}

// ---------- boot ----------
async function init() {
  const today = sgDate();
  const days = logOpen(store.get('open-days', []), today);
  store.set('open-days', days);
  $('open-days').textContent = `Opened on ${days.length} day${days.length === 1 ? '' : 's'} so far.`;

  state.scene = createScene($('scene-canvas'), { reduceMotion });
  // v2 holds boarded characters only. Carry over earlier entries the owner marked as ridden.
  state.collection = store.get('collection-v2', null) ?? migrateCollection(store.get('collection-v1', {}));
  state.showTaxis = store.get('taxi-spirits', true);
  $('taxi-toggle').checked = state.showTaxis;

  $('change-stop').addEventListener('click', openPicker);
  $('home').addEventListener('click', () => goHome());
  $('refresh').addEventListener('click', () => refresh());
  $('nearest').addEventListener('click', findNearest);
  $('stop-search').addEventListener('input', (e) => searchStops(e.target.value));
  for (const btn of document.querySelectorAll('#tabs button')) btn.addEventListener('click', () => showTab(btn.dataset.tab));
  $('taxi-toggle').addEventListener('change', (e) => {
    state.showTaxis = e.target.checked;
    store.set('taxi-spirits', state.showTaxis);
    refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.scene.stop();
    else { if (state.tab === 'scene' && state.stopCode) state.scene.start(); refresh(); }
  });

  try {
    await loadData();
  } catch {
    return renderState('Could not load the bus stop list. Reload to try again.');
  }
  window.addEventListener('popstate', route);
  route();
}

init();
