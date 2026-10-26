import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-intl";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PublishDialog, type PublishDialogProps } from "./publish-dialog";

function renderDialog(overrides: Partial<PublishDialogProps> = {}) {
  const props: PublishDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    blockers: [],
    audience: "members",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    error: null,
    readingHref: "/magazines/gazette/summer",
    ...overrides,
  };
  renderWithIntl(<PublishDialog {...props} />);
  return props;
}

describe("PublishDialog", () => {
  it("lists blockers and disables Publish while any remain", () => {
    const props = renderDialog({ blockers: ["NO_TITLE", "INVALID_ITEM"] });

    expect(screen.getByText("Before you can publish")).toBeVisible();
    expect(screen.getByText("Give the issue a title.")).toBeVisible();
    expect(screen.getByText("Fix the parts marked in the list.")).toBeVisible();
    expect(
      screen.queryByText("Add at least one article or text section."),
    ).toBeNull();
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();
    fireEvent.click(publish);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("publishes when nothing blocks, then links to the reading page", async () => {
    const props = renderDialog();
    expect(screen.getByText("Everything is ready.")).toBeVisible();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Your issue is published")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Read the issue" }),
    ).toHaveAttribute("href", "/magazines/gazette/summer");
  });

  it("stays on the review step when the publish fails and shows why", async () => {
    const props = renderDialog({
      onConfirm: vi.fn().mockRejectedValue(new Error("ISSUE_EMPTY")),
      error: "Add at least one article or note before you publish.",
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    });
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Your issue is published")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add at least one article or note before you publish.",
    );
  });

  it("names the audience in plain words", () => {
    renderDialog({ audience: "members" });
    expect(
      screen.getByText(
        "Only members of your community will be able to read it.",
      ),
    ).toBeVisible();
  });

  it("names a public audience in plain words", () => {
    renderDialog({ audience: "public" });
    expect(
      screen.getByText(/Anyone will be able to read it, also people outside/),
    ).toBeVisible();
  });
});
