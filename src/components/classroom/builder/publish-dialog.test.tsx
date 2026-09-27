import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";

vi.mock("@/components/classroom/celebrate", () => ({ fireConfetti: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { fireConfetti } from "@/components/classroom/celebrate";
import type { ChecklistInput } from "@/lib/classroom/publish-checklist";
import { PublishDialog, type PublishDialogProps } from "./publish-dialog";

const text = (s: string) => ({
  root: {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", text: s }] }],
  },
});

const intro = { id: 1, title: "Intro", module: null, body: text("hi") };
const base: ChecklistInput = {
  title: "Course",
  coverImageUrl: null,
  lessons: [intro, { id: 2, title: "Blank", module: null }],
  modules: [],
};

function renderDialog(overrides: Partial<PublishDialogProps> = {}) {
  const input = overrides.input ?? base;
  const props: PublishDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    input,
    onGoToLesson: vi.fn(),
    onGoToOutline: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    courseHref: "/communities/x/classroom/c",
    ...overrides,
  };
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PublishDialog {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("PublishDialog", () => {
  beforeEach(() => {
    vi.mocked(fireConfetti).mockReset();
  });

  it("blocks publishing while a lesson is empty and links to it", () => {
    const props = renderDialog();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Blank" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onGoToLesson).toHaveBeenCalledWith(2);
  });

  it("names an empty module and sends the author to the outline", () => {
    const props = renderDialog({
      input: {
        ...base,
        lessons: [{ ...intro, module: 10 }],
        modules: [
          { id: 10, title: "Basics" },
          { id: 11, title: "Later" },
        ],
      },
    });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onGoToOutline).toHaveBeenCalledTimes(1);
  });

  it("allows publishing with only the cover warning, then celebrates", async () => {
    const props = renderDialog({ input: { ...base, lessons: [intro] } });
    expect(screen.getByText(/cover/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Your course is live");
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(fireConfetti).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "View course" })).toHaveAttribute(
      "href",
      "/communities/x/classroom/c",
    );
  });

  it("stays open and does not celebrate when publishing fails", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("COURSE_ARCHIVED"));
    renderDialog({ input: { ...base, lessons: [intro] }, onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled(),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Your course is live")).toBeNull();
    expect(fireConfetti).not.toHaveBeenCalled();
  });

  it("does not publish twice while the first request is in flight", () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => undefined));
    renderDialog({ input: { ...base, lessons: [intro] }, onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(
      screen.getByRole("button", { name: en.classroomBuilder.publishing }),
    ).toBeDisabled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
