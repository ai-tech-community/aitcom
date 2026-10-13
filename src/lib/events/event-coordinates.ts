/**
 * Venue coordinates for public events the map should pin.
 *
 * Staff rows are inserted with SQL, which skips the Payload geocode hook, so
 * `latitude` / `longitude` stayed empty. These points are Nominatim matches
 * for the stored venue (or the city, when that is the whole location).
 * Events that were geocoded in April 2026 are included so a fresh database
 * and production share one list. The migration writes a point only when the
 * row is still missing one.
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
