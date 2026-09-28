import type { RichTextEditorExtension } from "@/components/article-editor/rich-text-editor";
import { embedExtension } from "./embed-node";
import { hostedFileExtension, hostedFileInsertable } from "./hosted-file-node";

/**
 * The lesson body editor's block nodes. Both lists register the same nodes, so a
 * lesson that already has files always loads and saves; they differ only in
 * whether "Add a file" is offered. Module-level: stable identity.
 */
export const classroomEditorExtensions: readonly RichTextEditorExtension[] = [
  embedExtension,
  hostedFileExtension,
];

/** For authors the community lets upload files. */
export const classroomEditorExtensionsWithUploads: readonly RichTextEditorExtension[] =
  [embedExtension, hostedFileInsertable];
