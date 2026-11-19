import {
  assignPoolIndexes, minutesAway, classifyForecast, nearest, pickLine, LOAD_LABEL, sgDate,
  metersFrom, recordBoarded, migrateCollection, collectionStats, findStop, createRefreshGate,
  findStops, historyAction, orderPool, recordOpen,
} from './lib.js';
import { createScene } from './scene.js';
import { sceneNote } from './fixes/plural-note.js';
import { collectionForPool, selectedEntry } from './fixes/pool-latent.js';
import { slideStep } from './fixes/carousel-wrap.js';
import { pickerState } from './fixes/picker-close.js';
import { announcements, nextTab } from './fixes/a11y.js';
import { loadBoard, reconcileKeys, avatarNeedsReplacing } from './board.js';

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
  forecast: null, forecastAt: 0, taxis: null, taxisAt: 0, taxisReq: null, weather: null,
  timer: null, tab: 'board',
  collection: {}, fresh: new Set(), selectedId: null, latest: null, confirming: null,
  scene: null, showTaxis: true,
};

// Only the newest stop's refresh may draw; a slower request for an older stop is dropped (review bug 1).
const gate = createRefreshGate();

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
    img.dataset.url = detail.img;
    img.alt = detail.name;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      const fallback = el('div', cls, fallbackName[0]);
      fallback.dataset.failedUrl = detail.img; // remember, so polls do not retry a broken URL
      img.replaceWith(fallback);
    });
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
      // Overlapping callers share one request.
      state.taxisReq ??= fetchJson(TAXI_API, undefined, 15000).then((json) => {
        state.taxis = json.features[0].geometry.coordinates; // [lng, lat] pairs
        state.taxisAt = Date.now();
      }).finally(() => { state.taxisReq = null; });
      await state.taxisReq;
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

// After the rider's own tap replaces the control they pressed, put focus on its safe button.
function focusSafeButton(no) {
  const card = [...$('board').children].find((c) => c.dataset.svc === no);
  const safe = card && card.querySelector('.board-ctl .safe');
  if (safe) safe.focus();
}

function confirmBoarding(no, entry) {
  const { collection, isNew, ignored } = recordBoarded(state.collection, { id: entry.id, svc: no }, sgDate());
  if (isNew) state.fresh.add(entry.id);
  state.confirming = null;
  if (!ignored) setCollection(collection);
  rerenderBoard();
  focusSafeButton(no);
}

function controlMode(no, entry) {
  return `${state.confirming === no ? 'confirm' : 'idle'}:${entry.id}`;
}

function boardControl(no, entry) {
  const wrap = el('span', 'board-ctl');
  wrap.dataset.mode = controlMode(no, entry);
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
      button('Cancel', 'ride safe', () => { state.confirming = null; rerenderBoard(); focusSafeButton(no); }),
    );
  } else {
    wrap.append(button('I boarded this', 'ride safe', () => { state.confirming = no; rerenderBoard(); focusSafeButton(no); }));
  }
  return wrap;
}

const ENTRY_CLASS_MS = 400;

function buildCard(no) {
  const card = el('article', 'card enter');
  card.dataset.svc = no;
  const who = el('div', 'who');
  who.append(el('div', 'svc'), el('div', 'char'));
  card.append(el('div', 'avatar'), who, el('div', 'eta'), el('div', 'tags'));
  // A timer, not animationend: that never fires under reduced motion.
  setTimeout(() => card.classList.remove('enter'), ENTRY_CLASS_MS);
  return card;
}

function updateAvatar(card, entry, detail) {
  const cur = card.firstElementChild;
  const want = detail && detail.img ? detail.img : undefined;
  const have = cur.dataset.url ?? cur.dataset.failedUrl;
  if (!avatarNeedsReplacing({ cardEntry: card.dataset.entry, entryId: entry.id, have, want })) return; // same picture: leave it loaded
  card.dataset.entry = String(entry.id);
  cur.replaceWith(avatar(detail, entry.name));
}

