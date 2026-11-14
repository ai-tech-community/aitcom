import { describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";

vi.mock("@/components/communities/gallery/gallery-page", () => ({
  GalleryPage: () => null,
}));

import { GalleryPage } from "@/components/communities/gallery/gallery-page";
import CommunityGalleryPage from "./page";

const params = Promise.resolve({ locale: "en", slug: "mlops" });

describe("CommunityGalleryPage", () => {
  it("renders the gallery for the community, with no rollout switch to check", async () => {
    const page = await CommunityGalleryPage({ params });
    expect(isValidElement(page)).toBe(true);
    expect(page.type).toBe(GalleryPage);
    expect(page.props).toEqual({ slug: "mlops" });
  });
});
