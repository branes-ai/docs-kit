// What the generator reads from a Markdown document: which lines are code, and
// the headings and anchors GitHub and Starlight render for it.
//
// Headings come from a Markdown parser (mdast), not from line patterns, so
// every form GitHub renders is seen as GitHub sees it: ATX and setext
// headings, indented up to three spaces, with entities decoded and code spans
// closed by a run as long as the one that opened them.

import GithubSlugger from 'github-slugger';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
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

// Front matter becomes blank lines, so the parser does not read its closing
// `---` as a setext underline and line numbers stay those of the file.
function blankFrontMatter(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return m ? m[0].replace(/[^\n]/g, '') + text.slice(m[0].length) : text;
}

// A heading's text as both slug it: the rendered text, without markup, raw
// HTML or image alt text.
function textOf(node) {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (node.type === 'html' || node.type === 'image' || node.type === 'imageReference') return '';
  return (node.children ?? []).map(textOf).join('');
}

// An anchor written as HTML: <a name="x"> or any element's id="x".
const CUSTOM_ANCHOR = /<[a-z][^>]*?\s(?:id|name)\s*=\s*(["'])(.*?)\1/gi;

// The headings of a document, in order, each with its depth, text and 1-based
// first and last line (a setext heading spans two), and the custom anchors.
export function headings(text) {
  const tree = fromMarkdown(blankFrontMatter(text), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const list = [];
  const custom = [];
  visit(tree, (node) => {
    if (node.type === 'heading') {
      list.push({ depth: node.depth, text: textOf(node).trim(), start: node.position.start.line, end: node.position.end.line });
    } else if (node.type === 'html') {
      for (const m of node.value.matchAll(CUSTOM_ANCHOR)) custom.push(m[2]);
    }
  });
  return { list, custom };
}

// A document as the site renders it: its title (the first `# ` heading, which
// becomes the page title and is removed from the body) and the anchors of the
// rest. The title takes no slug: a later heading with the same text renders
// as #text, not #text-1.
export function page(text) {
  const { list, custom } = headings(text);
  const title = list.find((h) => h.depth === 1) ?? null;
  const slugger = new GithubSlugger();
  const anchors = new Set(custom);
  for (const h of list) if (h !== title) anchors.add(slugger.slug(h.text));
  return { title: title?.text ?? null, titleLines: title ? [title.start, title.end] : null, anchors };
}

// The anchors GitHub renders for a Markdown file: every heading's, the title's
// included, and the custom ones.
export function githubAnchors(text) {
  const { list, custom } = headings(text);
  const slugger = new GithubSlugger();
  return new Set([...custom, ...list.map((h) => slugger.slug(h.text))]);
}
