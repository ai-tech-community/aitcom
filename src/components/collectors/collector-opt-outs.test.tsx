import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
const h = vi.hoisted(() => ({ query: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock("@/trpc/react", () => ({
  api: {
    collectors: {
      optOuts: { useQuery: h.query },
      addOptOut: { useMutation: () => ({ mutate: h.add }) },
      removeOptOut: { useMutation: () => ({ mutate: h.remove }) },
    },
    useUtils: () => ({ collectors: { optOuts: { invalidate: vi.fn() } } }),
  },
}));
import { CollectorOptOuts } from "./collector-opt-outs";
const view = () =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CollectorOptOuts />
    </NextIntlClientProvider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  h.query.mockReturnValue({
    data: [{ domain: "example.org", reason: "Owner request" }],
    isPending: false,
    isError: false,
  });
});
it("offers staff domain management with canonicalized input and field errors", () => {
  view();
  fireEvent.change(screen.getByLabelText("Domain"), {
    target: { value: "https://invalid.org" },
  });
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "Owner request" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add opt-out" }));
  expect(
    screen.getByText(en.collectors.optOuts.invalidDomain),
  ).toBeInTheDocument();
  expect(h.add).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Domain"), {
    target: { value: " NEW.Example.ORG. " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add opt-out" }));
  expect(h.add).toHaveBeenCalledWith({
    domain: "new.example.org",
    reason: "Owner request",
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Remove opt-out for example.org" }),
  );
  expect(h.remove).toHaveBeenCalledWith({ domain: "example.org" });
});
it("shows a clear refusal to an ordinary member", () => {
  h.query.mockReturnValue({
    isError: true,
    error: { data: { code: "FORBIDDEN" } },
  });
  view();
  expect(screen.getByRole("alert")).toHaveTextContent(
    en.collectors.optOuts.staffOnly,
  );
  expect(screen.queryByRole("button")).toBeNull();
});
