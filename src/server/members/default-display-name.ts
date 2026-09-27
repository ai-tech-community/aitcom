/**
 * The display name a new member profile starts with: the account name, else
 * the part of the email before "@". Shared by account creation
 * (better-auth `user.create.after`) and any path that creates a missing
 * profile row later, so both produce the same name.
 */
export function defaultDisplayName(user: {
  name?: string | null;
  email?: string | null;
}): string {
  // Empty strings fall through on purpose (an empty name is no name).
  if (user.name) return user.name;
  const emailLocalPart = user.email?.split("@")[0];
  if (emailLocalPart) return emailLocalPart;
  return "member";
}
