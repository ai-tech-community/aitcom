/** Shared by the news cron and the bot submit routes. */
export function newsBotAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`
  );
}
