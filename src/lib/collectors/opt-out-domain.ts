/** Domain only: no URL, port, path, wildcard or IP. URL canonicalizes IDNs. */
export function canonicalOptOutDomain(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/\.$/, "");
  if (!value || /[\s/:@?#*%\\]/.test(value)) return null;
  try {
    const host = new URL(`https://${value}`).hostname;
    if (host.length > 253 || /^[\d.]+$/.test(host)) return null;
    const labels = host.split(".");
    return labels.length >= 2 &&
      labels.every((label) =>
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
      )
      ? host
      : null;
  } catch {
    return null;
  }
}
