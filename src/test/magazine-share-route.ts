import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import nl from "../../messages/nl.json";
import type { ShareCard } from "@/server/magazines/share-cards";
import { loadShareCard } from "@/server/magazines/share-cards";
import { renderMagazineShareImage } from "@/server/magazines/share-image";
import { safeFetch } from "@/server/net/safe-fetch";
import { shareCoverBytes } from "./share-cover-fixture";

export async function shareImageTranslations({
  locale,
  namespace,
}: {
  locale: string;
  namespace: string;
}) {
  return createTranslator({
    locale,
    messages: locale === "nl" ? nl : en,
    namespace: namespace as never,
  });
}

type Params = {
  locale: string;
  magazineSlug: string;
  issueSlug: string;
  articleSlug?: string;
};
type Handler = (
  request: Request,
  context: { params: Promise<Params> },
) => Promise<Response>;

export function magazineShareRouteTests(
  get: Handler,
  runtime: string,
  articleSlug: string | null,
) {
  const card: ShareCard = {
    magazineName: "Weekly",
    communityName: "Builders",
    issueNumber: 4,
    issueTitle: "An issue",
    coverImageUrl: null,
    article: articleSlug ? { title: "An article", authorName: "Ada" } : null,
  };
  let ip = 0;
  function call(locale = "en", client = `192.0.2.${++ip}`) {
    return get(
      new Request("http://localhost/x", {
        headers: { "x-forwarded-for": client },
      }),
      {
        params: Promise.resolve({
          locale,
          magazineSlug: "weekly",
          issueSlug: "issue-4",
          ...(articleSlug ? { articleSlug } : {}),
        }),
      },
    );
  }
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadShareCard).mockResolvedValue(null);
    vi.mocked(safeFetch).mockRejectedValue(
      new Error("Refusing to fetch URL: internal"),
    );
  });

  describe(
    articleSlug ? "article share image route" : "issue share image route",
    () => {
      it("uses Node and returns 404 when the anonymous reader gets no card", async () => {
        expect(runtime).toBe("nodejs");
        expect((await call()).status).toBe(404);
        expect(loadShareCard).toHaveBeenCalledWith(expect.anything(), {
          locale: "en",
          magazineSlug: "weekly",
          issueSlug: "issue-4",
          articleSlug,
        });
        expect(renderMagazineShareImage).not.toHaveBeenCalled();
      });

      it("returns an uncached PNG with translated labels", async () => {
        vi.mocked(loadShareCard).mockResolvedValue(card);
        const response = await call("nl");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("cache-control")).toBe("no-store");
        const png = Buffer.from(await response.arrayBuffer());
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        expect(renderMagazineShareImage).toHaveBeenCalledWith(
          card,
          {
            issueLine: "Weekly · Nummer 4",
            byline: articleSlug ? "Door Ada" : "Een magazine van Builders",
          },
          null,
        );
      });

      it("falls back to the default locale and the community byline without an author", async () => {
        const anonymous = {
          ...card,
          article: card.article ? { ...card.article, authorName: null } : null,
        };
        vi.mocked(loadShareCard).mockResolvedValue(anonymous);
        const response = await call("invalid");
        await response.arrayBuffer();
        expect(loadShareCard).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ locale: "en" }),
        );
        expect(renderMagazineShareImage).toHaveBeenCalledWith(
          anonymous,
          { issueLine: "Weekly · Issue 4", byline: "A magazine by Builders" },
          null,
        );
      });

      it("never passes the raw editor cover URL to the renderer", async () => {
        vi.mocked(loadShareCard).mockResolvedValue({
          ...card,
          coverImageUrl: "http://169.254.169.254/x",
        });

        const response = await call();
        await response.arrayBuffer();
        expect(safeFetch).toHaveBeenCalledWith(
          "http://169.254.169.254/x",
          expect.anything(),
        );
        for (const [, , cover] of vi.mocked(renderMagazineShareImage).mock
          .calls) {
          expect(cover === null || cover.startsWith("data:")).toBe(true);
        }
      });

      it("passes a fetched cover as a data URL and renders it", async () => {
        const withCover = {
          ...card,
          coverImageUrl: "https://example.test/cover",
        };
        vi.mocked(loadShareCard).mockResolvedValue(withCover);
        vi.mocked(safeFetch).mockResolvedValueOnce({
          url: withCover.coverImageUrl,
          response: new Response(
            new Uint8Array(await shareCoverBytes("webp")),
            { headers: { "Content-Type": "image/webp" } },
          ) as unknown as Awaited<ReturnType<typeof safeFetch>>["response"],
        });
        const response = await call();
        const png = Buffer.from(await response.arrayBuffer());
        expect(png.subarray(1, 4).toString()).toBe("PNG");
        expect(renderMagazineShareImage).toHaveBeenCalledWith(
          withCover,
          expect.anything(),
          expect.stringMatching(/^data:image\//),
        );
      });

      it("limits the 31st request from one IP within a minute", async () => {
        const client = `198.51.100.${++ip}`;
        for (let count = 0; count < 30; count++)
          expect((await call("en", client)).status).toBe(404);
        const response = await call("en", client);
        expect(response.status).toBe(429);
        expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
        expect(await response.text()).toBe("Too many requests");
        expect(loadShareCard).toHaveBeenCalledTimes(30);
        expect((await call()).status).toBe(404);
      });
    },
  );
}
