import type enMessages from "../../messages/en.json";
import { routing } from "./routing";

/** Every locale's catalogue has the English one's shape. */
export type AppMessages = typeof enMessages;

export type AppLocale = (typeof routing.locales)[number];

/** A supported locale from untrusted input; the default when unknown. */
export function resolveLocale(value: string | null | undefined): AppLocale {
  return (routing.locales as readonly string[]).includes(value ?? "")
    ? (value as AppLocale)
    : routing.defaultLocale;
}

/** The message catalogue for a locale — pages and route handlers alike. */
export async function loadMessages(locale: AppLocale): Promise<AppMessages> {
  return (await import(`../../messages/${locale}.json`)).default as AppMessages;
}
