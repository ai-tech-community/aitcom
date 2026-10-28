// @vitest-environment node
import { describe, expect, it } from "vitest";

import { GET, generateStaticParams } from "./route";

const get = (locale: string, file: string) =>
  GET(new Request("https://app.test"), {
    params: Promise.resolve({ locale, file }),
  });

describe("emoji data route", () => {
  it("serves the picker's data for all languages from our own origin", async () => {
    expect(generateStaticParams()).toEqual([
      { locale: "en", file: "data.json" },
      { locale: "en", file: "messages.json" },
      { locale: "nl", file: "data.json" },
      { locale: "nl", file: "messages.json" },
      { locale: "fr", file: "data.json" },
      { locale: "fr", file: "messages.json" },
    ]);
    const res = await get("fr", "data.json");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { emoji: string }[];
    expect(data.length).toBeGreaterThan(1000);
    expect(res.headers.get("cache-control")).toMatch(/max-age=86400/);
  });

  it("answers 404 for anything else", async () => {
    expect((await get("de", "data.json")).status).toBe(404);
    expect((await get("en", "../package.json")).status).toBe(404);
  });
});
