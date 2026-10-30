// @vitest-environment node
import { vi } from "vitest";
import type * as Net from "@/server/net/safe-fetch";
import type * as ShareImage from "@/server/magazines/share-image";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/share-cards", () => ({ loadShareCard: vi.fn() }));
vi.mock("@/server/net/safe-fetch", async (original) => ({
  ...(await original<typeof Net>()),
  safeFetch: vi.fn(),
}));
vi.mock("@/server/magazines/share-image", async (original) => {
  const actual = await original<typeof ShareImage>();
  return {
    ...actual,
    renderMagazineShareImage: vi.fn(actual.renderMagazineShareImage),
  };
});
vi.mock("next-intl/server", async () => {
  const { shareImageTranslations } =
    await import("@/test/magazine-share-route");
  return { getTranslations: shareImageTranslations };
});

import { magazineShareRouteTests } from "@/test/magazine-share-route";
import { GET, runtime } from "./route";

magazineShareRouteTests(GET, runtime, null);
