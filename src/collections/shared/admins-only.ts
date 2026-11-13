/**
 * Payload access for records only Payload admins may reach over Payload's own
 * REST and GraphQL APIs. `req.user` is set only for a signed-in Payload user
 * (the `users` collection, all admins or editors); members are Better Auth
 * users and never appear here, so they go through tRPC instead.
 */
export const adminsOnly = ({ req }: { req: { user?: unknown } }): boolean =>
  Boolean(req.user);
