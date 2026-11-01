// The Astro configuration every site shares. A site's astro.config.mjs is
//
//   import starlight from '@astrojs/starlight';
//   import { docsKit } from '@branes-ai/docs-kit/astro';
//   import config from './docs-kit.config.mjs';
//
//   export default docsKit(config, import.meta.url, starlight);
//
// The site passes Starlight in, rather than the kit importing it: Starlight
// ships TypeScript, which Vite compiles when the site's config imports it, but
// not when an installed package like this one does.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import rehypeKatex from 'rehype-katex';
import rehypeRewrite from 'rehype-rewrite';
import remarkMath from 'remark-math';
import { resolveConfig } from './config.mjs';

// KaTeX's stylesheet, from the kit's own copy: npm doesn't always hoist it to
// where the site's bare `katex/…` would resolve, and it must be the version
// rehype-katex renders with.
const katexCss = createRequire(import.meta.url).resolve('katex/dist/katex.min.css');

export function docsKit(userConfig, configUrl, starlight) {
  if (typeof starlight !== 'function') {
    throw new Error('docsKit(config, import.meta.url, starlight): pass the Starlight integration, imported from @astrojs/starlight');
  }
  const c = resolveConfig(userConfig);

  // The content, the sidebar and the theme are generated from ../docs by
  // `docs-kit sync`, which `docs-kit dev` and `docs-kit build` run first.
  const sidebarFile = new URL('./src/generated/sidebar.json', configUrl);
  if (!fs.existsSync(sidebarFile)) {
    throw new Error('src/generated/sidebar.json is missing: run `npm run sync` (docs-kit sync) first');
  }
  const docsSidebar = JSON.parse(fs.readFileSync(sidebarFile, 'utf8'));

  // Deployment configuration.
  //   For GitHub Pages: DEPLOY_TARGET=github-pages (sets the project base path).
  //   For local dev / other hosts: no env vars needed.
  const isGitHubPages = process.env.DEPLOY_TARGET === 'github-pages';
  const site = isGitHubPages ? c.site : (process.env.SITE_URL || 'http://localhost:4321');
  const base = isGitHubPages ? c.base : '/';

  // The Doxygen C++ API reference is generated into public/api/ (`docs-kit
  // api`, and in the deploy workflow) and served at <base>api/. Starlight
  // prepends `base` to internal sidebar links, so this must be base-relative
  // (prefixing it here too would double it). The sidebar links it only when it
  // has been generated, so a preview without Doxygen has no dead link.
  const apiHref = '/api/';
  const hasApi = fs.existsSync(new URL('./public/api/index.html', configUrl));

  // Rehype plugin to rewrite absolute internal links with the base path, so the
  // root-relative links the sync generates resolve under the base on Pages.
  // Protocol-relative `//host` links and already-prefixed links are left
  // untouched.
  const basePrefix = base.replace(/\/$/, '');
  const rehypeBaseLinks = isGitHubPages ? [
    [
      rehypeRewrite,
      {
        rewrite: (node) => {
          if (node.type !== 'element') return;
          const attr = node.tagName === 'a' ? 'href' : node.tagName === 'img' ? 'src' : null;
          if (!attr || typeof node.properties?.[attr] !== 'string') return;
          const val = node.properties[attr];
          const isRootRelative = val.startsWith('/') && !val.startsWith('//');
          const alreadyPrefixed = val === basePrefix || val.startsWith(basePrefix + '/');
          if (isRootRelative && !alreadyPrefixed) {
            node.properties[attr] = basePrefix + val;
          }
        },
      },
    ],
  ] : [];

  return {
    server: { host: '0.0.0.0' },
    site,
    base,
    trailingSlash: 'always',
    markdown: {
      remarkPlugins: [...(c.math ? [remarkMath] : []), ...c.markdown.remarkPlugins],
      rehypePlugins: [...rehypeBaseLinks, ...(c.math ? [rehypeKatex] : []), ...c.markdown.rehypePlugins],
    },
    // Documents in docs/ import the site's code through @site/, the site's
    // src/ (docs-kit sync checks that each import resolves).
    vite: {
      resolve: { alias: { '@site': fileURLToPath(new URL('./src', configUrl)) } },
    },
    integrations: [
      starlight({
        title: c.title,
        description: c.description,
        favicon: '/favicon.svg',
        social: [
          { icon: 'github', label: 'GitHub', href: c.github },
        ],
        // Each generated page sets its own editUrl, to its source in docs/.
        editLink: {
          baseUrl: `${c.github}/edit/${c.branch}/docs/`,
        },
        sidebar: [
          ...docsSidebar,
          // The plans and ADRs are published on the architecture site, unless
          // the site keeps them (records: [], a private repo's).
          ...(c.records.size > 0
            ? [
                {
                  label: 'Plans and decisions',
                  items: [{ label: 'On the architecture site', link: `${c.architecture}/${c.repo}/` }],
                },
              ]
            : []),
          ...(hasApi
            ? [
                {
                  label: 'API Reference',
                  items: [{ label: 'C++ API (Doxygen)', link: apiHref, attrs: { target: '_blank' } }],
                },
              ]
            : []),
        ],
        customCss: ['./src/generated/theme.css', ...(c.math ? [katexCss] : []), ...c.customCss],
        ...c.starlight,
      }),
    ],
    ...c.astro,
  };
}
