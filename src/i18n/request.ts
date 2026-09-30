import { getRequestConfig } from "next-intl/server";
import { loadMessages, resolveLocale } from "./messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = resolveLocale(await requestLocale);
  return { locale, messages: await loadMessages(locale) };
});
