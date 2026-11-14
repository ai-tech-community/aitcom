// A featured gallery photo or video in an issue: the picture, its caption,
// who added it and the event it is from, at every size a layout asks for.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import nl from "../../../../messages/nl.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { galleryItemView } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

import { IssueItem } from "./registry";
import type { ItemSize } from "./types";

const href = (slug: string) => `/magazines/agents-weekly/issue-4/${slug}`;
const SIZES: ItemSize[] = ["lead", "card", "row", "related"];

function renderItem(view: ReturnType<typeof galleryItemView>, size: ItemSize) {
  return renderWithIntl(
    <IssueItem view={view} size={size} href={href} teaser={null} />,
  );
}

describe("GalleryItem", () => {
  it.each(SIZES)(
    "renders a %s photo linked to the gallery with its credit and event",
    (size) => {
      const { container } = renderItem(
        { ...galleryItemView(), intro: "Our favourite moment" },
        size,
      );
      expect(
        container.querySelector('[data-item-kind="galleryItem"]'),
      ).not.toBeNull();
      const image = screen.getByRole("img", {
        name: "People building robots 1",
      });
      expect(image).toHaveAttribute("loading", "lazy");
      expect(
        screen
          .getAllByRole("link")
          .some(
            (link) =>
              link.getAttribute("href") ===
              "/communities/local-builders/gallery?item=1",
          ),
      ).toBe(true);
      const credit = screen.getByText("Photo by Sanne");
      expect(credit.closest(".font-mono")).toBeNull();
      expect(screen.getByRole("link", { name: "Model night" })).toHaveAttribute(
        "href",
        "/events/model-night",
      );
      expect(screen.getByText("Our favourite moment")).toBeVisible();
      expect(container.querySelector("video")).toBeNull();
      expect(screen.queryByText("Only members see this")).toBeNull();
    },
  );

  it("shows the full photo large in the lead, with its caption as the figure caption", () => {
    const { container } = renderItem(galleryItemView(), "lead");
    expect(
      screen.getByRole("img", { name: "People building robots 1" }),
    ).toHaveAttribute("src", galleryItemView().url);
    const figure = container.querySelector("figure");
    expect(figure).not.toBeNull();
    const caption = within(figure!).getByText("Caption 1");
    expect(caption.closest("figcaption")).not.toBeNull();
    expect(caption.closest(".font-mono")).toBeNull();
  });

  it.each(["row", "related"] as const)(
    "uses the small picture and names the %s by its label",
    (size) => {
      renderItem(galleryItemView(), size);
      expect(
        screen.getByRole("img", { name: "People building robots 1" }),
      ).toHaveAttribute("src", galleryItemView().thumbnailUrl);
      const heading = screen.getByRole("heading", { name: "Caption 1" });
      expect(
        within(heading).getByRole("link", { name: "Caption 1" }),
      ).toHaveAttribute("href", "/communities/local-builders/gallery?item=1");
    },
  );

  it("says where a row comes from, in words", () => {
    renderItem(galleryItemView(), "row");
    expect(screen.getByText("From the gallery", { exact: true })).toBeVisible();
  });

  it.each(SIZES)(
    "shows a %s video as its thumbnail with a play badge, never as a player",
    (size) => {
      const view = galleryItemView(2, {
        mediaType: "video",
        url: "https://files.example.test/gallery/2.mp4?signature=a",
        durationSeconds: 42,
        caption: null,
        alt: null,
        label: {
          key: "gallery.label.videoFromEvent",
          values: { event: "Model night", name: "Sanne" },
        },
      });
      const { container } = renderItem(view, size);
      expect(container.querySelector("video")).toBeNull();
      expect(
        container.querySelector('img[src$=".mp4?signature=a"]'),
      ).toBeNull();
      const image = screen.getByRole("img", {
        name: "Video from Model night by Sanne",
      });
      expect(image).toHaveAttribute("src", view.thumbnailUrl);
      const badge = screen.getByText("Video", { exact: true });
      expect(badge).toBeVisible();
      expect(badge.parentElement?.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(screen.getByText("Video by Sanne")).toBeVisible();
      // The badge is part of the picture's link, so the link says it is a video.
      const link = screen.getAllByRole("link").find((a) => a.contains(image));
      expect(link).toHaveAttribute(
        "href",
        "/communities/local-builders/gallery?item=2",
      );
      expect(link).toHaveAccessibleName(
        /Video from Model night by Sanne.*Video/,
      );
    },
  );

  it("credits a member who deleted their account by the name the server sends", () => {
    renderItem(
      galleryItemView(1, { uploader: { name: "Deleted member" } }),
      "card",
    );
    expect(screen.getByText("Photo by Deleted member")).toBeVisible();
  });

  it("falls back to the label for alt text when the item has none", () => {
    renderItem(
      galleryItemView(1, {
        caption: null,
        alt: null,
        label: {
          key: "gallery.label.photoFromEvent",
          values: { event: "Model night", name: "Sanne" },
        },
      }),
      "card",
    );
    expect(
      screen.getByRole("img", { name: "Photo from Model night by Sanne" }),
    ).toBeVisible();
  });

  it("leaves out the event line for an item from no event", () => {
    renderItem(galleryItemView(1, { event: null }), "card");
    expect(screen.getByText("Photo by Sanne")).toBeVisible();
    expect(screen.queryByText(/Model night/)).toBeNull();
    expect(screen.queryByText("·")).toBeNull();
  });

  it.each(SIZES)(
    "marks a %s item outsiders cannot see, for editors",
    (size) => {
      renderItem(galleryItemView(1, { membersOnly: true }), size);
      expect(screen.getByText("Only members see this")).toBeVisible();
    },
  );

  it("follows a refreshed signed link on the next render", () => {
    const view = galleryItemView();
    const { rerender } = renderItem(view, "card");
    const refreshed = {
      ...view,
      url: "https://files.example.test/gallery/1.jpg?signature=b",
    };
    // `rerender` keeps the English wrapper.
    rerender(
      <IssueItem view={refreshed} size="card" href={href} teaser={null} />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", refreshed.url);
  });

  it("credits the photo and its event in Dutch", () => {
    render(
      <NextIntlClientProvider locale="nl" messages={nl} timeZone="UTC">
        <IssueItem
          view={galleryItemView(1, { membersOnly: true })}
          size="lead"
          href={href}
          teaser={null}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Foto door Sanne")).toBeVisible();
    expect(screen.getByText(/^Van/)).toHaveTextContent("Van Model night");
    expect(screen.getByText("Alleen leden zien dit")).toBeVisible();
  });
});
