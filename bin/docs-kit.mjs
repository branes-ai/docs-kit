#!/usr/bin/env node
// docs-kit init, run in a repo's root: writes the starter set of its docs site
// (docs-site/, stubs in docs/, the PR check and the deploy), pinned to this
// version of the kit:
//
//   docs-kit init --repo <name> --title <title> --description <text> --hue <0-359>
//                 [--sha <the release's commit>] [--visibility public|private]
//
// A private repo's set has no deploy (src/init.mjs). Without --visibility, the
// repo counts as public only if GitHub's API, asked without a token, says it
// is; anything else (private, not found, offline) gives the private set.
//
// docs-kit <command>, run in a site's folder (the one with docs-kit.config.mjs):
//
//   sync      generate the content, sidebar and theme from ../docs; fails on a
//             broken link or anchor
//   dev       sync, then the Astro dev server (`start` is the same)
//   build     sync, then the Astro build into dist/
//   preview   serve dist/
//   api       the Doxygen C++ API reference into public/api/ (nothing when the
//             config has no `api`)
//   check     check dist/: every internal link and anchor resolves in the
//             built HTML (run after build, with the same DEPLOY_TARGET)
//
// Arguments after the command are passed to Astro.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkDist } from '../src/check-dist.mjs';
import { resolveConfig } from '../src/config.mjs';
import { doxyfile } from '../src/doxygen.mjs';
import { starter } from '../src/init.mjs';
import { sync } from '../src/sync.mjs';

const [command, ...args] = process.argv.slice(2);
const siteDir = process.cwd();
const configFile = path.join(siteDir, 'docs-kit.config.mjs');

function fail(message) {
  console.error(`docs-kit: ${message}`);
  process.exit(1);
}

async function loadConfig() {
  if (!fs.existsSync(configFile)) fail(`no docs-kit.config.mjs in ${siteDir}`);
  try {
    return resolveConfig((await import(pathToFileURL(configFile).href)).default);
  } catch (e) {
    fail(e.message);
  }
}

