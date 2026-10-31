import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doc, repo } from './helpers.mjs';

test('a link to a document becomes a link to its page', () => {
  const r = repo({
    'docs/a/one.md': '# One\n\nSee [two](two.md) and [b](../b/).\n',
    'docs/a/two.md': '# Two\n',
    'docs/b/README.md': '# B\n',
  });
  assert.deepEqual(r.errors, []);
  assert.match(r.read('src/content/docs/a/one.md'), /\[two\]\(\/a\/two\/\) and \[b\]\(\/b\/\)/);
});

test('a broken link fails, naming the file and line', () => {
  const r = doc('Text.\n\n[x](nope.md)');
  assert.deepEqual(r.errors, ['docs/guide.md:5: link target nope.md does not exist']);
});

test('a broken anchor fails, and a real one passes', () => {
  const r = repo({
    'docs/a.md': '# A\n\n[ok](b.md#setup) [bad](b.md#nope) [self](#here) [self-bad](#gone)\n\n## Here\n',
    'docs/b.md': '# B\n\n## Setup\n',
  });
  assert.deepEqual(r.errors, [
    'docs/a.md:3: docs/b.md has no heading for anchor #nope',
    'docs/a.md:3: no heading for anchor #gone',
  ]);
});

test('a link to any other repo file goes to GitHub', () => {
  const r = doc('[src](../src/main.cpp) [dir](../src/)', { 'src/main.cpp': 'int main() {}\n' });
  assert.deepEqual(r.errors, []);
  assert.match(
    r.read('src/content/docs/guide.md'),
    /\(https:\/\/github\.com\/branes-ai\/demo\/blob\/main\/src\/main\.cpp\) \[dir\]\(https:\/\/github\.com\/branes-ai\/demo\/tree\/main\/src\)/,
  );
});

test('anchors on GitHub-rendered Markdown are checked, the title included', () => {
  const readme = '# demo\n\n## Building\n';
  const ok = doc('[a](../README.md#building) [t](../README.md#demo)', { 'README.md': readme });
  assert.deepEqual(ok.errors, []);
  const bad = doc('[a](../README.md#nope)', { 'README.md': readme });
  assert.deepEqual(bad.errors, ['docs/guide.md:3: README.md has no heading for anchor #nope']);
});

test('a link that leaves the repository, or is root-relative, fails', () => {
  const r = doc('[up](../../x.md) [root](/guide/)');
  assert.deepEqual(r.errors, [
    'docs/guide.md:3: link ../../x.md leaves the repository',
    'docs/guide.md:3: root-relative link /guide/; use a path relative to the document',
  ]);
});

test('links in code spans and code blocks are left alone', () => {
  const r = doc('`[x](nope.md)`\n\n```md\n[x](nope.md)\n```');
  assert.deepEqual(r.errors, []);
});

test('a four-backtick fence can show a three-backtick example', () => {
  const r = doc('````md\n```\n[x](nope.md)\n```\n````\n\n[after](missing.md)');
  // Only the link after the fence is checked.
  assert.deepEqual(r.errors, ['docs/guide.md:9: link target missing.md does not exist']);
});

test('a fence closes only on its own character, at least as long, with nothing after', () => {
  const r = doc('~~~\n```\n[x](a.md)\n~~~~\n\n```js\n``` not a close\n[y](b.md)\n```');
  assert.deepEqual(r.errors, []);
});

test('an image in docs/ is copied next to its page', () => {
  const r = doc('![d](img/d.svg)', { 'docs/img/d.svg': '<svg/>' });
  assert.deepEqual(r.errors, []);
  assert.ok(r.exists('src/content/docs/img/d.svg'));
});

test('a link to an image in docs/ goes to GitHub; only a shown image is copied', () => {
  const r = doc('See [the plot](img/p.png), and [![d](img/d.svg)](img/big.svg).\n\n![\\[x\\]](img/e.svg) [a \\[b\\] c](img/f.svg)', {
    'docs/img/p.png': 'png',
    'docs/img/d.svg': '<svg/>',
    'docs/img/big.svg': '<svg/>',
    'docs/img/e.svg': '<svg/>',
    'docs/img/f.svg': '<svg/>',
  });
  assert.deepEqual(r.errors, []);
  const page = r.read('src/content/docs/guide.md');
  const blob = 'https://github.com/branes-ai/demo/blob/main/docs/img';
  assert.ok(page.includes(`[the plot](${blob}/p.png)`), page);
  assert.ok(page.includes(`[![d](img/d.svg)](${blob}/big.svg)`), page);
  assert.ok(page.includes('![\\[x\\]](img/e.svg)'), page);
  assert.ok(page.includes(`[a \\[b\\] c](${blob}/f.svg)`), page);
  assert.ok(r.exists('src/content/docs/img/d.svg'));
  assert.ok(r.exists('src/content/docs/img/e.svg'));
  for (const f of ['p.png', 'big.svg', 'f.svg']) assert.ok(!r.exists(`src/content/docs/img/${f}`), f);
});

