---
status: complete
issue: branes-ai/architecture#5
---
# Plan: MDX pages in docs/, with the site's components

Issue: [architecture#5](https://github.com/branes-ai/architecture/issues/5), under the epic [architecture#3](https://github.com/branes-ai/architecture/issues/3). It is the step before [reflex#50](https://github.com/branes-ai/reflex/issues/50) and [cortex#528](https://github.com/branes-ai/cortex/issues/528), which move those sites' pages into `docs/`. Implemented in [docs-kit#7](https://github.com/branes-ai/docs-kit/pull/7), released as `v0.2.0`.

## Goal

The kit publishes MDX documents from `docs/` as pages. Their components and data come from the repo's `docs-site/`, and their links are checked like any document's.

## What reflex needs, and what v0.1 lacked

Reflex's site is the first to move. Its needs set the scope:

| Reflex has | docs-kit v0.1 |
|---|---|
| 19 MDX pages importing `TracePlayer`, traces and SVG figures by `../../../` paths | MDX only for `docs/index.mdx` |
| Pages titled in front matter, with a `description`, and no `# ` heading | The title from the first `# ` heading; no other front matter |
| Each block's four pages in a nested group ("PID Controller": Explainer, Developer Guide, V&V Plan, Deployment Guide), at flat routes such as `/control/pid-explainer/` | One level of groups, labeled by page title |
| A "Roadmap" group for the top-level `roadmap.md` | Top-level documents in no group |
| KaTeX math | The `astro` passthrough would replace the kit's link rewriting |
| A WebAssembly module and figures built before the site | npm's `prebuild` hook, but the action and the deploy called `npx docs-kit build`, which skips it |

## Decisions

- **Imports through an alias, `@site/` → the site's `src/`** (Vite `resolve.alias`; `tsconfig` `paths` for type checking), rather than the generator rewriting relative imports. The import in a document then reads the same in `docs/` and in the generated content. The sync checks each import, and a relative one is an error, because it can't resolve from both places.
- **Nesting from the map and front matter** (decided 2026-10-30). A page's front matter sets Starlight's `sidebar.label`, and the kit's `sidebar.group` names the nested group it is listed in. The group is placed where its first page would be, in the order of the map's row. The other options were a sidebar block in the config, which would repeat the map, and subfolders, which would change every route.
- **Math is an option, `math: true`**, not just a plugin, because the sync must know about it: in MDX, the braces of LaTeX (`$\frac{a}{b}$`) are otherwise read as expressions. The kit adds remark-math, rehype-katex and KaTeX's stylesheet. Other plugins go in `markdown`, after the kit's own.
- **Hooks are npm's.** The action and the deploy run the site's `npm run build`, `check` and `api`, so a `prebuild` script runs before the build, as it does locally.
- **GitHub shows `.mdx` as source.** That's accepted, and the README recommends `.md` unless a page needs a component.

## Design

- `src/markdown.mjs`: `frontMatter()` (js-yaml). An `.mdx` document is parsed with the MDX extensions, and with the math extension when the site has math. `page()` returns:
  - the lines that aren't Markdown (imports, exports and flow expressions), which are kept as written;
  - each import's specifier and line;
  - JSX `id`s, as anchors.
- `src/sync.mjs`:
  - `docs/**/*.mdx` becomes a page; the title comes from front matter or the first `# ` heading;
  - the rest of the front matter is kept, but for `sidebar.group`;
  - imports are checked;
  - in MDX, `{…}` on a line is left alone, like a code span;
  - the sidebar gets nested groups, labels, `hidden`, and top-level documents' groups.
- `src/astro.mjs`: the `@site` alias, `math`, `markdown` and `customCss`.

## Acceptance

All five were met on 2026-10-30:

1. A test repo with an MDX document in `docs/`, importing a component and a JSON file from `docs-site/`, builds and renders both: the example site does this, and CI builds and checks it.
2. A broken relative link in an MDX body fails the build with file and line; a link in a code block, a comment or an expression is not checked: unit tests.
3. A missing import fails the build, naming the document: unit tests.
4. **One reflex block page builds from `docs/`, and its rendered output matches today's.** The spike converted a copy of reflex's whole site, since the kit generates every page:
   - all 27 pages built from `docs/`, including the PID explainer with its `TracePlayer`;
   - each page's content is identical to today's build;
   - the sidebar is today's, plus the documentation map and the architecture site's link;
   - `docs-kit check` found 2072 internal links, 0 broken;
   - a screenshot of the PID explainer matches today's, except for the sidebar's added entry;
   - the trace players draw, and the math renders.
5. anatomy, racing-drone and synapse build the same `dist/` as on v0.1.0.
