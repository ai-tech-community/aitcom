import type { CollectionAfterChangeHook, CollectionConfig } from "payload";

import {
  EVENT_FOCUS_LABELS,
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  EVENT_LEVEL_LABELS,
  EVENT_LEVEL_OPTIONS,
  EVENT_REVIEW_STATUS_LABELS,
  EVENT_REVIEW_STATUS_OPTIONS,
} from "@/lib/event-metadata";
import { DEFAULT_EVENT_TIMEZONE, isValidTimeZone } from "@/lib/event-time";
import { geocodeEvent } from "@/server/geocoding/nominatim";
import { eventDeadlineWarnings } from "@/server/hackathon/deadlines";

function locationChanged(
  doc: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
): boolean {
  if (!previous) return true;
  return (
    doc.location !== previous.location ||
    doc.city !== previous.city ||
    doc.region !== previous.region ||
    doc.country !== previous.country
  );
}

/**
 * An "online" event (or one whose location string is a placeholder like
 * "Online"/"TBA" — the Luma normalizer's fallback for a calendar entry with
 * no geo/meeting-url signal at all) has no physical catchment to geocode:
 * `latitude`/`longitude` only feed the conflict corpus's distance check
 * (corpus.ts), which is already skipped for non-in-person events. Skipping
 * the Nominatim call here also spares the cron's throttled (1.1s) client
 * from being burned on venues that will never resolve to anything useful.
 * In-person events on the create path still geocode as before — this only
 * short-circuits the online/placeholder case.
 */
function isUngeocodableLocation(d: Record<string, unknown>): boolean {
  if (d.format === "online") return true;
  const location = typeof d.location === "string" ? d.location : "";
  return location === "Online" || location === "TBA";
}

const geocodeAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  const d = doc as Record<string, unknown>;
  const prev = previousDoc as Record<string, unknown> | undefined;

  if (isUngeocodableLocation(d)) return;

  const alreadyGeocoded =
    typeof d.latitude === "number" && typeof d.longitude === "number";
  const mustGeocode =
    operation === "create" || locationChanged(d, prev) || !alreadyGeocoded;

  if (!mustGeocode) return;

  const result = await geocodeEvent({
    location: typeof d.location === "string" ? d.location : null,
    city: typeof d.city === "string" ? d.city : null,
    region: typeof d.region === "string" ? d.region : null,
    country: typeof d.country === "string" ? d.country : null,
  });
  if (!result) return;

  try {
    await req.payload.update({
      collection: "events",
      id: d.id as number,
      data: {
        latitude: result.latitude,
        longitude: result.longitude,
        geocodedAt: new Date().toISOString(),
      },
      context: { skipGeocode: true },
    });
  } catch (error) {
    req.payload.logger.error({ err: error }, "Failed to persist geocode");
  }
};

