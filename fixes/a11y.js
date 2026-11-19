// Pure helpers for tab keyboard support and live-region announcements.

// Which tab a key moves to (wrapping), or null when the key is not a tab key.
export function nextTab(key, current, order) {
  const i = order.indexOf(current);
  if (key === 'ArrowRight') return order[(i + 1) % order.length];
  if (key === 'ArrowLeft') return order[(i - 1 + order.length) % order.length];
  if (key === 'Home') return order[0];
  if (key === 'End') return order[order.length - 1];
  return null;
}

const arriving = (s) => typeof s.next?.duration_ms === 'number' && s.next.duration_ms < 60000;

// Only meaningful changes: a service starting to arrive, appearing or disappearing.
export function announcements(prevServices, nextServices) {
  if (!prevServices) return [];
  const prev = new Map(prevServices.map((s) => [s.no, s]));
  const next = new Map(nextServices.map((s) => [s.no, s]));
  const out = [];
  for (const [no, s] of next) {
    const p = prev.get(no);
    if (!p) out.push(`Bus ${no} now serving this stop`);
    else if (arriving(s) && !arriving(p)) out.push(`Bus ${no} is arriving`);
  }
  for (const no of prev.keys()) if (!next.has(no)) out.push(`Bus ${no} no longer shown`);
  return out;
}
