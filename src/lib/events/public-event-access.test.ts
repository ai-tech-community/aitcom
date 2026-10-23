import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HUB_SLUG } from "@/server/communities/hub";

import {
  eventCommunityIsPublic,
  publishedEventsVisibleWhere,
  viewerMaySeeCommunityEvents,
  type EventCommunityGate,
} from "./public-event-access";

const dir = dirname(fileURLToPath(import.meta.url));

function gate(
  over: Partial<EventCommunityGate> &
    Pick<EventCommunityGate, "slug" | "isListedInDirectory" | "joinPolicy">,
): EventCommunityGate {
  return over;
}

describe("event community publicity", () => {
  it("keeps Hub events public even though the Hub is unlisted", () => {
    expect(
      eventCommunityIsPublic(
        gate({
          slug: HUB_SLUG,
          isListedInDirectory: false,
          joinPolicy: "invite_only",
        }),
      ),
    ).toBe(true);
  });

  it("keeps listed open and approval-required communities public", () => {
    expect(
      eventCommunityIsPublic(
        gate({
          slug: "builders",
          isListedInDirectory: true,
          joinPolicy: "open",
        }),
      ),
    ).toBe(true);
    expect(
      eventCommunityIsPublic(
        gate({
          slug: "builders",
          isListedInDirectory: true,
          joinPolicy: "approval_required",
        }),
      ),
    ).toBe(true);
  });

  it("hides unlisted, invite-only, and unknown join policies from guests", () => {
    const hidden: EventCommunityGate[] = [
      gate({
        slug: "ait-demo-studio",
        isListedInDirectory: false,
        joinPolicy: "open",
      }),
      gate({
        slug: "ait-demo-studio",
        isListedInDirectory: false,
        joinPolicy: "invite_only",
      }),
      gate({
        slug: "ait-demo-studio",
        isListedInDirectory: false,
        joinPolicy: "approval_required",
      }),
      gate({
        slug: "closed-circle",
        isListedInDirectory: true,
        joinPolicy: "invite_only",
      }),
      gate({
        slug: "mystery",
        isListedInDirectory: true,
        joinPolicy: "secret",
      }),
    ];
    expect(
      hidden.every((community) => !eventCommunityIsPublic(community)),
    ).toBe(true);
  });

  it("lets a member see a hidden community's events and a guest see unscoped ones", () => {
    const studio = gate({
      slug: "ait-demo-studio",
      isListedInDirectory: false,
      joinPolicy: "invite_only",
    });
    expect(viewerMaySeeCommunityEvents(studio, false)).toBe(false);
    expect(viewerMaySeeCommunityEvents(studio, true)).toBe(true);
    expect(viewerMaySeeCommunityEvents(null, false)).toBe(true);
  });
});

describe("publishedEventsVisibleWhere", () => {
  it("lists published events only, so a cancelled event stays out", () => {
    expect(publishedEventsVisibleWhere([])).toEqual({
      status: { equals: "published" },
      discoverySource: { not_equals: "luma" },
    });
  });

  it("drops events of hidden communities and keeps events with no community", () => {
    expect(publishedEventsVisibleWhere(["studio-id"])).toEqual({
      and: [
        {
          status: { equals: "published" },
          discoverySource: { not_equals: "luma" },
        },
        {
          or: [
            { communityId: { exists: false } },
            { communityId: { not_in: ["studio-id"] } },
          ],
        },
      ],
    });
  });

  it("fails closed when it cannot tell which communities are hidden", () => {
    expect(publishedEventsVisibleWhere(null)).toEqual({
      and: [
        {
          status: { equals: "published" },
          discoverySource: { not_equals: "luma" },
        },
        { communityId: { exists: false } },
      ],
    });
  });
});

describe("public event surfaces wire the same gate", () => {
  const root = join(dir, "../../..");
  const read = (path: string) => readFileSync(join(root, path), "utf8");

  it("filters the public listing, its search, and its JSON-LD", () => {
    const src = read("src/app/[locale]/events/page.tsx");
    expect(src).toContain("hiddenEventCommunityIds");
    expect(src).toContain("publishedEventsVisibleWhere");
  });

  it("returns notFound for an invite-only community on the detail page", () => {
    const src = read("src/app/[locale]/events/[slug]/page.tsx");
    expect(src).toContain("viewerMaySeeEvent");
    expect(src).toContain("notFound()");
    expect(src).toContain("cancelledLabel");
  });

  it("keeps hackathon subpages and the layout on the same gate", () => {
    expect(read("src/server/hackathon/resolve-public-hackathon.ts")).toContain(
      "viewerMaySeeEvent",
    );
  });

  it("filters the homepage, directory, digest, profiles, hosted cards, and agent browse", () => {
    expect(read("src/app/[locale]/page.tsx")).toContain(
      "hiddenEventCommunityIds",
    );
    expect(read("src/server/communities/directory-queries.ts")).toContain(
      "hiddenEventCommunityIds",
    );
    expect(read("src/server/notifications/digest-sources.ts")).toContain(
      "hiddenEventCommunityIds",
    );
    expect(read("src/server/members/profile-work.ts")).toContain(
      "hiddenEventCommunityIds",
    );
    expect(read("src/server/events/public-events-queries.ts")).toContain(
      "hiddenEventCommunityIds",
    );
    expect(read("src/server/api/routers/agent.ts")).toContain(
      "hiddenEventCommunityIds",
    );
    expect(read("src/server/api/routers/events.ts")).toContain(
      "viewerMaySeeEvent",
    );
    expect(read("src/app/api/events/[slug]/ics/route.ts")).toContain(
      "viewerMaySeeEvent",
    );
  });

  it("does not publish events in the blog RSS feed", () => {
    expect(read("src/app/feed.xml/route.ts")).not.toContain(
      'collection: "events"',
    );
  });
});
