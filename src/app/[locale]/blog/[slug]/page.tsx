import { cache } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { LexicalRenderer } from "@/lib/lexical";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

const getArticleBySlug = cache(async (slug: string, locale: string) => {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
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
  return { title: article.title };
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

  const typeLabels: Record<string, string> = {
    article: t("article"),
    tutorial: t("tutorial"),
    talk_recording: t("talkRecording"),
  };

  const tags = Array.isArray(article.tags) ? (article.tags as string[]) : [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
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
      </div>

      {/* Title */}
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">{article.title}</h1>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="border-border mt-8 border-t pt-8">
        <LexicalRenderer content={article.content} />
      </div>
    </div>
  );
}