function updateCard(card, s, entry, detail, kind) {
  const buses = normaliseBuses(s);
  const first = buses[0];
  updateAvatar(card, entry, detail);

  const [who, eta, tags] = [card.children[1], card.children[2], card.children[3]];
  const svc = who.children[0];
  svc.textContent = s.no;
  if (s.operator) svc.append(el('small', '', s.operator));
  who.children[1].textContent = detail ? detail.name : entry.name;
  const lineText = first ? pickLine(s.no, { mins: first.mins, load: first.load, weather: kind, monitored: first.monitored }) : null;
  const line = who.querySelector('.line');
  if (lineText === null) { if (line) line.remove(); }
  else if (line) { if (line.textContent !== lineText) line.textContent = lineText; }
  else who.append(el('p', 'line', lineText));

  eta.textContent = '';
  if (first) {
    eta.append(el('div', 'big', first.mins <= 0 ? 'Arr' : String(first.mins)));
    if (first.mins > 0) eta.append(el('div', 'unit', 'min'));
    const later = buses.slice(1).map((b) => (b.mins <= 0 ? 'Arr' : `${b.mins}`));
    if (later.length) eta.append(el('div', 'then', `then ${later.join(', ')}`));
  } else {
    eta.append(el('div', 'unit', 'No ETA'));
  }

  // Tags are plain text and rebuilt; the boarding control stays put unless its mode changed.
  let ctl = tags.querySelector('.board-ctl');
  for (const child of [...tags.children]) if (child !== ctl) child.remove();
  const info = [];
  if (state.collection[entry.id]) {
    info.push(el('span', 'tag collected', state.fresh.has(entry.id) ? 'Added to your collection!' : 'In your collection'));
  }
  if (first && LOAD_LABEL[first.load]) info.push(el('span', `tag ${first.load}`, LOAD_LABEL[first.load]));
  if (first && first.type === 'DD') info.push(el('span', 'tag', 'Double deck'));
  if (first && first.type === 'BD') info.push(el('span', 'tag', 'Bendy'));
  if (first && !first.monitored) info.push(el('span', 'tag', 'No live GPS yet'));
  if (ctl && ctl.dataset.mode !== controlMode(s.no, entry)) { ctl.remove(); ctl = null; }
  // Never re-append an existing control: moving a node in the DOM drops keyboard focus.
  if (ctl) ctl.before(...info);
  else tags.append(...info, boardControl(s.no, entry));
}

// Idempotent: updates cards in place, keyed by service number, so focus, images and animations survive polls.
function renderServices({ services, weather, chars, slots }) {
  const board = $('board');
  const kind = weather ? weather.kind : 'fair';
  const existing = new Map();
  for (const child of [...board.children]) {
    if (child.classList.contains('card')) existing.set(child.dataset.svc, child);
    else child.remove(); // a message such as "Looking for buses…"
  }
  const { remove, order } = reconcileKeys([...existing.keys()], services.map((s) => s.no));
  for (const no of remove) existing.get(no).remove();

  const byNo = new Map(services.map((s) => [s.no, s]));
  order.forEach((no, i) => {
    const s = byNo.get(no);
    const entry = state.pool[slots[no]];
    const card = existing.get(no) ?? buildCard(no);
    updateCard(card, s, entry, chars[entry.id], kind);
    if (board.children[i] !== card) board.insertBefore(card, board.children[i] ?? null);
  });
}

// ---------- Stage 3 scene data ----------
async function updateScene({ services, chars, slots, stop }, ticket, code) {
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
  if (!gate.isCurrent(ticket)) return;
  state.scene.setData({ stopKey: code, stopName: stopLabel(code).name, buses, taxis, showTaxis: state.showTaxis, kind: document.body.dataset.weather });
  const placed = buses.filter((b) => b.first).length;
  $('scene-note').textContent = sceneNote(placed, noGps);
}

