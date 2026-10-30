import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

import { communityLogoChoice } from "./logo-choice";

describe("community logo choice", () => {
  it("keeps a URL and accepts a media id", () => {
    expect(
      communityLogoChoice({ logoUrl: "https://cdn.example.test/logo.png" }),
    ).toEqual({ kind: "url", logoUrl: "https://cdn.example.test/logo.png" });
    expect(communityLogoChoice({ logoUrl: null })).toEqual({
      kind: "url",
      logoUrl: null,
    });
    expect(communityLogoChoice({ logoMediaId: 8 })).toEqual({
      kind: "media",
      mediaId: 8,
    });
    expect(communityLogoChoice({ logoMediaId: null })).toEqual({
      kind: "media",
      mediaId: null,
    });
    expect(communityLogoChoice({})).toEqual({ kind: "skip" });
  });

  it("refuses to apply a URL and a media id in one call", () => {
    expect(() =>
      communityLogoChoice({
        logoUrl: "https://cdn.example.test/logo.png",
        logoMediaId: 8,
      }),
    ).toThrow(TRPCError);
  });
});
