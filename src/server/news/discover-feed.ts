import { load } from "cheerio";
import { TRPCError } from "@trpc/server";
import { parseFeed, NotAFeedError } from "@/server/collectors/helpers/feed";
import { safeFetch, readBodyCapped } from "@/server/net/safe-fetch";

function publicFeedUrl(raw: string, base?: string) {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

async function readDocument(url: string) {
  const result = await safeFetch(url, {
    userAgent: "AIT-news-feeds",
    timeoutMs: 12000,
    accept:
      "application/rss+xml, application/atom+xml, application/xml, text/html",
  });
  return {
    url: result.url,
    body: (await readBodyCapped(result.response, 4 * 1024 * 1024)).toString(
      "utf8",
    ),
  };
}

export async function discoverFeed(raw: string, read = readDocument) {
  try {
    const address = publicFeedUrl(raw);
    if (!address) throw new Error();
    const doc = await read(address);
    const url = publicFeedUrl(doc.url);
    if (!url) throw new Error();
    try {
      const headline = parseFeed(doc.body, url).find(
        (entry) => entry.title && entry.url?.startsWith("https://"),
      )?.title;
      if (!headline) throw new Error();
      const xml = load(doc.body, { xml: true });
      const name =
        xml("channel > title, feed > title")
          .first()
          .text()
          .trim()
          .slice(0, 120) || new URL(url).hostname;
      return { kind: "feed" as const, name, url, headline };
    } catch (error) {
      if (!(error instanceof NotAFeedError)) throw error;
    }
    const html = load(doc.body);
    const base =
      publicFeedUrl(html("base[href]").first().attr("href") ?? url, url) ?? url;
    const choices = new Map<string, string>();
    for (const element of html("link[href]").toArray()) {
      const link = html(element);
      if (!link.attr("rel")?.toLowerCase().split(/\s+/).includes("alternate"))
        continue;
      if (
        !/^application\/(rss|atom)\+xml(?:\s*;|$)/i.test(
          link.attr("type") ?? "",
        )
      )
        continue;
      const href = publicFeedUrl(link.attr("href")!, base);
      if (href) choices.set(href, link.attr("title")?.trim() || href);
    }
    if (!choices.size) throw new Error();
    return {
      kind: "website" as const,
      choices: Array.from(choices, ([url, name]) => ({ url, name })),
    };
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Enter a public RSS or Atom feed URL with a recent article.",
    });
  }
}
