/**
 * Localized country/region names from ISO 3166 codes ("NL" → "Netherlands" /
 * "Nederland"). Falls back to the code itself when the runtime lacks
 * `Intl.DisplayNames` or does not know the code.
 */
export function createRegionNamer(locale: string): (code: string) => string {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  return (code) => {
    try {
      return names?.of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };
}
