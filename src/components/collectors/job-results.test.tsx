import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import fr from "../../../messages/fr.json";
import { JobResults } from "./job-results";

const row = {
  title: "Engineer",
  location: "Amsterdam",
  department: "Research",
  description: "First paragraph\n\nSecond paragraph <script>alert(1)</script>",
  employmentType: "FullTime",
  workplaceType: "Remote",
  postedAt: "2026-10-31T10:00:00Z",
  url: "https://example.com/job",
  applyUrl: "https://example.com/apply",
  descriptionTruncated: false,
};
function show(
  item: Record<string, unknown> = row,
  locale: "en" | "nl" | "fr" = "en",
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={{ en, nl, fr }[locale]}>
      <JobResults rows={[item]} />
    </NextIntlClientProvider>,
  );
}
function open() {
  fireEvent.click(
    screen.getByRole("button", { name: "View details for Engineer" }),
  );
}

describe("job results", () => {
  it("keeps a source calendar date intact in a browser west of UTC", () => {
    const browser = vi
      .spyOn(Date.prototype, "toLocaleDateString")
      .mockImplementation(function (this: Date, locale, options) {
        return new Intl.DateTimeFormat(locale, {
          timeZone: "America/Los_Angeles",
          ...options,
        }).format(this);
      });
    try {
      show({ ...row, postedAt: "2026-10-27" });
      expect(
        within(screen.getByRole("table")).getByText("10/27/2026"),
      ).toBeInTheDocument();
    } finally {
      browser.mockRestore();
    }
  });

  it("keeps descriptions out of the table and opens readable details with safe links", async () => {
    show();
    expect(screen.queryByText(/First paragraph/)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader").map((c) => c.textContent),
    ).toEqual([
      "Title",
      "Location",
      "Department",
      "Employment",
      "Workplace",
      "Published",
      "Job details",
    ]);
    const trigger = screen.getByRole("button", {
      name: "View details for Engineer",
    });
    trigger.focus();
    open();
    const dialog = screen.getByRole("dialog", { name: "Engineer" });
    expect(within(dialog).getByText(/First paragraph/).textContent).toBe(
      row.description,
    );
    expect(dialog.querySelector("script")).toBeNull();
    expect(within(dialog).getByText("Full time")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", {
        name: en.collectors.jobDetails.apply,
      }),
    ).toHaveAttribute("href", row.applyUrl);
    expect(
      within(dialog).getByRole("link", {
        name: en.collectors.jobDetails.source,
      }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("distinguishes old rows from absent source descriptions and rejects unsafe links", () => {
    show({
      title: "Engineer",
      url: "javascript:alert(1)",
      applyUrl: "https://user:pass@example.com",
    });
    open();
    expect(
      screen.getByText(en.collectors.jobDetails.older),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("explains missing and shortened descriptions", () => {
    show({ ...row, description: null, descriptionTruncated: true });
    open();
    expect(
      screen.getByText(en.collectors.jobDetails.missing),
    ).toBeInTheDocument();
    expect(
      screen.getByText(en.collectors.jobDetails.truncated),
    ).toBeInTheDocument();
  });

  it("closes with Escape and keeps a single link when application and source match", async () => {
    show({ ...row, applyUrl: row.url });
    open();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it.each(["nl", "fr"] as const)(
    "translates the interaction in %s",
    (locale) => {
      show(row, locale);
      const t = { nl, fr }[locale].collectors.jobDetails;
      fireEvent.click(
        screen.getByRole("button", {
          name: t.viewNamed.replace("{title}", "Engineer"),
        }),
      );
      expect(screen.getByRole("button", { name: t.close })).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog")).getByText(t.employment.FullTime),
      ).toBeInTheDocument();
    },
  );
});
