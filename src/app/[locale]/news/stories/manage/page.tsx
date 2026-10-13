import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/server/better-auth/server";
import { isNewsStaff } from "@/server/news/staff";
import { StorylineEditor } from "@/components/news/storyline-editor";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function ManageStoriesPage() {
  const session = await getSession();
  if (!(await isNewsStaff(session?.user?.email))) notFound();
  const t = await getTranslations("newsStories");
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <Link
        href="/news/stories"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <h1 className="mt-8 text-3xl font-semibold">{t("editorTitle")}</h1>
      <p className="text-muted-foreground mt-3 max-w-prose">
        {t("editorHelp")}
      </p>
      <StorylineEditor />
    </main>
  );
}
