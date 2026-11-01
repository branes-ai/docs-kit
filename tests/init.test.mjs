// docs-kit init: the accent from a hue, and the starter set.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docsKit } from '../src/astro.mjs';
import { resolveConfig } from '../src/config.mjs';
import { palette, starter } from '../src/init.mjs';
import { sync } from '../src/sync.mjs';

const BIN = fileURLToPath(new URL('../bin/docs-kit.mjs', import.meta.url));
const SHA = 'a'.repeat(40);
const ARGS = { repo: 'isr-drone', title: 'ISR Drone', description: 'A mission repo.', hue: 210, version: '1.2.3', sha: SHA, visibility: 'public' };
const PRIVATE = { ...ARGS, repo: 'secret-gen', visibility: 'private' };

function write(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-kit-init-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test("the accent of a hue: scout-drone's green at 145", () => {
  assert.deepEqual(palette(145), {
    dark: { low: '#142f1f', accent: '#40bf75', high: '#c1f0d5' },
    light: { low: '#d3f3e0', accent: '#1d7c45', high: '#0c311b' },
    tile: '#0f2418',
  });
  assert.equal(palette(0).dark.accent, '#bf4040');
  for (const bad of [-1, 360, NaN]) assert.throws(() => palette(bad), /hue/);
});

test('the starter set syncs from docs/ with no broken link', async () => {
  const dir = write(starter(ARGS));
  const config = resolveConfig((await import(pathToFileURL(path.join(dir, 'docs-site/docs-kit.config.mjs')).href)).default);
  assert.equal(config.repo, 'isr-drone');
  assert.deepEqual(config.accent, { dark: palette(210).dark, light: palette(210).light });
  const { errors } = sync({ siteDir: path.join(dir, 'docs-site'), config });
  assert.deepEqual(errors, []);
  const sidebar = JSON.parse(fs.readFileSync(path.join(dir, 'docs-site/src/generated/sidebar.json'), 'utf8'));
  // The landing page is the site's root, and the map, at /overview/, follows
  // the introduction.
  assert.deepEqual(sidebar, [{
    label: 'Getting Started',
    items: [{ label: 'Introduction', slug: 'getting-started/introduction' }, { label: 'Documentation map', slug: 'overview' }],
  }]);
});

test('the package pins the release by tag, the workflows by commit', () => {
  const files = starter(ARGS);
  assert.equal(JSON.parse(files['docs-site/package.json']).dependencies['@branes-ai/docs-kit'], 'github:branes-ai/docs-kit#v1.2.3');
  assert.match(files['.github/workflows/docs-site.yml'], new RegExp(`docs-kit/actions/check@${SHA}  # v1\\.2\\.3`));
  assert.match(files['.github/workflows/deploy-docs.yml'], new RegExp(`docs-kit/\\.github/workflows/pages\\.yml@${SHA}  # v1\\.2\\.3`));
  assert.match(files['.github/workflows/deploy-docs.yml'], /repos\/branes-ai\/isr-drone\/pages -f build_type=workflow/);
  assert.match(files['.github/workflows/deploy-docs.yml'], /^ {6}- 'sdk\/include\/\*\*'$/m);
});

test('quotes, braces and tags in the title and description', async () => {
  const title = "Bob's {drone}";
  const description = 'Flies <fast> & "far" \\ away.';
  const files = starter({ ...ARGS, title, description });
  const dir = write(files);
  const c = (await import(pathToFileURL(path.join(dir, 'docs-site/docs-kit.config.mjs')).href)).default;
  assert.equal(c.title, title);
  assert.equal(c.description, description);
  assert.match(files['docs/index.mdx'], /^title: "Bob's \{drone\}"$/m);
  assert.match(files['docs/index.mdx'], /^## What Bob's \\\{drone\\\} is$/m);
  assert.match(files['docs/index.mdx'], /^Flies &lt;fast> & "far" \\ away\.$/m);
  assert.match(files['docs-site/public/favicon.svg'], /aria-label="Bob's \{drone\}"/);
});

test('the options are checked', () => {
  assert.throws(() => starter({ ...ARGS, repo: 'a/b' }), /--repo/);
  assert.throws(() => starter({ ...ARGS, title: ' ' }), /--title is required/);
  assert.throws(() => starter({ ...ARGS, sha: 'abc' }), /--sha/);
  assert.throws(() => starter({ ...ARGS, hue: 400 }), /hue/);
  assert.throws(() => starter({ ...ARGS, title: 'Two\nlines' }), /--title must be one line/);
  assert.throws(() => starter({ ...ARGS, description: 'A\r\nB' }), /--description must be one line/);
  for (const visibility of [undefined, 'internal', 'Public']) {
    assert.throws(() => starter({ ...ARGS, visibility }), /--visibility must be public or private/);
  }
});

test('a private repo\'s set has no deploy, and keeps its records on the site', async () => {
  const files = starter(PRIVATE);
  const publicSet = Object.keys(starter(ARGS));
  // Every file of the public set but the deploy.
  assert.deepEqual(Object.keys(files), publicSet.filter((rel) => rel !== '.github/workflows/deploy-docs.yml'));
  assert.match(files['.github/workflows/docs-site.yml'], /never publishes the\n# site/);
  assert.match(files['.github/workflows/docs-site.yml'], /There is no deploy workflow, and\n# there must not be one/);
  assert.match(files['docs/README.md'], /never published/);
  assert.doesNotMatch(files['docs/README.md'], /github\.io\/secret-gen/);
  assert.doesNotMatch(files['docs-site/.gitignore'], /public\/plan/);
  const dir = write({ ...files, 'docs/plan/a.md': '# Plan: a\n' });
  const raw = (await import(pathToFileURL(path.join(dir, 'docs-site/docs-kit.config.mjs')).href)).default;
  assert.deepEqual(raw.records, []);
  const config = resolveConfig(raw);
  assert.equal(config.records.size, 0);
  const { errors } = sync({ siteDir: path.join(dir, 'docs-site'), config });
  assert.deepEqual(errors, []);
  // The plan is a page of the site, not a redirect to the architecture site.
  assert.ok(fs.existsSync(path.join(dir, 'docs-site/src/content/docs/plan/a.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'docs-site/public/plan')));
  // The public set is as before: the records go to the architecture site.
  assert.equal((await import(pathToFileURL(path.join(write(starter(ARGS)), 'docs-site/docs-kit.config.mjs')).href)).default.records, undefined);
});

test('init writes the set, and writes nothing over an existing file', () => {
  const dir = write({ 'README.md': '# A repo\n' });
  const run = () => spawnSync(process.execPath, [BIN, 'init', '--repo', 'isr-drone', '--title=ISR Drone', '--description', 'A mission repo.', '--hue', '210', '--sha', SHA, '--visibility', 'public'], { cwd: dir, encoding: 'utf8' });
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(dir, '.github/workflows/deploy-docs.yml')));
  fs.rmSync(path.join(dir, 'docs-site/package.json'));
  fs.writeFileSync(path.join(dir, 'docs/README.md'), '# Mine\n');
  const second = run();
  assert.equal(second.status, 1);
  assert.match(second.stderr, /exist already, so nothing was written:\n {2}docs-site\/docs-kit\.config\.mjs/);
  assert.ok(!fs.existsSync(path.join(dir, 'docs-site/package.json')));
  assert.equal(fs.readFileSync(path.join(dir, 'docs/README.md'), 'utf8'), '# Mine\n');
});

test('a private repo\'s site has no architecture-site link, and serves on localhost only', async () => {
  const site = (files) => {
    const dir = write({ ...files, 'docs-site/src/generated/sidebar.json': '[]' });
    return import(pathToFileURL(path.join(dir, 'docs-site/docs-kit.config.mjs')).href).then(({ default: c }) => {
      let options;
      const starlight = (o) => ((options = o), { name: 'starlight' });
      const astro = docsKit(c, pathToFileURL(path.join(dir, 'docs-site/astro.config.mjs')), starlight);
      return { astro, labels: options.sidebar.map((g) => g.label) };
    });
  };
  const pub = await site(starter(ARGS));
  assert.ok(pub.labels.includes('Plans and decisions'));
  assert.deepEqual(pub.astro.server, { host: '0.0.0.0' });
  const priv = await site(starter(PRIVATE));
  assert.ok(!priv.labels.includes('Plans and decisions'));
  assert.deepEqual(priv.astro.server, { host: '127.0.0.1' });
});

test('init --visibility private writes no deploy, and says not to publish', () => {
  const dir = write({});
  const r = spawnSync(process.execPath, [BIN, 'init', '--repo', 'secret-gen', '--title', 'Secret', '--description', 'A private repo.', '--hue', '30', '--sha', SHA, '--visibility', 'private'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, '.github/workflows/docs-site.yml')));
  assert.ok(!fs.existsSync(path.join(dir, '.github/workflows/deploy-docs.yml')));
  assert.match(r.stdout, /never published: don't enable GitHub Pages/);
  assert.doesNotMatch(r.stdout, /build_type=workflow/);
  const bad = spawnSync(process.execPath, [BIN, 'init', '--repo', 'x', '--title', 'X', '--description', 'X.', '--hue', '30', '--sha', SHA, '--visibility', 'internal'], { cwd: write({}), encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--visibility must be public or private/);
});

// Runs init without --visibility, with fetch replaced by `fake` (the source of
// an async function), so GitHub's API is never asked.
function initAsking(dir, fake) {
  const preload = `data:text/javascript,${encodeURIComponent(`globalThis.fetch = ${fake};`)}`;
  return spawnSync(process.execPath, ['--import', preload, BIN, 'init', '--repo', 'isr-drone', '--title', 'ISR Drone', '--description', 'A mission repo.', '--hue', '210', '--sha', SHA], { cwd: dir, encoding: 'utf8' });
}

test('init without --visibility writes the public set only when GitHub says the repo is public', () => {
  // The lookup asks for this repo, with a deadline.
  const pub = write({});
  const r = initAsking(pub, `async (url, o) => {
    if (url !== 'https://api.github.com/repos/branes-ai/isr-drone' || !(o.signal instanceof AbortSignal)) throw new Error('wrong request');
    return new Response(JSON.stringify({ visibility: 'public' }));
  }`);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(pub, '.github/workflows/deploy-docs.yml')));
  assert.doesNotMatch(r.stdout, /private set/);
  const answers = {
    'not public': [`async () => new Response(JSON.stringify({ visibility: 'internal' }))`, /GitHub says it is not public, so this is the private set/],
    'not found': [`async () => new Response('{}', { status: 404 })`, /GitHub answered 404 without a token/],
    'unreachable': [`async () => { throw new Error('offline'); }`, /GitHub could not be reached \(offline\)/],
  };
  for (const [name, [fake, reason]] of Object.entries(answers)) {
    const dir = write({});
    const p = initAsking(dir, fake);
    assert.equal(p.status, 0, `${name}: ${p.stderr}`);
    assert.match(p.stdout, reason, name);
    assert.ok(fs.existsSync(path.join(dir, '.github/workflows/docs-site.yml')), name);
    assert.ok(!fs.existsSync(path.join(dir, '.github/workflows/deploy-docs.yml')), name);
  }
});

test('init --visibility private refuses a repo that has a deploy already', () => {
  const deploy = 'name: Deploy Documentation\n';
  const dir = write({ '.github/workflows/deploy-docs.yml': deploy });
  const r = spawnSync(process.execPath, [BIN, 'init', '--repo', 'secret-gen', '--title', 'Secret', '--description', 'A private repo.', '--hue', '30', '--sha', SHA, '--visibility', 'private'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /deploy-docs\.yml exists, and would publish this private repo's site/);
  assert.ok(!fs.existsSync(path.join(dir, 'docs-site')));
  assert.equal(fs.readFileSync(path.join(dir, '.github/workflows/deploy-docs.yml'), 'utf8'), deploy);
});

test('init needs its options', () => {
  const r = spawnSync(process.execPath, [BIN, 'init', '--repo', 'x'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--title is required/);
  const u = spawnSync(process.execPath, [BIN, 'init', '--colour', 'red'], { encoding: 'utf8' });
  assert.match(u.stderr, /unknown option\(s\) --colour/);
});
