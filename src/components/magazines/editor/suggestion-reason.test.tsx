import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SuggestionReason } from "@/lib/magazines/suggestions";

import { renderWithIntl } from "../test-intl";
import { SuggestionReasonText } from "./suggestion-reason";

describe("SuggestionReasonText", () => {
  it.each<{ reason: SuggestionReason; text: string; mono: string[] }>([
    {
      reason: { type: "waitingSince", at: "2026-10-24T10:00:00.000Z" },
      text: "Approved and waiting since 24 Oct 2026",
      mono: ["24 Oct 2026"],
    },
    {
      reason: { type: "topic", topic: "agents" },
      text: "Matches your topic agents",
      mono: [],
    },
    {
      reason: { type: "eventComingUp", at: "2026-10-24T00:00:00.000Z" },
      text: "Coming up on 24 Oct 2026",
      mono: ["24 Oct 2026"],
    },
    {
      reason: { type: "eventRecap", at: "2026-10-24T00:00:00.000Z", going: 12 },
      text: "Took place on 24 Oct 2026, 12 going",
      mono: ["24 Oct 2026", "12"],
    },
    {
      reason: { type: "mostReplies", count: 42 },
      text: "Most talked about: 42 replies",
      mono: ["42"],
    },
    {
      reason: { type: "mostUpvotes", count: 120 },
      text: "Most upvoted: 120 upvotes",
      mono: ["120"],
    },
    {
      reason: { type: "newMembers", count: 7 },
      text: "7 new members joined",
      mono: ["7"],
    },
  ])(
    "renders $reason.type with only dates and counts in mono",
    ({ reason, text, mono }) => {
      const { container } = renderWithIntl(
        <p>
          <SuggestionReasonText reason={reason} />
        </p>,
      );
      expect(container.querySelector("p")).toHaveTextContent(text);
      expect(
        [...container.querySelectorAll(".font-mono")].map(
          (el) => el.textContent,
        ),
      ).toEqual(mono);
      for (const value of mono)
        expect(screen.getByText(value)).toHaveClass("font-mono");
      expect(container.querySelector("p")).not.toHaveClass("font-mono");
    },
  );
});
