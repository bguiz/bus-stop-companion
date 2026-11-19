import {
  assignPoolIndexes, minutesAway, classifyForecast, nearest, pickLine, LOAD_LABEL, sgDate, logOpen,
} from './lib.js';

const ARRIVALS_API = 'https://arrivelah2.busrouter.sg/';
const FORECAST_API = 'https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast';
const ANILIST_API = 'https://graphql.anilist.co';
const REFRESH_MS = 20000; // arrivelah2 caches for ~15s; never poll faster
const FORECAST_TTL_MS = 5 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// localStorage can throw (private mode, blocked): never let it break the page.
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

const state = { stops: {}, pool: [], stopCode: null, forecast: null, forecastAt: 0, timer: null, busy: false };

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
  const missing = ids.filter((id) => !cache[id]);
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
    } catch { /* fall back to names from the repo snapshot below */ }
  }
  return cache;
}

// ---------- weather (data.gov.sg 2-hour forecast, nearest area to the stop) ----------
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
      mins: minutesAway(b.duration_ms), load: b.load, monitored: b.monitored === 1 && !(b.lat === 0 && b.lng === 0),
      type: b.type,
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

function renderServices(services, weather, chars) {
  const board = $('board');
  board.textContent = '';
  const nos = services.map((s) => s.no);
  const slots = assignPoolIndexes(nos, state.pool.length);
  const kind = weather ? weather.kind : 'fair';

  for (const s of services) {
    const buses = normaliseBuses(s);
    const first = buses[0];
    const entry = state.pool[slots[s.no]];
    const detail = chars[entry.id];
    const card = el('article', 'card');

    if (detail && detail.img) {
      const img = el('img', 'avatar');
      img.src = detail.img;
      img.alt = detail.name;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.replaceWith(el('div', 'avatar', entry.name[0])));
      card.append(img);
    } else {
      card.append(el('div', 'avatar', entry.name[0]));
    }

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
    if (first && LOAD_LABEL[first.load]) tags.append(el('span', `tag ${first.load}`, LOAD_LABEL[first.load]));
    if (first && first.type === 'DD') tags.append(el('span', 'tag', 'Double deck'));
    if (first && first.type === 'BD') tags.append(el('span', 'tag', 'Bendy'));
    if (first && !first.monitored) tags.append(el('span', 'tag', 'No live GPS yet'));
    if (tags.children.length) card.append(tags);

    board.append(card);
  }
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
      return;
    }
    services.sort((a, b) => (a.next?.duration_ms ?? Infinity) - (b.next?.duration_ms ?? Infinity));
    const nos = services.map((s) => s.no);
    const slots = assignPoolIndexes(nos, state.pool.length);
    const chars = await ensureCharacters(nos.map((no) => state.pool[slots[no]].id));
    renderServices(services, weather, chars);
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

// ---------- stop picker ----------
function stopLabel(code) {
  const [, , name, road] = state.stops[code];
  return { name, road };
}

function selectStop(code) {
  state.stopCode = code;
  store.set('last-stop', code);
  const { name, road } = stopLabel(code);
  $('stop-name').textContent = name;
  $('stop-meta').textContent = `${road} · ${code}`;
  $('picker').hidden = true;
  $('refresh').hidden = false;
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

// ---------- boot ----------
async function init() {
  const today = sgDate();
  const days = logOpen(store.get('open-days', []), today);
  store.set('open-days', days);
  $('open-days').textContent = `Opened on ${days.length} day${days.length === 1 ? '' : 's'} so far.`;

  $('change-stop').addEventListener('click', openPicker);
  $('refresh').addEventListener('click', () => refresh());
  $('nearest').addEventListener('click', findNearest);
  $('stop-search').addEventListener('input', (e) => searchStops(e.target.value));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  try {
    await loadData();
  } catch {
    return renderState('Could not load the bus stop list. Reload to try again.');
  }
  const last = store.get('last-stop', null);
  if (last && state.stops[last]) selectStop(last);
  else {
    openPicker();
    renderState('Pick your stop to meet the buses.');
  }
}

init();
