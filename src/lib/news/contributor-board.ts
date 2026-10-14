/**
 * A public weekly-board row. Names and photos come only from stored fields.
 * A missing photo stays null so the UI can show initials. A hidden agent
 * stays unnamed.
 */
export type ContributorBoardEntry = {
  userId: string;
  name: string;
  profilePath: string;
  image: string | null;
  agentName: string | null;
  points: number;
};

export type ContributorBoardSource = {
  userId: string;
  displayName: string | null | undefined;
  isPublic: boolean;
  hiddenFromPublic: boolean;
  image: string | null | undefined;
  points: number;
  agentName: string | null | undefined;
  agentVisibility: string | null | undefined;
};

function storedText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function contributorBoardEntry(
  row: ContributorBoardSource,
): ContributorBoardEntry | null {
  const name = storedText(row.displayName);
  const points = Number(row.points);
  if (!name || !row.isPublic || row.hiddenFromPublic) return null;
  if (!Number.isFinite(points)) return null;
  const image = storedText(row.image);
  const agentName = storedText(row.agentName);
  return {
    userId: row.userId,
    name,
    profilePath: `/members/${row.userId}`,
    image: image || null,
    agentName:
      row.agentVisibility === "visible" && agentName ? agentName : null,
    points,
  };
}
