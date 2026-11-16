import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// The real emoji button and its tooltip, unmocked: this file proves the
// composer gives the toolbar what it needs (a TooltipProvider) to render
// and open the panel.
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("./use-send-message", () => ({
  useSendMessage: () => ({ send: vi.fn(), isPending: false }),
}));
// The GIF button needs the tRPC provider; message-composer.test covers it.
vi.mock("@/components/composer/gif-picker-button", () => ({
  GifPickerButton: () => null,
}));

import { MessageComposer } from "./message-composer";

describe("MessageComposer with the real emoji button", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the emoji button and opens its panel", async () => {
    // The emoji data never arrives; the search box shows without it.
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
    render(
      <MessageComposer
        conversationId="c1"
        placeholder="Write…"
        kind="person"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "emoji" }));

    expect(
      await screen.findByRole("searchbox", { name: "emojiSearch" }),
    ).toBeInTheDocument();
  });
});
