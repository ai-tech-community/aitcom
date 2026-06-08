import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
  it("renders an All chip plus one chip per topic", () => {
    render(<TopicChipsView topics={topics} active="all" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /general/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /wins/i })).toBeInTheDocument();
  });

  it("calls onSelect with the slug when a chip is clicked", () => {
    const onSelect = vi.fn();
    render(<TopicChipsView topics={topics} active="all" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /wins/i }));
    expect(onSelect).toHaveBeenCalledWith("wins");
  });
});
