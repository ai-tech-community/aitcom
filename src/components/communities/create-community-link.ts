/**
 * Deep link that opens the "Create a community" dialog on the directory.
 * Server-safe constants (no "use client"), so server pages can link to it.
 */
export const CREATE_COMMUNITY_PARAM = "create";
export const CREATE_COMMUNITY_HREF = `/communities?${CREATE_COMMUNITY_PARAM}=1`;
