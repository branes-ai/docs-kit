// MDX documents in docs/, front matter, imports through @site/, and the
// sidebar's nested groups (architecture#5).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { docsKit } from '../src/astro.mjs';
import { resolveConfig } from '../src/config.mjs';
import { repo } from './helpers.mjs';

const SITE_FILES = {
  'docs-site/src/components/Widget.astro': '<div />\n',
  'docs-site/src/data/points.json': '[1, 2]\n',
};

const MDX = [
  '---',
  'title: The widget',
  'description: A page with a component.',
  '---',
  '',
  "import Widget from '@site/components/Widget.astro';",
  "import points from '@site/data/points.json';",
  '',
  'See [the guide](guide.md#setup).',
  '',
  '{/* Not a link: [x](nowhere.md) */}',
  '',
  '## Live',
  '',
  '<Widget data={points} id="live-widget" />',
  '',
  'Inline {"[y](nowhere.md)"} and [back](#live-widget) and [the heading](#live).',
  '',
].join('\n');

const GUIDE = '# Guide\n\n## Setup\n\nSee [the widget](widget.mdx#live-widget).\n';

test('an MDX document is a page, with its front matter and imports kept', () => {
  const r = repo({ 'docs/a/widget.mdx': MDX, 'docs/a/guide.md': GUIDE, ...SITE_FILES });
  assert.deepEqual(r.errors, []);
  const out = r.read('src/content/docs/a/widget.mdx');
  assert.equal(
    out.split('---\n')[1],
    'title: "The widget"\ndescription: A page with a component.\neditUrl: "https://github.com/branes-ai/demo/edit/main/docs/a/widget.mdx"\n',
  );
  assert.match(out, /^import Widget from '@site\/components\/Widget\.astro';$/m);
  assert.match(out, /See \[the guide\]\(\/a\/guide\/#setup\)\./);
  // Comments and expressions are left as written, not checked.
  assert.match(out, /\{\/\* Not a link: \[x\]\(nowhere\.md\) \*\/\}/);
  assert.match(out, /Inline \{"\[y\]\(nowhere\.md\)"\} and \[back\]\(#live-widget\)/);
  // A link to an MDX page, with a JSX id for its anchor.
  assert.match(r.read('src/content/docs/a/guide.md'), /\[the widget\]\(\/a\/widget\/#live-widget\)/);
});

test('a broken link in an MDX body fails with its file and line', () => {
  const r = repo({ 'docs/a/widget.mdx': MDX.replace('guide.md#setup', 'gone.md'), 'docs/a/guide.md': GUIDE, ...SITE_FILES });
  assert.deepEqual(r.errors, ['docs/a/widget.mdx:9: link target gone.md does not exist']);
});

test("an import that doesn't resolve fails, naming the document and line", () => {
  const r = repo({
    'docs/a/widget.mdx': [
      '---', 'title: W', '---',
      "import A from '@site/components/Missing.astro';",
      "import B from '../../docs-site/src/components/Widget.astro';",
      "import C from 'not-installed/thing';",
      "import { Card } from '@scope/pkg/components';",
      "import raw from '@site/data/points.json?raw';",
      '',
      'Text.',
    ].join('\n'),
    ...SITE_FILES,
    'docs-site/node_modules/@scope/pkg/package.json': '{}',
  });
  assert.deepEqual(r.errors, [
    'docs/a/widget.mdx:4: import @site/components/Missing.astro: docs-site/src/components/Missing.astro does not exist',
    'docs/a/widget.mdx:5: import ../../docs-site/src/components/Widget.astro is a path; import site code through @site/ (docs-site/src/)',
    'docs/a/widget.mdx:6: import not-installed/thing: package not-installed is not installed',
  ]);
});

test('invalid MDX fails with its line', () => {
  const r = repo({ 'docs/a/bad.mdx': '---\ntitle: Bad\n---\n\nText.\n\n<Widget unclosed\n' });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /^docs\/a\/bad\.mdx:\d+: not valid MDX: /);
});

test('a title in the front matter is the title; the body keeps its headings', () => {
  const r = repo({ 'docs/a/t.md': '---\ntitle: From front matter\n---\n# A heading\n\nText.\n', 'docs/a/u.md': '# U\n\n[t](t.md#a-heading)\n' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.read('src/content/docs/a/t.md'), '---\ntitle: "From front matter"\neditUrl: "https://github.com/branes-ai/demo/edit/main/docs/a/t.md"\n---\n# A heading\n\nText.\n');
});

test('bad front matter fails', () => {
  const r = repo({
    'docs/a/one.md': '---\ntitle: [unclosed\n---\n# One\n',
    'docs/a/two.md': '---\nsidebar: { group: 3 }\n---\n# Two\n',
    'docs/a/three.md': '---\nsidebar: { hidden: maybe }\n---\n# Three\n',
  });
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /^docs\/a\/one\.md: front matter: /);
  assert.deepEqual(r.errors.slice(1), [
    'docs/a/three.md: front matter sidebar.hidden must be true or false',
    'docs/a/two.md: front matter sidebar.group must be a string',
  ]);
});

const fm = (sidebar) => `---\nsidebar: ${JSON.stringify(sidebar)}\n---\n`;

test("nested groups from sidebar.group, labels from sidebar.label, in the map's order", () => {
  const r = repo({
    'docs/README.md': [
      '# Map', '', '| Folder | Contents |', '|---|---|',
      '| [control/](control/guide.md) | [Guide](control/guide.md), [PID](control/pid-explainer.md), [PID dev](control/pid.md), [Mixer](control/mixer.md), [Hidden](control/hidden.md) |',
      '| [Roadmap](roadmap.md) | Next |',
      '',
    ].join('\n'),
    'docs/control/guide.md': '# Control guide\n',
    'docs/control/pid-explainer.md': `${fm({ label: 'Explainer', group: 'PID Controller' })}# How PID works\n`,
    'docs/control/pid.md': `${fm({ label: 'Developer Guide', group: 'PID Controller' })}# PID\n`,
    'docs/control/mixer.md': `${fm({ label: 'Explainer', group: 'Mixer' })}# How the mixer works\n`,
    'docs/control/hidden.md': `${fm({ hidden: true })}# Hidden\n`,
    'docs/roadmap.md': '# Roadmap\n',
    'docs/zeta.md': '# Zeta\n',
  });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.sidebar(), [
    { label: 'Overview', link: '/' },
    {
      label: 'Control',
      items: [
        { label: 'Control guide', slug: 'control/guide' },
        { label: 'PID Controller', items: [{ label: 'Explainer', slug: 'control/pid-explainer' }, { label: 'Developer Guide', slug: 'control/pid' }] },
        { label: 'Mixer', items: [{ label: 'Explainer', slug: 'control/mixer' }] },
      ],
    },
    { label: 'Roadmap', items: [{ label: 'Roadmap', slug: 'roadmap' }] },
    { label: 'Zeta', items: [{ label: 'Zeta', slug: 'zeta' }] },
  ]);
  // Starlight's own sidebar fields stay in the page; the kit's group does not.
  assert.match(r.read('src/content/docs/control/pid.md'), /^sidebar:\n {2}label: Developer Guide\n/m);
  assert.doesNotMatch(r.read('src/content/docs/control/pid.md'), /group/);
});

test('docsKit adds the config\'s plugins after its own, its stylesheets after the theme, and @site', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-kit-astro-'));
  fs.mkdirSync(path.join(dir, 'src/generated'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src/generated/sidebar.json'), '[]');
  const remark = () => {};
  const rehype = () => {};
  let options;
  const starlight = (o) => ((options = o), { name: 'starlight' });
  const prev = process.env.DEPLOY_TARGET;
  process.env.DEPLOY_TARGET = 'github-pages';
  try {
    const config = docsKit(
      { repo: 'r', title: 'T', description: 'D', markdown: { remarkPlugins: [remark], rehypePlugins: [rehype] }, customCss: ['katex/dist/katex.min.css'] },
      new URL(`file://${dir}/astro.config.mjs`),
      starlight,
    );
    assert.deepEqual(config.markdown.remarkPlugins, [remark]);
    assert.equal(config.markdown.rehypePlugins.length, 2);
    assert.equal(config.markdown.rehypePlugins[1], rehype);
    assert.equal(config.vite.resolve.alias['@site'], path.join(dir, 'src'));
    assert.deepEqual(options.customCss, ['./src/generated/theme.css', 'katex/dist/katex.min.css']);
  } finally {
    if (prev === undefined) delete process.env.DEPLOY_TARGET;
    else process.env.DEPLOY_TARGET = prev;
  }
  assert.throws(() => resolveConfig({ repo: 'r', title: 'T', description: 'D', markdown: { rehypePlugins: 'x' } }), /markdown\.rehypePlugins/);
});

test('empty front matter is empty: a later --- is not its end', () => {
  const r = repo({ 'docs/a/e.md': '---\n---\n# Empty\n\nText.\n\n---\n\nAfter a break.\n' });
  assert.deepEqual(r.errors, []);
  assert.equal(
    r.read('src/content/docs/a/e.md'),
    '---\ntitle: "Empty"\neditUrl: "https://github.com/branes-ai/demo/edit/main/docs/a/e.md"\n---\nText.\n\n---\n\nAfter a break.\n',
  );
});

test('@site/ imports resolve as Vite does: extensions and folder indexes', () => {
  const r = repo({
    'docs/a/w.mdx': [
      '---', 'title: W', '---',
      "import plot from '@site/lib/plot';",
      "import parts from '@site/lib/parts';",
      "import data from '@site/data/points';",
      "import nothing from '@site/lib/empty';",
      '',
      'Text.',
    ].join('\n'),
    'docs-site/src/lib/plot.ts': 'export default 1;\n',
    'docs-site/src/lib/parts/index.js': 'export default 2;\n',
    'docs-site/src/data/points.json': '[]\n',
    'docs-site/src/lib/empty/README.md': 'A folder without an index.\n',
  });
  assert.deepEqual(r.errors, ['docs/a/w.mdx:7: import @site/lib/empty: docs-site/src/lib/empty does not exist']);
});