test('a shown image or a link to one: code spans, escapes and spaces', () => {
  const r = doc([
    '![a `[x](y)` label](img/c.svg) \\![not shown](img/n.svg) ![a\\\\[x]](img/b.svg)',
    '',
    '[the space](img/a%20b.svg)',
  ].join('\n'), {
    'docs/img/c.svg': '<svg/>',
    'docs/img/n.svg': '<svg/>',
    'docs/img/b.svg': '<svg/>',
    'docs/img/a b.svg': '<svg/>',
  });
  assert.deepEqual(r.errors, []);
  const page = r.read('src/content/docs/guide.md');
  const blob = 'https://github.com/branes-ai/demo/blob/main/docs/img';
  assert.ok(page.includes('![a `[x](y)` label](img/c.svg)'), page);
  assert.ok(page.includes(`\\![not shown](${blob}/n.svg)`), page);
  assert.ok(page.includes('![a\\\\[x]](img/b.svg)'), page);
  assert.ok(page.includes(`[the space](${blob}/a%20b.svg)`), page);
  assert.ok(r.exists('src/content/docs/img/c.svg'));
  assert.ok(r.exists('src/content/docs/img/b.svg'));
  assert.ok(!r.exists('src/content/docs/img/n.svg'));
});

test('a link to a record goes to the architecture site, its anchor checked', () => {
  const plan = '---\nstatus: draft\n---\n# Plan: x\n\n## Steps\n';
  const ok = doc('[p](plan/x/README.md#steps) [a](adr/0001-y.md)', {
    'docs/plan/x/README.md': plan,
    'docs/adr/0001-y.md': '# ADR 1: y\n',
  });
  assert.deepEqual(ok.errors, []);
  assert.match(
    ok.read('src/content/docs/guide.md'),
    /\(https:\/\/branes-ai\.github\.io\/architecture\/demo\/plan\/x\/#steps\) \[a\]\(https:\/\/branes-ai\.github\.io\/architecture\/demo\/adr\/0001-y\/\)/,
  );
  const bad = doc('[p](plan/x/README.md#nope)', { 'docs/plan/x/README.md': plan });
  assert.deepEqual(bad.errors, ['docs/guide.md:3: docs/plan/x/README.md has no heading for anchor #nope']);
});

test('an unpublished folder has no pages, and a link to it goes to GitHub', () => {
  const r = doc('[log](sessions/2026-01-01.md)', { 'docs/sessions/2026-01-01.md': '# Log\n' }, { unpublished: ['sessions'] });
  assert.deepEqual(r.errors, []);
  assert.ok(!r.exists('src/content/docs/sessions'));
  assert.match(r.read('src/content/docs/guide.md'), /blob\/main\/docs\/sessions\/2026-01-01\.md/);
});

test('each page links to its source for editing, and loses its title line', () => {
  const r = doc('Body.');
  assert.equal(
    r.read('src/content/docs/guide.md'),
    '---\ntitle: "Guide"\neditUrl: "https://github.com/branes-ai/demo/edit/main/docs/guide.md"\n---\nBody.\n',
  );
});

test('a document without a title fails', () => {
  const r = repo({ 'docs/a.md': 'No title.\n' });
  assert.deepEqual(r.errors, ['docs/a.md: no "# " title heading (or title in the front matter)']);
});

test('CRLF line endings: fences are seen, and the landing front matter is read', () => {
  const r = repo({
    'docs/guide.md': '# Guide\r\n\r\n```\r\n[x](nope.md)\r\n```\r\n',
    'docs/index.mdx': '---\r\ntitle: Demo\r\n---\r\n\r\nSee [the guide](guide.md).\r\n',
  });
  assert.deepEqual(r.errors, []);
  assert.match(r.read('src/content/docs/index.mdx'), /\[the guide\]\(\/guide\/\)/);
});

test('a malformed %-escape is a link error, not a crash', () => {
  const r = doc('[x](a%zz.md) [y](#b%zz)');
  assert.deepEqual(r.errors, [
    'docs/guide.md:3: link target a%zz.md does not exist',
    'docs/guide.md:3: no heading for anchor #b%zz',
  ]);
});

test('a footnote definition is not a link; a reference definition is', () => {
  const r = doc('Text[^1] and [ref].\n\n[^1]: A note, not a target.\n[ref]: other.md', { 'docs/other.md': '# Other\n' });
  assert.deepEqual(r.errors, []);
  assert.match(r.read('src/content/docs/guide.md'), /\[\^1\]: A note, not a target\.\n\[ref\]: \/other\/$/m);
});
