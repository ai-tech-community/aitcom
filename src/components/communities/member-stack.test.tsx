import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MemberStack (the connected sibling in this module) pulls in @/trpc/react,
// whose AppRouter graph would load the server-only db client under jsdom. The
// MemberStackView tests below never touch tRPC, so stub the client to keep the
// import graph off the server (repo convention — see agent-suggestions.test.tsx).
vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getMemberStack: { useQuery: vi.fn(() => ({ data: undefined })) },
    },
  },
}));

// Repo convention (see dashboard-tabs.test.tsx): stub next-intl so the
// component's useTranslations resolves without a NextIntlClientProvider.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { MemberStackView } from "./member-stack";

const faces = [
  { userId: "a", displayName: "Ada Lovelace", image: null },
  { userId: "b", displayName: "Bob", image: null },
];

describe("MemberStackView", () => {
  it("renders nothing below the threshold total", () => {
    const { container } = render(<MemberStackView faces={faces} total={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no showable faces", () => {
    const { container } = render(<MemberStackView faces={[]} total={50} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders faces with no overflow bubble at or below the max-faces total", () => {
    render(<MemberStackView faces={faces} total={2} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("renders the '+N' overflow once the total exceeds the max", () => {
    render(<MemberStackView faces={faces} total={396} />);
    // Initials fallbacks render for image-less faces.
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    // total(396) - shownFaces(2) = 394
    expect(screen.getByText("+394")).toBeInTheDocument();
  });
});
