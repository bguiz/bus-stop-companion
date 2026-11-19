// Double-clicking a character's picture with full motion: the animation steps happen in order, and the picture
// is really placed on screen (a past bug left every position NaN, so nothing was positioned).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { bootApp, arrivals, service, bus, settle } from './helpers/browser.mjs';

const app = await bootApp({
  url: '/?stop=53009',
  routes: { arrivals: arrivals(service('96', bus(3), bus(10))) },
  reduceMotion: false,
});
after(() => app.close());

const steps = [];
app.window.HTMLElement.prototype.animate = function animate(frames, opts) {
  steps.push({ on: this.className, frames, opts });
  return { finished: Promise.resolve() };
};

const card = app.cards()[0];
const av = card.firstElementChild;
av.getBoundingClientRect = () => ({ left: 20, top: 200, width: 76, height: 100, right: 96, bottom: 300, x: 20, y: 200 });
av.dispatchEvent(new app.window.MouseEvent('dblclick', { bubbles: true }));
await settle(60);

const pic = () => app.document.querySelector('.talk-pic');
const bubble = () => app.document.querySelector('.talk-bubble');

test('the steps run in order: backdrop fades in, the picture floats out, it pulses twice, the bubble pops in', () => {
  assert.deepEqual(steps.map((s) => [s.on, s.opts.duration]), [
    ['talk-backdrop', 250], ['talk-pic', 600], ['talk-pic', 450], ['talk-bubble', 250],
  ]);
  assert.equal(steps[2].opts.iterations, 2, 'two pulses');
  assert.equal(steps[1].opts.fill, 'both');
});

test('the float starts exactly over the original picture and ends with no transform', () => {
  const [from, to] = steps[1].frames;
  assert.match(from.transform, /^translate\(.+px, .+px\) scale\(.+\)$/);
  assert.equal(to.transform, 'none');
  assert.ok(Number(from.transform.match(/scale\(([\d.]+)\)/)[1]) < 1, 'it starts smaller than its final size');
});

test('the picture and the bubble are positioned with real numbers on a 400 x 800 screen', () => {
  const finite = (v) => /^-?\d+(\.\d+)?px$/.test(v);
  for (const k of ['left', 'top', 'width', 'height']) assert.ok(finite(pic().style[k]), `${k}: ${pic().style[k]}`);
  for (const k of ['left', 'top']) assert.ok(finite(bubble().style[k]), `bubble ${k}: ${bubble().style[k]}`);
  const left = parseFloat(pic().style.left);
  const width = parseFloat(pic().style.width);
  assert.ok(Math.abs(left + width / 2 - 200) < 1, 'the picture is centred horizontally');
});

test('the bubble is shown once the picture has landed', () => {
  assert.equal(bubble().style.visibility, 'visible');
});