function runSync(config) {
  const { errors, summary } = sync({ siteDir, config });
  if (errors.length) {
    console.error(`sync-docs: ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`sync-docs: ${summary}`);
}

// Astro as the site resolves it, so the CLI and the config share one copy.
function astro(astroArgs) {
  const require = createRequire(path.join(siteDir, 'package.json'));
  const pkg = require.resolve('astro/package.json');
  const bin = path.join(path.dirname(pkg), JSON.parse(fs.readFileSync(pkg, 'utf8')).bin.astro);
  const { status } = spawnSync(process.execPath, [bin, ...astroArgs, ...args], { cwd: siteDir, stdio: 'inherit' });
  process.exit(status ?? 1);
}

// --key value or --key=value.
function options(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)(?:=(.*))?$/s.exec(argv[i]);
    if (!m) fail(`unexpected argument ${argv[i]}`);
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (i + 1 < argv.length) out[m[1]] = argv[++i];
    else fail(`--${m[1]} needs a value`);
  }
  return out;
}

// The commit of this version's release tag, which the workflows pin.
function releaseSha(tag) {
  const { status, stdout } = spawnSync('git', ['ls-remote', 'https://github.com/branes-ai/docs-kit', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' });
  if (status !== 0) fail(`could not look up ${tag} on GitHub; pass --sha <its commit>`);
  const refs = Object.fromEntries(stdout.trim().split('\n').filter(Boolean).map((l) => l.split('\t').reverse()));
  const sha = refs[`refs/tags/${tag}^{}`] ?? refs[`refs/tags/${tag}`];
  if (!sha) fail(`no tag ${tag} on GitHub; pass --sha <its commit>`);
  return sha;
}

// The repo's visibility from GitHub's API, without a token: 'public' only if
// the API says so, else 'private', with the reason.
async function lookUpVisibility(repo) {
  try {
    const r = await fetch(`https://api.github.com/repos/branes-ai/${repo}`, { headers: { accept: 'application/vnd.github+json' } });
    if (r.ok && (await r.json()).visibility === 'public') return { visibility: 'public' };
    return { visibility: 'private', reason: r.ok ? 'GitHub says it is not public' : `GitHub answered ${r.status} without a token: private, or not created yet` };
  } catch (e) {
    return { visibility: 'private', reason: `GitHub could not be reached (${e.message})` };
  }
}

async function init(argv) {
  const known = ['repo', 'title', 'description', 'hue', 'sha', 'visibility'];
  const o = options(argv);
  const unknown = Object.keys(o).filter((k) => !known.includes(k));
  if (unknown.length) fail(`unknown option(s) ${unknown.map((k) => `--${k}`).join(', ')}`);
  for (const k of ['repo', 'title', 'description', 'hue']) if (o[k] === undefined) fail(`--${k} is required`);
  const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  let visibility = o.visibility;
  if (visibility === undefined) {
    const found = await lookUpVisibility(o.repo);
    visibility = found.visibility;
    if (found.reason) console.log(`docs-kit: ${found.reason}, so this is the private set: no deploy. Pass --visibility public if the repo is public.`);
  }
  let files;
  try {
    const hue = /^\d+(\.\d+)?$/.test(o.hue) ? Number(o.hue) : NaN;
    files = starter({ ...o, hue, version, visibility, sha: o.sha ?? releaseSha(`v${version}`) });
  } catch (e) {
    fail(e.message);
  }
  const existing = Object.keys(files).filter((rel) => fs.existsSync(path.join(siteDir, rel)));
  if (existing.length) fail(`these exist already, so nothing was written:\n  ${existing.join('\n  ')}`);
  // Each file is created exclusively: if one appears after the check above, the
  // files written so far are removed and nothing else is touched.
  const written = [];
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(siteDir, rel);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text, { flag: 'wx' });
    } catch (e) {
      for (const w of written) fs.rmSync(w, { force: true });
      fail(e.code === 'EEXIST' ? `${rel} appeared while writing, so nothing was written` : `${rel}: ${e.message}`);
    }
    written.push(file);
  }
  for (const rel of Object.keys(files)) console.log(`  ${rel}`);
  const next = `docs-kit: the starter set of ${o.repo}'s docs site, on docs-kit v${version}. Next:
  1. cd docs-site && npm install      the lockfile, then \`npm run dev\` to see the site
  2. write the documents in docs/, and replace the starter artwork in docs-site/
  3. commit, and open the PR: the Docs site check builds it`;
  console.log(visibility === 'public' ? `${next}
  4. after the merge, as a repo admin, publish with GitHub Actions:
       gh api -X POST repos/branes-ai/${o.repo}/pages -f build_type=workflow
     then run the deploy (gh workflow run deploy-docs.yml) and check https://branes-ai.github.io/${o.repo}/` : `${next}
The repo is private, so the site is never published: don't enable GitHub Pages for it,
which would make the site public. Read it with \`npm run dev\`.`);
}

switch (command) {
  case 'init':
    await init(args);
    break;
  case 'sync':
    runSync(await loadConfig());
    break;
  case 'dev':
  case 'start':
    runSync(await loadConfig());
    astro(['dev']);
    break;
  case 'build':
    runSync(await loadConfig());
    astro(['build']);
    break;
  case 'preview':
    astro(['preview']);
    break;
  case 'api': {
    const config = await loadConfig();
    if (!config.api) {
      console.log('docs-kit: no `api` in docs-kit.config.mjs; no API reference');
      break;
    }
    const { status, error } = spawnSync('doxygen', ['-'], { cwd: siteDir, input: doxyfile(config), stdio: ['pipe', 'inherit', 'inherit'] });
    if (error) fail(`doxygen: ${error.message}`);
    process.exit(status ?? 1);
  }
  case 'check': {
    const config = await loadConfig();
    const base = process.env.DEPLOY_TARGET === 'github-pages' ? config.base : '/';
    const dist = path.join(siteDir, 'dist');
    if (!fs.existsSync(dist)) fail('no dist/: run `docs-kit build` first');
    const { pages, checked, broken } = checkDist(dist, base);
    if (!pages) fail('no pages in dist/: run `docs-kit build` first');
    for (const b of broken) console.error(`  ${b}`);
    console.log(`docs-kit: ${checked} internal links in ${pages} pages, ${broken.length} broken`);
    process.exit(broken.length ? 1 : 0);
  }
  default:
    fail(`unknown command ${command ?? '(none)'}; use init, sync, dev, start, build, preview, api or check`);
}
