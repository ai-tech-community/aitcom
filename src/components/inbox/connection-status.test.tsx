import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ConnectionStatus } from "./connection-status";
import { useInboxStream } from "./use-inbox-stream";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/chat/flags", () => ({ isChatEnabled: () => true }));
vi.mock("@/trpc/react", () => ({ api: { useUtils: () => ({}) } }));

class TestEventSource {
  static CLOSED = 2;
  static opened: TestEventSource[] = [];
  readyState = 0;
  onopen?: () => void;
  onerror?: () => void;
  close = vi.fn();

  constructor() {
    TestEventSource.opened.push(this);
  }
}

function StreamConsumer() {
  useInboxStream();
  return <ConnectionStatus />;
}

afterEach(() => {
  TestEventSource.opened = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("announces disconnects from the existing shared stream and confirms reconnect briefly", () => {
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", TestEventSource);
  const { unmount } = render(
    <>
      <StreamConsumer />
      <StreamConsumer />
    </>,
  );
  expect(TestEventSource.opened).toHaveLength(1);
  const stream = TestEventSource.opened[0]!;
  act(() => stream.onerror?.());
  for (const status of screen.getAllByRole("status")) {
    expect(status).toBeEmptyDOMElement();
  }
  act(() => {
    vi.advanceTimersByTime(3_000);
  });
  for (const status of screen.getAllByRole("status")) {
    expect(status).toHaveTextContent("reconnecting");
  }
  act(() => stream.onopen?.());
  for (const status of screen.getAllByRole("status")) {
    expect(status).toHaveTextContent("backOnline");
  }
  act(() => {
    vi.advanceTimersByTime(2_000);
  });
  for (const status of screen.getAllByRole("status")) {
    expect(status).toBeEmptyDOMElement();
  }
  act(() => {
    stream.readyState = TestEventSource.CLOSED;
    stream.onerror?.();
  });
  act(() => {
    vi.advanceTimersByTime(3_000);
  });
  for (const status of screen.getAllByRole("status")) {
    expect(status).toBeEmptyDOMElement();
  }
  unmount();
  expect(stream.close).toHaveBeenCalledTimes(1);
});

it("confirms a browser reconnection while the realtime stream is in polling fallback", () => {
  vi.useFakeTimers();
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  try {
    render(<ConnectionStatus />);
    expect(screen.getByRole("status")).toHaveTextContent("offline");
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("backOnline");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  } finally {
    online.mockRestore();
  }
});
