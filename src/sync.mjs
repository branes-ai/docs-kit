// Generates a site's content from its repo's docs/.
//
//   docs/**/*.md(x)     → src/content/docs/**  (README.md → index.md), except
//                         the records (docs/adr/, docs/plan/), which the
//                         architecture site publishes (branes-ai/architecture),
//                         and the unpublished folders
//   docs/index.mdx      → the home page
//   docs/README.md      → the documentation map, /overview/ (the home page
//                         when there is no docs/index.mdx)
//   sidebar             → src/generated/sidebar.json
//   theme               → src/generated/theme.css
//   the records' old pages → public/{adr,plan}/**/index.html, each a redirect to
//                         the record's page on the architecture site
//
// Nothing under src/content/docs/ is authored by hand; it is deleted and
// rebuilt on every run. Relative links are rewritten: to a page when the target
// is a document in docs/, to the architecture site when it is a record, to
// GitHub when it is any other file in the repo. A relative link whose target
// (or anchor) does not exist is an error, and so is a hero link that is not a
// page.

import fs from 'node:fs';
import path from 'node:path';
import { slug as slugify } from 'github-slugger';
import yaml from 'js-yaml';
import { FRONT_MATTER, frontMatter, githubAnchors, lines, page } from './markdown.mjs';
import { themeCss } from './theme.mjs';

// The landing page: MDX, for Starlight's hero and components.
const LANDING = 'index.mdx';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

// The extensions Vite tries for an import without one.
const MODULE_EXT = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];

const toPosix = (p) => p.split(path.sep).join('/');

