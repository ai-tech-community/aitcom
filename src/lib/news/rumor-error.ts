/** Turn a rumor submit failure into a sentence the toast can show. */
export function newsRumorErrorText(
  message: string,
  fields: { url?: string; title?: string; body?: string },
  copy: {
    rate: string;
    url: string;
    title: string;
    body: string;
    invalid: string;
  },
): string {
  if (message === "rate") return copy.rate;
  if (fields.url === "url" || message === "url" || fields.url) return copy.url;
  if (fields.title) return copy.title;
  if (fields.body) return copy.body;
  return copy.invalid;
}
