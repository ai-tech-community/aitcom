// The `/magazines` home is rendered per request and passes the `?topic=`
// filter to the read model in the form it compares.
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { homeData } from "@/components/magazines/test-fixtures";

const state = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (opts: { namespace?: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: opts.namespace as never,
    }),
  getLocale: async () => "en",
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/magazines/reading", () => ({
  loadMagazinesHome: async (_deps: unknown, opts: unknown) => {
    state.calls.push(opts);
    return homeData();
  },
}));

import MagazinesHomePage, { dynamic, generateMetadata } from "./page";

const params = Promise.resolve({ locale: "nl" });

beforeEach(() => {
  state.calls = [];
});

describe("magazines home page", () => {
  it("is rendered per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("passes the normalised topic to the read model and the view", async () => {
    const page = await MagazinesHomePage({
      params,
      searchParams: Promise.resolve({ topic: "  Agents " }),
    });
    expect(state.calls).toEqual([{ locale: "nl", topic: "agents" }]);
    expect(page.props.activeTopic).toBe("agents");
  });

  it("lists every magazine without a topic", async () => {
    const page = await MagazinesHomePage({
      params,
      searchParams: Promise.resolve({ topic: "   " }),
    });
    expect(state.calls).toEqual([{ locale: "nl" }]);
    expect(page.props.activeTopic).toBeNull();
  });

  it("has one canonical URL for every topic view", async () => {
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("Magazines");
    expect(meta.alternates?.canonical).toEqual(
      expect.stringMatching(/\/en\/magazines$/),
    );
  });
});
