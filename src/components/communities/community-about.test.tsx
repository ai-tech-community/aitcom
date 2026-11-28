import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

const m = vi.hoisted(() => ({
  community: { description: "Practitioners shipping models." } as {
    description: string | null;
  },
  stack: {
    data: undefined as
      | {
          faces: { userId: string; displayName: string; image: null }[];
          total: number;
        }
      | undefined,
    isLoading: false,
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    communities: {
      getBySlug: { useQuery: () => ({ data: m.community }) },
      getMemberStack: { useQuery: () => m.stack },
    },
  },
}));

import { CommunityAbout } from "./community-about";

const faces = [
  { userId: "a", displayName: "Ada", image: null },
  { userId: "b", displayName: "Bo", image: null },
];

function renderAbout(showMemberCount = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommunityAbout slug="mlops" showMemberCount={showMemberCount} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  m.community = { description: "Practitioners shipping models." };
  m.stack = { data: { faces, total: 2 }, isLoading: false };
});

describe("CommunityAbout", () => {
  it("is a section titled About, with the description and the faces", () => {
    renderAbout();
    expect(screen.getByRole("region", { name: /About/ })).toBeInTheDocument();
    expect(
      screen.getByText("Practitioners shipping models."),
    ).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("has no members line: the faces say who is here", () => {
    renderAbout();
    expect(screen.queryByText(/members/)).toBeNull();
  });

  it("pairs the redesigned stack with a readable total and labelled public faces", () => {
    m.stack = { data: { faces, total: 12 }, isLoading: false };
    renderAbout(true);
    expect(screen.getByRole("group", { name: "12 members" })).toBeVisible();
    expect(screen.getByText("12 members")).toBeVisible();
    expect(screen.getByRole("img", { name: "Ada" })).toBeVisible();
    expect(screen.queryByText("+10")).not.toBeInTheDocument();
  });

  it("still shows the faces when there is no description", () => {
    m.community = { description: null };
    renderAbout();
    expect(screen.getByRole("region", { name: /About/ })).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("is left out when there is neither a description nor faces", () => {
    m.community = { description: "  " };
    m.stack = { data: { faces: [], total: 1 }, isLoading: false };
    const { container } = renderAbout();
    expect(container).toBeEmptyDOMElement();
  });

  it("does not flash an empty heading while the faces load", () => {
    m.community = { description: null };
    m.stack = { data: undefined, isLoading: true };
    const { container } = renderAbout();
    expect(container).toBeEmptyDOMElement();
  });

  describe("a long description", () => {
    const heights = { scroll: 0, client: 0 };
    let restore: () => void;

    beforeEach(() => {
      const proto = HTMLElement.prototype;
      const scroll = Object.getOwnPropertyDescriptor(proto, "scrollHeight");
      const client = Object.getOwnPropertyDescriptor(proto, "clientHeight");
      Object.defineProperty(proto, "scrollHeight", {
        configurable: true,
        get: () => heights.scroll,
      });
      Object.defineProperty(proto, "clientHeight", {
        configurable: true,
        get: () => heights.client,
      });
      restore = () => {
        if (scroll) Object.defineProperty(proto, "scrollHeight", scroll);
        if (client) Object.defineProperty(proto, "clientHeight", client);
      };
    });
    afterEach(() => restore());

    it("starts clamped and opens with Show more", () => {
      heights.scroll = 400;
      heights.client = 120;
      renderAbout();
      const text = document.querySelector("[data-community-description]");
      expect(text?.className).toMatch(/\bline-clamp-6\b/);
      const toggle = screen.getByRole("button", {
        name: en.communities.profile.showMore,
      });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveAttribute("aria-controls", text?.id);

      fireEvent.click(toggle);
      expect(text?.className).not.toMatch(/\bline-clamp-6\b/);
      expect(
        screen.getByRole("button", { name: en.communities.profile.showLess }),
      ).toHaveAttribute("aria-expanded", "true");
    });

    it("offers no toggle when the description fits", () => {
      heights.scroll = 80;
      heights.client = 80;
      renderAbout();
      expect(screen.queryByRole("button")).toBeNull();
    });
  });
});
