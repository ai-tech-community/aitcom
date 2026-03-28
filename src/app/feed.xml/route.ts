import { getPayloadClient } from "@/server/payload";
import { extractPlainText } from "@/lib/lexical";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "...";
}

type LexicalRoot = {
  root?: { children?: unknown[] };
};

export async function GET() {
  const payload = await getPayloadClient();
  const { docs: articles } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { status: { equals: "published" } },
        {
          or: [
            { authorType: { not_equals: "member" } },
            { reviewStatus: { equals: "approved" } },
          ],
        },
      ],
    },
    sort: "-publishedAt",
    locale: "en",
    draft: false,
    limit: 20,
  });

  const siteUrl = "https://aitcommunity.org";

  const items = articles
    .map((article) => {
      const content = article.content as LexicalRoot | string | null;
      let plainText = "";
      if (typeof content === "string") {
        try {
          const parsed = JSON.parse(content) as LexicalRoot;
          plainText = extractPlainText((parsed.root?.children ?? []) as Parameters<typeof extractPlainText>[0]);
        } catch { /* empty */ }
      } else if (content?.root?.children) {
        plainText = extractPlainText(content.root.children as Parameters<typeof extractPlainText>[0]);
      }

      const description = truncateWords(plainText, 200);
      const author = article.authorName ?? "AIT Community";
      const link = `${siteUrl}/en/blog/${article.slug}`;

      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${escapeXml(link)}</link>
      <description>${escapeXml(description)}</description>
      <dc:creator>${escapeXml(author)}</dc:creator>
      <category>${escapeXml(article.type)}</category>
      ${article.publishedAt ? `<pubDate>${toRfc822(article.publishedAt)}</pubDate>` : ""}
      <guid isPermaLink="true">${escapeXml(link)}</guid>
    </item>`;
    })
    .join("\n");

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>AIT Community Blog</title>
    <link>${siteUrl}/en/blog</link>
    <description>Articles, tutorials, and talk recordings from the AI Tech Community.</description>
    <language>en</language>
${items}
  </channel>
</rss>`;

  return new Response(feed, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
