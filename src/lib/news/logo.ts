/** First letter or digit of a company or source name, for a logo tile. */
export function newsLogoInitial(
  name: string | null | undefined,
): string | null {
  const match = name?.trim().match(/\p{L}|\p{N}/u);
  if (!match) return null;
  return match[0].toLocaleUpperCase();
}
