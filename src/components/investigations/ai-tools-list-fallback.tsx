import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import {
  AI_TOOLS_LIST_SITE,
  aiToolsListCopy,
} from "@/lib/investigations/ai-tools-list";
import { STARTUPS_PATH } from "@/lib/investigations/startups";

const DIRECTORY_LABEL = {
  en: "Startup directory",
  nl: "Startupdirectory",
} as const;

/**
 * Shown when the AIAI.Tools profile row is missing. The URL still resolves,
 * with the same title and description as the profile route.
 */
export function AiToolsListFallback({ locale }: { locale: string }) {
  const copy = aiToolsListCopy(locale);
  const directory = locale === "nl" ? DIRECTORY_LABEL.nl : DIRECTORY_LABEL.en;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel as="div">{copy.heading}</SectionLabel>
      <h1 className="mt-8 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        {copy.heading}
      </h1>
      <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-relaxed">
        {copy.body}
      </p>
      <p className="mt-8 flex flex-col gap-3 text-sm">
        <a
          href={AI_TOOLS_LIST_SITE}
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          AIAI.Tools
        </a>
        <Link
          href={STARTUPS_PATH}
          className="hover:text-foreground underline-offset-4 hover:underline"
        >
          {directory}
        </Link>
      </p>
    </main>
  );
}
