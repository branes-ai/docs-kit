// A throwaway repo with the given docs/ (and other) files, synced into its
// docs-site/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveConfig } from '../src/config.mjs';
import { sync } from '../src/sync.mjs';

export function repo(files, config = {}) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-kit-'));
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(repoDir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  const siteDir = path.join(repoDir, 'docs-site');
  fs.mkdirSync(siteDir, { recursive: true });
  const result = sync({ siteDir, config: resolveConfig({ repo: 'demo', title: 'Demo', description: 'A demo.', ...config }) });
  const read = (rel) => fs.readFileSync(path.join(siteDir, rel), 'utf8');
  const exists = (rel) => fs.existsSync(path.join(siteDir, rel));
  return { ...result, read, exists, sidebar: () => JSON.parse(read('src/generated/sidebar.json')) };
}

// One document, docs/guide.md, with the given body under its title.
export function doc(body, extra = {}, config = {}) {
  return repo({ 'docs/guide.md': `# Guide\n\n${body}\n`, ...extra }, config);
}
