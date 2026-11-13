import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import type { GalleryUploadChoices } from "@/server/gallery/items";
import { GalleryEditDialog } from "./gallery-edit-dialog";
import { galleryItem } from "./gallery-test-fixtures";

Object.assign(Element.prototype, {
  scrollIntoView: () => undefined,
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
});

const m = vi.hoisted(() => ({
  updates: [] as unknown[],
  updateFails: null as null | { message: string },
  invalidateList: vi.fn(),
  invalidateFacets: vi.fn(),
  invalidateItem: vi.fn(),
  toastSuccess: vi.fn(),
}));

const CHOICES: GalleryUploadChoices = {
  events: [
    { id: 4, title: "Autumn hack night", startsAt: "2026-11-02T18:00:00.000Z" },
    { id: 3, title: "Summer picnic", startsAt: "2026-07-14T10:00:00.000Z" },
  ],
  publicReachesOutsiders: true,
};

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      gallery: {
        list: { invalidate: m.invalidateList },
        facets: { invalidate: m.invalidateFacets },
        item: { invalidate: m.invalidateItem },
      },
    }),
    gallery: {
      uploadChoices: {
        useQuery: () => ({
          isPending: false,
          isError: false,
          data: CHOICES,
          refetch: vi.fn(),
        }),
      },
      updateItem: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, input: unknown) => void;
          onError?: (error: unknown, input: unknown) => void;
        }) => ({
          isPending: false,
          mutate: (input: unknown) => {
            m.updates.push(input);
            if (m.updateFails) opts.onError?.(m.updateFails, input);
            else opts.onSuccess?.({}, input);
          },
        }),
      },
    },
    topics: {
      list: {
        useQuery: () => ({
          data: [
            { id: 1, slug: "general", label: "General", emoji: null },
            { id: 2, slug: "meetups", label: "Meetups", emoji: "🍕" },
          ],
        }),
      },
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: m.toastSuccess, error: vi.fn() },
}));

const ITEM = galleryItem({
  id: 7,
  caption: "Opening talk",
  alt: null,
  topicSlug: "meetups",
  event: { id: 4, title: "Autumn hack night", slug: "autumn-hack" },
  visibility: "community",
  magazineConsent: false,
  isOwn: true,
});

const onOpenChange = vi.fn();

function renderDialog(item = ITEM) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <GalleryEditDialog
        slug="mlops"
        item={item}
        open
        onOpenChange={onOpenChange}
      />
    </NextIntlClientProvider>,
  );
}

const save = () => screen.getByRole("button", { name: "Save" });

beforeEach(() => {
  vi.clearAllMocks();
  m.updates = [];
  m.updateFails = null;
});

describe("GalleryEditDialog", () => {
  it("starts from the item's details, with Save off until something changes", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Edit details" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Caption" })).toHaveValue(
      "Opening talk",
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue(
      "",
    );
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveTextContent(
      "Autumn hack night",
    );
    expect(
      within(screen.getByRole("radiogroup", { name: "Category" })).getByRole(
        "radio",
        { name: "🍕 Meetups" },
      ),
    ).toBeChecked();
    expect(save()).toBeDisabled();
  });

  it("sends only the fields that changed", () => {
    renderDialog();
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "  Dana on stage  " },
    });
    fireEvent.click(save());
    expect(m.updates).toEqual([
      { slug: "mlops", itemId: 7, alt: "Dana on stage" },
    ]);
    expect(m.invalidateList).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.invalidateFacets).toHaveBeenCalledWith({ slug: "mlops" });
    expect(m.toastSuccess).toHaveBeenCalledWith("Saved");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not count whitespace around the same text as a change", () => {
    renderDialog();
    fireEvent.change(screen.getByRole("textbox", { name: "Caption" }), {
      target: { value: " Opening talk " },
    });
    expect(save()).toBeDisabled();
  });

  it("clears a category as null", () => {
    renderDialog();
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Category" })).getByRole(
        "radio",
        { name: "No category" },
      ),
    );
    fireEvent.click(save());
    expect(m.updates).toEqual([{ slug: "mlops", itemId: 7, topicSlug: null }]);
  });

  it("gives and takes back magazine permission with the upload's wording", () => {
    renderDialog();
    const consent = screen.getByRole("checkbox", {
      name: "The community may use this in its magazine",
    });
    expect(consent).not.toBeChecked();
    expect(
      screen.getByText(
        "Editors can only feature photos with this ticked. People who can't see a members-only photo won't see it in the magazine either.",
      ),
    ).toBeVisible();
    fireEvent.click(consent);
    fireEvent.click(save());
    expect(m.updates).toEqual([
      { slug: "mlops", itemId: 7, magazineConsent: true },
    ]);
  });

  it("shows who can see it as fixed, not as a choice", () => {
    renderDialog();
    expect(screen.queryByRole("radio", { name: "Everyone" })).toBeNull();
    expect(screen.getByText("Members only")).toBeVisible();
    expect(
      screen.getByText("This can't be changed after upload."),
    ).toBeVisible();
  });

  it("says a refused save in plain words and stays open", () => {
    m.updateFails = { message: "EVENT_NOT_ALLOWED" };
    renderDialog();
    fireEvent.change(screen.getByRole("textbox", { name: "Caption" }), {
      target: { value: "New" },
    });
    fireEvent.click(save());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Photos can't be linked to that event.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
