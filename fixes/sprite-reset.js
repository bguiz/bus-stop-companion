// Decide which bus sprites survive a scene update.
// Positions are relative to the selected stop, so a different stop drops every sprite
// (buses then appear in place instead of gliding). Absent services are always dropped.
export function reconcileSprites(prev, prevStopKey, stopKey, buses) {
  const reset = prevStopKey !== stopKey;
  const next = new Map();
  for (const b of buses) {
    const s = reset ? null : prev.get(b.key);
    if (s) { s.tx = b.x; s.ty = b.y; next.set(b.key, s); } else next.set(b.key, { x: b.x, y: b.y, tx: b.x, ty: b.y });
  }
  return { sprites: next, reset };
}
