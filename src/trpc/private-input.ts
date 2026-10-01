/**
 * Query inputs that must not travel in a URL. tRPC sends queries as GET,
 * so their input lands in the query string — and with it in request logs
 * and proxies. A query carrying one of these keys is sent as POST instead,
 * with the input in the body.
 */
export const PRIVATE_INPUT_KEYS = ["near"] as const;

export function carriesPrivateInput(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  return PRIVATE_INPUT_KEYS.some((key) => record[key] !== undefined);
}
