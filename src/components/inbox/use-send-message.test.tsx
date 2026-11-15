import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";

import type { AppRouter } from "@/server/api/root";
import { api, type RouterOutputs } from "@/trpc/react";

vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "ada" } } }) },
}));

import { MESSAGES_PAGE_SIZE, useSendMessage } from "./use-send-message";

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
    () => ({ composer: useSendMessage("c1"), utils: api.useUtils() }),
    { wrapper },
  );
}

const key = { conversationId: "c1", limit: MESSAGES_PAGE_SIZE };

const earlier = {
  id: "m1",
  senderId: "bob",
  senderType: "human",
  content: "Hello Ada",
  createdAt: new Date("2026-11-15T09:00:00Z"),
} as Page["messages"][number];

describe("useSendMessage", () => {
  afterEach(() => {
    sent.length = 0;
    answer = () => Promise.resolve({ id: "m2" });
  });

  it("sends the trimmed text", async () => {
    const { result } = setup();

    await act(() => result.current.composer.send("  hi  "));

    expect(sent).toEqual([{ conversationId: "c1", content: "hi" }]);
  });

  it("sends nothing for whitespace", async () => {
    const { result } = setup();

    await act(() => result.current.composer.send("   "));

    expect(sent).toEqual([]);
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
      sending = result.current.composer.send("hi");
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
});
