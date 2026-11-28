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
vi.mock("@/components/message-member-button", () => ({
  MessageMemberButton: ({ recipientName }: { recipientName: string }) => (
    <button>Message {recipientName}</button>
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

function show(
  row: DirectoryMember,
  locale: "en" | "nl" | "fr" = "en",
  viewerId?: string | null,
  communityCreatedAt = new Date("2026-09-01T12:00:00Z"),
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ en, nl, fr }[locale]}
      onError={(error) => {
        throw error;
      }}
      timeZone="Europe/Amsterdam"
      now={new Date("2026-11-28T12:00:00Z")}
    >
      <ul>
        <DirectoryMemberRow
          member={row}
          viewerId={viewerId}
          communityCreatedAt={communityCreatedAt}
        />
      </ul>
    </NextIntlClientProvider>,
  );
}

describe("DirectoryMemberRow", () => {
  it("uses the member role as a subtitle when there is no headline", () => {
    const { container } = show(
      member({
        role: "member",
        bio: null,
        profile: null,
        userId: "hidden-id-fragment",
      }),
      "en",
      "another-member",
    );
    expect(screen.getByText("Member", { exact: true })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("hidden-id-fragment");
  });

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

  it("shows browseable skills and keeps the message action separate from the profile link", () => {
    const row = member();
    show(
      member({
        profile: {
          ...row.profile!,
          skills: ["Community building", "Events", "Meetups", "Facilitation"],
        },
      }),
      "en",
      "viewer",
    );
    expect(screen.getByRole("list", { name: "Skills" })).toHaveTextContent(
      "Community building",
    );
    expect(
      screen.getByRole("button", { name: "Message Naomi Kimhi" }).closest("a"),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Naomi Kimhi" })).toHaveAttribute(
      "href",
      "/members/naomi-id",
    );
    expect(screen.getByRole("list", { name: "Skills" }).children).toHaveLength(
      3,
    );
    expect(screen.queryByText("Facilitation")).not.toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText(/Joined Nov/)).not.toBeInTheDocument();
  });

  it("omits the new badge for long-time members", () => {
    show(
      member({ joinedAt: new Date("2026-10-28T12:00:00Z") }),
      "en",
      "viewer",
    );
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("omits the New badge in a community still in its first 30 days", () => {
    show(member(), "en", "viewer", new Date("2026-10-29T12:00:00Z"));
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("keeps a private profile's bio out of both the row and the preview", async () => {
    show(member({ canOpenProfile: false, profile: null }), "en", "viewer");
    expect(screen.getByText("Private profile")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Message Naomi Kimhi" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Messages off",
      }),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByText("Naomi Kimhi"));
    expect(
      await screen.findByText("Admin · joined November 2026"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Connects founders/)).toBeNull();
  });

  it.each([
    [null, "Messages off", "Sign in to message Naomi Kimhi."],
    ["naomi-id", "You", "You can’t message yourself."],
  ] as const)(
    "names why messaging is unavailable for viewer %s",
    (viewerId, label, reason) => {
      show(member(), "en", viewerId);
      expect(
        screen.queryByRole("button", { name: "Message Naomi Kimhi" }),
      ).toBeNull();
      const unavailable = screen.getByRole("button", { name: label });
      expect(unavailable).toHaveAccessibleDescription(reason);
      fireEvent.click(unavailable);
      expect(screen.getByRole("dialog", { name: "Message" })).toHaveTextContent(
        reason,
      );
    },
  );
});
