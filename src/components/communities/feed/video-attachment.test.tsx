import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { VideoAttachment } from "./video-attachment";

const file = new File(["x"], "demo.mp4", { type: "video/mp4" });

function renderIt(
  props: Partial<React.ComponentProps<typeof VideoAttachment>> = {},
) {
  const onVisibilityChange = vi.fn();
  const onRemove = vi.fn();
  const onCancel = vi.fn();
  const onRetry = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VideoAttachment
        file={file}
        visibility="community"
        onVisibilityChange={onVisibilityChange}
        onRemove={onRemove}
        onCancel={onCancel}
        onRetry={onRetry}
        state={{ step: "idle" }}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onVisibilityChange, onRemove, onCancel, onRetry };
}

describe("VideoAttachment", () => {
  it("defaults to community only and switches to public", () => {
    const { onVisibilityChange } = renderIt();
    expect(screen.getByRole("radio", { name: "Community only" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    expect(onVisibilityChange).toHaveBeenCalledWith("public");
  });

  it("removes the clip while idle", () => {
    const { onRemove } = renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Remove video" }));
    expect(onRemove).toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("announces each step in a status region", () => {
    renderIt({ state: { step: "uploading", share: 0.2 } });
    expect(screen.getByRole("status")).toHaveTextContent("Uploading…");
  });

  it("shows progress while preparing, with a cancel", () => {
    const { onCancel } = renderIt({ state: { step: "preparing", share: 0.4 } });
    expect(screen.getByRole("status")).toHaveTextContent("Preparing video…");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("locks visibility and removal while the post is on its way", () => {
    renderIt({ state: { step: "uploading", share: 0.5 } });
    expect(
      screen.queryByRole("button", { name: "Remove video" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Community only" }),
    ).toBeDisabled();
  });

  it("offers no cancel once the post is being created", () => {
    renderIt({ state: { step: "posting" } });
    expect(screen.getByRole("status")).toHaveTextContent("Posting…");
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("offers to try again after a failed upload", () => {
    const { onRetry } = renderIt({
      state: {
        step: "error",
        message: en.communities.video.failed,
        retryable: true,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the error in plain words", () => {
    renderIt({
      state: {
        step: "error",
        message: en.communities.video.tooLong,
        retryable: false,
      },
    });
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Videos can be up to 90 seconds.",
    );
  });
});
