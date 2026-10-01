import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
  topics: [] as {
    id: number;
    slug: string;
    label: string;
    emoji: string | null;
  }[],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/trpc/react", () => ({
  api: { topics: { list: { useQuery: () => ({ data: m.topics }) } } },
}));

import { TopicSelect } from "./topic-select";

describe("TopicSelect", () => {
  it("shows nothing while there is only one topic", () => {
    m.topics = [{ id: 1, slug: "general", label: "General", emoji: null }];
    render(
      <TopicSelect communitySlug="c" value="general" onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("keeps a post's old topic that the community no longer lists", () => {
    m.topics = [
      { id: 1, slug: "general", label: "General", emoji: null },
      { id: 2, slug: "jobs", label: "Jobs", emoji: "💼" },
    ];
    render(
      <TopicSelect communitySlug="c" value="old-topic" onChange={vi.fn()} />,
    );
    expect(screen.getByRole("combobox", { name: "selectTopic" })).toHaveValue(
      "old-topic",
    );
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "old-topic",
      "General",
      "💼 Jobs",
    ]);
  });
});
