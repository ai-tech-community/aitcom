/**
 * Member dashboard destinations that more than one place links to (server
 * onboarding steps and dashboard UI). Locale-less: pass them to the i18n
 * `Link` / router, which adds the locale.
 */

/** The profile form on the Settings tab. */
export const PROFILE_SETTINGS_HREF = "/dashboard/settings#profile";

/**
 * Email preferences (Hub emails, weekly digest, community announcements) on
 * the Settings tab. Every email's "Manage notifications" link points here.
 */
export const NOTIFICATION_SETTINGS_HREF = "/dashboard/settings#notifications";

/** The anchor id of the email preferences section. */
export const NOTIFICATION_SETTINGS_ANCHOR = "notifications";

/** The intent ("what brings you here") questions. */
export const ONBOARDING_HREF = "/dashboard/onboarding";
