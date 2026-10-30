// Checks a built site (dist/): every internal link resolves to a built page,
// and every anchor to an id on it. It tests what the sync predicted (that a
// heading renders with the anchor it checked a link against) on the HTML
// Starlight actually built. The API reference (api/) is Doxygen's and is
// skipped.

import fs from 'node:fs';
import path from 'node:path';

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

  const ids = new Map();
  const idsOf = (f) => {
    if (!ids.has(f)) {
      const html = fs.readFileSync(f, 'utf8');
      ids.set(f, new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/g)].map((m) => m[1])));
    }
    return ids.get(f);
  };

  const broken = [];
  let checked = 0;
  for (const f of files) {
    const page = toPosix(path.relative(dist, f));
    const html = fs.readFileSync(f, 'utf8');
    for (const [, href] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue;
      if (href.startsWith('#')) {
        if (href.length === 1) continue;
        checked++;
        if (!idsOf(f).has(decodeURIComponent(href.slice(1)))) broken.push(`${page}: no id for ${href}`);
        continue;
      }
      if (!href.startsWith('/')) continue;
      checked++;
      if (!href.startsWith(base)) {
        broken.push(`${page}: ${href} is outside the base ${base}`);
        continue;
      }
      const [p, anchor] = href.slice(base.length).split('#');
      let target = path.join(dist, decodeURIComponent(p.split('?')[0]));
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
      if (!fs.existsSync(target)) {
        // The API reference is linked but built separately, in the deploy.
        if (!href.startsWith(`${base}api/`)) broken.push(`${page}: ${href} does not exist`);
        continue;
      }
      if (anchor && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(anchor))) {
        broken.push(`${page}: ${href} has no id for #${anchor}`);
      }
    }
  }
  return { pages: files.length, checked, broken };
}

const toPosix = (p) => p.split(path.sep).join('/');