async function refresh() {
  const code = state.stopCode;
  if (!code) return;
  const ticket = gate.begin(code);
  if (!ticket) return; // this stop is already refreshing
  const stop = findStop(state.stops, code);
  if (!stop) { gate.end(ticket); return; }
  const [lng, lat] = stop;
  const isCurrent = () => gate.isCurrent(ticket); // false once the user picks another stop or goes Home
  let picked = null;
  let done = Promise.resolve();
  try {
    // Bus times draw first. Weather and artwork are filled in later and never block or break the board.
    ({ done } = await loadBoard({
      fetchArrivals: () => fetchJson(`${ARRIVALS_API}?id=${encodeURIComponent(code)}`),
      fetchWeather: async () => {
        const w = await getWeather(lat, lng);
        if (w) state.weather = { code, w };
        return w;
      },
      fetchChars: (ids) => ensureCharacters(ids),
      cachedChars: () => store.get('chars-v1', {}),
      lastWeather: () => (state.weather && state.weather.code === code ? state.weather.w : null),
      isCurrent,
      prepare: (arrivals) => {
        const services = (arrivals.services || []).filter((s) => s.next || s.subsequent);
        if (!services.length) {
          renderState('No buses right now. Service may have ended for tonight, or nothing is due here yet.', true);
          state.scene.setData({ stopKey: code, stopName: stopLabel(code).name, buses: [], taxis: [], kind: document.body.dataset.weather });
          $('scene-note').textContent = 'No buses due';
          return null;
        }
        services.sort((a, b) => (a.next?.duration_ms ?? Infinity) - (b.next?.duration_ms ?? Infinity));
        const slots = assignPoolIndexes(services.map((s) => s.no), state.pool.length);
        picked = { services, slots };
        return services.map((s) => state.pool[slots[s.no]].id);
      },
      onEmpty: ({ weather }) => showWeather(weather),
      render: ({ weather, chars }) => {
        showWeather(weather);
        const latest = { ...picked, weather, chars, stop };
        const said = announcements(state.latest?.services, latest.services);
        if (said.length) $('announcer').textContent = said.join('. ');
        state.latest = latest;
        renderServices(latest);
        updateScene(latest, ticket, code).catch(() => {});
      },
    }));
  } catch {
    if (isCurrent()) {
      renderState(navigator.onLine === false
        ? 'You look offline. Reconnect and try again.'
        : 'Could not reach the bus times service. It is a free community service and may be busy.', true);
    }
  } finally {
    // The ticket stays valid until weather and artwork have been applied, so those late draws are not dropped as stale.
    done.catch(() => {}).finally(() => gate.end(ticket));
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
  const visible = collectionForPool(state.pool, state.collection);
  const { met, rides } = collectionStats(visible);
  $('collection-stats').textContent = `${met} of ${state.pool.length} collected · ${rides} boarding${rides === 1 ? '' : 's'}. A character joins your collection when you confirm you boarded their bus.`;

  for (const entry of orderPool(state.pool, visible)) {
    const owned = visible[entry.id];
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
  const entry = selectedEntry(state.pool, state.selectedId);
  const sel = entry && visible[entry.id];
  detailBox.hidden = !sel;
  if (!sel) return;
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
  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.setAttribute('aria-selected', String(btn.dataset.tab === name));
    btn.tabIndex = btn.dataset.tab === name ? 0 : -1;
  }
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

function goToSlide(i, smooth = true) {
  const c = $('carousel');
  const slide = $('track').children[i];
  if (!slide) return;
  const left = slide.offsetLeft - (c.clientWidth - slide.clientWidth) / 2;
  c.scrollTo({ left: Math.max(0, left), behavior: reduceMotion || !smooth ? 'auto' : 'smooth' });
}

function startCarousel() {
  const c = $('carousel');
  c.addEventListener('scroll', () => requestAnimationFrame(updateDots), { passive: true });
  const pause = () => { carouselPausedUntil = Date.now() + 8000; };
  for (const ev of ['pointerdown', 'wheel', 'touchstart', 'focusin']) c.addEventListener(ev, pause, { passive: true });
  c.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      pause();
      const step = slideStep(carouselIndex(), PEEK_SERVICES.length, e.key === 'ArrowRight' ? 1 : -1);
      goToSlide(step.index, step.smooth);
    }
  });
  if (reduceMotion) return; // no auto-advance for people who asked for less motion
  clearInterval(carouselTimer);
  carouselTimer = setInterval(() => {
    if (document.hidden || $('landing').hidden || Date.now() < carouselPausedUntil) return;
    const step = slideStep(carouselIndex(), PEEK_SERVICES.length, 1);
    goToSlide(step.index, step.smooth);
  }, 3500);
}

