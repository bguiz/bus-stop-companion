// The app is called "Bus stop aibou" (相棒). These tests keep the old working title out of the app files
// and make sure the new name and its Japanese word are shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), 'utf8');

// Every text file of the app. VIDEO_SCRIPT.md belongs to a separate video project and is not scanned.
const SKIP_DIRS = new Set(['.git', '.claude', '.agents', 'node_modules', 'media', 'data', 'icons']);
const SKIP_FILES = new Set(['VIDEO_SCRIPT.md', 'skills-lock.json', 'CLAUDE.md']);
function files(dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (!SKIP_FILES.has(name) && /\.(html|js|mjs|css|json|md|py|svg|webmanifest)$/.test(name)) out.push(relative(root, p));
  }
  return out;
}

test('the old working title appears nowhere in the app files', () => {
  const offenders = files().filter((f) => f !== 'tests/p4-rename.test.mjs' && /bus[ -]stop[ -]companion/i.test(read(f)));
  assert.deepEqual(offenders, []);
});

test('the page title is "Bus stop aibou"', () => {
  assert.match(read('index.html'), /<title>Bus stop aibou<\/title>/);
});

test('the landing heading shows the name and 相棒 marked as Japanese', () => {
  const html = read('index.html');
  assert.match(html, /<h1>Bus stop aibou\s*<span[^>]*lang="ja"[^>]*>相棒<\/span><\/h1>/);
});

test('the web manifest uses the new name and a short label', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'Bus stop aibou');
  assert.equal(m.short_name, 'Aibou');
});

test('the package name follows the app name', () => {
  assert.equal(JSON.parse(read('package.json')).name, 'bus-stop-aibou');
});

test('the README and PRD titles carry the new name and 相棒', () => {
  assert.match(read('README.md').split('\n')[0], /^# Bus stop aibou 相棒/);
  assert.match(read('PRD.md').split('\n')[0], /^# PRD: Bus stop aibou 相棒/);
});
