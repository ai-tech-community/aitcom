import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-intl";
import type { IssueDetailsDraft } from "./use-issue-save";
import { IssueDetails } from "./issue-details";
import { publicOptInRequired } from "../public-opt-in";

vi.mock("@/components/article-editor/rich-text-editor", () => ({
  RichTextEditor: () => null,
}));

function DetailsEditor() {
  const [details, setDetails] = useState<IssueDetailsDraft>({
    title: "Summer",
    slug: "summer",
    coverImageUrl: null,
    editorNote: null,
    visibility: "members",
  });
  const [confirmed, setConfirmed] = useState(false);
  return (
    <IssueDetails
      details={details}
      onChange={(patch) => setDetails((current) => ({ ...current, ...patch }))}
      initialEditorNote={null}
      published={false}
      titleValid
      slugValid
      communityIsPrivate
      optInRequired={publicOptInRequired({
        next: details.visibility,
        saved: {
          visibility: "members",
          publicConfirmedAt: null,
          publicConfirmedBy: null,
        },
        community: { slug: "night-owls", isListedInDirectory: false },
      })}
      confirmed={confirmed}
      onConfirmedChange={setConfirmed}
    />
  );
}

describe("IssueDetails", () => {
  it("offers preview with a hint and asks an unlisted community to confirm it", () => {
    renderWithIntl(<DetailsEditor />);
    expect(screen.getByText("Only members can read it.")).toBeVisible();
    fireEvent.click(
      screen.getByRole("radio", { name: "Preview for everyone" }),
    );
    expect(
      screen.getByText(
        "Everyone sees the cover, the contents and the start of each article. Members read everything.",
      ),
    ).toHaveClass("text-muted-foreground", "text-sm");
    expect(
      screen.getByRole("checkbox", { name: /I understand/ }),
    ).not.toBeChecked();
    expect(screen.getByText("Tick the box to save this choice.")).toBeVisible();
  });

  it("moving from public to preview keeps the tick; moving to members clears it; moving from preview to everyone asks again", () => {
    renderWithIntl(<DetailsEditor />);
    const choose = (name: string) =>
      fireEvent.click(screen.getByRole("radio", { name }));
    const tick = () => screen.getByRole("checkbox", { name: /I understand/ });
    choose("Everyone");
    expect(screen.getByText("Everyone can read all of it.")).toBeVisible();
    fireEvent.click(tick());
    choose("Preview for everyone");
    expect(tick()).toBeChecked();
    choose("Members only");
    choose("Preview for everyone");
    expect(tick()).not.toBeChecked();
    fireEvent.click(tick());
    choose("Everyone");
    expect(tick()).not.toBeChecked();
    expect(screen.getByText("Tick the box to save this choice.")).toBeVisible();
  });
});