// A malformed %-escape is kept as written, so the link check reports it with
// its file and line rather than the run failing.
const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Generates the site in siteDir from the docs/ of repoDir (siteDir's parent by
// default), with `config` from resolveConfig(). Returns the errors, and writes
// nothing but the content when there are any.
export function sync({ siteDir, repoDir = path.resolve(siteDir, '..'), config }) {
  const DOCS_DIR = path.join(repoDir, 'docs');
  const OUT_DIR = path.join(siteDir, 'src', 'content', 'docs');
  const GEN_DIR = path.join(siteDir, 'src', 'generated');
  const PUBLIC_DIR = path.join(siteDir, 'public');
  const { github: GITHUB, branch: BRANCH, records: RECORDS, unpublished: UNPUBLISHED } = config;

  const hasLanding = fs.existsSync(path.join(DOCS_DIR, LANDING));
  const isRecord = (docsRel) => RECORDS.has(docsRel.split('/')[0]);
  const isUnpublished = (docsRel) => UNPUBLISHED.has(docsRel.split('/')[0]);

  // A record's page on the architecture site: its path under docs/, each
  // segment slugified, a README being its folder's page. The rule is the site's
  // (branes-ai/architecture, scripts/lib/parse.mjs, routeOf).
  function recordUrl(docsRel) {
    const parts = docsRel.split('/');
    const base = parts.pop().replace(/\.md$/, '');
    if (base !== 'README') parts.push(base);
    return `${config.architecture}/${[config.repo, ...parts].map((x) => slugify(x)).join('/')}/`;
  }

  // docs-relative path of a document → its output path and its site route.
  function pageOf(rel) {
    if (rel === LANDING) return { outRel: LANDING, slug: '', route: '/' };
    if (rel === 'README.md' && hasLanding) return { outRel: 'overview.md', slug: 'overview', route: '/overview/' };
    const dir = path.posix.dirname(rel);
    const ext = path.posix.extname(rel);
    const base = path.posix.basename(rel, ext);
    const isIndex = base === 'README';
    const outRel = path.posix.join(dir, `${isIndex ? 'index' : base}${ext}`);
    // The route as Starlight's loader derives it: each path segment slugified
    // (lowercased, spaces to hyphens, punctuation dropped).
    const segments = (isIndex ? dir : path.posix.join(dir, base)).split('/').filter((x) => x !== '.' && x !== '');
    const slug = segments.map((x) => slugify(x)).join('/');
    return { outRel, slug, route: slug === '' ? '/' : `/${slug}/` };
  }

  // A document: its text and lines, its front matter, and what page() reads.
  // A title in the front matter is the page's title; an MDX document that is
  // not valid MDX is an error, at its line.
  function parse(file) {
    const text = fs.readFileSync(file, 'utf8');
    const mdx = file.endsWith('.mdx');
    const fm = frontMatter(text);
    const given = typeof fm.data.title === 'string' ? fm.data.title : null;
    const base = { text, mdx, tagged: lines(text), fm, parseError: null };
    try {
      return { ...base, ...page(text, { mdx, math: config.math, title: given }) };
    } catch (e) {
      const line = e.line ?? e.place?.line ?? e.position?.start?.line;
      return { ...base, parseError: `${line ?? 1}: not valid MDX: ${e.reason ?? e.message}`, title: given, titleLines: null, anchors: new Set(), skip: new Set(), imports: [] };
    }
  }

  // An MDX document's import must resolve: site code through @site/ (the
  // site's src/), or an installed package.
  function checkImport(specifier, rel, line) {
    const where = `docs/${rel}:${line}`;
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      errors.push(`${where}: import ${specifier} is a path; import site code through @site/ (docs-site/src/)`);
      return;
    }
    if (specifier.startsWith('@site/')) {
      // As Vite resolves it: the file, the file with a module extension, or
      // the folder's index.
      const file = path.join(siteDir, 'src', specifier.slice('@site/'.length).split('?')[0]);
      const candidates = [file, ...MODULE_EXT.map((e) => file + e), ...MODULE_EXT.map((e) => path.join(file, `index${e}`))];
      if (!candidates.some((f) => fs.existsSync(f) && fs.statSync(f).isFile())) {
        errors.push(`${where}: import ${specifier}: ${toPosix(path.relative(repoDir, file))} does not exist`);
      }
      return;
    }
    if (/^(astro|virtual):/.test(specifier)) return;
    const name = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
    for (let dir = siteDir; ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'node_modules', name))) return;
      if (path.dirname(dir) === dir) break;
    }
    errors.push(`${where}: import ${specifier}: package ${name} is not installed`);
  }

  // A page's sidebar fields: Starlight's `sidebar.label` and `sidebar.hidden`,
  // and the kit's `sidebar.group`, the nested group the page is listed in.
  function sidebarOf(rel, fm) {
    const sb = fm.sidebar ?? {};
    const bad = (msg) => {
      errors.push(`docs/${rel}: front matter sidebar${msg}`);
      return {};
    };
    if (typeof sb !== 'object' || Array.isArray(sb)) return bad(' must be a mapping');
    for (const k of ['label', 'group']) if (sb[k] !== undefined && typeof sb[k] !== 'string') return bad(`.${k} must be a string`);
    if (sb.hidden !== undefined && typeof sb.hidden !== 'boolean') return bad('.hidden must be true or false');
    return sb;
  }

  const errors = [];

  const allMd = walk(DOCS_DIR)
    .map((f) => toPosix(path.relative(DOCS_DIR, f)))
    .filter((rel) => rel.endsWith('.md') || (rel.endsWith('.mdx') && rel !== LANDING))
    .sort();
  const mdFiles = allMd.filter((rel) => !isRecord(rel) && !isUnpublished(rel));

  const docs = new Map();
  for (const rel of mdFiles) {
    const d = parse(path.join(DOCS_DIR, rel));
    if (d.fm.error) errors.push(`docs/${rel}: ${d.fm.error}`);
    if (d.parseError) errors.push(`docs/${rel}:${d.parseError}`);
    else if (d.title === null) errors.push(`docs/${rel}: no "# " title heading (or title in the front matter)`);
    for (const { specifier, line } of d.imports) checkImport(specifier, rel, line);
    docs.set(rel, { ...d, sidebar: sidebarOf(rel, d.fm.data), ...pageOf(rel) });
  }

  // The landing page: its front matter is kept as written (title required), and
  // its body is parsed like any document's, for links and anchors.
  let landingFront = null;
  if (hasLanding) {
    const text = fs.readFileSync(path.join(DOCS_DIR, LANDING), 'utf8');
    const m = text.match(FRONT_MATTER);
    if (!m) {
      errors.push(`docs/${LANDING}: no front matter`);
    } else {
      landingFront = m[1] ?? '';
      const title = landingFront.match(/^title:\s*(.+)$/m);
      if (!title) errors.push(`docs/${LANDING}: no title in the front matter`);
      const body = parse(path.join(DOCS_DIR, LANDING));
      if (body.parseError) errors.push(`docs/${LANDING}:${body.parseError}`);
      for (const { specifier, line } of body.imports) checkImport(specifier, LANDING, line);
      const offset = m[0].split(/\r?\n/).length - 1;
      const tagged = lines(text.slice(m[0].length));
      docs.set(LANDING, { ...body, tagged, offset, title: title ? title[1] : null, titleLines: null, ...pageOf(LANDING) });
    }
  }

  // Rewrites one link target found in docs/<rel>, line `lineNo`.
  function rewrite(target, rel, lineNo, copies) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return target;
    const where = `docs/${rel}:${lineNo}`;
    if (target.startsWith('#')) {
      const anchor = safeDecode(target.slice(1));
      if (!docs.get(rel).anchors.has(anchor)) errors.push(`${where}: no heading for anchor ${target}`);
      return target;
    }
    if (target.startsWith('/')) {
      errors.push(`${where}: root-relative link ${target}; use a path relative to the document`);
      return target;
    }
    const [pathPart, ...rest] = target.split('#');
    const anchor = rest.length ? safeDecode(rest.join('#')) : null;
    const abs = path.resolve(DOCS_DIR, path.posix.dirname(rel), safeDecode(pathPart));
    const repoRel = toPosix(path.relative(repoDir, abs));
    if (repoRel.startsWith('..')) {
      errors.push(`${where}: link ${target} leaves the repository`);
      return target;
    }
    if (!fs.existsSync(abs)) {
      errors.push(`${where}: link target ${target} does not exist`);
      return target;
    }
    const docsRel = toPosix(path.relative(DOCS_DIR, abs));
    const inDocs = !docsRel.startsWith('..');
    const isDir = fs.statSync(abs).isDirectory();
    const docRel = inDocs && isDir ? path.posix.join(docsRel, 'README.md').replace(/^\.\//, '') : docsRel;
    if (inDocs && docs.has(docRel)) {
      const p = docs.get(docRel);
      if (anchor !== null && !p.anchors.has(anchor)) {
        errors.push(`${where}: docs/${docRel} has no heading for anchor #${anchor}`);
      }
      return p.route + (anchor !== null ? `#${anchor}` : '');
    }
    if (inDocs && isRecord(docRel) && docRel.endsWith('.md') && fs.existsSync(path.join(DOCS_DIR, docRel))) {
      if (anchor !== null && !parse(path.join(DOCS_DIR, docRel)).anchors.has(anchor)) {
        errors.push(`${where}: docs/${docRel} has no heading for anchor #${anchor}`);
      }
      return recordUrl(docRel) + (anchor !== null ? `#${anchor}` : '');
    }
    if (inDocs && !isDir && IMAGE_EXT.has(path.extname(abs).toLowerCase())) {
      copies.add(docsRel);
      return target;
    }
    if (anchor !== null && !isDir && abs.endsWith('.md') && !githubAnchors(fs.readFileSync(abs, 'utf8'), { math: config.math }).has(anchor)) {
      errors.push(`${where}: ${repoRel} has no heading for anchor #${anchor}`);
    }
    const kind = isDir ? 'tree' : 'blob';
    return `${GITHUB}/${kind}/${BRANCH}/${repoRel}` + (anchor !== null ? `#${anchor}` : '');
  }

  // Rewrites the inline links of one line, leaving code spans alone, and in
  // MDX, {expressions}.
  function rewriteLine(line, rel, lineNo, copies) {
    return line
      .split(rel.endsWith('.mdx') ? /(`+[^`]*`+|\{[^{}]*\})/ : /(`+[^`]*`+)/)
      .map((part, i) => {
        if (i % 2 === 1) return part;
        return part
          .replace(/(\]\()(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g, (_, open, target, close) => {
            const bare = target.startsWith('<') ? target.slice(1, -1) : target;
            return open + rewrite(bare, rel, lineNo, copies) + close;
          })
          // A reference definition; a footnote's ([^1]: text) is not a link.
          .replace(/^(\s*\[(?!\^)[^\]]+\]:\s+)(\S+)/, (_, open, target) => open + rewrite(target, rel, lineNo, copies));
      })
      .join('');
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const copies = new Set();

  for (const [rel, d] of docs) {
    if (d.title === null || d.parseError || rel === LANDING) continue;
    // The body without the front matter and the title heading; imports and
    // {expressions} as written.
    const [first, last] = d.titleLines ?? [0, -1];
    const body = d.tagged
      .map((t, i) => {
        const n = i + 1;
        if (n <= d.fm.lineCount || (n >= first && n <= last)) return null;
        return t.code || d.skip.has(n) ? t.line : rewriteLine(t.line, rel, n, copies);
      })
      .filter((l) => l !== null)
      .join('\n')
      .replace(/^\s*\n/, '');
    // The document's own front matter is kept, but for the kit's fields: the
    // title, the edit link and sidebar.group.
    const { title: _title, editUrl: _editUrl, sidebar, ...fields } = d.fm.data;
    const { group: _group, ...sidebarFields } = sidebar && typeof sidebar === 'object' ? sidebar : {};
    if (Object.keys(sidebarFields).length) fields.sidebar = sidebarFields;
    const front = [
      '---',
      `title: ${JSON.stringify(d.title)}`,
      ...(Object.keys(fields).length ? [yaml.dump(fields, { lineWidth: -1 }).trimEnd()] : []),
      `editUrl: ${JSON.stringify(`${GITHUB}/edit/${BRANCH}/docs/${rel}`)}`,
      '---',
      '',
    ].join('\n');
    const out = path.join(OUT_DIR, d.outRel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, front + body);
  }

  if (landingFront !== null) {
    const d = docs.get(LANDING);
    // Each relative hero action (`link: ./x/`) must be the route of a page.
    const routes = new Set([...docs.values()].map((p) => p.route));
    for (const [i, line] of landingFront.split(/\r?\n/).entries()) {
      const m = line.match(/^\s*link:\s*['"]?(\.\/[^'"\s]*)/);
      if (m && !routes.has(m[1].slice(1).replace(/\/?$/, '/'))) {
        errors.push(`docs/${LANDING}:${i + 2}: hero link ${m[1]} is not a page`);
      }
    }
    const body = d.tagged
      .map((t, i) => {
        const n = i + 1 + d.offset;
        return t.code || d.skip.has(n) ? t.line : rewriteLine(t.line, LANDING, n, copies);
      })
      .join('\n');
    const editUrl = `editUrl: ${JSON.stringify(`${GITHUB}/edit/${BRANCH}/docs/${LANDING}`)}`;
    fs.writeFileSync(path.join(OUT_DIR, LANDING), `---\n${landingFront}\n${editUrl}\n---\n${body}`);
  }

  for (const rel of copies) {
    const out = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.copyFileSync(path.join(DOCS_DIR, rel), out);
  }

  // Sidebar: one group per top-level folder, and per top-level document (other
  // than the map), in the order docs/README.md's table lists them, then any
  // others alphabetically: folders, then documents. Within a folder's group:
  // the documents its table row links to, in that order; then the folder's
  // README, its other documents, and its subfolders' documents. A page whose
  // front matter sets sidebar.group is listed in a nested group of that name,
  // placed where the group's first page would be; sidebar.label is its label
  // (the title otherwise), and sidebar.hidden leaves it out.
  const folders = [...new Set(mdFiles.filter((r) => r.includes('/')).map((r) => r.split('/')[0]))];
  const topDocs = [...docs.keys()].filter((r) => !r.includes('/') && r !== 'README.md' && r !== LANDING);
  const order = [];
  const rowLinks = new Map();
  const index = docs.get('README.md');
  if (index) {
    for (const { line, code } of index.tagged) {
      if (code) continue;
      const folder = line.match(/^\|\s*\[?([A-Za-z0-9_-]+)\/\]?/)?.[1];
      const doc = line.match(/^\|\s*\[[^\]]*\]\(([^)#\s/]+\.mdx?)\)/)?.[1];
      if (folder && folders.includes(folder) && !order.includes(folder)) {
        order.push(folder);
        const cells = line.split('|').slice(2).join('|');
        const linked = [...cells.matchAll(/\]\(([^)#\s]+)/g)].map((x) => path.posix.normalize(x[1]));
        rowLinks.set(folder, [...new Set(linked)]);
      } else if (doc && topDocs.includes(doc) && !order.includes(doc)) {
        order.push(doc);
      }
    }
  }
  for (const f of folders.sort()) if (!order.includes(f)) order.push(f);
  for (const r of topDocs.sort()) if (!order.includes(r)) order.push(r);

  // The items for a list of pages, nesting the ones with a sidebar.group.
  function itemsOf(pages) {
    const items = [];
    const groups = new Map();
    for (const [, d] of pages) {
      if (d.sidebar.hidden) continue;
      const item = { label: d.sidebar.label ?? d.title, slug: d.slug };
      const name = d.sidebar.group;
      if (name === undefined) {
        items.push(item);
        continue;
      }
      if (!groups.has(name)) {
        groups.set(name, { label: name, items: [] });
        items.push(groups.get(name));
      }
      groups.get(name).items.push(item);
    }
    return items;
  }

  // With a landing page, the documentation map is the last item of the first
  // group; without one, it is the home page, linked first.
  const sidebar = hasLanding ? [] : [{ label: 'Overview', link: '/' }];
  for (const folder of order) {
    if (topDocs.includes(folder)) {
      const d = docs.get(folder);
      const items = itemsOf([[folder, d]]);
      if (d.title !== null && items.length) sidebar.push({ label: d.title, items });
      continue;
    }
    const pages = [...docs.entries()]
      .filter(([rel, d]) => rel.startsWith(`${folder}/`) && d.title !== null)
      .sort(([a], [b]) => {
        const links = rowLinks.get(folder) ?? [];
        const la = links.indexOf(a);
        const lb = links.indexOf(b);
        if (la !== lb) return la === -1 ? 1 : lb === -1 ? -1 : la - lb;
        const ia = a === `${folder}/README.md`;
        const ib = b === `${folder}/README.md`;
        if (ia !== ib) return ia ? -1 : 1;
        // The folder's own documents before its subfolders' (plan/test-plan.md
        // before plan/b0/README.md).
        const da = a.split('/').length;
        const db = b.split('/').length;
        return da !== db ? da - db : a.localeCompare(b);
      });
    sidebar.push({
      label: config.groupLabels[folder] ?? folder[0].toUpperCase() + folder.slice(1),
      items: itemsOf(pages),
    });
  }
  const map = docs.get('README.md');
  if (hasLanding && map && map.title !== null && sidebar.length > 0) {
    sidebar[0].items.push({ label: map.title, slug: map.slug });
  }

  if (errors.length) return { errors };

  fs.mkdirSync(GEN_DIR, { recursive: true });
  fs.writeFileSync(path.join(GEN_DIR, 'sidebar.json'), JSON.stringify(sidebar, null, 2) + '\n');
  fs.writeFileSync(path.join(GEN_DIR, 'theme.css'), themeCss(config));

  // The records were pages of this site until they moved to the architecture
  // site. Each old page redirects there, keeping the URL's #fragment; the meta
  // refresh is the fallback without JavaScript.
  for (const folder of RECORDS) fs.rmSync(path.join(PUBLIC_DIR, folder), { recursive: true, force: true });
  const records = allMd.filter(isRecord);
  for (const rel of records) {
    const url = JSON.stringify(recordUrl(rel));
    const html = [
      '<!doctype html>',
      '<html lang="en">',
      '<meta charset="utf-8">',
      '<title>Moved to the architecture site</title>',
      '<meta name="robots" content="noindex">',
      `<link rel="canonical" href=${url}>`,
      `<script>location.replace(${url} + location.hash);</script>`,
      `<meta http-equiv="refresh" content="0; url=${recordUrl(rel)}">`,
      `<p>This page moved to <a href=${url}>the architecture site</a>.</p>`,
      '</html>',
      '',
    ].join('\n');
    const out = path.join(PUBLIC_DIR, pageOf(rel).slug, 'index.html');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
  }
  return {
    errors,
    summary: `${docs.size} pages from docs/, ${copies.size} images, ${order.length} sidebar groups, ${records.length} redirects to the architecture site`,
  };
}
