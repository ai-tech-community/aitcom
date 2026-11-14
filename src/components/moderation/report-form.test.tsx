import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../messages/en.json";

import { ReportForm, type ReportDraft } from "./report-form";

const REASONS = ["mine", "spam", "other"] as const;
type Reason = (typeof REASONS)[number];
const LABELS: Record<Reason, string> = {
  mine: "This is me",
  spam: "Spam",
  other: "Something else",
};

function Harness({
  initial = { reason: null, note: "" },
  onSubmit = vi.fn(),
  pending = false,
}: {
  initial?: ReportDraft<Reason>;
  onSubmit?: (report: { reason: Reason; note?: string }) => void;
  pending?: boolean;
}) {
  const [draft, setDraft] = useState<ReportDraft<Reason>>(initial);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <ReportForm
        name="report-7"
        reasons={REASONS}
        reasonLabel={(reason) => LABELS[reason]}
        draft={draft}
        onDraftChange={setDraft}
        noteMax={500}
        labels={{
          reasons: "What's wrong?",
          note: "Anything to add? (optional)",
          submit: "Send report",
        }}
        pending={pending}
        onSubmit={onSubmit}
      >
        <p role="alert">Extra line</p>
      </ReportForm>
    </NextIntlClientProvider>
  );
}

describe("ReportForm", () => {
  it("lists the reasons in the given order, as one labelled group", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: "What's wrong?" });
    expect(
      Array.from(group.querySelectorAll("input[type=radio]")).map(
        (radio) => (radio as HTMLInputElement).value,
      ),
    ).toEqual(["mine", "spam", "other"]);
    expect(screen.getByRole("radio", { name: "This is me" })).not.toBeChecked();
  });

  it("can't be sent before a reason is chosen", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    expect(send).toBeEnabled();
  });

  it("sends the reason and the trimmed note", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("radio", { name: "This is me" }));
    fireEvent.change(screen.getByLabelText("Anything to add? (optional)"), {
      target: { value: "  Left, in the blue coat  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reason: "mine",
      note: "Left, in the blue coat",
    });
  });

  it("leaves a blank note out", () => {
    const onSubmit = vi.fn();
    render(
      <Harness
        initial={{ reason: "other", note: "   " }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(onSubmit).toHaveBeenCalledWith({ reason: "other" });
  });

  it("caps the note and holds the send while one is on its way", () => {
    const onSubmit = vi.fn();
    render(
      <Harness
        initial={{ reason: "spam", note: "" }}
        onSubmit={onSubmit}
        pending
      />,
    );
    expect(
      screen.getByLabelText("Anything to add? (optional)"),
    ).toHaveAttribute("maxlength", "500");
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send).toBeDisabled();
    fireEvent.submit(send.closest("form")!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows what the caller puts between the note and the button", () => {
    render(<Harness />);
    expect(screen.getByRole("alert")).toHaveTextContent("Extra line");
  });
});
