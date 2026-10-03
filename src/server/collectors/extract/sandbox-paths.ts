/**
 * Where the pre-bundled HTML extraction worker lives, relative to the app's
 * working directory (`process.cwd()`). `next.config.js` repeats this path as
 * a literal in `outputFileTracingIncludes`; a test keeps the two in sync.
 */
export const HTML_EXTRACT_BUNDLE = "workers/dist/html-extract.bundle.cjs";
