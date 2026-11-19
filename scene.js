// Stage 3: living scene. A stylised radar-style map around the selected stop.
// Buses are drawn as their characters at their real GPS positions; taxis drift as small spirits;
// weather changes the sky and adds rain, lightning, haze, clouds or sparkles.
import { ringStep, sceneRadius } from './lib.js';
import { stopLabelBox, ellipsize } from './fixes/stop-label.js';

const TAU = Math.PI * 2;
const SKY = {
  fair: ['#2b4a7a', '#0f1830'],
  rain: ['#28405c', '#101b2b'],
  storm: ['#3a2d5c', '#120e22'],
  cloudy: ['#3a4559', '#151a25'],
  hazy: ['#5a4a38', '#1d1710'],
};
const LOAD_COLOR = { SEA: '#7be0a4', SDA: '#ffd166', LSD: '#ff7b7b' };

export function createScene(canvas, { reduceMotion = false } = {}) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let radius = 800;
  let targetRadius = 800;
  let flash = 0;
  let nextFlashAt = 0;

  let data = { stopName: '', buses: [], taxis: [], kind: 'fair', showTaxis: true, noGps: 0 };
  const sprites = new Map(); // bus key -> { x, y, tx, ty }
  const images = new Map(); // url -> HTMLImageElement
  const drops = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
  const motes = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * TAU, s: 0.2 + Math.random() }));
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: (i / 6) * 1.4 - 0.2, y: 0.1 + Math.random() * 0.8, r: 0.18 + Math.random() * 0.15, s: 0.004 + Math.random() * 0.006 }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(200, Math.round(rect.width));
    h = Math.max(200, Math.round(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getImage(url) {
    if (!url) return null;
    let img = images.get(url);
    if (!img) {
      img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      images.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  /** Replace what the scene shows. Bus positions glide to their new spots. */
  function setData(next) {
    data = { ...data, ...next };
    const live = new Set();
    for (const b of data.buses) {
      live.add(b.key);
      const s = sprites.get(b.key);
      if (s) { s.tx = b.x; s.ty = b.y; } else sprites.set(b.key, { x: b.x, y: b.y, tx: b.x, ty: b.y });
    }
    for (const key of [...sprites.keys()]) if (!live.has(key)) sprites.delete(key);
    targetRadius = sceneRadius(data.buses.filter((b) => b.first).map((b) => Math.hypot(b.x, b.y)));
    if (reduceMotion) { radius = targetRadius; for (const s of sprites.values()) { s.x = s.tx; s.y = s.ty; } }
    if (!running) draw(performance.now() / 1000);
  }

  function project(x, y, scale) {
    let px = x * scale;
    let py = -y * scale;
    const edge = (Math.min(w, h) / 2 - 30);
    const d = Math.hypot(px, py);
    if (d > edge) { px = (px / d) * edge; py = (py / d) * edge; }
    return [w / 2 + px, h / 2 + py];
  }

  function drawAvatar(url, name, x, y, r, ringColor) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.clip();
    const img = getImage(url);
    if (img) {
      const s = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
      const iw = img.naturalWidth * s;
      ctx.drawImage(img, x - iw / 2, y - r, iw, img.naturalHeight * s); // top-aligned: faces sit high
    } else {
      ctx.fillStyle = '#1b2236';
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.fillStyle = '#b9c0d4';
      ctx.font = `700 ${r}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((name || '?')[0], x, y);
    }
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ringColor;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }

  function drawWeatherBack(t) {
    const k = data.kind;
    if (k === 'cloudy' || k === 'hazy' || k === 'rain' || k === 'storm') {
      for (const c of clouds) {
        const cx = ((c.x + (reduceMotion ? 0 : t * c.s)) % 1.4 - 0.2) * w;
        const g = ctx.createRadialGradient(cx, c.y * h, 0, cx, c.y * h, c.r * w);
        const a = k === 'hazy' ? 0.2 : 0.13;
        g.addColorStop(0, `rgba(220,226,240,${a})`);
        g.addColorStop(1, 'rgba(220,226,240,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    }
    if (k === 'hazy') {
      ctx.fillStyle = 'rgba(255,196,130,0.10)';
      ctx.fillRect(0, 0, w, h);
    }
    if (k === 'fair' && !reduceMotion) {
      for (const m of motes) {
        const a = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * m.s + m.p));
        ctx.fillStyle = `rgba(255,230,170,${a})`;
        ctx.beginPath();
        ctx.arc(m.x * w, ((m.y - t * 0.01 * m.s) % 1 + 1) % 1 * h, 1.5 + m.s, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawWeatherFront(t) {
    const k = data.kind;
    if ((k === 'rain' || k === 'storm') && !reduceMotion) {
      const n = k === 'storm' ? drops.length : Math.round(drops.length * 0.6);
      ctx.strokeStyle = 'rgba(170,205,255,0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        const y = ((d.y + t * 0.9 * d.s) % 1) * (h + 40) - 20;
        const x = ((d.x + t * 0.12 * d.s) % 1) * w;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 14 * d.s);
      }
      ctx.stroke();
    }
    if (k === 'storm' && !reduceMotion) {
      if (t > nextFlashAt) { flash = 1; nextFlashAt = t + 3 + Math.random() * 5; }
      if (flash > 0.01) {
        ctx.fillStyle = `rgba(255,255,230,${flash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
        flash *= 0.9;
      }
    }
  }

  function draw(t) {
    radius += (targetRadius - radius) * (reduceMotion ? 1 : 0.04);
    const scale = (Math.min(w, h) / 2 - 30) / radius;
    const [top, bot] = SKY[data.kind] || SKY.fair;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, top);
    bg.addColorStop(1, bot);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    drawWeatherBack(t);

    // distance rings
    const step = ringStep(radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (let d = step; d <= radius; d += step) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, d * scale, 0, TAU);
      ctx.stroke();
      ctx.fillText(d >= 1000 ? `${d / 1000} km` : `${d} m`, w / 2 + d * scale * 0.71 + 4, h / 2 - d * scale * 0.71 - 2);
    }

    // taxi spirits
    if (data.showTaxis) {
      for (const [i, taxi] of data.taxis.entries()) {
        if (Math.hypot(taxi.x, taxi.y) > radius) continue;
        const wob = reduceMotion ? 0 : 1;
        const x = taxi.x + Math.sin(t * 0.5 + i) * 14 * wob;
        const y = taxi.y + Math.cos(t * 0.4 + i * 1.7) * 14 * wob;
        const [px, py] = project(x, y, scale);
        const a = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
        const g = ctx.createRadialGradient(px, py, 0, px, py, 9);
        g.addColorStop(0, `rgba(255,224,102,${a})`);
        g.addColorStop(1, 'rgba(255,224,102,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - 9, py - 9, 18, 18);
      }
    }

    // the stop
    const pulse = reduceMotion ? 0 : (t % 2) / 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - pulse)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 8 + pulse * 22, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 6, 0, TAU);
    ctx.fill();

    // buses: later buses first so the next one is on top
    const ordered = [...data.buses].sort((a, b) => Number(a.first) - Number(b.first));
    for (const b of ordered) {
      const s = sprites.get(b.key);
      if (!s) continue;
      if (reduceMotion) { s.x = s.tx; s.y = s.ty; } else { s.x += (s.tx - s.x) * 0.06; s.y += (s.ty - s.y) * 0.06; }
      const [px, py] = project(s.x, s.y, scale);
      const r = b.first ? 22 : 13;
      ctx.globalAlpha = b.first ? 1 : 0.7;
      drawAvatar(b.img, b.name, px, py, r, LOAD_COLOR[b.load] || '#b9c0d4');
      ctx.globalAlpha = 1;
      ctx.font = `700 ${b.first ? 13 : 11}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const label = b.mins <= 0 ? `${b.svc} · Arr` : `${b.svc} · ${b.mins}m`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(8,12,24,0.72)';
      ctx.fillRect(px - tw / 2, py + r + 3, tw, b.first ? 18 : 16);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, px, py + r + (b.first ? 16 : 14));
    }

    // stop name: drawn after the buses, above the marker, so a bus at the stop never hides it
    if (data.stopName) {
      ctx.font = '600 12px system-ui, sans-serif';
      const box = stopLabelBox({ w, h, textWidth: ctx.measureText(data.stopName).width, avatarRadius: 22 });
      ctx.fillStyle = 'rgba(8,12,24,0.8)';
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ellipsize(data.stopName, box.textMax, (s) => ctx.measureText(s).width), w / 2, box.y + 14);
    }

    drawWeatherFront(t);
    if (!data.buses.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No buses with live GPS yet', w / 2, h / 2 + 48);
    }
  }

  function frame(now) {
    if (!running) return;
    draw(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const ro = new ResizeObserver(() => { resize(); if (!running) draw(performance.now() / 1000); });
  ro.observe(canvas);
  resize();

  return { setData, start, stop };
}
