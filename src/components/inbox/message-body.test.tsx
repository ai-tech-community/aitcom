import { describe, expect, it, vi } from "vitest";
import {
  render as renderWithTestingLibrary,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps, ReactElement } from "react";

import type { RouterOutputs } from "@/trpc/react";
import en from "../../../messages/en.json";

// The real player needs IntersectionObserver and translations; the body
// only decides where each GIF goes.
vi.mock("@/components/media/gif-player", () => ({
  GifPlayer: ({ gif, size }: { gif: { title: string }; size: string }) => (
    <div data-testid="gif" data-title={gif.title} data-size={size} />
  ),
}));
vi.mock("./ui-message", () => ({
  UiMessage: () => <div data-testid="ui-message" />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));

import { MessageBody } from "./message-body";

function render(ui: ReactElement) {
  return renderWithTestingLibrary(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

type Msg = RouterOutputs["inbox"]["getMessages"]["messages"][number];

const gif = {
  id: "a1",
  kind: "gif" as const,
  position: 0,
  title: "dancing cat",
  mp4Url: "https://media.giphy.com/cat.mp4",
  stillUrl: "https://media.giphy.com/cat.gif",
  width: 200,
  height: 150,
};

function message(overrides: Partial<Msg>): Msg {
  return {
    id: "m1",
    conversationId: "c1",
    senderId: "ada",
    senderType: "human",
    content: "",
    metadata: null,
    uiResource: null,
    uiProducerTrust: null,
    createdAt: new Date("2026-11-16T10:00:00Z"),
    attachments: [],
    ...overrides,
  } as Msg;
}

describe("MessageBody", () => {
  it("web URLs in own messages are clickable", () => {
    const url =
      "https://www.aitcommunity.org/en/invite/5ec5f410bc1b48829bca72a1ff582651";
    render(
      <MessageBody
        message={message({ content: url })}
        isUser
        conversationId="c1"
      />,
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe(url);
  });

  it("own links keep Hebrew text and punctuation and open safely in a new tab", () => {
    const { container } = render(
      <MessageBody
        message={message({
          content:
            "שלום (https://example.com/invite). עוד http://example.org/page! javascript:alert(1) <b>hello</b>",
        })}
        isUser
        conversationId="c1"
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://example.com/invite",
      "http://example.org/page",
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(link).toHaveAttribute(
        "rel",
        expect.stringContaining("noreferrer"),
      );
      expect(link).toHaveAttribute("dir", "ltr");
    }
    expect(container.textContent).toContain("שלום (");
    expect(container.textContent).toContain("). עוד ");
    expect(container.textContent).toContain(
      "! javascript:alert(1) <b>hello</b>",
    );
    expect(container.querySelector("b")).toBeNull();
  });

  it("a GIF-only message shows the GIF and no empty paragraph", () => {
    const { container } = render(
      <MessageBody
        message={message({ content: "", attachments: [gif] })}
        isUser
        conversationId="c1"
      />,
    );

    const shown = screen.getByTestId("gif");
    expect(shown.getAttribute("data-title")).toBe("dancing cat");
    expect(shown.getAttribute("data-size")).toBe("message");
    expect(container.querySelector("p")).toBeNull();
  });

  it("words and a GIF show both, words first", () => {
    const { container } = render(
      <MessageBody
        message={message({ content: "look at this", attachments: [gif] })}
        isUser
        conversationId="c1"
      />,
    );

    const words = screen.getByText("look at this");
    const shown = screen.getByTestId("gif");
    expect(
      words.compareDocumentPosition(shown) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.children).toHaveLength(2);
  });

  it("own words render as plain text", () => {
    const { container } = render(
      <MessageBody
        message={message({ content: "**x**" })}
        isUser
        conversationId="c1"
      />,
    );

    expect(screen.getByText("**x**").tagName).toBe("P");
    expect(container.querySelector("strong")).toBeNull();
  });

  it("a GIF-only message from someone else shows no text element", () => {
    const { container } = render(
      <MessageBody
        message={message({
          senderId: "bob",
          content: "",
          attachments: [gif],
        })}
        isUser={false}
        conversationId="c1"
      />,
    );

    expect(screen.getByTestId("gif")).toBeTruthy();
    expect(container.children).toHaveLength(1);
  });
});
