// Double-click a character's picture: it floats out of the page, pulses twice, and a speech bubble shows the
// card's English line with its Japanese version underneath. Then the bubble goes and the picture flies back.
// The rest of the app is blocked while it plays (a full-screen backdrop plus `inert` on the page).

/** getBoundingClientRect() gives { left, top, width, height }; the layout works with { x, y, w, h }. */
export function rectToBox(r) {
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** Where the lifted picture and its bubble go, and the transform that places it exactly over the original. */
export function liftLayout({ vw, vh, from, bubbleH, aspect = from.h / from.w }) {
  const margin = 12;
  const gap = 16;
  const maxW = Math.min(220, vw * 0.55);
  const fitW = (vh - 2 * margin - bubbleH - gap) / aspect; // so the bubble and the picture fit on screen together
  const w = Math.max(60, Math.min(maxW, fitW));
  const h = w * aspect;
  const top = Math.max(margin, (vh - (bubbleH + gap + h)) / 2);
  const x = (vw - w) / 2;
  const y = top + bubbleH + gap;
  return {
    x, y, w, h, bubbleTop: top,
    start: { dx: from.x + from.w / 2 - (x + w / 2), dy: from.y + from.h / 2 - (y + h / 2), scale: from.w / w },
  };
}

/** How long each step takes, in milliseconds. Reduced motion keeps the pause but skips the movement. */
export function talkTimings({ reduceMotion = false, textLength = 0 }) {
  const hold = Math.min(5000, Math.max(1800, 1800 + textLength * 30));
  if (reduceMotion) return { backdrop: 0, float: 0, pulse: 0, pulses: 0, bubbleIn: 0, hold, bubbleOut: 0, back: 0 };
  return { backdrop: 250, float: 600, pulse: 450, pulses: 2, bubbleIn: 250, hold, bubbleOut: 250, back: 600 };
}

let playing = false;

/** Plays the whole sequence for one picture. Resolves when everything is back in place. */
export async function playTalk({ source, en, ja, name = '', reduceMotion = false }) {
  if (playing || !source) return;
  playing = true;
  const t = talkTimings({ reduceMotion, textLength: (en + ja).length });
  const rect = source.getBoundingClientRect();
  const card = source.closest('.card');

  // the pieces
  const backdrop = document.createElement('div');
  backdrop.className = 'talk-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', name ? `${name} says` : 'Speech bubble');
  backdrop.tabIndex = -1;
  for (const ev of ['wheel', 'touchmove']) backdrop.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

  const bubble = document.createElement('div');
  bubble.className = 'talk-bubble';
  const enP = document.createElement('p');
  enP.className = 'en';
  enP.textContent = en;
  const jaP = document.createElement('p');
  jaP.className = 'ja';
  jaP.lang = 'ja';
  jaP.textContent = ja;
  bubble.append(enP, jaP);
  bubble.style.visibility = 'hidden';

  let pic;
  if (source.tagName === 'IMG') {
    pic = document.createElement('img');
    pic.src = source.currentSrc || source.src;
    pic.alt = '';
    pic.referrerPolicy = 'no-referrer';
  } else {
    pic = document.createElement('div');
    pic.textContent = source.textContent;
  }
  pic.classList.add('talk-pic');
  backdrop.append(bubble, pic);
  document.body.append(backdrop);

  // lay out: measure the bubble, then place both
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = bubble.getBoundingClientRect().width;
  const L = liftLayout({ vw, vh, from: rectToBox(rect), bubbleH: bubble.getBoundingClientRect().height });
  Object.assign(pic.style, { left: `${L.x}px`, top: `${L.y}px`, width: `${L.w}px`, height: `${L.h}px` });
  Object.assign(bubble.style, { left: `${(vw - bw) / 2}px`, top: `${L.bubbleTop}px` });
  const away = `translate(${L.start.dx}px, ${L.start.dy}px) scale(${L.start.scale})`;
  pic.style.transform = away; // starts exactly over the original

  // block everything else
  const blocked = [...document.querySelectorAll('.top, main, footer')].map((n) => [n, n.inert]);
  for (const [n] of blocked) n.inert = true;
  if (card) card.classList.add('lifted');
  backdrop.focus({ preventScroll: true });

  const run = (el, frames, ms, easing = 'ease', extra = {}) => (ms > 0
    ? el.animate(frames, { duration: ms, easing, fill: 'both', ...extra }).finished
    : Promise.resolve());
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    // 1. the picture floats out of the page
    await Promise.all([
      run(backdrop, [{ opacity: 0 }, { opacity: 1 }], t.backdrop),
      run(pic, [{ transform: away, boxShadow: '0 0 0 rgba(0,0,0,0)' }, { transform: 'none', boxShadow: '0 22px 44px rgba(0,0,0,.5)' }], t.float, 'cubic-bezier(.2,.8,.2,1)'),
    ]);
    pic.style.transform = 'none';
    pic.style.boxShadow = '0 22px 44px rgba(0,0,0,.5)';
    // 2. it pulses twice while the bubble pops in, then the bubble stays long enough to read
    bubble.style.visibility = 'visible';
    run(pic, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], t.pulse, 'ease-in-out', { iterations: t.pulses });
    await Promise.all([
      run(bubble, [{ opacity: 0, transform: 'translateY(8px) scale(.94)' }, { opacity: 1, transform: 'none' }], t.bubbleIn, 'ease-out'),
      wait(Math.max(t.hold, t.pulse * t.pulses)),
    ]);
    // 3. the bubble disappears
    await run(bubble, [{ opacity: 1 }, { opacity: 0 }], t.bubbleOut);
    bubble.style.visibility = 'hidden';
    // 4. the picture goes back to where it came from
    await Promise.all([
      run(pic, [{ transform: 'none', boxShadow: '0 22px 44px rgba(0,0,0,.5)' }, { transform: away, boxShadow: '0 0 0 rgba(0,0,0,0)' }], t.back, 'cubic-bezier(.5,0,.8,.4)'),
      run(backdrop, [{ opacity: 1 }, { opacity: 0 }], t.back),
    ]);
  } finally {
    backdrop.remove();
    for (const [n, was] of blocked) n.inert = was;
    if (card) card.classList.remove('lifted');
    if (source.isConnected && source.tabIndex === 0) source.focus({ preventScroll: true });
    playing = false;
  }
}
