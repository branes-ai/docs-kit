# docs-kit

The docs-site generator every Branes.AI repo shares. A repo writes its documents in `docs/`, where GitHub renders them, and docs-kit generates a [Starlight](https://starlight.astro.build/) site from them and publishes it on the repo's GitHub Pages. A repo keeps only its configuration, and it pins docs-kit to a version: a fix to the generator reaches a repo as a version bump, not as a copy ([plan](docs/plan/docs-kit/README.md)).

## What it does

- Every `docs/**/*.md` and `docs/**/*.mdx` becomes a page, and a folder's `README.md` becomes the folder's index. The title is the front matter's `title`, or else the first `# ` heading. The rest of the front matter (`description`, …) is kept. Each page's "Edit page" link opens its source in `docs/`.
- `docs/index.mdx` is the landing page, using Starlight's hero and components. `docs/README.md` is the documentation map, at `/overview/`.
- The sidebar has one group per top-level folder, in the order of the map's table, and one per top-level document that the map lists. Within a group, pages follow the order of the links in that folder's row. A page's front matter can set `sidebar.label`, the label instead of the title, and `sidebar.group`, to list it in a nested group of that name; `sidebar.hidden` leaves it out (see [MDX pages and the sidebar](#mdx-pages-and-the-sidebar)).
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
    "@branes-ai/docs-kit": "github:branes-ai/docs-kit#v0.2.0"
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
    // doxyfile: { HTML_EXTRA_STYLESHEET: ['doxygen-awesome/doxygen-awesome.css'] },
    //   more Doxyfile settings, after (and over) the kit's; paths from the site folder
  },
  math: true,                       // KaTeX math
  customCss: ['./src/styles/custom.css'],  // after the theme
  // markdown: { remarkPlugins, rehypePlugins }, after the kit's own
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

### MDX pages and the sidebar

A page that needs the site's components is MDX in `docs/`, and it imports them from the site's `src/` through `@site/`:

```mdx
---
title: How the PID Controller Works
description: An explainer for Pid, one term at a time.
sidebar:
  label: Explainer          # the sidebar's label, instead of the title
  group: PID Controller     # a nested group in its folder's sidebar group
---

import TracePlayer from '@site/components/trace/TracePlayer.astro';
import terms from '@site/traces/pid/terms.json';

Links are checked as in Markdown: [the developer guide](pid.mdx#api).

<TracePlayer trace={terms} id="terms" />
```

- **Imports:** each import must resolve, or the sync fails, naming the document and line. That means a file under `docs-site/src/` through `@site/`, or an installed package. A relative import is an error: it would only resolve in one of `docs/` and the generated content.
- **What's checked:** links in Markdown text are checked and rewritten. Imports, `{expressions}` (and `{/* comments */}`) and JSX attributes are left as written. A JSX element's `id` can be linked as an anchor, and `docs-kit check` checks such links after the build.
- **Type checking:** for `@site/` in TypeScript, add `"paths": { "@site/*": ["src/*"] }` under `compilerOptions` in the site's `tsconfig.json`.
- **GitHub:** GitHub shows an `.mdx` file as source, so write a page as `.md` unless it needs a component.
- **Nested groups:** pages with the same `sidebar.group` are listed together, in a nested group placed where its first page would be, in the order of the map's row. The files stay where they are, so the routes don't change.

### Math, Markdown plugins and styles

- `math: true` renders LaTeX math (`$…$`, `$$…$$`) with KaTeX at build time. The sync then reads `$…$` as math, as remark-math does, so the braces of LaTeX in MDX aren't taken for expressions.
- `markdown: { remarkPlugins, rehypePlugins }` adds plugins after the kit's own.
- `customCss: ['./src/styles/custom.css']` adds stylesheets after the theme.

### Assets built before the site

The site's npm scripts run the kit, so npm's hooks work as usual: a `prebuild` script (or `predev`) runs first. Use it for assets the pages need, such as generated figures or a WebAssembly module. The CI action and the deploy workflow run `npm run build`, so they run the hook too.

A hook that needs a toolchain (Emscripten, CMake) needs it installed first. In CI, install it in the job's steps before `actions/check`. The deploy workflow is a separate job that the caller can't add steps to, so a repo whose hook needs a toolchain keeps its own deploy workflow, running the same npm scripts, or makes the hook install what it needs.

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
