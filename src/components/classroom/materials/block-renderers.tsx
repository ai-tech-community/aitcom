import type { BlockRenderers } from "@/lib/lexical";
import { isMaterialId } from "@/lib/classroom/lesson-body";
import { EmbedFrame } from "./embed-frame";
import { HostedFileCard } from "./hosted-file-card";

/** Lesson-body blocks only the classroom renders. Module-level: stable identity. */
export const classroomBlockRenderers: BlockRenderers = {
  Embed: (fields) =>
    typeof fields.url === "string" ? <EmbedFrame url={fields.url} /> : null,
  HostedFile: (fields) =>
    isMaterialId(fields.materialId) ? (
      <HostedFileCard materialId={fields.materialId} />
    ) : null,
};
