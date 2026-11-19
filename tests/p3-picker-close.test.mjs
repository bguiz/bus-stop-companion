import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickerState } from '../fixes/picker-close.js';

test('Cancel shows only when a stop is open', () => {
  assert.equal(pickerState({ hasStop: true, event: 'open' }).showCancel, true);
  assert.equal(pickerState({ hasStop: false, event: 'open' }).showCancel, false);
});

test('with a stop open, tab switch, Escape and Cancel close the picker', () => {
  for (const event of ['tab', 'escape', 'cancel', 'select', 'home']) {
    assert.equal(pickerState({ hasStop: true, event }).close, true, event);
  }
  assert.equal(pickerState({ hasStop: true, event: 'open' }).close, false);
});

test('home page picker never closes by tab, Escape or Cancel', () => {
  for (const event of ['tab', 'escape', 'cancel']) {
    assert.equal(pickerState({ hasStop: false, event }).close, false, event);
  }
  assert.equal(pickerState({ hasStop: false, event: 'select' }).close, true);
});

test('markup has a Cancel button inside the picker', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const picker = html.slice(html.indexOf('id="picker"'), html.indexOf('</section>', html.indexOf('id="picker"')));
  assert.match(picker, /id="picker-cancel"/);
});
