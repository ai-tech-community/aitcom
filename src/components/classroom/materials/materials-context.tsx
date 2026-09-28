"use client";

import { createContext, useContext, type ReactNode } from "react";

import type {
  MaterialSummary,
  MaterialsManifest,
} from "@/lib/classroom/material-access";

const EMPTY: MaterialsManifest = {};
const REMOVED: MaterialSummary = { access: "removed" };

const ManifestContext = createContext<MaterialsManifest>(EMPTY);

/**
 * The course's materials manifest from `classrooms.get`, for the lesson
 * body's block renderers (which only receive a block's own fields).
 */
export function MaterialsManifestProvider({
  manifest,
  children,
}: {
  manifest: MaterialsManifest;
  children: ReactNode;
}) {
  return (
    <ManifestContext.Provider value={manifest}>
      {children}
    </ManifestContext.Provider>
  );
}

/** One file's summary; a file the manifest doesn't know is shown as removed. */
export function useMaterialSummary(materialId: number): MaterialSummary {
  return useContext(ManifestContext)[materialId] ?? REMOVED;
}
