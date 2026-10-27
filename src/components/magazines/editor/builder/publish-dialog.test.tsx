import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDateTimeToIso } from "@/lib/magazines/schedule";

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
    skippedCount: 0,
    audience: "members",
    onConfirm: vi.fn().mockResolvedValue(undefined),
    scheduledFor: null,
    onSchedule: vi.fn().mockResolvedValue(undefined),
    onUnschedule: vi.fn().mockResolvedValue(undefined),
    error: null,
    readingHref: "/magazines/gazette/summer",
    ...overrides,
  };
  renderWithIntl(<PublishDialog {...props} />);
  return props;
}

describe("PublishDialog", () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  function chooseLater(value = "2030-01-02T09:30") {
    fireEvent.click(
      screen.getByRole("radio", { name: "Later, at a time I choose" }),
    );
    fireEvent.change(screen.getByLabelText("Date and time"), {
      target: { value },
    });
  }

  it("shows a close button in the review phase", () => {
    const props = renderDialog();
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toBeVisible();
    fireEvent.click(close);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("schedules for the chosen time", async () => {
    const props = renderDialog();
    chooseLater();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Schedule it" }));
    });
    expect(props.onSchedule).toHaveBeenCalledWith(
      localDateTimeToIso("2030-01-02T09:30"),
    );
    expect(props.onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Your issue is scheduled" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "You can still change it until then.",
    );
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });

  it("refuses a past time before calling the server", async () => {
    const props = renderDialog();
    chooseLater("2029-12-01T09:30");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Schedule it" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Pick a time that is still to come.",
    );
    expect(props.onSchedule).not.toHaveBeenCalled();
  });

  it.each([
    ["", "Enter a date and a time."],
    ["2031-01-02T09:30", "Pick a time within the next year."],
  ])("refuses an invalid schedule (%s)", async (value, message) => {
    const props = renderDialog();
    chooseLater(value);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Schedule it" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(props.onSchedule).not.toHaveBeenCalled();
  });

  it("a scheduled issue starts on Later with its time and can cancel the schedule", async () => {
    const props = renderDialog({
      scheduledFor: localDateTimeToIso("2030-01-02T09:30"),
    });
    expect(
      screen.getByRole("radio", { name: "Later, at a time I choose" }),
    ).toBeChecked();
    expect(screen.getByLabelText("Date and time")).toHaveValue(
      "2030-01-02T09:30",
    );
    expect(screen.getByText(/^Scheduled for /)).toBeVisible();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Cancel the schedule" }),
      );
    });
    expect(props.onUnschedule).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "The schedule is cancelled" }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The issue is a draft again.",
    );
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });

  it("labels the choice and the time", () => {
    renderDialog();
    expect(
      screen.getByRole("group", { name: "When should it go out?" }),
    ).toBeVisible();
    expect(screen.getByRole("radio", { name: "Now" })).toBeChecked();
    chooseLater();
    expect(screen.getByLabelText("Date and time")).toHaveAttribute(
      "type",
      "datetime-local",
    );
  });

  it("the confirm button is the only orange one", () => {
    renderDialog({ scheduledFor: localDateTimeToIso("2030-01-02T09:30") });
    const orange = screen
      .getAllByRole("button")
      .filter(
        (button) =>
          button.dataset.slot === "button" &&
          (!button.dataset.variant || button.dataset.variant === "default"),
      );
    expect(orange).toEqual([
      screen.getByRole("button", { name: "Schedule it" }),
    ]);
    expect(
      screen.getByRole("button", { name: "Cancel the schedule" }),
    ).toHaveAttribute("data-variant", "ghost");
  });

  it("shows the time the editor typed, in their own zone", async () => {
    process.env.TZ = "America/Los_Angeles";
    renderDialog(); // The provider uses UTC, just like the server.
    chooseLater();
    expect(screen.getByText(/Your time zone:/)).toHaveTextContent(
      "America/Los_Angeles",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Schedule it" }));
    });
    const result = screen.getByRole("status");
    expect(result).toHaveTextContent("9:30 AM");
    expect(result).not.toHaveTextContent(/5:30 PM|17:30/);
  });

  it("ties the help and the error to the time field", async () => {
    renderDialog();
    chooseLater("2029-12-01T09:30");
    const input = screen.getByLabelText("Date and time");
    const help = screen.getByText(/Your time zone:/);
    expect(input).toHaveAttribute("aria-describedby", help.id);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Schedule it" }));
    });
    expect(input).toHaveAttribute(
      "aria-describedby",
      `${help.id} ${screen.getByRole("alert").id}`,
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("says how many items readers will skip", () => {
    const { unmount } = renderWithIntl(
      <PublishDialog
        open
        onOpenChange={vi.fn()}
        blockers={[]}
        skippedCount={2}
        audience="public"
        onConfirm={vi.fn()}
        scheduledFor={null}
        onSchedule={vi.fn()}
        onUnschedule={vi.fn()}
        error={null}
        readingHref="/magazines/gazette/summer"
      />,
    );
    expect(
      screen.getByText(
        "2 items are no longer available. Readers will not see them.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
    unmount();
    renderDialog({ skippedCount: 0 });
    expect(screen.queryByText(/no longer available/)).toBeNull();
  });

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

  it("publishes now as before", async () => {
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
