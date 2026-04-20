"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

export default function BrandProfilePage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const t = useTranslations("benchmark");
  const { slug } = use(params);
  const q = api.benchmark.getBrandProfile.useQuery({ slug });

  if (q.isLoading) return <main className="p-6">{t("brandProfile.loading")}</main>;
  if (q.error) return <main className="p-6">{t("brandProfile.notFound")}</main>;

  const { brand, mentions } = q.data!;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{brand.canonicalName}</h1>
        {brand.website && (
          <a
            className="text-sm text-blue-600 underline"
            href={brand.website}
            target="_blank"
            rel="noreferrer"
          >
            {brand.website}
          </a>
        )}
        {brand.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {brand.aliases.map((a) => (
              <Badge key={a} variant="secondary">
                {a}
              </Badge>
            ))}
          </div>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("brandProfile.recentMentions")}</h2>
        <ul className="flex flex-col gap-2">
          {mentions.map((m, i) => (
            <li
              key={i}
              className="flex flex-col gap-1 rounded-md border p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">
                  {m.modelProvider}/{m.modelId}
                </span>
                <Badge
                  variant={
                    m.sentiment === "positive"
                      ? "default"
                      : m.sentiment === "negative"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {t(`brandProfile.sentiment.${m.sentiment as "positive" | "negative" | "neutral"}`)}
                </Badge>
              </div>
              {m.context && (
                <p className="text-muted-foreground">
                  &ldquo;{m.context}&rdquo;
                </p>
              )}
              <span className="text-muted-foreground text-xs">
                {new Date(m.capturedAt as unknown as string).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
