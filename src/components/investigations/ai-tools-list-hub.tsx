import { JsonLd } from "@/components/json-ld";
import { SectionLabel } from "@/components/ui/section-label";
import {
  AI_TOOLS_LIST_TOOLS,
  aiToolsListCopy,
  aiToolsListJsonLd,
  aiToolsOnPage,
  type AiToolsListTool,
} from "@/lib/investigations/ai-tools-list";

/**
 * Directory page for AI tools. Copy and structured data come from the
 * directory module, never from a startup profile that shares the URL.
 */
export function AiToolsListHub({
  locale,
  tools = AI_TOOLS_LIST_TOOLS,
}: {
  locale: string;
  tools?: readonly AiToolsListTool[];
}) {
  const copy = aiToolsListCopy(locale);
  const visible = aiToolsOnPage(tools);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <JsonLd data={aiToolsListJsonLd(locale, visible)} />
      <SectionLabel as="div">{copy.kicker}</SectionLabel>
      <h1 className="mt-8 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        {copy.heading}
      </h1>
      <p className="text-muted-foreground mt-6 max-w-[65ch] text-lg leading-relaxed text-pretty">
        {copy.intro}
      </p>
      {visible.length > 0 ? (
        <ul className="border-border mt-10 max-w-2xl divide-y border-y">
          {visible.map((tool) => (
            <li key={tool.url} className="py-3">
              <a
                href={tool.url}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {tool.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
