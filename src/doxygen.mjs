// The Doxyfile of a site's C++ API reference, from the config's `api`. Paths
// are relative to the site folder, where Doxygen runs; the reference is
// written to public/api/. `api.doxyfile` settings come last: a tag the kit
// doesn't set is added, and one it does is replaced (Doxygen takes a tag's
// last value, so a list is replaced whole, not appended to). A value with a
// space, comma, # or " is quoted, since Doxygen splits lists on spaces and
// commas; inside quotes only " is escaped, and a backslash stays as written.
const value = (v) => (/[\s,#"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v);

export function doxyfile({ api }, { repoFromSite = '..' } = {}) {
  const input = api.input.map((p) => JSON.stringify(`${repoFromSite}/${p.replace(/\/$/, '')}`)).join(' ');
  return [
    `PROJECT_NAME           = ${JSON.stringify(api.name)}`,
    `PROJECT_BRIEF          = ${JSON.stringify(api.brief ?? '')}`,
    'OUTPUT_DIRECTORY       = public',
    'HTML_OUTPUT            = api',
    'GENERATE_LATEX         = NO',
    `INPUT                  = ${input}`,
    'RECURSIVE              = YES',
    'FILE_PATTERNS          = *.hpp *.h',
    'EXTRACT_ALL            = YES',
    'EXTRACT_STATIC         = YES',
    'JAVADOC_AUTOBRIEF      = YES',
    'QUIET                  = YES',
    'WARN_IF_UNDOCUMENTED   = NO',
    'GENERATE_TREEVIEW      = YES',
    'DISABLE_INDEX          = NO',
    'FULL_SIDEBAR           = NO',
    'SOURCE_BROWSER         = YES',
    'ALPHABETICAL_INDEX     = YES',
    'SORT_MEMBER_DOCS       = YES',
    'BUILTIN_STL_SUPPORT    = YES',
    ...Object.entries(api.doxyfile ?? {}).map(([tag, v]) => `${tag.padEnd(22)} = ${[v].flat().map(value).join(' ')}`),
    '',
  ].join('\n');
}
