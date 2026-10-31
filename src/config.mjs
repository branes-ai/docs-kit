// A repo's docs-kit.config.mjs, checked and completed with the defaults every
// Branes.AI repo shares. Only `repo`, `title` and `description` are required.

const DEFAULT_ACCENT = {
  dark: { low: '#2a1f4d', accent: '#9b7bff', high: '#ddd3ff' },
  light: { low: '#e6defe', accent: '#6440d8', high: '#2a1a63' },
};

const KEYS = new Set([
  'repo', 'title', 'description', 'owner', 'branch', 'base', 'records', 'unpublished',
  'groupLabels', 'accent', 'api', 'architecture', 'math', 'markdown', 'customCss', 'starlight', 'astro',
]);

export function resolveConfig(c) {
  const where = 'docs-kit.config.mjs';
  if (c === null || typeof c !== 'object') throw new Error(`${where}: the default export must be an object`);
  const unknown = Object.keys(c).filter((k) => !KEYS.has(k));
  if (unknown.length) throw new Error(`${where}: unknown key(s) ${unknown.join(', ')}`);
  for (const k of ['repo', 'title', 'description']) {
    if (typeof c[k] !== 'string' || c[k] === '') throw new Error(`${where}: \`${k}\` is required`);
  }
  if (c.api && !(Array.isArray(c.api.input) && c.api.input.length)) {
    throw new Error(`${where}: \`api.input\` must list the header folders, relative to the repo`);
  }
  for (const [tag, v] of Object.entries(c.api?.doxyfile ?? {})) {
    const ok = /^[A-Z][A-Z0-9_]*$/.test(tag) && [v].flat().every((x) => typeof x === 'string');
    if (!ok) throw new Error(`${where}: \`api.doxyfile.${tag}\` must be a Doxygen tag with a string or a list of strings`);
  }
  for (const k of ['remarkPlugins', 'rehypePlugins']) {
    if (c.markdown?.[k] !== undefined && !Array.isArray(c.markdown[k])) throw new Error(`${where}: \`markdown.${k}\` must be a list`);
  }
  if (c.math !== undefined && typeof c.math !== 'boolean') throw new Error(`${where}: \`math\` must be true or false`);
  if (c.customCss !== undefined && !Array.isArray(c.customCss)) throw new Error(`${where}: \`customCss\` must be a list`);
  const owner = c.owner ?? 'branes-ai';
  return {
    owner,
    repo: c.repo,
    title: c.title,
    description: c.description,
    branch: c.branch ?? 'main',
    github: `https://github.com/${owner}/${c.repo}`,
    site: `https://${owner}.github.io`,
    base: c.base ?? `/${c.repo}/`,
    // The records, published on the architecture site, not here.
    records: new Set(c.records ?? ['adr', 'plan']),
    architecture: c.architecture ?? `https://${owner}.github.io/architecture`,
    // Folders kept in the repo but not published: a link to one goes to GitHub.
    unpublished: new Set(c.unpublished ?? []),
    // Sidebar labels for top-level folders whose name is not a good label.
    groupLabels: { arch: 'Architecture', 'getting-started': 'Getting Started', ...c.groupLabels },
    accent: {
      dark: { ...DEFAULT_ACCENT.dark, ...c.accent?.dark },
      light: { ...DEFAULT_ACCENT.light, ...c.accent?.light },
    },
    // The Doxygen C++ API reference: { name, brief, input: [header folders],
    // doxyfile: { TAG: value or [values] } added to the kit's Doxyfile }.
    api: c.api ?? null,
    // LaTeX math: $…$ and $$…$$, rendered with KaTeX at build time.
    math: c.math ?? false,
    // Markdown plugins, run after the kit's (rehype: after its base-path
    // rewriting), and stylesheets loaded after the theme.
    markdown: { remarkPlugins: c.markdown?.remarkPlugins ?? [], rehypePlugins: c.markdown?.rehypePlugins ?? [] },
    customCss: c.customCss ?? [],
    // Passed through to Starlight and Astro, over the kit's settings.
    starlight: c.starlight ?? {},
    astro: c.astro ?? {},
  };
}
