// Heading anchors, as GitHub and Starlight render them: a correct link passes
// and a wrong one fails, for each heading form.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { githubAnchors, page } from '../src/markdown.mjs';
import { doc } from './helpers.mjs';

// Each case: a heading, the anchor both render, and a wrong anchor.
const CASES = [
  ['intraword underscores are text', '## Q8_0 blocks', 'q8_0-blocks', 'q80-blocks'],
  ['underscores in a code span are text', '## Inside `gemm_rows<Q4_K>`', 'inside-gemm_rowsq4_k', 'inside-gemmrowsq4k'],
  ['emphasis underscores are dropped', '## The _fast_ path', 'the-fast-path', 'the-_fast_-path'],
  ['emphasis asterisks are dropped', '## A **bold** move', 'a-bold-move', 'a-bold-move-1'],
  ['a link becomes its text', '## See [the guide](guide.md)', 'see-the-guide', 'see-the-guideguidemd'],
  ['a setext heading', 'Setext title\n------------', 'setext-title', 'setext-title-1'],
  ['an ATX heading indented by three spaces', '   ## Indented', 'indented', 'indented-1'],
  ['an entity is decoded', '## A &amp; B', 'a--b', 'a-amp-b'],
  ['a code span closes on a run as long as its opening', '## ``foo`_bar_``', 'foo_bar_', 'foobar'],
  ['inline HTML is dropped, its text kept', '## The <code>run</code> step', 'the-run-step', 'the-coderuncode-step'],
  ['a closing sequence is dropped', '## Closed ##', 'closed', 'closed-'],
];

for (const [name, heading, good, bad] of CASES) {
  test(`${name}: #${good} passes, #${bad} fails`, () => {
    assert.deepEqual(doc(`${heading}\n\n[ok](#${good})`).errors, []);
    assert.deepEqual(doc(`${heading}\n\n[no](#${bad})`).errors.length, 1);
    // The same anchor on GitHub, through the README fallback.
    assert.ok(githubAnchors(`# R\n\n${heading}\n`).has(good));
  });
}

test('a custom anchor, <a name> or id=, can be linked', () => {
  const body = '<a name="setup"></a>\n\nText <span id="note">here</span>.';
  assert.deepEqual(doc(`${body}\n\n[a](#setup) [b](#note)`).errors, []);
  assert.deepEqual([...githubAnchors(body)].sort(), ['note', 'setup']);
});

test('repeated headings are numbered, the title taking no number on the site', () => {
  const p = page('# Notes\n\n## Notes\n\n## Notes\n');
  assert.deepEqual([...p.anchors], ['notes', 'notes-1']);
  assert.deepEqual([...githubAnchors('# Notes\n\n## Notes\n')], ['notes', 'notes-1']);
});

test('headings in code are not headings', () => {
  const p = page('# T\n\n```\n## Not a heading\n```\n\n    ## Indented code\n');
  assert.deepEqual([...p.anchors], []);
});

test('front matter is not read as a setext heading', () => {
  const p = page('---\nstatus: draft\nissue: x\n---\n# Title\n');
  assert.equal(p.title, 'Title');
  assert.deepEqual([...p.anchors], []);
  assert.deepEqual(p.titleLines, [5, 5]);
});

test('a setext title is removed from the page, both lines', () => {
  const r = doc('', { 'docs/guide.md': 'Guide\n=====\n\nBody.\n' });
  assert.deepEqual(r.errors, []);
  assert.match(r.read('src/content/docs/guide.md'), /---\nBody\.\n$/);
});

test('the title is the rendered text', () => {
  assert.equal(page('# The `gemm` &amp; *fast* kernel\n').title, 'The gemm & fast kernel');
});
