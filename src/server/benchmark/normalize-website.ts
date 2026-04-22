export function normalizeWebsite(
  input: string | null | undefined,
): string | null {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim();
  if (raw.length === 0) return null;
  if (/\s/.test(raw)) return null;

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  } else {
    candidate = candidate.replace(/^http:\/\//i, "https://");
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return null;
  const lastLabel = host.split(".").pop() ?? "";
  if (lastLabel.length < 2) return null;

  let pathname = url.pathname;
  if (pathname === "/") pathname = "";
  else if (pathname.endsWith("/")) pathname = pathname.slice(0, -1);

  const search = url.search;
  return `${url.protocol}//${host}${pathname}${search}`;
}
