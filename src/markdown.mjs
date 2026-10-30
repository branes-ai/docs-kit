// What the generator reads from a Markdown or MDX document: its front matter,
// which lines are code, and the headings and anchors GitHub and Starlight
// render for it.
//
// Headings come from a Markdown parser (mdast), not from line patterns, so
// every form GitHub renders is seen as GitHub sees it: ATX and setext
// headings, indented up to three spaces, with entities decoded and code spans
// closed by a run as long as the one that opened them. An MDX document is
// parsed as MDX, so its imports, {expressions} and JSX are told apart from
// its Markdown. On a site with math, $…$ and $$…$$ are math, as remark-math
// reads them, so the braces of LaTeX are not taken for MDX expressions.

import GithubSlugger from 'github-slugger';
import yaml from 'js-yaml';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { mathFromMarkdown } from 'mdast-util-math';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { gfm } from 'micromark-extension-gfm';
import { math as mathSyntax } from 'micromark-extension-math';
import { mdxjs } from 'micromark-extension-mdxjs';
import { visit } from 'unist-util-visit';

// Splits a document into lines tagged with whether they sit in a code fence.
// As in CommonMark, a fence closes only on a run of its own character at least
// as long as the opening one, with nothing after it, so a four-backtick fence
// can show a three-backtick example. Lines end in LF or CRLF; the CR is not
// kept.
export function lines(text) {
  let fence = null;
  return text.split(/\r?\n/).map((line) => {
    const m = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (m) {
      if (fence === null) fence = m[1];
      else if (m[1][0] === fence[0] && m[1].length >= fence.length && m[2].trim() === '') fence = null;
      return { line, code: true };
    }
    return { line, code: fence !== null };
  });
}

// Front matter, which may be empty (`---` then `---`): the lazy `??` tries the
// empty block first, so a later `---` (a thematic break) is never taken for
// its end.
export const FRONT_MATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)??---(?:\r?\n|$)/;

// A document's front matter: its fields, and how many lines it takes (0 when
// there is none). Front matter that is not a YAML mapping is an error.
export function frontMatter(text) {
  const m = text.match(FRONT_MATTER);
  if (!m) return { data: {}, lineCount: 0, error: null };
  const lineCount = m[0].split(/\r?\n/).length - (/\n$/.test(m[0]) ? 1 : 0);
  try {
    const data = yaml.load(m[1] ?? '') ?? {};
    if (typeof data !== 'object' || Array.isArray(data)) return { data: {}, lineCount, error: 'front matter is not a mapping' };
    return { data, lineCount, error: null };
  } catch (e) {
    return { data: {}, lineCount, error: `front matter: ${e.reason ?? e.message}` };
  }
}

// Front matter becomes blank lines, so the parser does not read its closing
// `---` as a setext underline and line numbers stay those of the file.
function blankFrontMatter(text) {
  const m = text.match(FRONT_MATTER);
  return m ? m[0].replace(/[^\n]/g, '') + text.slice(m[0].length) : text;
}

// A heading's text as both slug it: the rendered text, without markup, raw
// HTML, image alt text or MDX expressions.
function textOf(node) {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'inlineMath') return node.value;
  if (['html', 'image', 'imageReference', 'mdxTextExpression', 'mdxFlowExpression'].includes(node.type)) return '';
  return (node.children ?? []).map(textOf).join('');
}

// An anchor written as HTML: <a name="x"> or any element's id="x".
const CUSTOM_ANCHOR = /<[a-z][^>]*?\s(?:id|name)\s*=\s*(["'])(.*?)\1/gi;

// Parses a document. An MDX document that is not valid MDX throws, with the
// line of the problem in the error's `line`.
function parseTree(text, mdx, math) {
  const extensions = [gfm()];
  const mdastExtensions = [gfmFromMarkdown()];
  if (math) {
    extensions.push(mathSyntax());
    mdastExtensions.push(mathFromMarkdown());
  }
  if (mdx) {
    extensions.push(mdxjs());
    mdastExtensions.push(mdxFromMarkdown());
  }
  return fromMarkdown(blankFrontMatter(text), { extensions, mdastExtensions });
}

// The headings of a document, in order, each with its depth, text and 1-based
// first and last line (a setext heading spans two); its custom anchors; and,
// for MDX, the lines that are not Markdown (imports and exports, and flow
// expressions such as {/* comments */}) and each import's specifier and line.
export function headings(text, { mdx = false, math = false } = {}) {
  const tree = parseTree(text, mdx, math);
  const list = [];
  const custom = [];
  const skip = new Set();
  const imports = [];
  visit(tree, (node) => {
    if (node.type === 'heading') {
      list.push({ depth: node.depth, text: textOf(node).trim(), start: node.position.start.line, end: node.position.end.line });
    } else if (node.type === 'html') {
      for (const m of node.value.matchAll(CUSTOM_ANCHOR)) custom.push(m[2]);
    } else if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      for (const a of node.attributes ?? []) {
        if (a.type === 'mdxJsxAttribute' && (a.name === 'id' || (a.name === 'name' && node.name === 'a')) && typeof a.value === 'string') {
          custom.push(a.value);
        }
      }
    } else if (node.type === 'mdxjsEsm' || node.type === 'mdxFlowExpression') {
      for (let l = node.position.start.line; l <= node.position.end.line; l++) skip.add(l);
      if (node.type === 'mdxjsEsm') {
        node.value.split('\n').forEach((line, i) => {
          for (const m of line.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\1/g)) {
            imports.push({ specifier: m[2], line: node.position.start.line + i });
          }
        });
      }
    }
  });
  return { list, custom, skip, imports };
}

// A document as the site renders it: its title and the anchors of the rest.
// The title is the front matter's `title` when it has one; otherwise the
// first `# ` heading, which becomes the page title and is removed from the
// body. A removed title takes no slug: a later heading with the same text
// renders as #text, not #text-1.
export function page(text, { mdx = false, math = false, title: given = null } = {}) {
  const { list, custom, skip, imports } = headings(text, { mdx, math });
  const title = given === null ? (list.find((h) => h.depth === 1) ?? null) : null;
  const slugger = new GithubSlugger();
  const anchors = new Set(custom);
  for (const h of list) if (h !== title) anchors.add(slugger.slug(h.text));
  return {
    title: given ?? title?.text ?? null,
    titleLines: title ? [title.start, title.end] : null,
    anchors,
    skip,
    imports,
  };
}

// The anchors GitHub renders for a Markdown file: every heading's, the title's
// included, and the custom ones.
export function githubAnchors(text, { math = false } = {}) {
  const { list, custom } = headings(text, { math });
  const slugger = new GithubSlugger();
  return new Set([...custom, ...list.map((h) => slugger.slug(h.text))]);
}
