// The starter set of a new repo's docs site: `docs-kit init`. The files are
// those of a site built by this version of the kit (docs-site/, stubs in
// docs/, the PR check and the deploy), with the repo's name, title and accent.

const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1';

// HSL to #rrggbb.
function hsl(h, s, l) {
  s /= 100;
  l /= 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// The accent of a hue (0–360), at the saturation and lightness of
// scout-drone's green: a dim and a bright tint around the accent in dark mode,
// and the same darkened for contrast in light mode.
export function palette(hue) {
  if (!Number.isFinite(hue) || hue < 0 || hue >= 360) throw new Error('the hue must be a number from 0 to 359');
  return {
    dark: { low: hsl(hue, 41, 13), accent: hsl(hue, 50, 50), high: hsl(hue, 62, 85) },
    light: { low: hsl(hue, 58, 89), accent: hsl(hue, 62, 30), high: hsl(hue, 61, 12) },
    // The artwork's tile, darker than the dark-mode low.
    tile: hsl(hue, 40, 10),
  };
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
// A YAML double-quoted scalar.
const yaml = (s) => JSON.stringify(s);
// Text in an MDX page's body, where braces and tags are syntax.
const mdx = (s) => s.replace(/[{}]/g, '\\$&').replace(/</g, '&lt;');

// repo, title and description are the config's; hue the accent's; version and
// sha the kit's release, which the site's package.json and the workflows pin.
export function starter({ repo, title, description, hue, version, sha }) {
  if (!/^[A-Za-z0-9._-]+$/.test(repo ?? '')) throw new Error('--repo must be the repo\'s name on GitHub');
  for (const [k, v] of Object.entries({ title, description })) {
    if (typeof v !== 'string' || !v.trim()) throw new Error(`--${k} is required`);
    // One line: it goes into the config, the front matter, a heading and the artwork.
    if (/[\0-\x1f\x7f]/.test(v)) throw new Error(`--${k} must be one line of text`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`no release version: ${version}`);
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('--sha must be the full commit SHA of the release');
  const c = palette(hue);
  const tag = `v${version}`;
  const kit = `branes-ai/docs-kit`;
  const url = `https://branes-ai.github.io/${repo}/`;

  const files = {};

  files['docs-site/package.json'] = json({
    name: `${repo}-docs-site`,
    type: 'module',
    version: '0.1.0',
    private: true,
    scripts: {
      sync: 'docs-kit sync',
      dev: 'docs-kit dev',
      start: 'docs-kit dev',
      build: 'docs-kit build',
      check: 'docs-kit check',
      api: 'docs-kit api',
      'build:full': 'docs-kit api && docs-kit build',
      preview: 'docs-kit preview',
    },
    dependencies: { '@branes-ai/docs-kit': `github:${kit}#${tag}` },
  });

  files['docs-site/docs-kit.config.mjs'] = `// The docs site's configuration: everything docs-kit does not default.
// https://github.com/${kit}
export default {
  repo: ${quote(repo)},
  title: ${quote(title)},
  description: ${quote(description)},
  // The session logs are working records, not documentation.
  unpublished: ['sessions'],
  accent: {
    dark: { low: '${c.dark.low}', accent: '${c.dark.accent}', high: '${c.dark.high}' },
    light: { low: '${c.light.low}', accent: '${c.light.accent}', high: '${c.light.high}' },
  },
  // The C++ API reference, once the repo has public headers:
  // api: {
  //   name: ${quote(`${title} C++ API`)},
  //   brief: '…',
  //   input: ['sdk/include'],
  // },
};
`;

  files['docs-site/astro.config.mjs'] = `// @ts-check
// The site is generated from ../docs by docs-kit (docs-kit.config.mjs).
import starlight from '@astrojs/starlight';
import { docsKit } from '@branes-ai/docs-kit/astro';
import config from './docs-kit.config.mjs';

export default docsKit(config, import.meta.url, starlight);
`;

  files['docs-site/src/content.config.ts'] = `import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
`;

  files['docs-site/tsconfig.json'] = json({
    extends: 'astro/tsconfigs/strict',
    include: ['.astro/types.d.ts', '**/*'],
    exclude: ['dist'],
  });

  files['docs-site/.gitignore'] = `# Astro / Node
node_modules/
dist/
.astro/

# Generated from ../docs by docs-kit (\`npm run sync\`, and before dev and build).
# Edit the documents in docs/, never these.
src/content/docs/
src/generated/
# The records' old pages, redirects to the architecture site.
public/adr/
public/plan/

# Generated Doxygen C++ API reference (built in CI / by \`npm run api\`)
public/api/
`;

  // Starter artwork in the accent, for the repo to replace with its own.
  const label = title.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  files['docs-site/public/favicon.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${label}">
  <rect width="320" height="320" rx="64" fill="${c.tile}"/>
  <g fill="none" stroke="${c.dark.accent}" stroke-width="22" stroke-linecap="round">
    <line x1="80" y1="110" x2="240" y2="110"/>
    <line x1="80" y1="160" x2="240" y2="160"/>
    <line x1="80" y1="210" x2="180" y2="210"/>
  </g>
  <circle cx="232" cy="214" r="18" fill="${c.dark.high}"/>
</svg>
`;

  files['docs-site/src/assets/hero.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c.dark.accent}"/>
      <stop offset="1" stop-color="${c.dark.high}"/>
    </linearGradient>
  </defs>
  <!-- Starter artwork from docs-kit init: replace it with the repo's own. -->
  <g fill="none" stroke="url(#g)" stroke-width="10" stroke-linecap="round">
    <circle cx="160" cy="160" r="120" stroke-dasharray="2 18"/>
    <circle cx="160" cy="160" r="80" opacity="0.7"/>
  </g>
  <circle cx="160" cy="160" r="34" fill="${c.dark.accent}"/>
  <circle cx="273" cy="120" r="14" fill="${c.dark.high}"/>
  <circle cx="104" cy="217" r="10" fill="${c.dark.high}"/>
</svg>
`;

  files['docs/index.mdx'] = `---
title: ${yaml(title)}
description: ${yaml(description)}
template: splash
hero:
  tagline: ${yaml(description)}
  image:
    file: ../../assets/hero.svg
  actions:
    - text: Get Started
      link: ./getting-started/introduction/
      icon: right-arrow
    - text: View on GitHub
      link: https://github.com/branes-ai/${repo}
      icon: external
      variant: minimal
---

{/* The site's landing page. It is MDX for the hero and the cards;
    docs/README.md is the documentation map. */}

## What ${mdx(title)} is

${mdx(description)}

## Where to go next

- **[Introduction](getting-started/introduction.md)**: what the repo is for, and where it fits.
`;

  files['docs/README.md'] = `# Documentation map

These documents are published at <${url}>. The site is generated from this folder on every merge to main: edit the documents here, never the site. [\`index.mdx\`](index.mdx) is the site's landing page, and this file is its documentation map.

| Folder | Contents |
|---|---|
| [getting-started/](getting-started/introduction.md) | [Introduction](getting-started/introduction.md) |
| sessions/ | Dated session records (\`YYYY-MM-DD-short-topic.md\`), not published |

A plan (\`plan/\`) or an architecture decision (\`adr/\`) is published on the [architecture site](https://branes-ai.github.io/architecture/), alongside every other repo's plans and decisions and their status, rather than here.
`;

  files['docs/getting-started/introduction.md'] = `# Introduction

${description}

<!-- What the repo is for, and where it fits in the Branes.AI stack. -->
`;

  files['.github/workflows/docs-site.yml'] = `name: Docs site

# Builds the docs site (generated from docs/ by docs-kit) as the deploy does,
# so a broken relative link or anchor fails the PR instead of the deploy after
# merge. A repo with a CI workflow can move this job into it.

on:
  pull_request:
  workflow_dispatch:

# A new push to a PR supersedes its in-flight run.
concurrency:
  group: \${{ github.workflow }}-\${{ github.event_name }}-\${{ github.event.pull_request.number || github.run_id }}
  cancel-in-progress: \${{ github.event_name == 'pull_request' }}

# Top-level least-privilege default.
permissions:
  contents: read

jobs:
  docs-site:
    name: Docs site
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: ${CHECKOUT}
        with:
          persist-credentials: false
      # Installs the pinned docs-kit (docs-site/package.json), builds the site as
      # the deploy does, and checks every link and anchor in it.
      - uses: ${kit}/actions/check@${sha}  # ${tag}
`;

  files['.github/workflows/deploy-docs.yml'] = `name: Deploy Documentation

# Builds the Starlight docs site (generated from docs/ by docs-kit, at the
# version docs-site/package.json pins) and the Doxygen C++ API reference, if
# the config has one, and publishes them to GitHub Pages at
# ${url}. The steps are docs-kit's shared deploy
# workflow; this file keeps the triggers.
#
# One-time setup (repo admin): Pages' source must be GitHub Actions:
#   gh api -X POST repos/branes-ai/${repo}/pages -f build_type=workflow
# After that, every push to main touching docs/, docs-site/, the public headers
# (the API reference, once the config has one), or this workflow redeploys.

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'docs-site/**'
      - 'sdk/include/**'
      - '.github/workflows/deploy-docs.yml'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  pages:
    uses: ${kit}/.github/workflows/pages.yml@${sha}  # ${tag}
    # The deploy job inside needs the Pages write scopes.
    permissions:
      contents: read
      pages: write
      id-token: write
`;

  return files;
}
