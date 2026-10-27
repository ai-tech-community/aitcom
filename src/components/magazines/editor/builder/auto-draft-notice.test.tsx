import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-intl";
import { AutoDraftNotice } from "./auto-draft-notice";

describe("AutoDraftNotice", () => {
  it("explains the automatic schedule and lets the editor stop it", () => {
    const onStop = vi.fn();
    renderWithIntl(
      <AutoDraftNotice
        status="scheduled"
        scheduledVia="auto"
        scheduledFor="2026-10-29T12:00:00.000Z"
        onStop={onStop}
        stopping={false}
      />,
    );
    const notice = screen.getByRole("region", { name: "Made automatically" });
    expect(notice).toHaveTextContent(
      /The magazine made this draft\. It goes out by itself on .+ unless you stop it\. Any change you make stops that too\./,
    );
    expect(notice.querySelector(".font-mono")).not.toBeNull();
    const stop = screen.getByRole("button", {
      name: "Stop the automatic publish",
    });
    expect(stop).toHaveAttribute("data-variant", "outline");
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("disables Stop while it is stopping", () => {
    renderWithIntl(
      <AutoDraftNotice
        status="scheduled"
        scheduledVia="auto"
        scheduledFor="2026-10-29T12:00:00.000Z"
        onStop={vi.fn()}
        stopping
      />,
    );
    expect(
      screen.getByRole("button", { name: "Stop the automatic publish" }),
    ).toBeDisabled();
  });

  it.each([
    { status: "draft" as const, scheduledVia: null },
    { status: "scheduled" as const, scheduledVia: "schedule" as const },
  ])(
    "explains the draft without offering to stop an editor's schedule ($status)",
    (schedule) => {
      renderWithIntl(
        <AutoDraftNotice
          {...schedule}
          scheduledFor="2026-10-29T12:00:00.000Z"
          onStop={vi.fn()}
          stopping={false}
        />,
      );
      expect(
        screen.getByRole("region", { name: "Made automatically" }),
      ).toHaveTextContent(
        "The magazine made this draft from what happened in your community. Check it, change what you like, and publish it when you are happy.",
      );
      expect(screen.queryByRole("button")).toBeNull();
    },
  );
});
