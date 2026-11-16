import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";

import type { PickedGif } from "@/components/composer/gif-picker-button";
import type { AppRouter } from "@/server/api/root";
import { api, type RouterOutputs } from "@/trpc/react";

vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "ada" } } }) },
}));

import { messagesQueryInput } from "./conversation-messages";
import { useSendMessage } from "./use-send-message";

type Page = RouterOutputs["inbox"]["getMessages"];

/** Every `inbox.sendMessage` the client sent, in order. */
const sent: unknown[] = [];
/** Settles the mutation in flight; set per test. */
let answer: (input: unknown) => Promise<unknown> = () =>
  Promise.resolve({ id: "m2" });

/**
 * Ends the tRPC chain in the test: records each mutation and answers it
 * with `answer`, instead of going over HTTP.
 */
const fakeServer: TRPCLink<AppRouter> =
  () =>
  ({ op }) =>
    observable((observer) => {
      if (op.path === "inbox.sendMessage") sent.push(op.input);
      answer(op.input).then(
        (data) => {
          observer.next({ result: { type: "data", data } });
          observer.complete();
        },
        (error: Error) => observer.error(TRPCClientError.from(error)),
      );
      return () => undefined;
    });

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const trpcClient = api.createClient({ links: [fakeServer] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
  return renderHook(
    ({ conversationId }: { conversationId: string }) => ({
      composer: useSendMessage(conversationId),
      utils: api.useUtils(),
    }),
    { wrapper, initialProps: { conversationId: "c1" } },
  );
}

const key = messagesQueryInput("c1");

const earlier = {
  id: "m1",
  senderId: "bob",
  senderType: "human",
  content: "Hello Ada",
  createdAt: new Date("2026-11-15T09:00:00Z"),
} as Page["messages"][number];

const partyGif: PickedGif = {
  giphyId: "abc123",
  title: "Party parrot",
  mp4Url: "https://media.giphy.com/media/abc123/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/abc123/giphy_s.gif",
  width: 400,
  height: 300,
  preview: {
    mp4Url: "https://media.giphy.com/media/abc123/200w.mp4",
    stillUrl: "https://media.giphy.com/media/abc123/200w_s.gif",
    width: 200,
    height: 150,
  },
};

describe("useSendMessage", () => {
  afterEach(() => {
    sent.length = 0;
    answer = () => Promise.resolve({ id: "m2" });
  });

  it("sends the trimmed text", async () => {
    const { result } = setup();

    await act(() => result.current.composer.send({ content: "  hi  " }));

    expect(sent).toEqual([{ conversationId: "c1", content: "hi" }]);
  });

  it("sends nothing for whitespace", async () => {
    const { result } = setup();

    await act(() => result.current.composer.send({ content: "   " }));

    expect(sent).toEqual([]);
  });

  it("sends the GIF id with the words", async () => {
    const { result } = setup();

    await act(() =>
      result.current.composer.send({ content: " look ", gif: partyGif }),
    );

    expect(sent).toEqual([
      { conversationId: "c1", content: "look", gif: { giphyId: "abc123" } },
    ]);
  });

  it("sends a GIF with no words", async () => {
    const { result } = setup();

    await act(() =>
      result.current.composer.send({ content: "  ", gif: partyGif }),
    );

    expect(sent).toEqual([
      { conversationId: "c1", content: "", gif: { giphyId: "abc123" } },
    ]);
  });

  it("sends nothing without words or GIF", async () => {
    const { result } = setup();

    await act(() => result.current.composer.send({ content: "", gif: null }));

    expect(sent).toEqual([]);
  });

  it("the optimistic row shows the picked GIF", async () => {
    answer = () => new Promise(() => undefined);
    const { result } = setup();
    act(() => {
      result.current.utils.inbox.getMessages.setData(key, {
        messages: [earlier],
      } as Page);
    });

    act(() => {
      void result.current.composer.send({ content: "", gif: partyGif });
    });

    await waitFor(() =>
      expect(
        result.current.utils.inbox.getMessages.getData(key)?.messages[1]
          ?.attachments,
      ).toEqual([
        {
          id: "optimistic-gif",
          kind: "gif",
          position: 0,
          title: "Party parrot",
          mp4Url: partyGif.mp4Url,
          stillUrl: partyGif.stillUrl,
          width: 400,
          height: 300,
        },
      ]),
    );
  });

  it("the optimistic row of words alone has no attachments", async () => {
    answer = () => new Promise(() => undefined);
    const { result } = setup();
    act(() => {
      result.current.utils.inbox.getMessages.setData(key, {
        messages: [earlier],
      } as Page);
    });

    act(() => {
      void result.current.composer.send({ content: "hi" });
    });

    await waitFor(() =>
      expect(
        result.current.utils.inbox.getMessages.getData(key)?.messages[1]
          ?.attachments,
      ).toEqual([]),
    );
  });

  it("shows the message at once and takes it back when the send fails", async () => {
    let fail!: (error: Error) => void;
    answer = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });
    const { result } = setup();
    const page = { messages: [earlier] } as Page;
    act(() => {
      result.current.utils.inbox.getMessages.setData(key, page);
    });

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.composer.send({ content: "hi" });
    });

    await waitFor(() =>
      expect(
        result.current.utils.inbox.getMessages
          .getData(key)
          ?.messages.map((m) => [m.senderId, m.content]),
      ).toEqual([
        ["bob", "Hello Ada"],
        ["ada", "hi"],
      ]),
    );

    await act(async () => {
      fail(new Error("offline"));
      await expect(sending).rejects.toThrow("offline");
    });

    expect(result.current.utils.inbox.getMessages.getData(key)).toEqual(page);
  });

  it("takes the message back from its own conversation after the view moved on", async () => {
    let fail!: (error: Error) => void;
    answer = () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      });
    const { result, rerender } = setup();
    const page = { messages: [earlier] } as Page;
    const otherKey = messagesQueryInput("c2");
    const otherPage = { messages: [] } as unknown as Page;
    act(() => {
      result.current.utils.inbox.getMessages.setData(key, page);
      result.current.utils.inbox.getMessages.setData(otherKey, otherPage);
    });

    let sending!: Promise<void>;
    act(() => {
      sending = result.current.composer.send({ content: "hi" });
    });
    await waitFor(() =>
      expect(
        result.current.utils.inbox.getMessages.getData(key)?.messages,
      ).toHaveLength(2),
    );

    // The member opens another conversation while the send is in flight.
    rerender({ conversationId: "c2" });
    await act(async () => {
      fail(new Error("offline"));
      await expect(sending).rejects.toThrow("offline");
    });

    expect(result.current.utils.inbox.getMessages.getData(key)).toEqual(page);
    expect(result.current.utils.inbox.getMessages.getData(otherKey)).toEqual(
      otherPage,
    );
  });
});
