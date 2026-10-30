// The check of the built HTML.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkDist } from '../src/check-dist.mjs';

function dist(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-kit-dist-'));
  for (const [rel, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), html);
  }
  return dir;
}

const page = (body) => `<!doctype html><html><body>\n${body}\n</body></html>`;

test('root-relative and relative links resolve, with their anchors', () => {
  const d = dist({
    'index.html': page('<a href="/r/a/#top">a</a> <a href="a/">a</a> <a href="./a/#top">a</a> <a href="#self" id="self">s</a>'),
    'a/index.html': page('<h2 id="top">Top</h2> <a href="../">home</a> <a href="../b/">b</a> <a href="#gone">x</a>'),
  });
  const r = checkDist(d, '/r/');
  assert.equal(r.checked, 7);
  assert.deepEqual(r.broken, ['a/index.html:2: ../b/ does not exist', 'a/index.html:2: no id for #gone']);
});

test('only real elements count: not markup in code or comments', () => {
  const d = dist({
    'index.html': page([
      '<pre><code>&lt;a href="/r/missing/"&gt; id="fake"</code></pre>',
      '<!-- <a href="/r/also-missing/"></a> <span id="hidden"></span> -->',
      '<a href="#fake">f</a> <a href="#hidden">h</a>',
    ].join('\n')),
  });
  assert.deepEqual(checkDist(d, '/r/').broken, ['index.html:4: no id for #fake', 'index.html:4: no id for #hidden']);
});

test('a link outside the base, and the API reference', () => {
  const d = dist({ 'index.html': page('<a href="/other/">o</a> <a href="/r/api/">api</a>') });
  assert.deepEqual(checkDist(d, '/r/').broken, ['index.html:2: /other/ is outside the base /r/']);
});
