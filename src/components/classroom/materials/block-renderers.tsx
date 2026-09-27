import type { BlockRenderers } from "@/lib/lexical";
import { EmbedFrame } from "./embed-frame";

/** Lesson-body blocks only the classroom renders. */
export const classroomBlockRenderers: BlockRenderers = {
  Embed: (fields) =>
    typeof fields.url === "string" ? <EmbedFrame url={fields.url} /> : null,
};
