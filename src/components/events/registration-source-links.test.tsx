import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
const m = vi.hoisted(() => ({
  query: {
    isLoading: false,
    isError: false,
    data: [] as { source: string; url: string }[],
    refetch: vi.fn(),
  },
  copy: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/trpc/react", () => ({
  api: { events: { registrationSourceLinks: { useQuery: () => m.query } } },
}));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
import { RegistrationSourceLinks } from "./registration-source-links";
function show(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <RegistrationSourceLinks eventId={7} />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.query.isLoading = false;
  m.query.isError = false;
  m.query.data = [
    { source: "luma", url: "https://app.test/api/events/ref/opaque" },
  ];
  m.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: m.copy },
    configurable: true,
  });
});
it("copies an event-specific link and explains it does not publish an event", async () => {
  show();
  expect(screen.getByText(/These links do not publish events/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Copy Luma link" }));
  await waitFor(() =>
    expect(m.success).toHaveBeenCalledWith("Registration link copied"),
  );
  expect(m.copy).toHaveBeenCalledWith("https://app.test/api/events/ref/opaque");
});
it("reports clipboard failures without claiming success", async () => {
  m.copy.mockRejectedValue(new Error("denied"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Copy Luma link" }));
  await waitFor(() => expect(m.error).toHaveBeenCalled());
  expect(m.success).not.toHaveBeenCalled();
});
it("shows loading, retries errors, and hides links when an event is ineligible", () => {
  m.query.isLoading = true;
  const view = show();
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  view.unmount();
  m.query.isLoading = false;
  m.query.isError = true;
  const error = show();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(m.query.refetch).toHaveBeenCalled();
  error.unmount();
  m.query.isError = false;
  m.query.data = [];
  expect(show().container).toBeEmptyDOMElement();
});
it("localizes the sharing controls in Dutch", () => {
  show("nl");
  expect(
    screen.getByRole("button", { name: "Luma-link kopiëren" }),
  ).toBeVisible();
});
