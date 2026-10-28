import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import en from "../../../messages/en.json";

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
