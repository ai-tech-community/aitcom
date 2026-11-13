// The Gallery tab is a 404 while the rollout flag is off.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

const state = vi.hoisted(() => ({ enabled: false }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/gallery/flag", () => ({
  galleryEnabled: () => state.enabled,
}));
vi.mock("@/components/communities/gallery/gallery-page", () => ({
  GalleryPage: () => null,
}));

import { GalleryPage } from "@/components/communities/gallery/gallery-page";
import CommunityGalleryPage, { dynamic } from "./page";

const params = Promise.resolve({ locale: "en", slug: "mlops" });

beforeEach(() => {
  state.enabled = false;
});

describe("CommunityGalleryPage", () => {
  it("is rendered per request, so the flag is read every time", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("is not found while the gallery is switched off", async () => {
    await expect(CommunityGalleryPage({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("renders the gallery for the community once switched on", async () => {
    state.enabled = true;
    const page = await CommunityGalleryPage({ params });
    expect(isValidElement(page)).toBe(true);
    expect(page.type).toBe(GalleryPage);
    expect(page.props).toEqual({ slug: "mlops" });
  });
});
