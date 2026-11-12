import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";
import fr from "../../../../messages/fr.json";
import {
  emptyMatchingProfile,
  type ConnectionType,
} from "@/lib/communities/matching";

const m = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  memberships: {} as Record<string, unknown>,
  setup: {} as Record<string, unknown>,
  suggestions: {} as Record<string, unknown>,
  directory: {} as Record<string, unknown>,
  saveProfile: vi.fn(),
  saveType: vi.fn(),
  propose: vi.fn(),
  dismiss: vi.fn(),
  pending: false,
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: m.session }) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      communityMatching: Object.fromEntries(
        ["setup", "suggestions", "participants", "history"].map((key) => [
          key,
          { invalidate: vi.fn() },
        ]),
      ),
      advisory: { myPendingIntroductions: { invalidate: vi.fn() } },
    }),
    communities: {
      getMyCommunities: { useQuery: () => m.memberships },
      getMembers: { useInfiniteQuery: () => m.directory },
    },
    communityMatching: {
      setup: { useQuery: () => m.setup },
      suggestions: { useQuery: () => m.suggestions },
      saveProfile: {
        useMutation: () => ({ mutate: m.saveProfile, isPending: m.pending }),
      },
      saveType: {
        useMutation: () => ({ mutate: m.saveType, isPending: m.pending }),
      },
      archiveType: { useMutation: () => ({ mutate: vi.fn() }) },
      dismiss: { useMutation: () => ({ mutate: m.dismiss }) },
      restoreDismissed: { useMutation: () => ({ mutate: vi.fn() }) },
      propose: {
        useMutation: () => ({ mutate: m.propose, isPending: m.pending }),
      },
      participants: {
        useInfiniteQuery: () => ({ data: { pages: [{ items: [] }] } }),
      },
      history: {
        useInfiniteQuery: () => ({
          data: { pages: [{ items: [], members: [] }] },
        }),
      },
    },
  },
}));

import { CommunityMembersHub } from "./members-hub";
import { MatchingProfileForm } from "./profile-form";
import { ConnectionTypeEditor } from "./type-editor";
import { CommunityMatches } from "./matches";
import { ProposeIntroduction } from "./propose-introduction";
import { MatchingSettings } from "../settings/matching-settings";

const type: ConnectionType = {
  id: "type-a",
  active: true,
  name: "Hobbies",
  description: "",
  mode: "shared",
  promptA: "What do you enjoy?",
  promptB: "",
  topics: ["Cycling", "Hiking"],
};
const a = { userId: "a", displayName: "Naomi", image: null };
const b = { userId: "b", displayName: "Greg", image: null };
function show(children: ReactNode, locale: "en" | "nl" | "fr" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={{ en, nl, fr }[locale]}
      onError={(error) => {
        throw error;
      }}
      timeZone="Europe/Amsterdam"
    >
      {children}
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.pending = false;
  m.session = { user: { id: "me" } };
  m.memberships = {
    data: [{ slug: "alpha", status: "active", role: "owner" }],
  };
  m.setup = {
    data: { types: [type], profile: emptyMatchingProfile, canManage: true },
  };
  m.directory = {
    data: { pages: [{ items: [{ ...a, bio: "Founder", role: "member" }] }] },
  };
  m.suggestions = {
    data: {
      members: [a, b],
      scanned: 2,
      total: 2,
      dismissedCount: 0,
      matches: [
        {
          userIdA: "a",
          userIdB: "b",
          pairKey: "a|b",
          reasons: [{ typeId: "type-a", kind: "shared", topic: "Cycling" }],
          sameCity: "Amsterdam",
          languages: ["English"],
          score: 13,
        },
      ],
    },
  };
});

