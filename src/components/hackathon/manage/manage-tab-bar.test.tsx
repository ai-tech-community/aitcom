import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import fr from "../../../../messages/fr.json";
import nl from "../../../../messages/nl.json";
import { HackathonTabBar } from "../hub/hackathon-tab-bar";
import { ManageTabBar } from "./manage-tab-bar";

vi.mock("@/i18n/navigation", () => ({
  Link: "a",
  usePathname: () => "/events/demo",
}));

vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => true,
}));

it.each([
  ["en", en, "Hackathon management sections", "Hackathon sections"],
  ["nl", nl, "Onderdelen voor hackathonbeheer", "Hackathononderdelen"],
  ["fr", fr, "Rubriques de gestion du hackathon", "Rubriques du hackathon"],
])(
  "gives the organizer and participant navigation landmarks distinct names in %s",
  (locale, messages, organizerName, participantName) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ManageTabBar
          communitySlug="demo-community"
          eventSlug="demo"
          labels={{
            setup: "Setup",
            tasks: "Tasks",
            analytics: "Analytics",
            lifecycle: "Lifecycle",
          }}
        />
        <HackathonTabBar
          slug="demo"
          tabs={[{ key: "overview", available: true, lockedReasonKey: null }]}
          labels={{
            overview: "Overview",
            timeline: "Timeline",
            projects: "Projects",
            participants: "Participants",
            team: "Team",
            workspace: "Workspace",
            agents: "Agents",
            winners: "Winners",
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("navigation", { name: organizerName }),
    ).toBeVisible();
    expect(
      screen.getByRole("navigation", { name: participantName }),
    ).toBeVisible();
  },
);
