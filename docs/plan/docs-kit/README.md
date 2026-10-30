---
status: in-progress
issue: branes-ai/architecture#4
---
# Plan: one shared, versioned docs-site generator

Issue: [architecture#4](https://github.com/branes-ai/architecture/issues/4), under the epic [architecture#3](https://github.com/branes-ai/architecture/issues/3) (one docs-site workflow for every repo, generated from `docs/`).

## Goal

The docs-site generator and its build plumbing live in one place, are released with versions, and are pinned by every repo. A repo keeps only its configuration, and a fix reaches every repo as a version bump, not a hand port.

## Why

`sync-docs.mjs` was copied into anatomy, racing-drone and synapse, and the copies drifted. Review of synapse's copy ([synapse#68](https://github.com/branes-ai/synapse/pull/68)) found bugs in all three, which then had to be ported to the others by hand ([racing-drone#76](https://github.com/branes-ai/racing-drone/issues/76)). The review of the ports found more.

## Decision: a docs-kit repo, installed from a git tag

Decided 2026-10-29 by the stack's maintainer, from these options:

| Option | For | Against |
|---|---|---|
| **A `docs-kit` repo; sites depend on `github:branes-ai/docs-kit#vX.Y.Z`** (chosen) | `npm ci` and the dev server work locally as they do now; the lockfile pins the commit; release-please tags versions; the actions live alongside the code | One more repo |
| A folder of the architecture repo, released as tarballs | No new repo | npm cannot install a subfolder of a git repo, so each release attaches a tarball: more release machinery |
| The action alone, running the generator from its own checkout (as `check-records` does) | Simplest CI | A local `npm run dev` would need the architecture repo checked out alongside |

The npm package is `@branes-ai/docs-kit`. It is not published to a registry, and a git tag is its version.

## Design

- **The generator** (`src/sync.mjs`) is synapse's `sync-docs.mjs` after #68, with the repo-specific values moved into the config (`docs-kit.config.mjs`). Given the same `docs/`, it writes the same content, sidebar and redirects as the three copies, byte for byte.
- **Headings** are read with mdast (`src/markdown.mjs`) instead of line patterns. This fixes the five cases CodeRabbit found in the ports (recorded on [architecture#4](https://github.com/branes-ai/architecture/issues/4#issuecomment-6510875747)), all of which failed valid links:
  - setext headings;
  - ATX headings indented by up to three spaces;
  - HTML entities;
  - a code span closed only by a run as long as the one that opened it;
  - custom `<a name>` and `id=` anchors.
- **The Astro configuration** is `docsKit(config, import.meta.url, starlight)` (`src/astro.mjs`). The site passes in Starlight, because Starlight ships TypeScript, which Vite compiles in the site's config but not inside an installed package. It provides:
  - the base-path link rewriting;
  - the generated sidebar;
  - the records and API entries in the sidebar (the API entry only when the reference was built, as anatomy's copy did);
  - the theme, generated from the config's accent.
- **The CLI** (`docs-kit sync|dev|build|check|api|preview`) runs the sync before the dev server and the build, so no repo needs `pre*` hooks. `check` is new: it checks every link and anchor in the built HTML, which tests the sync's anchor predictions against what Starlight actually rendered.
- **Doxygen**: the config's `api` (name, brief, header folders) becomes the Doxyfile, piped to `doxygen -`.
- **CI**: the composite action `actions/check` (install, build, check) is the PR job. The reusable workflow `.github/workflows/pages.yml` is the deploy. Both run on Node 22 (the copies use Node 20, which is past end of life).
- **Versions**: Astro 5.18 and Starlight 0.37, as in the three repos' lockfiles, so switching changes nothing. An upgrade is a later release.

## Steps

1. **This repo**: the kit, its unit tests, the example site (`example/`), the action, the deploy workflow and this plan. Released as `v0.1.0`.
2. **Adoption**, one PR per repo (anatomy, racing-drone, synapse). Each PR:
   - replaces `scripts/sync-docs.mjs`, `astro.config.mjs`'s body, `custom.css`, the `Doxyfile` and the deploy steps with the config, the pinned kit, the action and the workflow;
   - shows, in its description, a diff of `dist/` before and after the switch.
3. **The architecture site** lists this repo in `sources.yaml`, so this plan is published with the others.

## Acceptance

1. anatomy, racing-drone and synapse build their sites with docs-kit at a pinned version, with no local `sync-docs.mjs`.
2. Each builds the same pages, sidebar and links as before the switch (a diff of `dist/`, ignoring hashes).
3. The unit tests and the example site's build and check run in this repo's CI.
4. Bumping the pinned version in a repo is the whole change needed to pick up a generator fix.
