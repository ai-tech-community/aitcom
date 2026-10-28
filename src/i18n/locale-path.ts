import { routing } from "./routing";

/** Match a whole locale segment, never a path such as `/france`. */
export function localeFromPathname(pathname: string) {
  const segment = pathname.split("/")[1];
  return routing.locales.find((locale) => locale === segment);
}

export function stripLocalePrefix(pathname: string): string {
  const locale = localeFromPathname(pathname);
  return locale ? pathname.slice(locale.length + 1) || "/" : pathname;
}
