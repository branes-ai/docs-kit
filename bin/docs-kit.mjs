#!/usr/bin/env node
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

switch (command) {
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
    fail(`unknown command ${command ?? '(none)'}; use sync, dev, start, build, preview, api or check`);
}
