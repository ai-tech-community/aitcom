import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer, extractHeadings } from "@/lib/lexical";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

const getArticleBySlug = cache(async (slug: string, locale: string) => {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { slug: { equals: slug } },
        { status: { equals: "published" } },
      ],
    },
    locale: locale as "en" | "nl",
    limit: 1,
    draft: false,
  });
  return docs[0] ?? null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const article = await getArticleBySlug(slug, locale);
  if (!article) return {};

  const tags = Array.isArray(article.tags)
    ? (article.tags as { tag: string }[]).map((t) => t.tag)
    : [];
  const description = tags.length > 0
    ? `${article.type.charAt(0).toUpperCase() + article.type.slice(1)} - ${tags.join(", ")}`
    : `${article.type.charAt(0).toUpperCase() + article.type.slice(1)} from AIT Community`;

  return {
    title: article.title,
    description,
    ...buildOgMeta(article.title, description, tags.join(" · ") || "Blog"),
    alternates: buildAlternates(`/blog/${slug}`),
  };
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("blog");

  const article = await getArticleBySlug(slug, locale);
  if (!article) return notFound();
  if (article.authorType === "member" && article.reviewStatus !== "approved") return notFound();

  const typeLabels: Record<string, string> = {
    article: t("article"),
    tutorial: t("tutorial"),
    talk_recording: t("talkRecording"),
  };

  const tags = Array.isArray(article.tags)
    ? (article.tags as { id?: string; tag: string }[]).map((t) => t.tag)
    : [];

  const headings = extractHeadings(article.content);
  const showToc = headings.length >= 2;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <JsonLd
        data={{
          "@type": "Article",
          headline: article.title,
          ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
          ...(article.mediaUrl ? { image: article.mediaUrl } : {}),
          author: article.authorType === "member" && article.authorName
            ? { "@type": "Person" as const, name: article.authorName }
            : { "@type": "Organization" as const, name: "AIT Community", url: "https://aitcommunity.org" },
          publisher: {
            "@type": "Organization",
            name: "AIT Community",
            logo: {
              "@type": "ImageObject",
              url: "https://aitcommunity.org/logo.png",
            },
          },
        }}
      />

      {/* Back link */}
      <Link
        href="/blog"
        className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider transition-colors"
      >
        {t("backToBlog")}
      </Link>

      {/* Meta line */}
      <div className="text-muted-foreground mt-6 flex flex-wrap items-center gap-3 font-mono text-xs tracking-wider">
        {article.publishedAt && (
          <>
            <span>{formatDate(article.publishedAt)}</span>
            <span className="text-border">|</span>
          </>
        )}
        <span className="border-border rounded border px-2.5 py-0.5 font-medium">
          {typeLabels[article.type] ?? article.type}
        </span>
        {article.authorType === "member" && article.authorName && (
          <>
            <span className="text-border">|</span>
            <span>by {article.authorName}</span>
          </>
        )}
      </div>

      {/* Title */}
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">{article.title}</h1>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Link
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className="border-border text-muted-foreground hover:text-foreground cursor-pointer rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider transition-colors"
            >
              {tag}
            </Link>
          ))}
        </div>
      )}

      {/* Featured Image */}
      {article.mediaUrl && (
        <div className="mt-6 overflow-hidden rounded">
          <Image
            src={article.mediaUrl}
            alt={article.title}
            width={800}
            height={450}
            className="w-full object-cover"
            priority
          />
        </div>
      )}

      {/* Content area */}
      <div className={`border-border mt-8 border-t pt-8 ${showToc ? "flex gap-8" : ""}`}>
        {/* Article content */}
        <div className={showToc ? "min-w-0 flex-1" : ""}>
          <LexicalRenderer content={article.content} />
        </div>

        {/* Table of Contents sidebar */}
        {showToc && (
          <aside className="hidden w-64 shrink-0 lg:block">
            <nav className="sticky top-24">
              <h2 className="text-muted-foreground mb-3 font-mono text-xs font-medium tracking-wider">
                / {t("tableOfContents")}
              </h2>
              <ul className="space-y-1.5">
                {headings.map((heading) => (
                  <li key={heading.slug}>
                    <a
                      href={`#${heading.slug}`}
                      className={`text-muted-foreground hover:text-foreground block font-mono text-sm transition-colors ${
                        heading.level === 3 ? "pl-3" : ""
                      }`}
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
