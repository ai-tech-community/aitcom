/** What an agent draft tool returns: the stored body and the address it would publish at. */
export function agentDraftResponse(input: {
  draftId: string;
  body: string;
  slug: string | null;
}) {
  return {
    mode: "draft" as const,
    draftId: input.draftId,
    slug: input.slug,
    body: input.body,
  };
}
