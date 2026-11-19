// Pure helpers for the Scene tab's stop-name label.
const PAD = 6;
const HEIGHT = 20;
const GAP = 6;
const MARGIN = 4;

/**
 * Pill rectangle for the stop label: above the stop, clear of an avatar of radius
 * avatarRadius centred on the stop, clamped inside the canvas. textMax is the widest
 * text (px) that fits the pill; ellipsize the name to it.
 */
export function stopLabelBox({ w, h, textWidth, avatarRadius }) {
  const width = Math.max(0, Math.min(textWidth + 2 * PAD, w - 2 * MARGIN));
  const x = Math.max(MARGIN, Math.min(w / 2 - width / 2, w - MARGIN - width));
  let y = h / 2 - avatarRadius - GAP - HEIGHT;
  if (y < MARGIN) y = h / 2 + avatarRadius + GAP; // no room above: go below
  y = Math.max(MARGIN, Math.min(y, h - MARGIN - HEIGHT));
  return { x, y, width, height: HEIGHT, textMax: Math.max(0, width - 2 * PAD) };
}

/** Shorten text with an ellipsis until measure(text) <= maxWidth. */
export function ellipsize(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;
  let s = text;
  while (s.length > 0 && measure(`${s}…`) > maxWidth) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
