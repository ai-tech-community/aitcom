// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: {} }));

import { createGiphyClient, isGiphyMediaUrl, toGif } from "./giphy";

const raw = (id: string, host = "media2.giphy.com", rating = "g") => ({
  id,
  title: `Title ${id}`,
  rating,
  images: {
    original: {
      mp4: `https://${host}/media/${id}/giphy.mp4`,
      mp4_size: "900000",
      width: "480",
      height: "270",
    },
    original_still: { url: `https://${host}/media/${id}/giphy_s.gif` },
    fixed_width: {
      mp4: `https://${host}/media/${id}/200w.mp4`,
      width: "200",
      height: "113",
    },
    fixed_width_still: { url: `https://${host}/media/${id}/200w_s.gif` },
  },
});

const page = (
  ids: string[],
  pagination = { offset: 0, count: ids.length, total_count: 100 },
) =>
  new Response(JSON.stringify({ data: ids.map((id) => raw(id)), pagination }), {
    status: 200,
  });

describe("GIPHY media hosts", () => {
  it("accepts only https addresses on GIPHY's media hosts", () => {
    expect(isGiphyMediaUrl("https://media2.giphy.com/media/a/giphy.mp4")).toBe(
      true,
    );
    expect(isGiphyMediaUrl("https://i.giphy.com/a.webp")).toBe(true);
    expect(isGiphyMediaUrl("http://media.giphy.com/a.mp4")).toBe(false);
    expect(isGiphyMediaUrl("https://media.giphy.com.evil.test/a.mp4")).toBe(
      false,
    );
    expect(isGiphyMediaUrl("https://tracker.example/pixel.gif")).toBe(false);
  });

  it("drops a result with any address elsewhere, or an odd id", () => {
    expect(toGif(raw("abc"))).toMatchObject({
      giphyId: "abc",
      width: 480,
      height: 270,
      preview: { width: 200, height: 113 },
    });
    expect(toGif(raw("abc", "evil.test"))).toBeNull();
    expect(toGif({ ...raw("abc"), id: "../x" })).toBeNull();
  });
});

describe("createGiphyClient", () => {
  it("searches with a safe rating and the member's language, and pages on", async () => {
    const fetch = vi.fn(async () =>
      page(["a", "b"], { offset: 0, count: 24, total_count: 100 }),
    );
    const giphy = createGiphyClient({ apiKey: "k", fetch: fetch as never });
    const result = await giphy.search({
      query: " Party ",
      offset: 0,
      lang: "nl",
    });
    expect(result.gifs.map((g) => g.giphyId)).toEqual(["a", "b"]);
    expect(result.nextOffset).toBe(24);
    const url = (fetch.mock.calls[0] as unknown as [URL])[0];
    expect(url.pathname).toBe("/v1/gifs/search");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      api_key: "k",
      q: "party",
      rating: "pg",
      lang: "nl",
      offset: "0",
    });
  });

  it("ends paging at the last result", async () => {
    const giphy = createGiphyClient({
      apiKey: "k",
      fetch: (async () =>
        page(["a"], { offset: 96, count: 4, total_count: 100 })) as never,
    });
    expect((await giphy.trending({ offset: 96 })).nextOffset).toBeNull();
  });

  it("answers the same page from its cache for a while", async () => {
    let now = 0;
    const fetch = vi.fn(async () => page(["a"]));
    const giphy = createGiphyClient({
      apiKey: "k",
      fetch: fetch as never,
      now: () => now,
    });
    await giphy.trending({ offset: 0 });
    await giphy.trending({ offset: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 11 * 60 * 1000;
    await giphy.trending({ offset: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("says GIF search is busy when GIPHY's quota is used up", async () => {
    const giphy = createGiphyClient({
      apiKey: "k",
      fetch: (async () => new Response("", { status: 429 })) as never,
    });
    await expect(giphy.trending({ offset: 0 })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("looks a GIF up by id, and never calls GIPHY for a malformed id", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: raw("xyz") })),
    );
    const giphy = createGiphyClient({ apiKey: "k", fetch: fetch as never });
    await expect(giphy.byId("xyz")).resolves.toMatchObject({ giphyId: "xyz" });
    expect((fetch.mock.calls[0] as unknown as [URL])[0].pathname).toBe(
      "/v1/gifs/xyz",
    );
    await expect(giphy.byId("../search")).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("knows no GIF for an id GIPHY does not know", async () => {
    const giphy = createGiphyClient({
      apiKey: "k",
      fetch: (async () => new Response("", { status: 404 })) as never,
    });
    await expect(giphy.byId("gone")).resolves.toBeNull();
  });

  it("refuses a GIF rated above pg, also when looked up by id", async () => {
    expect(toGif(raw("adult", undefined, "r"))).toBeNull();
    expect(toGif({ ...raw("unrated"), rating: undefined })).toBeNull();
    const giphy = createGiphyClient({
      apiKey: "k",
      fetch: (async () =>
        new Response(
          JSON.stringify({ data: raw("adult", undefined, "r") }),
        )) as never,
    });
    await expect(giphy.byId("adult")).resolves.toBeNull();
  });

  it("answers a just-picked GIF from the search it came from", async () => {
    const fetch = vi.fn(async () => page(["a"]));
    const giphy = createGiphyClient({ apiKey: "k", fetch: fetch as never });
    await giphy.trending({ offset: 0 });
    await expect(giphy.byId("a")).resolves.toMatchObject({ giphyId: "a" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the lighter rendition for a large GIF, and tidies titles", () => {
    const big = raw("big");
    big.images.original.mp4_size = String(5 * 1024 * 1024);
    Object.assign(big.images, {
      fixed_height: {
        mp4: "https://media2.giphy.com/media/big/200.mp4",
        width: "356",
        height: "200",
      },
      fixed_height_still: {
        url: "https://media2.giphy.com/media/big/200_s.gif",
      },
    });
    expect(toGif(big)).toMatchObject({
      mp4Url: "https://media2.giphy.com/media/big/200.mp4",
      height: 200,
    });
    expect(
      toGif({ ...raw("t"), title: "Happy Dance GIF by Foo Studio" })?.title,
    ).toBe("Happy Dance");
  });
});
