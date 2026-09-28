import type {
  MaterialKind,
  MaterialStatus,
  MaterialVisibility,
} from "./material-rules";

/**
 * Who may get a hosted file, and what a lesson shows for it (spec
 * 2026-09-27 §1, §3.3). Pure and shared: `fileLink` on the server and the
 * lesson manifest use the same rule, so a card never offers a download the
 * server would refuse.
 */

/** A viewer's course access, as resolved by `loadCourseAccess` (never "none" here). */
export type MaterialViewer = "visitor" | "member" | "manager";

export type MaterialAccess = "download" | "join" | "processing" | "failed";

export type ManifestMaterial = {
  id: number;
  kind: MaterialKind;
  title: string;
  extension: string;
  contentType: string;
  bytes: number;
  status: MaterialStatus;
  visibility: MaterialVisibility;
};

export type MaterialSummary =
  | { access: "removed" }
  | ({ access: MaterialAccess } & Omit<ManifestMaterial, "id">);

/** Keyed by material id. Carries no URLs: links are fetched on demand. */
export type MaterialsManifest = Record<number, MaterialSummary>;

/** Members and managers get every file; visitors of a public course only free-preview files. */
export function mayDownloadMaterial(
  viewer: MaterialViewer | "none",
  visibility: MaterialVisibility,
): boolean {
  return (
    viewer === "member" ||
    viewer === "manager" ||
    (viewer === "visitor" && visibility === "preview")
  );
}

/** What a lesson shows this viewer for one existing file. */
export function materialAccessFor(
  viewer: MaterialViewer,
  material: { status: MaterialStatus; visibility: MaterialVisibility },
): MaterialAccess {
  if (!mayDownloadMaterial(viewer, material.visibility)) return "join";
  if (material.status === "uploading") return "processing";
  if (material.status === "failed") return "failed";
  return "download";
}

/**
 * One summary per referenced id. An id without a matching material (deleted,
 * or not in this course) is "removed". Only display fields are copied —
 * never storage keys or upload ids.
 */
export function buildMaterialsManifest(
  ids: readonly number[],
  materials: readonly ManifestMaterial[],
  viewer: MaterialViewer,
): MaterialsManifest {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const manifest: MaterialsManifest = {};
  for (const id of ids) {
    const m = byId.get(id);
    manifest[id] = m
      ? {
          access: materialAccessFor(viewer, m),
          kind: m.kind,
          title: m.title,
          extension: m.extension,
          contentType: m.contentType,
          bytes: m.bytes,
          status: m.status,
          visibility: m.visibility,
        }
      : { access: "removed" };
  }
  return manifest;
}
