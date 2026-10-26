/**
 * Venue coordinates for public events the map should pin.
 *
 * Staff rows are inserted with SQL, which skips the Payload geocode hook, so
 * `latitude` / `longitude` stayed empty. These points are Nominatim matches
 * for the stored venue (or the city, when that is the whole location).
 * Events that were geocoded in April 2026 are included so a fresh database
 * and production share one list. `20261013b` writes a point only when the
 * row is still missing one. That migration is already recorded on
 * production, so `20261019a` writes the five November points with the same
 * null guard. `20261021a` writes the next ten the same way. `20261022a`
 * writes the next seven the same way. `20261026b` writes the next five
 * the same way. A fresh database
 * inserts those rows in `20260925a`, before `20261013b`, and the later write
 * leaves the stored points alone.
 */
export type EventCoordinate = {
  slug: string;
  latitude: number;
  longitude: number;
};

export const EVENT_COORDINATES_AT = "2026-10-13T08:00:00.000Z";

export const EVENT_COORDINATE_BACKFILL: readonly EventCoordinate[] = [
  {
    slug: "the-ai-conference-2026",
    latitude: 37.7756552,
    longitude: -122.3861378,
  },
  {
    slug: "world-summit-ai-amsterdam-2026",
    latitude: 52.4203757,
    longitude: 4.8324208,
  },
  {
    slug: "boston-openclaw-meetup-2026",
    latitude: 42.3616283,
    longitude: -71.081069,
  },
  {
    slug: "ai-engineer-new-york-2026",
    latitude: 40.7127281,
    longitude: -74.0060152,
  },
  {
    slug: "techex-amsterdam-hackathon-2026",
    latitude: 52.3412264,
    longitude: 4.8899065,
  },
  {
    slug: "nvidia-gtc-berlin-2026",
    latitude: 52.5016063,
    longitude: 13.3811909,
  },
  {
    slug: "pytorch-conference-north-america-2026",
    latitude: 37.3289453,
    longitude: -121.8890159,
  },
  {
    slug: "aixia-2026",
    latitude: 48.5962756,
    longitude: 7.7592999,
  },
  {
    slug: "agentic-ai-in-the-wild-2026",
    latitude: 40.7127281,
    longitude: -74.0060152,
  },
  {
    slug: "hacktoberfest-hack-day-barcelona-2026",
    latitude: 41.3774112,
    longitude: 2.1787859,
  },
  {
    slug: "tedai-2026",
    latitude: 48.2083537,
    longitude: 16.3725042,
  },
  {
    slug: "web-summit-2026",
    latitude: 38.7684689,
    longitude: -9.0939002,
  },
  {
    slug: "llmday-london-2026",
    latitude: 51.5061329,
    longitude: -0.0178293,
  },
  {
    slug: "agntcon-mcpcon-europe-2026",
    latitude: 52.3412264,
    longitude: 4.8899065,
  },
  {
    slug: "humanx-amsterdam-2026",
    latitude: 52.3412264,
    longitude: 4.8899065,
  },
  {
    slug: "lisbon-ai-2026",
    latitude: 38.6935306,
    longitude: -9.222055,
  },
  {
    slug: "ai-salon-amsterdam-wsai-special-2026-10-07",
    latitude: 52.4217487,
    longitude: 4.8383248,
  },
  {
    slug: "clinical-ai-hackathon-vienna-2026",
    latitude: 48.2135962,
    longitude: 16.3766853,
  },
  {
    slug: "ai-engineer-code-2026",
    latitude: 37.7857343,
    longitude: -122.4104369,
  },
  {
    slug: "neurips-2026",
    latitude: -33.8698439,
    longitude: 151.2082848,
  },
  {
    slug: "iamexpat-fair-the-hague-2026",
    latitude: 52.0773944,
    longitude: 4.3071566,
  },
  {
    slug: "slush-2026",
    latitude: 60.2029511,
    longitude: 24.9364411,
  },
  {
    slug: "ai-europe-congress-2026",
    latitude: 52.2334499,
    longitude: 21.0016166,
  },
  {
    slug: "ukairs-2026",
    latitude: 55.9399139,
    longitude: -3.169732,
  },
  {
    slug: "ai-hpi-conference-2026",
    latitude: 52.3936679,
    longitude: 13.1331929,
  },
  {
    slug: "ai-devcon-nyc-2026",
    latitude: 40.6566834,
    longitude: -74.0072654,
  },
  {
    slug: "ai-engineering-summit-austin-2026",
    latitude: 30.2820301,
    longitude: -97.7406426,
  },
  {
    slug: "siai-2026",
    latitude: 42.3365765,
    longitude: -71.0953704,
  },
  {
    slug: "kvk-ondernemersdagen-2026",
    latitude: 52.0845399,
    longitude: 5.1040766,
  },
  {
    slug: "ai-coding-summit-nyc-2026",
    latitude: 40.7081774,
    longitude: -74.054691,
  },
  {
    slug: "dsc-europe-2026",
    latitude: 44.7968533,
    longitude: 20.437565,
  },
  {
    slug: "expatise-income-tax-utrecht-2026",
    latitude: 52.0932221,
    longitude: 5.1141671,
  },
  {
    slug: "ae-global-summit-2026",
    latitude: 51.5263708,
    longitude: -0.1326179,
  },
  {
    slug: "data-science-summit-warsaw-2026",
    latitude: 52.2397726,
    longitude: 21.0454432,
  },
  {
    slug: "generative-ai-summit-london-2026",
    latitude: 51.503295,
    longitude: -0.0000577,
  },
  {
    slug: "agentic-transformation-summit-amsterdam-2026",
    latitude: 52.3624578,
    longitude: 4.8801835,
  },
  {
    // Nominatim for Het Scheepvaartmuseum, the published 11:30 arrival.
    // The intocht is a route, not one hall.
    slug: "sinterklaasintocht-amsterdam-2026",
    latitude: 52.372005,
    longitude: 4.9149527,
  },
  {
    slug: "handelsblatt-ai-summit-2026",
    latitude: 48.1275499,
    longitude: 11.6093703,
  },
  {
    slug: "microsoft-ignite-2026",
    latitude: 37.7839013,
    longitude: -122.4012097,
  },
  {
    // Nominatim for Riviervismarkt 1. The pub name is not a separate point.
    slug: "welcome-to-the-hague-2026",
    latitude: 52.0770497,
    longitude: 4.3074642,
  },
  {
    slug: "apidays-paris-2026",
    latitude: 48.8927415,
    longitude: 2.2391581,
  },
  {
    slug: "the-ai-summit-new-york-2026",
    latitude: 40.7583595,
    longitude: -74.0022114,
  },
  {
    slug: "big-data-ai-world-madrid-2026",
    latitude: 40.4663707,
    longitude: -3.617214,
  },
  {
    // Nominatim for 100 Stockton Street. The room name is not a separate point.
    slug: "data-outpost-2026",
    latitude: 37.7869895,
    longitude: -122.406369,
  },
  {
    slug: "adopt-ai-2026",
    latitude: 48.8661614,
    longitude: 2.3122229,
  },
  {
    slug: "ai-coding-summit-berlin-2026",
    latitude: 52.5172459,
    longitude: 13.45001,
  },
  {
    slug: "chatbot-summit-berlin-2027",
    latitude: 52.5103653,
    longitude: 13.3753306,
  },
];

/**
 * Upcoming venue events on `/en/events` as of 13 Oct 2026. Each one has a
 * physical location and must be in the coordinate backfill.
 */
export const UPCOMING_VENUE_EVENT_SLUGS = [
  "techex-amsterdam-hackathon-2026",
  "pytorch-conference-north-america-2026",
  "nvidia-gtc-berlin-2026",
  "agentic-ai-in-the-wild-2026",
  "aixia-2026",
  "hacktoberfest-hack-day-barcelona-2026",
  "tedai-2026",
  "clinical-ai-hackathon-vienna-2026",
  "web-summit-2026",
  "ai-engineer-code-2026",
  "llmday-london-2026",
  "neurips-2026",
] as const;
