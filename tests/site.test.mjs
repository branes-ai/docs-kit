// The sidebar, the landing page, the redirects, the theme and the config.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveConfig } from '../src/config.mjs';
import { doxyfile } from '../src/doxygen.mjs';
import { repo } from './helpers.mjs';

const MAP = [
  '# Documentation map',
  '',
  '| Folder | Contents |',
  '|---|---|',
  '| [getting-started/](getting-started/intro.md) | [Intro](getting-started/intro.md), [build](getting-started/build.md) |',
  '| [arch/](arch/README.md) | [Two](arch/two.md), [one](arch/one.md) |',
  '',
].join('\n');

const SITE = {
  'docs/README.md': MAP,
  'docs/getting-started/intro.md': '# Introduction\n',
  'docs/getting-started/build.md': '# Build\n',
  'docs/getting-started/zz.md': '# Extra\n',
  'docs/arch/README.md': '# Architecture\n',
  'docs/arch/one.md': '# One\n',
  'docs/arch/two.md': '# Two\n',
  'docs/arch/deep/README.md': '# Deep\n',
  'docs/arch/zeta.md': '# Zeta\n',
  'docs/zoo/a.md': '# Zoo\n',
};

test("the sidebar follows the map's table: groups by row, pages by link", () => {
  const r = repo(SITE);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sidebar(), [
    { label: 'Overview', link: '/' },
    {
      label: 'Getting Started',
      items: [
        { label: 'Introduction', slug: 'getting-started/intro' },
        { label: 'Build', slug: 'getting-started/build' },
        { label: 'Extra', slug: 'getting-started/zz' },
      ],
    },
    {
      label: 'Architecture',
      items: [
        { label: 'Two', slug: 'arch/two' },
        { label: 'One', slug: 'arch/one' },
        { label: 'Architecture', slug: 'arch' },
        { label: 'Zeta', slug: 'arch/zeta' },
        { label: 'Deep', slug: 'arch/deep' },
      ],
    },
    { label: 'Zoo', items: [{ label: 'Zoo', slug: 'zoo/a' }] },
  ]);
  assert.ok(r.exists('src/content/docs/index.md'));
});

const LANDING = '---\ntitle: Demo\ntemplate: splash\nhero:\n  actions:\n    - text: Start\n      link: ./getting-started/intro/\n---\n\nSee [the map](README.md).\n';

test('with a landing page, the map moves to /overview/ and closes the first group', () => {
  const r = repo({ ...SITE, 'docs/index.mdx': LANDING });
  assert.deepEqual(r.errors, []);
  const sidebar = r.sidebar();
  assert.equal(sidebar[0].label, 'Getting Started');
  assert.deepEqual(sidebar[0].items.at(-1), { label: 'Documentation map', slug: 'overview' });
  assert.ok(r.exists('src/content/docs/overview.md'));
  const landing = r.read('src/content/docs/index.mdx');
  assert.match(landing, /^---\ntitle: Demo\n[\s\S]*editUrl: "https:\/\/github\.com\/branes-ai\/demo\/edit\/main\/docs\/index\.mdx"\n---\n/);
  assert.match(landing, /\[the map\]\(\/overview\/\)/);
});

test("a hero link that isn't a page fails, naming the line", () => {
  const r = repo({ ...SITE, 'docs/index.mdx': LANDING.replace('./getting-started/intro/', './nowhere/') });
  assert.deepEqual(r.errors, ['docs/index.mdx:7: hero link ./nowhere/ is not a page']);
});

test("each record's old page redirects to the architecture site, keeping the fragment", () => {
  const r = repo({
    ...SITE,
    'docs/plan/My Plan/README.md': '# Plan\n',
    'docs/adr/0002-use-x.md': '# ADR 2\n',
  });
  assert.deepEqual(r.errors, []);
  const plan = r.read('public/plan/my-plan/index.html');
  assert.match(plan, /location\.replace\("https:\/\/branes-ai\.github\.io\/architecture\/demo\/plan\/my-plan\/" \+ location\.hash\)/);
  assert.match(plan, /<meta http-equiv="refresh" content="0; url=https:\/\/branes-ai\.github\.io\/architecture\/demo\/plan\/my-plan\/">/);
  assert.ok(r.exists('public/adr/0002-use-x/index.html'));
  assert.ok(!r.exists('src/content/docs/plan'));
});

test('nothing but the content is written when there are errors', () => {
  const r = repo({ 'docs/a.md': '# A\n\n[x](nope.md)\n' });
  assert.equal(r.errors.length, 1);
  assert.ok(!r.exists('src/generated/sidebar.json'));
});

test('the theme carries the accent', () => {
  const r = repo(SITE, { accent: { dark: { accent: '#21c7b0' }, light: { accent: '#0b7d6e' } } });
  const css = r.read('src/generated/theme.css');
  assert.match(css, /:root \{\n {2}--sl-color-accent-low: #2a1f4d;\n {2}--sl-color-accent: #21c7b0;/);
  assert.match(css, /\[data-theme='light'\] \{[^}]*--sl-color-accent: #0b7d6e;/);
});

test('the config: required keys, unknown keys, defaults', () => {
  assert.throws(() => resolveConfig({ title: 'T', description: 'D' }), /`repo` is required/);
  assert.throws(() => resolveConfig({ repo: 'r', title: 'T', description: 'D', unpublishd: [] }), /unknown key\(s\) unpublishd/);
  assert.throws(() => resolveConfig({ repo: 'r', title: 'T', description: 'D', api: { name: 'X' } }), /api\.input/);
  const c = resolveConfig({ repo: 'r', title: 'T', description: 'D', groupLabels: { hw: 'Hardware' } });
  assert.equal(c.base, '/r/');
  assert.equal(c.github, 'https://github.com/branes-ai/r');
  assert.deepEqual([...c.records], ['adr', 'plan']);
  assert.deepEqual(c.groupLabels, { arch: 'Architecture', 'getting-started': 'Getting Started', hw: 'Hardware' });
});

test("the Doxyfile takes the config's name and header folders", () => {
  const text = doxyfile(resolveConfig({
    repo: 'r', title: 'T', description: 'D',
    api: { name: 'R C++ API', brief: 'branes::r', input: ['sdk/include', 'sim/include/'] },
  }));
  assert.match(text, /^PROJECT_NAME {11}= "R C\+\+ API"$/m);
  assert.match(text, /^INPUT {18}= \.\.\/sdk\/include \.\.\/sim\/include$/m);
});
