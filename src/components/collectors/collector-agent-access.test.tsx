import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
const h = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }));
vi.mock("@/trpc/react", () => ({
  api: {
    collectors: {
      agentAccess: { useQuery: h.query },
      setAgentAccess: { useMutation: () => ({ mutate: h.mutate }) },
    },
    useUtils: () => ({ collectors: { agentAccess: { invalidate: vi.fn() } } }),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
import { CollectorAgentAccess } from "./collector-agent-access";
const view = () =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CollectorAgentAccess />
    </NextIntlClientProvider>,
  );
beforeEach(() => vi.clearAllMocks());
it.each([true, false])(
  "lets the owner explicitly toggle existing key permission (allowed=%s)",
  (allowed) => {
    h.query.mockReturnValue({ data: { hasKey: true, allowed } });
    view();
    fireEvent.click(
      screen.getByRole("button", {
        name: allowed ? "Turn off collection" : "Allow my agent to collect",
      }),
    );
    expect(h.mutate).toHaveBeenCalledWith({
      allowed: !allowed,
      acknowledged: true,
    });
    expect(
      screen.getByRole("link", { name: "Read the rules" }),
    ).toHaveAttribute("href", "/collectors/about");
  },
);
it("points an owner without a key at existing agent setup", () => {
  h.query.mockReturnValue({ data: { hasKey: false, allowed: false } });
  view();
  expect(
    screen.getByRole("link", { name: "Set up your agent and API key" }),
  ).toHaveAttribute("href", "/dashboard/agent");
  expect(screen.queryByRole("button")).toBeNull();
});