export const Events: CollectionConfig = {
  slug: "events",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "date", "status", "reviewStatus"],
  },
  versions: { drafts: true },
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        for (const warning of eventDeadlineWarnings(data)) {
          req?.payload?.logger?.warn(
            `Event ${data?.slug ?? "(new)"}: ${warning}`,
          );
        }
        return data;
      },
    ],
    afterChange: [
      async (args) => {
        if ((args.req.context as { skipGeocode?: boolean })?.skipGeocode) {
          return;
        }
        await geocodeAfterChange(args);
      },
    ],
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "description", type: "richText", required: true, localized: true },
    {
      type: "tabs",
      tabs: [
        {
          label: "Basics",
          fields: [
            {
              name: "summary",
              type: "textarea",
              localized: true,
              admin: {
                description:
                  "Short event summary for cards, SEO, and agent curation.",
              },
            },
            {
              name: "type",
              type: "select",
              required: true,
              options: [
                { label: "Workshop", value: "workshop" },
                { label: "Hackathon", value: "hackathon" },
                { label: "Deep Dive", value: "deep_dive" },
                { label: "Meetup", value: "meetup" },
              ],
            },
            {
              name: "format",
              type: "select",
              options: EVENT_FORMAT_OPTIONS.map((value) => ({
                label: EVENT_FORMAT_LABELS[value],
                value,
              })),
              admin: {
                description: "How attendees join this event.",
              },
            },
            {
              name: "location",
              type: "text",
              required: true,
            },
            {
              type: "row",
              fields: [
                { name: "region", type: "text" },
                { name: "country", type: "text" },
                { name: "city", type: "text" },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "latitude",
                  type: "number",
                  admin: {
                    description:
                      "Geocoded automatically from location/city/country.",
                    readOnly: true,
                    width: "40%",
                  },
                },
                {
                  name: "longitude",
                  type: "number",
                  admin: { readOnly: true, width: "40%" },
                },
                {
                  name: "geocodedAt",
                  type: "date",
                  admin: { readOnly: true, width: "20%" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "date",
                  type: "date",
                  required: true,
                  admin: { width: "50%" },
                },
                { name: "startTime", type: "text", admin: { width: "25%" } },
                { name: "endTime", type: "text", admin: { width: "25%" } },
              ],
            },
            // IANA timezone the start/end wall-clock times are expressed in.
            // Design decision (#166): Nominatim geocoding cannot return a
            // timezone and we deliberately avoid heavy tz-boundary deps
            // (geo-tz). The default therefore comes from the organizer's
            // browser in the community create flow (and from Luma's own
            // timezone on imports), with this platform-home fallback for
            // admin-created events. Organizers can always override it.
            {
              name: "timezone",
              type: "text",
              defaultValue: DEFAULT_EVENT_TIMEZONE,
              validate: (value: string | null | undefined) =>
                !value ||
                isValidTimeZone(value) ||
                "Must be a valid IANA timezone, e.g. Europe/Amsterdam",
              admin: {
                description:
                  'IANA timezone for start/end times, e.g. "Europe/Amsterdam".',
              },
            },
            {
              type: "row",
              admin: {
                // Hackathon timeline deadlines (event-level, all optional).
                // Authoritative over the manual phase buttons: a passed deadline
                // closes its gate regardless of phase; extend by editing the date.
                // Unset = no enforced window (today's phase-driven behavior).
                condition: (data) => data?.type === "hackathon",
              },
              fields: [
                {
                  name: "registrationDeadline",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description:
                      "After this, team create/join is closed (interpreted in the event timezone).",
                  },
                },
                {
                  name: "submissionDeadline",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description: "After this, project submission is closed.",
                  },
                },
              ],
            },
            {
              type: "row",
              admin: {
                condition: (data) => data?.type === "hackathon",
              },
              fields: [
                {
                  name: "judgingDeadline",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description:
                      "After this, judges can no longer submit rankings.",
                  },
                },
                {
                  name: "resultsDate",
                  type: "date",
                  admin: {
                    width: "50%",
                    date: { pickerAppearance: "dayAndTime" },
                    description:
                      "Results announcement target — display/notification only, not enforced.",
                  },
                },
              ],
            },
            { name: "maxAttendees", type: "number" },
            {
              name: "price",
              type: "number",
              admin: {
                description:
                  "Price in EUR cents (e.g. 1500 = €15.00). Leave empty for free events.",
              },
            },
          ],
        },
        {
          label: "Discovery & classification",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "focus",
                  type: "select",
                  options: EVENT_FOCUS_OPTIONS.map((value) => ({
                    label: EVENT_FOCUS_LABELS[value],
                    value,
                  })),
                },
                {
                  name: "level",
                  type: "select",
                  options: EVENT_LEVEL_OPTIONS.map((value) => ({
                    label: EVENT_LEVEL_LABELS[value],
                    value,
                  })),
                },
                {
                  name: "aitFitScore",
                  type: "number",
                  min: 1,
                  max: 10,
                  admin: {
                    description: "1-10 relevance score for AIT Community.",
                  },
                },
              ],
            },
            {
              name: "audience",
              type: "relationship",
              relationTo: "audiences",
              hasMany: true,
            },
            {
              name: "tags",
              type: "array",
              admin: {
                description: "Optional keyword tags for search and curation.",
              },
              fields: [{ name: "tag", type: "text", required: true }],
            },
            {
              type: "row",
              fields: [
                { name: "sourceUrl", type: "text" },
                { name: "discoverySource", type: "text" },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "curatedByAgent",
                  type: "checkbox",
                  defaultValue: false,
                },
                { name: "confidenceScore", type: "number", min: 0, max: 1 },
                {
                  name: "lastVerifiedAt",
                  type: "date",
                  admin: { date: { pickerAppearance: "dayAndTime" } },
                },
              ],
            },
            {
              name: "reviewStatus",
              type: "select",
              defaultValue: "approved",
              options: EVENT_REVIEW_STATUS_OPTIONS.map((value) => ({
                label: EVENT_REVIEW_STATUS_LABELS[value],
                value,
              })),
              admin: {
                description:
                  "Curation lifecycle; separate from publish status so existing flows keep working.",
              },
            },
          ],
        },
        {
          label: "Media",
          fields: [
            {
              name: "image",
              type: "upload",
              relationTo: "media",
              admin: {
                description:
                  "Legacy/compatible event image. Existing events continue using this.",
              },
            },
            {
              name: "coverImage",
              type: "upload",
              relationTo: "media",
              admin: {
                description: "Primary hero image for the event page.",
              },
            },
            {
              name: "gallery",
              type: "upload",
              relationTo: "media",
              hasMany: true,
            },
            { name: "videoUrl", type: "text" },
          ],
        },
        {
          label: "Relations",
          fields: [
            {
              name: "speakers",
              type: "relationship",
              relationTo: "speakers",
              hasMany: true,
            },
          ],
        },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft (pending approval)", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Completed", value: "completed" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "communityId",
      type: "text",
      index: true,
      admin: { position: "sidebar" },
    },
    {
      name: "challengeId",
      type: "text",
      index: true,
      admin: {
        position: "sidebar",
        description:
          "ID of the Challenge this event runs as a hackathon. Set this to bind an event-challenge (the binding is the team-based discriminator, ADR-0029). Must share the challenge's communityId.",
      },
    },
    {
      name: "submittedBy",
      type: "text",
      index: true,
      admin: {
        position: "sidebar",
        description:
          "User ID of the community member who submitted this event for review.",
        readOnly: true,
      },
    },
  ],
};
