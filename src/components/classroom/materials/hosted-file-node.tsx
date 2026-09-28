"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, X } from "lucide-react";
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "@payloadcms/richtext-lexical/lexical";

import type { RichTextEditorExtension } from "@/components/article-editor/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { hostedFileBlockNode, isMaterialId } from "@/lib/classroom/lesson-body";
import {
  MATERIAL_ACCEPT,
  fileTypeLabel,
  formatBytes,
} from "@/lib/classroom/material-rules";
import { api } from "@/trpc/react";
import { FileTypeIcon } from "./file-type-icon";
import { useLessonEditorContext } from "./lesson-editor-context";
import { useFileUpload } from "./use-file-upload";

/**
 * The editor's form of a stored HostedFile block. Apart from `type` (which
 * the editor remaps to "block" on save) it is exactly `HostedFileBlockNode`
 * from `@/lib/classroom/lesson-body`. A node that never got a file carries
 * `materialId: 0` and is dropped before saving.
 */
export type SerializedHostedFileNode = SerializedLexicalNode & {
  type: "hosted-file";
  version: 2;
  format: "";
  fields: {
    id: string;
    blockName: "";
    blockType: "HostedFile";
    materialId: number;
  };
};

/** The course file list failed to load: a short note and a retry. */
function FilesLoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("classroom.files");
  return (
    <div className="flex flex-wrap items-center gap-2" role="alert">
      <p className="text-destructive text-xs">{t("listFailed")}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t("tryAgain")}
      </Button>
    </div>
  );
}

function HostedFileEditor({
  materialId,
  nodeKey,
  editor,
}: {
  materialId: number | null;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const t = useTranslations("classroom.files");
  const { courseId, canUpload } = useLessonEditorContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const files = api.classroomMaterials.listCourseMaterials.useQuery(
    { courseId: courseId ?? 0 },
    { enabled: courseId !== null },
  );
  const { state, upload, cancel } = useFileUpload(courseId);
  const retryFiles = () => void files.refetch();

  const choose = useCallback(
    (id: number) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof HostedFileNode) node.setMaterialId(id);
      });
    },
    [editor, nodeKey],
  );

  const remove = useCallback(() => {
    editor.update(() => $getNodeByKey(nodeKey)?.remove());
  }, [editor, nodeKey]);

  const removeButton = (
    <button
      type="button"
      onClick={remove}
      className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
      aria-label={t("remove")}
      title={t("remove")}
    >
      <X className="size-4" />
    </button>
  );

  if (materialId !== null) {
    const file = files.data?.find((f) => f.id === materialId);
    return (
      <div className="border-border my-4 flex items-center gap-3 rounded-lg border px-3 py-2">
        <FileTypeIcon
          extension={file?.extension ?? ""}
          className="text-muted-foreground size-5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          {files.isError && files.data === undefined ? (
            <FilesLoadFailed onRetry={retryFiles} />
          ) : files.data === undefined ? (
            <Skeleton className="h-4 w-40" />
          ) : (
            <p className="truncate text-sm font-medium">
              {file ? file.title : t("removed")}
            </p>
          )}
          {file ? (
            <p className="text-muted-foreground font-mono text-xs">
              {`${fileTypeLabel(file.extension)} · ${formatBytes(file.bytes)}`}
            </p>
          ) : null}
        </div>
        {file ? (
          <Badge variant="secondary">
            {file.visibility === "preview"
              ? t("visibilityPreview")
              : t("visibilityMembers")}
          </Badge>
        ) : null}
        {removeButton}
      </div>
    );
  }

  const reusable = (files.data ?? []).filter((f) => f.status === "ready");
  const percent =
    state.step === "uploading" ? Math.round(state.share * 100) : 0;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const done = await upload(picked);
    if (done) choose(done.id);
  }

  return (
    <div className="border-border my-4 space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs">{t("addFileHelp")}</p>
        {removeButton}
      </div>
      {state.step === "uploading" ? (
        <div className="space-y-2">
          {/* The shared Progress does not forward `value` to the progressbar
              role, so aria-valuenow is set here (as in video-attachment). */}
          <Progress
            value={percent}
            aria-label={t("uploadingProgress", { percent })}
            aria-valuenow={percent}
          />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-xs">
              {t("uploadingProgress", { percent })}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={cancel}>
              {t("cancelUpload")}
            </Button>
          </div>
        </div>
      ) : state.step === "finishing" ? (
        <p className="text-muted-foreground text-xs" role="status">
          {t("finishing")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {canUpload ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <Paperclip className="size-4" />
                {t("chooseFile")}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept={MATERIAL_ACCEPT}
                aria-label={t("chooseFile")}
                className="hidden"
                onChange={(e) => void onPick(e)}
              />
            </>
          ) : null}
          {reusable.length > 0 ? (
            <select
              aria-label={t("reuseLabel")}
              defaultValue=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (isMaterialId(id)) choose(id);
              }}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 min-w-0 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            >
              <option value="" disabled>
                {t("reusePlaceholder")}
              </option>
              {reusable.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}
      {files.isError && files.data === undefined ? (
        <FilesLoadFailed onRetry={retryFiles} />
      ) : null}
      {state.step === "error" ? (
        <p className="text-destructive text-xs" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function generateBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

export class HostedFileNode extends DecoratorNode<React.JSX.Element> {
  __materialId: number | null;
  __blockId: string;

  static getType(): string {
    return "hosted-file";
  }

  static clone(node: HostedFileNode): HostedFileNode {
    return new HostedFileNode(node.__materialId, node.__blockId, node.__key);
  }

  constructor(materialId: number | null, blockId?: string, key?: NodeKey) {
    super(key);
    this.__materialId = materialId;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedHostedFileNode): HostedFileNode {
    const id = json.fields?.materialId;
    return new HostedFileNode(isMaterialId(id) ? id : null, json.fields?.id);
  }

  exportJSON(): SerializedHostedFileNode {
    return {
      ...hostedFileBlockNode(this.__materialId ?? 0, this.__blockId),
      type: "hosted-file",
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  setMaterialId(materialId: number): void {
    this.getWritable().__materialId = materialId;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <HostedFileEditor
        materialId={this.__materialId}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

export function $createHostedFileNode(
  materialId: number | null = null,
): HostedFileNode {
  return new HostedFileNode(materialId);
}

export function $isHostedFileNode(
  node: LexicalNode | null | undefined,
): node is HostedFileNode {
  return node instanceof HostedFileNode;
}

/** Registered so lessons with files always load; not insertable. */
export const hostedFileExtension: RichTextEditorExtension = {
  node: HostedFileNode,
  nodeType: "hosted-file",
  blockType: "HostedFile",
  create: () => $createHostedFileNode(),
};

/** The same node, insertable from the slash menu and the toolbar. */
export const hostedFileInsertable: RichTextEditorExtension = {
  ...hostedFileExtension,
  command: {
    id: "hosted-file",
    label: "Add a file",
    group: "Basic",
    keywords: [
      "file",
      "upload",
      "pdf",
      "slides",
      "document",
      "spreadsheet",
      "download",
      "attachment",
    ],
  },
  toolbar: {
    title: "Add a file",
    icon: <Paperclip className="size-4" />,
  },
};
