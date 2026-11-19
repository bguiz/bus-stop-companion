import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneNote } from '../fixes/plural-note.js';

const cases = [
  [0, 0, '0 buses placed'],
  [1, 0, '1 bus placed'],
  [2, 0, '2 buses placed'],
  [0, 1, '0 buses placed, 1 bus has no live GPS yet'],
  [1, 1, '1 bus placed, 1 bus has no live GPS yet'],
  [1, 11, '1 bus placed, 11 buses have no live GPS yet'],
  [2, 2, '2 buses placed, 2 buses have no live GPS yet'],
  [0, 5, '0 buses placed, 5 buses have no live GPS yet'],
];
for (const [p, g, want] of cases) {
  test(`sceneNote(${p}, ${g})`, () => assert.equal(sceneNote(p, g), want));
}
