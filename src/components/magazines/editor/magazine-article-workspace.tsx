import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ArticleEditor,
  type ArticleDestination,
  type ArticleEditorProps,
} from "@/components/article-editor";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { Link } from "@/i18n/navigation";
import { communityMagazinePath } from "@/lib/magazines/paths";
import type { MagazineWriting } from "@/server/magazines/magazine-articles";

/**
 * The article editor inside the community frame, writing for the
 * community's magazine: which magazine the article is for, a way back to
 * the Magazine tab, then the same editor the blog uses.
 */
export function MagazineArticleWorkspace({
  communitySlug,
  writing,
  initialData,
}: {
  communitySlug: string;
  writing: MagazineWriting;
  initialData?: ArticleEditorProps["initialData"];
}) {
  const t = useTranslations("articleEditor.magazine");
  const destination: ArticleDestination = {
    kind: "magazine",
    magazineId: writing.magazineId,
    magazineName: writing.magazineName,
    communitySlug,
    handIn: writing.handIn,
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel as="p" bordered={false} className="min-w-0 break-words">
          {t("writingFor", { magazine: writing.magazineName })}
        </SectionLabel>
        <Button variant="ghost" size="sm" asChild>
          <Link href={communityMagazinePath(communitySlug)}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToMagazine")}
          </Link>
        </Button>
      </div>
      {/* The editor's sticky bar bleeds into this gutter (-mx-6 / sm:-mx-12). */}
      <div className="px-6 sm:px-12">
        <ArticleEditor
          initialData={initialData}
          // Unused here: a magazine destination never publishes directly
          // (its articles go live with their issue).
          isTrustedAuthor={false}
          destination={destination}
        />
      </div>
    </div>
  );
}
