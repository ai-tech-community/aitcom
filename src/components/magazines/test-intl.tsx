import { render } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import en from "../../../messages/en.json";
import type { TranslateMessage } from "./items/types";

/** Renders magazine UI with the English messages, as the app does. */
export function renderWithIntl(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    ),
  });
}

/**
 * The app's root-level translator in English, as item titles get it. The
 * app's root `useTranslations()` takes any key; this one is typed by the
 * catalogue, so it is widened here.
 */
export const translateEn = createTranslator({
  locale: "en",
  messages: en,
}) as unknown as TranslateMessage;
