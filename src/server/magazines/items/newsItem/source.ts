/** The original web link and its hostname, shared by the card and picker. */
export function newsItemSource(address: string): {
  url: string | null;
  source: string | null;
} {
  if (address.startsWith("http://") || address.startsWith("https://")) {
    try {
      const url = new URL(address);
      return { url: address, source: url.hostname.replace(/^www\./, "") };
    } catch {
      // A malformed feed URL remains readable as a plain headline.
    }
  }
  return { url: null, source: null };
}
