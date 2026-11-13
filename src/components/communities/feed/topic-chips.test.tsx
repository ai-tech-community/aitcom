import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// topic-chips.tsx imports @/trpc/react (for the data-bound TopicChips wrapper),
// whose AppRouter graph would load the server-only db client under jsdom. The
// TopicChipsView tests below never touch tRPC, so stub the client to keep the
// import graph off the server (repo convention — see member-stack.test.tsx).
vi.mock("@/trpc/react", () => ({
  api: {
    topics: {
      list: { useQuery: vi.fn(() => ({ data: undefined })) },
    },
  },
}));

import { TopicChipsView } from "./topic-chips";

const topics = [
  { id: 1, label: "General", slug: "general", emoji: null },
  { id: 2, label: "Wins", slug: "wins", emoji: "⭐" },
];

describe("TopicChipsView", () => {
  it("renders an All chip plus one chip per topic, as one choice", () => {
    render(<TopicChipsView topics={topics} active="all" onSelect={vi.fn()} />);
    const group = screen.getByRole("radiogroup", { name: "selectTopic" });
    expect(
      within(group).getByRole("radio", { name: "allTopics" }),
    ).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: "General" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "⭐ Wins" }),
    ).toBeInTheDocument();
  });

  it("marks the active topic", () => {
    render(<TopicChipsView topics={topics} active="wins" onSelect={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "⭐ Wins" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "allTopics" })).not.toBeChecked();
  });

  it("calls onSelect with the slug when a chip is chosen", () => {
    const onSelect = vi.fn();
    render(<TopicChipsView topics={topics} active="all" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("radio", { name: "⭐ Wins" }));
    expect(onSelect).toHaveBeenCalledWith("wins");
  });
});
