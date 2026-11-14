import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import fr from "../../../../messages/fr.json";
import {
  DirectoryMemberRow,
  type DirectoryMember,
} from "./directory-member-row";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function member(overrides: Partial<DirectoryMember> = {}): DirectoryMember {
  return {
    userId: "naomi-id",
    role: "admin",
    joinedAt: new Date("2026-11-01T12:00:00Z"),
    displayName: "Naomi Kimhi",
    bio: "Connects founders across the Netherlands.",
    image: null,
    canOpenProfile: true,
    profile: {
      company: "Acme",
      skills: ["Community building", "Events"],
      level: 3,
      tier: "beginner",
    },
    ...overrides,
  };
}

function show(row: DirectoryMember, locale: "en" | "nl" | "fr" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ en, nl, fr }[locale]}
      onError={(error) => {
        throw error;
      }}
      timeZone="Europe/Amsterdam"
    >
      <ul>
        <DirectoryMemberRow member={row} />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("DirectoryMemberRow", () => {
  it("links the member to their profile page", () => {
    show(member());
    expect(screen.getByRole("link", { name: /Naomi Kimhi/ })).toHaveAttribute(
      "href",
      "/members/naomi-id",
    );
  });

  it("previews company, level, skills and join date on hover", async () => {
    show(member());
    fireEvent.pointerEnter(screen.getByRole("link", { name: /Naomi Kimhi/ }));
    expect(await screen.findByText("@ Acme")).toBeInTheDocument();
    expect(screen.getByText("Level 3 · Beginner")).toBeInTheDocument();
    const skills = screen.getByRole("list", { name: "Skills" });
    expect(skills).toHaveTextContent("Community building");
    expect(skills).toHaveTextContent("Events");
    expect(
      screen.getByText("Admin · joined November 2026"),
    ).toBeInTheDocument();
  });

  it("does not link a profile the viewer may not open, and says it is private", async () => {
    show(member({ canOpenProfile: false, profile: null, role: "member" }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByText("Naomi Kimhi"));
    expect(await screen.findByText("Private profile")).toBeInTheDocument();
    expect(screen.getByText("Joined November 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Level/)).not.toBeInTheDocument();
  });

  it.each([
    ["nl", "Privéprofiel"],
    ["fr", "Profil privé"],
  ] as const)("renders the preview in %s", async (locale, text) => {
    show(member({ canOpenProfile: false, profile: null }), locale);
    fireEvent.pointerEnter(screen.getByText("Naomi Kimhi"));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
