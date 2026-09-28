import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import { CourseTitleEditor } from "./course-title-editor";

function renderEditor(onRename?: (title: string) => void) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CourseTitleEditor title="Intro to agents" onRename={onRename} />
    </NextIntlClientProvider>,
  );
}

const startEditing = () =>
  fireEvent.click(screen.getByRole("button", { name: /Rename course/ }));
const input = () =>
  screen.getByRole("textbox", { name: en.classroomBuilder.courseTitleInput });

describe("CourseTitleEditor", () => {
  it("shows the title as the page heading", () => {
    renderEditor(vi.fn());
    expect(
      screen.getByRole("heading", { level: 1, name: /Intro to agents/ }),
    ).toBeInTheDocument();
  });

  it("edits in place: Enter saves the trimmed title and gives focus back", () => {
    const onRename = vi.fn();
    renderEditor(onRename);
    startEditing();
    expect(input()).toHaveValue("Intro to agents");
    expect(input()).toHaveFocus();
    fireEvent.change(input(), { target: { value: "  Agents from scratch " } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("Agents from scratch");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: /Rename course/ })).toHaveFocus();
  });

  it("saves when the input loses focus", () => {
    const onRename = vi.fn();
    renderEditor(onRename);
    startEditing();
    fireEvent.change(input(), { target: { value: "Agents from scratch" } });
    fireEvent.blur(input());
    expect(onRename).toHaveBeenCalledWith("Agents from scratch");
  });

  it("does not save an unchanged title", () => {
    const onRename = vi.fn();
    renderEditor(onRename);
    startEditing();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Escape cancels and keeps the old title", () => {
    const onRename = vi.fn();
    renderEditor(onRename);
    startEditing();
    fireEvent.change(input(), { target: { value: "Something else" } });
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Intro to agents",
    );
  });

  it("will not save a title under 3 characters and says why", () => {
    const onRename = vi.fn();
    renderEditor(onRename);
    startEditing();
    fireEvent.change(input(), { target: { value: "ab" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.blur(input());
    expect(onRename).not.toHaveBeenCalled();
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input()).toHaveAccessibleDescription(
      en.classroomBuilder.titleTooShort,
    );
  });

  it("is plain text when the course cannot be changed (archived)", () => {
    renderEditor(undefined);
    expect(screen.queryByRole("button", { name: /Rename course/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Intro to agents",
    );
  });
});
