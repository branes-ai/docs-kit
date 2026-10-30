// Checks a built site (dist/): every internal link resolves to a built page,
// and every anchor to an id on it. It tests what the sync predicted (that a
// heading renders with the anchor it checked a link against) on the HTML
// Starlight actually built. The HTML is parsed, so only real elements count,
// not markup shown in code or left in comments. The API reference (api/) is
// Doxygen's and is skipped.

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';

const toPosix = (p) => p.split(path.sep).join('/');

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// The ids (and <a name>s) of a parsed page, and its links: every href and
// src, with the element's line.
function scan(html) {
  const ids = new Set();
  const links = [];
  (function walk(node) {
    for (const { name, value } of node.attrs ?? []) {
      if (name === 'id' || (name === 'name' && node.tagName === 'a')) ids.add(value);
      if (name === 'href' || name === 'src') links.push({ href: value, line: node.sourceCodeLocation?.startLine });
    }
    // A <template>'s children are in its content fragment.
    for (const child of node.content?.childNodes ?? node.childNodes ?? []) walk(child);
  })(parse(html, { sourceCodeLocationInfo: true }));
  return { ids, links };
}

export function checkDist(dist, base) {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (path.relative(dist, f) !== 'api') walk(f);
      } else if (f.endsWith('.html')) files.push(f);
    }
  })(dist);

  const pages = new Map();
  const pageOf = (f) => {
    if (!pages.has(f)) pages.set(f, scan(fs.readFileSync(f, 'utf8')));
    return pages.get(f);
  };

  const broken = [];
  let checked = 0;
  for (const f of files) {
    const rel = toPosix(path.relative(dist, f));
    // The page's URL, against which a relative link resolves.
    const url = new URL(`${base}${rel.replace(/(^|\/)index\.html$/, '$1')}`, 'https://site.invalid');
    for (const { href, line } of pageOf(f).links) {
      const where = `${rel}:${line}`;
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
      if (href.startsWith('#')) {
        if (href.length === 1) continue;
        checked++;
        if (!pageOf(f).ids.has(safeDecode(href.slice(1)))) broken.push(`${where}: no id for ${href}`);
        continue;
      }
      checked++;
      const resolved = new URL(href, url);
      if (!resolved.pathname.startsWith(base)) {
        broken.push(`${where}: ${href} is outside the base ${base}`);
        continue;
      }
      let target = path.join(dist, safeDecode(resolved.pathname.slice(base.length)));
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) {
        // The API reference is linked but built separately, in the deploy.
        if (!resolved.pathname.startsWith(`${base}api/`)) broken.push(`${where}: ${href} does not exist`);
        continue;
      }
      const anchor = resolved.hash.slice(1);
      if (anchor && target.endsWith('.html') && !pageOf(target).ids.has(safeDecode(anchor))) {
        broken.push(`${where}: ${href} has no id for #${anchor}`);
      }
    }
  }
  return { pages: files.length, checked, broken };
}