describe("member matching interface", () => {
  it("shows matching controls to owners", () => {
    show(<CommunityMembersHub slug="alpha" />);
    expect(screen.getByRole("tab", { name: "Matches" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Connection types" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Topics members can choose"),
    ).not.toBeInTheDocument();
  });
  it("edits connection types from matching settings", () => {
    show(<MatchingSettings slug="alpha" />);
    expect(
      screen.getByLabelText("Topics members can choose"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save connection type" }),
    ).toBeInTheDocument();
  });
  it("does not render the settings editor for a regular member", () => {
    m.setup = {
      data: { types: [type], profile: emptyMatchingProfile, canManage: false },
    };
    show(<MatchingSettings slug="alpha" />);
    expect(
      screen.getByText(en.communities.manage.accessDenied),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save connection type" }),
    ).not.toBeInTheDocument();
  });
  it("lets an owner retry loading matching settings", () => {
    const refetch = vi.fn();
    m.setup = { isError: true, refetch };
    show(<MatchingSettings slug="alpha" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(
      screen.queryByLabelText("Topics members can choose"),
    ).not.toBeInTheDocument();
  });
  it("links initial matching setup to this community's settings", () => {
    show(<CommunityMatches slug="alpha" types={[]} />);
    expect(
      screen.getByRole("link", { name: "Set up matching" }),
    ).toHaveAttribute("href", "/communities/alpha/settings/matching");
    expect(
      screen.queryByLabelText("Topics members can choose"),
    ).not.toBeInTheDocument();
  });
  it("links configured matching to settings", () => {
    show(<CommunityMatches slug="alpha" types={[type]} />);
    expect(
      screen.getByRole("link", { name: "Matching settings" }),
    ).toHaveAttribute("href", "/communities/alpha/settings/matching");
    expect(
      screen.queryByRole("link", { name: "Set up matching" }),
    ).not.toBeInTheDocument();
  });
  it("gives regular members a profile without owner controls", () => {
    m.setup = {
      data: { types: [type], profile: emptyMatchingProfile, canManage: false },
    };
    show(<CommunityMembersHub slug="alpha" />);
    expect(
      screen.getByRole("tab", { name: "My matching profile" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Matches" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Connection types" }),
    ).not.toBeInTheDocument();
  });
  it("keeps guests and inactive members in the directory, including stale signed-in cache", () => {
    m.session = null;
    show(<CommunityMembersHub slug="alpha" />);
    expect(screen.getByText("Naomi")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
  it("does not offer profiles to inactive memberships", () => {
    m.memberships = { data: [{ slug: "alpha", status: "banned" }] };
    show(<CommunityMembersHub slug="alpha" />);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
  it("saves explicit opt-in and community answers, and can opt back out", () => {
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[type]}
        profile={emptyMatchingProfile}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Cycling" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save matching profile" }),
    );
    expect(m.saveProfile).toHaveBeenLastCalledWith({
      slug: "alpha",
      profile: {
        ...emptyMatchingProfile,
        optedIn: true,
        answers: {
          "type-a": { interests: ["Cycling"], offering: [], seeking: [] },
        },
      },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save matching profile" }),
    );
    expect(m.saveProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ optedIn: false }),
      }),
    );
  });
  it("lets a member opt in without answering any questions", () => {
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[type]}
        profile={emptyMatchingProfile}
      />,
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    );
    expect(
      screen.getByText(en.communityMatching.optionalQuestions),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Save matching profile" }),
    );
    expect(m.saveProfile).toHaveBeenCalledWith({
      slug: "alpha",
      profile: { ...emptyMatchingProfile, optedIn: true },
    });
  });
  it("asks questions only after opt-in and retains answers when toggling participation", () => {
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[type]}
        profile={emptyMatchingProfile}
      />,
    );
    expect(
      screen.queryByRole("checkbox", { name: "Cycling" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(en.communityMatching.city),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Cycling" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    );
    expect(
      screen.queryByRole("checkbox", { name: "Cycling" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    );
    expect(screen.getByRole("checkbox", { name: "Cycling" })).toBeChecked();
  });
  it("allows opting out after hiding an invalid unsaved language draft", () => {
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[type]}
        profile={{
          ...emptyMatchingProfile,
          optedIn: true,
          languages: ["English"],
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText(en.communityMatching.languages), {
      target: {
        value: Array.from({ length: 11 }, (_, i) => `language-${i}`).join(", "),
      },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save matching profile" }),
    );
    expect(m.saveProfile).toHaveBeenCalledWith({
      slug: "alpha",
      profile: {
        ...emptyMatchingProfile,
        languages: ["English"],
        optedIn: false,
      },
    });
  });
  it("shows both owner-defined questions for complementary types", () => {
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[
          {
            ...type,
            mode: "complementary",
            promptA: "What can you teach?",
            promptB: "What do you want to learn?",
          },
        ]}
        profile={{ ...emptyMatchingProfile, optedIn: true }}
      />,
    );
    expect(
      screen.getByRole("group", { name: "What can you teach?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "What do you want to learn?" }),
    ).toBeInTheDocument();
  });
  it("saves a custom owner-defined connection type", () => {
    show(<ConnectionTypeEditor slug="alpha" types={[]} />);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Walking partners" },
    });
    fireEvent.change(screen.getByLabelText("Topics members can choose"), {
      target: { value: "Parks, Forests" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save connection type" }),
    );
    expect(m.saveType).toHaveBeenCalledWith({
      slug: "alpha",
      type: expect.objectContaining({
        name: "Walking partners",
        mode: "shared",
        topics: ["Parks", "Forests"],
      }),
    });
  });
  it("explains a match and requires review before proposing it", () => {
    show(<CommunityMatches slug="alpha" types={[type]} />);
    expect(
      screen.getByText("Both are interested in Cycling."),
    ).toBeInTheDocument();
    expect(m.propose).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Review introduction" }),
    );
    expect(m.propose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Why these two people?"), {
      target: { value: "You both enjoy cycling in Amsterdam." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Propose introduction" }),
    );
    expect(m.propose).toHaveBeenCalledWith({
      slug: "alpha",
      userIdA: "a",
      userIdB: "b",
      reason: "You both enjoy cycling in Amsterdam.",
      connectionTypeId: "type-a",
    });
  });
  it("does not allow an incomplete manual introduction", () => {
    show(<ProposeIntroduction slug="alpha" types={[type]} onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Propose introduction" }),
    ).toBeDisabled();
  });
  it("disables profile submission and opt-in while saving", () => {
    m.pending = true;
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[type]}
        profile={emptyMatchingProfile}
      />,
    );
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /I’m open to introductions/ }),
    ).toBeDisabled();
  });
  it("keeps matching message keys aligned in every locale", () => {
    const keys = (value: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(value)
        .flatMap(([key, child]) =>
          typeof child === "object" && child !== null
            ? keys(child as Record<string, unknown>, `${prefix}${key}.`)
            : [`${prefix}${key}`],
        )
        .sort();
    expect(keys(nl.communityMatching)).toEqual(keys(en.communityMatching));
    expect(keys(fr.communityMatching)).toEqual(keys(en.communityMatching));
  });
  it("renders Dutch profile labels", () => {
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[]}
        profile={{ ...emptyMatchingProfile, optedIn: true }}
      />,
      "nl",
    );
    expect(
      screen.getByRole("button", { name: "Matchprofiel opslaan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("De verbindingsvragen komen eraan"),
    ).toBeInTheDocument();
  });
  it("renders French profile labels", () => {
    show(
      <MatchingProfileForm
        slug="alpha"
        types={[]}
        profile={emptyMatchingProfile}
      />,
      "fr",
    );
    expect(
      screen.getByRole("button", { name: "Enregistrer le profil" }),
    ).toBeInTheDocument();
  });
});
