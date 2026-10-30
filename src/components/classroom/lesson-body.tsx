import { LexicalRenderer, type BlockRenderers } from "@/lib/lexical";
import { lessonMarkdownSource } from "@/lib/classroom/lesson-markdown";
import { SafeMarkdown } from "@/components/markdown/safe-markdown";

/**
 * A lesson the agent wrote in markdown, or a lesson a person built in the
 * editor. Markdown is rendered as headings, lists, tables, code, and links.
 * Rich text, including file and embed blocks, stays on the lexical renderer.
 */
export function LessonBody({
  content,
  blockRenderers,
}: {
  content: unknown;
  blockRenderers?: BlockRenderers;
}) {
  const markdown = lessonMarkdownSource(content);
  if (markdown != null && markdown.trim() !== "") {
    return <SafeMarkdown>{markdown}</SafeMarkdown>;
  }
  if (markdown != null) return null;
  return <LexicalRenderer content={content} blockRenderers={blockRenderers} />;
}
