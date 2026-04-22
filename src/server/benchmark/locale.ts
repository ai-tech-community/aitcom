export function parseCountry(locale: string | null | undefined): string | null {
  if (!locale || typeof locale !== "string") return null;
  const parts = locale.split(/[-_]/);
  if (parts.length < 2) return null;
  const candidate = parts[1];
  if (candidate?.length !== 2) return null;
  return candidate.toUpperCase();
}
