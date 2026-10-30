# docs-kit

The docs-site generator every Branes.AI repo shares. A repo writes its documents in `docs/`, where GitHub renders them, and docs-kit generates a [Starlight](https://starlight.astro.build/) site from them and publishes it on the repo's GitHub Pages. A repo keeps only its configuration, and it pins docs-kit to a version: a fix to the generator reaches a repo as a version bump, not as a copy ([plan](docs/plan/docs-kit/README.md)).

## What it does

- Every `docs/**/*.md` becomes a page, a folder's `README.md` becomes the folder's index, and the first `# ` heading becomes the title. Each page's "Edit page" link opens its source in `docs/`.
- `docs/index.mdx` is the landing page, using Starlight's hero and components. `docs/README.md` is the documentation map, at `/overview/`.
- The sidebar has one group per top-level folder, in the order of the map's table. Within a group, pages follow the order of the links in that folder's row.
- **Links are checked.** A link to a document becomes a link to its page, and a link to any other file in the repo becomes a GitHub link. A relative link or anchor that doesn't resolve fails the build, naming the file and line. Headings are read with a Markdown parser, so an anchor is checked as GitHub and Starlight render it. After the build, `docs-kit check` checks every link and anchor in the built HTML.
- **The records**, `docs/adr/` and `docs/plan/`, are published on the [architecture site](https://branes-ai.github.io/architecture/) rather than here. Their old pages redirect there.
- **The C++ API reference** is built by Doxygen from the headers the config lists, and served at `<base>api/`.

## Using it

A repo's `docs-site/`:

```text
docs-site/
  package.json          the pinned docs-kit, and the scripts below
  package-lock.json
  docs-kit.config.mjs   the repo's configuration
  astro.config.mjs      three lines, below
  src/content.config.ts Starlight's content collection
  src/assets/hero.svg   the landing page's image
  public/favicon.svg
  tsconfig.json, .gitignore
```

`package.json`:

```json
{
  "name": "synapse-docs-site",
  "type": "module",
  "private": true,
  "scripts": {
    "sync": "docs-kit sync",
    "dev": "docs-kit dev",
    "start": "docs-kit dev",
    "build": "docs-kit build",
    "check": "docs-kit check",
    "api": "docs-kit api",
    "build:full": "docs-kit api && docs-kit build",
    "preview": "docs-kit preview"
  },
  "dependencies": {
    "@branes-ai/docs-kit": "github:branes-ai/docs-kit#v0.1.0"
  }
}
```

`astro.config.mjs`:

```js
import starlight from '@astrojs/starlight';
import { docsKit } from '@branes-ai/docs-kit/astro';
import config from './docs-kit.config.mjs';

export default docsKit(config, import.meta.url, starlight);
```

The site passes in Starlight rather than the kit importing it. Starlight ships TypeScript: Vite compiles it when the site's config imports it, but not when an installed package does.

`docs-kit.config.mjs`. Only `repo`, `title` and `description` are required:

```js
export default {
  repo: 'synapse',                  // github.com/branes-ai/synapse, served at /synapse/
  title: 'Synapse',
  description: 'The ML runtime of the Branes.AI platform: …',
  unpublished: ['sessions'],        // folders of docs/ kept off the site
  groupLabels: { hw: 'Hardware' },  // sidebar labels; arch and getting-started have defaults
  accent: {                         // the theme's accent, dark and light
    dark: { low: '#2a1f4d', accent: '#9b7bff', high: '#ddd3ff' },
    light: { low: '#e6defe', accent: '#6440d8', high: '#2a1a63' },
  },
  api: {                            // the Doxygen C++ API reference
    name: 'Synapse C++ API',
    brief: 'branes::synapse — GGUF loader, quantized kernels, graph engine and models',
    input: ['sdk/include'],         // header folders, relative to the repo
  },
  // owner, branch, base, records, architecture: the Branes.AI defaults
  // starlight, astro: passed through, over the kit's settings
};
```

### CI and deploy

The PR job builds the site as the deploy does, and checks it:

```yaml
docs-site:
  name: Docs site
  runs-on: ubuntu-24.04
  steps:
    - uses: actions/checkout@<sha>
      with:
        persist-credentials: false
    - uses: branes-ai/docs-kit/actions/check@<sha>
```

`.github/workflows/deploy-docs.yml` keeps its own trigger paths, and calls the shared deploy:

```yaml
on:
  push:
    branches: [main]
    paths: ['docs/**', 'docs-site/**', 'sdk/include/**', '.github/workflows/deploy-docs.yml']
  workflow_dispatch:

permissions:
  contents: read

jobs:
  pages:
    uses: branes-ai/docs-kit/.github/workflows/pages.yml@<sha>
    permissions:
      contents: read
      pages: write
      id-token: write
```

The generator's version is the one in `package.json`. The action and the workflow only run it, so they are pinned by commit like any other action.

## Commands

Run in the site's folder:

| Command | What it does |
|---|---|
| `docs-kit sync` | Generates the content, the sidebar and the theme from `../docs`; fails on a broken link or anchor |
| `docs-kit dev` (`start`) | Sync, then the Astro dev server |
| `docs-kit build` | Sync, then the Astro build into `dist/` |
| `docs-kit check` | Every internal link and anchor in `dist/` resolves (run with the build's `DEPLOY_TARGET`) |
| `docs-kit api` | The Doxygen API reference into `public/api/` |
| `docs-kit preview` | Serves `dist/` |

## Developing

```sh
npm ci
npm test          # the generator's unit tests
npm run example   # builds and checks example/, a repo laid out as above
```

To try a change on a repo's site before releasing it, run `npm install ../docs-kit` in that repo's `docs-site/`, which links your checkout.

Releases are automatic: release-please versions and tags each releasable merge to `main` (`v0.1.0`, …), following Conventional Commits.
