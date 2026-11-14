/**
 * Test support for the `galleryItem` kind: gallery items, events, Payload,
 * the database and storage, all in memory. The kind, picker and suggester
 * tests share these, so one set of item states runs through every path that
 * decides what an editor may feature.
 */
import { vi } from "vitest";

import {
  matchesWhere,
  selectFields,
  sortDocs,
} from "@/test/fake-payload-query";

import type { Deps } from "../../deps";
import type { ItemContext, PickerContext, SuggestContext } from "../types";

export type Doc = Record<string, unknown>;
export type Where = Record<string, unknown>;

export const COMMUNITY = { id: "c1", slug: "town" };

export function item(id: number, over: Doc = {}): Doc {
  const isPublic = over.visibility === "public";
  const stem = isPublic
    ? `media/gallery/public/c1/u${id}`
    : `private/gallery/c1/u${id}`;
  return {
    id,
    communityId: "c1",
    event: 5,
    topicSlug: null,
    mediaType: "photo",
    status: "ready",
    storage: isPublic ? "public" : "private",
    visibility: "community",
    fileKey: `${stem}.jpg`,
    thumbnailKey: `${stem}-thumb.jpg`,
    width: 2048,
    height: 1536,
    bytes: 1_000_000,
    durationSeconds: null,
    caption: null,
    alt: null,
    uploaderId: "u1",
    batch: 3,
    uploadId: `u${id}`,
    magazineConsent: true,
    magazineConsentAt: "2026-11-10T12:00:00.000Z",
    hiddenAt: null,
    reportCount: 0,
    createdAt: `2026-11-${String(10 + (id % 10)).padStart(2, "0")}T12:00:00.000Z`,
    updatedAt: "2026-11-10T12:00:00.000Z",
    ...over,
  };
}

/** A published community event on one day (no end date). */
export function event(id: number, title: string, day: string, over: Doc = {}) {
  return {
    id,
    title,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    communityId: "c1",
    status: "published",
    date: `${day}T00:00:00.000Z`,
    endDate: null,
    ...over,
  };
}

/** Two events that both ended before 14 November 2026. */
export const EVENTS = [
  event(5, "Model night", "2026-11-05"),
  event(6, "Demo day", "2026-11-08"),
];

export const USERS = [
  { id: "u1", name: "Dana", image: null },
  { id: "u2", name: "Ruben", image: null },
  { id: "u4", name: null, image: null },
];

/**
 * Payload, the database and storage, all in memory. `role` is the reader's
 * membership in the community (none when null); `listed` whether outsiders
 * may read its content.
 */
export function fakes(
  seed: {
    items?: Doc[];
    events?: Doc[];
    role?: string | null;
    listed?: boolean;
  } = {},
) {
  const store: Record<string, Doc[]> = {
    "gallery-items": seed.items ?? [],
    events: seed.events ?? EVENTS,
  };
  const payload = {
    find: vi.fn(
      async (args: {
        collection: string;
        where?: Where;
        sort?: string;
        limit?: number;
        select?: Doc;
      }) => {
        const found = sortDocs(
          (store[args.collection] ?? []).filter((doc) =>
            matchesWhere(doc, args.where),
          ),
          args.sort,
        ).map((doc) => selectFields(doc, args.select));
        return { docs: args.limit ? found.slice(0, args.limit) : found };
      },
    ),
  };
  const communityRead = vi.fn(async () => ({
    id: "c1",
    slug: "town",
    isListedInDirectory: seed.listed ?? true,
    joinPolicy: "open",
  }));
  const db = {
    query: {
      communities: { findFirst: communityRead },
      communityMemberships: {
        findFirst: vi.fn(async () =>
          seed.role ? { role: seed.role, status: "active" } : undefined,
        ),
      },
    },
    select: vi.fn(() => ({
      from: () => ({
        where: async () => USERS,
      }),
    })),
  };
  const storage = {
    presignUpload: vi.fn(),
    inspect: vi.fn(),
    signedGetUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
    publicUrl: vi.fn((key: string) => `https://public.test/${key}`),
    list: vi.fn(),
    remove: vi.fn(),
  };
  const storageSource = vi.fn(() => storage);
  return { payload, db, storage, storageSource, communityRead, store };
}

export type Fakes = ReturnType<typeof fakes>;

export function context(
  f: Fakes,
  access: ItemContext["access"],
  viewerId: string | null,
): ItemContext {
  return {
    payload: f.payload as unknown as ItemContext["payload"],
    db: f.db as unknown as ItemContext["db"],
    storage: f.storageSource as never,
    magazineId: 1,
    issueId: 2,
    community: COMMUNITY,
    locale: "en",
    access,
    reader: {
      viewerId,
      hiddenCommunityIds: vi.fn(async () => new Set<string>()),
      membersOnlyCommunityIds: vi.fn(async () => new Set<string>()),
    },
  };
}

export function pickerContext(f: Fakes, viewerId = "editor"): PickerContext {
  return {
    deps: {
      payload: f.payload as unknown as Deps["payload"],
      db: f.db as unknown as Deps["db"],
      storage: f.storageSource as never,
    },
    magazineId: 1,
    community: COMMUNITY,
    viewerId,
    locale: "en",
  };
}

/** 14 November 2026, looking back over the month before. */
export const NOW = new Date("2026-11-14T06:00:00.000Z");
export const WINDOW = {
  since: new Date("2026-10-15T06:00:00.000Z"),
  until: NOW,
};

export function suggestContext(
  f: Fakes,
  viewerId = "editor",
  now = NOW,
): SuggestContext {
  const picker = pickerContext(f, viewerId);
  return {
    ...picker,
    community: { ...picker.community, name: "Town" },
    topics: [],
    now,
  };
}