function showLanding(on) {
  $('landing').hidden = !on;
}

// ---------- stop picker ----------
function stopLabel(code) {
  const [, , name, road] = findStop(state.stops, code);
  return { name, road };
}

// Each stop has its own URL (?stop=CODE). The bare path always opens an empty home page.
function showOpenDays(days) {
  $('open-days').textContent = `Used at a stop on ${days.length} day${days.length === 1 ? '' : 's'} so far.`;
}

function selectStop(code, { push = true } = {}) {
  const action = historyAction(state.stopCode, code); // before state.stopCode changes
  state.stopCode = code;
  state.latest = null;
  state.confirming = null;
  store.set('last-stop', code);
  const days = recordOpen(store.get('open-days', []), sgDate(), 'stop');
  store.set('open-days', days);
  showOpenDays(days);
  if (push) history[action === 'replace' ? 'replaceState' : 'pushState']({}, '', `${location.pathname}?stop=${encodeURIComponent(code)}`);
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
  const { codes, total } = findStops(state.stops, query);
  let note = '';
  if (!total) note = 'No stops match that.';
  else if (total > codes.length) note = `Showing ${codes.length} of ${total}. Keep typing to narrow.`;
  renderResults(codes, note);
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

function closePicker(event) {
  if (pickerState({ hasStop: Boolean(state.stopCode), event }).close) $('picker').hidden = true;
}

function openPicker() {
  $('picker-cancel').hidden = !pickerState({ hasStop: Boolean(state.stopCode), event: 'open' }).showCancel;
  $('picker').hidden = false;
  $('stop-search').focus();
}

let carouselStarted = false;

function goHome({ push = true } = {}) {
  clearInterval(state.timer);
  gate.cancel(); // an in-flight refresh must not draw on the home page
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
  recent.hidden = !findStop(state.stops, last);
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
  try {
    if (findStop(state.stops, code)) selectStop(code, { push: false });
    else goHome({ push: false });
  } catch {
    goHome({ push: false }); // never leave a blank page
  }
}

// ---------- boot ----------
async function init() {
  showOpenDays(store.get('open-days', []));

  state.scene = createScene($('scene-canvas'), { reduceMotion });
  // v2 holds boarded characters only. Carry over earlier entries the owner marked as ridden.
  state.collection = store.get('collection-v2', null) ?? migrateCollection(store.get('collection-v1', {}));
  state.showTaxis = store.get('taxi-spirits', true);
  $('taxi-toggle').checked = state.showTaxis;

  $('change-stop').addEventListener('click', openPicker);
  $('home').addEventListener('click', () => goHome());
  $('picker-cancel').addEventListener('click', () => closePicker('cancel'));
  $('stop-search').addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker('escape'); });
  $('refresh').addEventListener('click', () => refresh());
  $('nearest').addEventListener('click', findNearest);
  $('stop-search').addEventListener('input', (e) => searchStops(e.target.value));
  for (const btn of document.querySelectorAll('#tabs button')) {
    btn.addEventListener('click', () => { closePicker('tab'); showTab(btn.dataset.tab); });
    btn.addEventListener('keydown', (e) => {
      const order = [...document.querySelectorAll('#tabs button')].map((b) => b.dataset.tab);
      const to = nextTab(e.key, btn.dataset.tab, order);
      if (!to) return;
      e.preventDefault();
      closePicker('tab');
      showTab(to);
      document.getElementById(`tab-${to}`).focus();
    });
  }
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
