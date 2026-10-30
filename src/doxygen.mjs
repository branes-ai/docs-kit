// The Doxyfile of a site's C++ API reference, from the config's `api`. Paths
// are relative to the site folder, where Doxygen runs; the reference is
// written to public/api/.
export function doxyfile({ api }, { repoFromSite = '..' } = {}) {
  const input = api.input.map((p) => `${repoFromSite}/${p.replace(/\/$/, '')}`).join(' ');
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
    '',
  ].join('\n');
}
