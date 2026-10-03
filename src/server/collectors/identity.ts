/**
 * How our data collector introduces itself (ADR-0040). The worker sends the
 * user agent; the public about page shows it. One source, so they agree.
 */
export const COLLECTOR_ROBOTS_TOKEN = "aitcom-collector";
export const COLLECTOR_ABOUT_PATH = "/collectors/about";
export const COLLECTOR_USER_AGENT = `${COLLECTOR_ROBOTS_TOKEN}/1.0 (+https://aitcommunity.org${COLLECTOR_ABOUT_PATH})`;
/** Where site owners ask to be added to the block list. */
export const COLLECTOR_OPT_OUT_EMAIL = "info@klevox.com";
