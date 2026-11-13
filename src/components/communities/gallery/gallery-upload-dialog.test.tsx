import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import type { GalleryUploadChoices } from "@/server/gallery/items";
import { GalleryUploadDialog } from "./gallery-upload-dialog";
import type {
  GalleryUploadFile,
  GalleryUploadState,
} from "./use-gallery-upload";

// Radix Select scrolls to the chosen option and captures the pointer;
// jsdom has neither.
Object.assign(Element.prototype, {
  scrollIntoView: () => undefined,
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
});
Object.assign(URL, {
  createObjectURL: () => "blob:preview",
  revokeObjectURL: () => undefined,
});

const m = vi.hoisted(() => ({
  state: null as unknown as GalleryUploadState,
  start: vi.fn(),
  cancel: vi.fn(),
  retryUnsent: vi.fn(),
  dropFailed: vi.fn(),
  canTranscode: true,
  choices: {
    isPending: false,
    isError: false,
    data: undefined as GalleryUploadChoices | undefined,
    refetch: vi.fn(),
  },
}));

vi.mock("./use-gallery-upload", () => ({
  useGalleryUpload: () => ({
    state: m.state,
    start: m.start,
    cancel: m.cancel,
    retryUnsent: m.retryUnsent,
    dropFailed: m.dropFailed,
  }),
}));
vi.mock("@/lib/video-transcode", () => ({
  canTranscode: async () => m.canTranscode,
}));
vi.mock("@/trpc/react", () => ({
  api: {
    gallery: {
      uploadChoices: { useQuery: () => m.choices },
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

const CHOICES: GalleryUploadChoices = {
  events: [
    { id: 4, title: "Autumn hack night", startsAt: "2026-11-02T18:00:00.000Z" },
    { id: 3, title: "Summer picnic", startsAt: "2026-07-14T10:00:00.000Z" },
  ],
  publicReachesOutsiders: true,
};

const IDLE: GalleryUploadState = { phase: "idle", files: [], result: null };

const onOpenChange = vi.fn();

function renderDialog(
  props: Partial<React.ComponentProps<typeof GalleryUploadDialog>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <GalleryUploadDialog
        slug="mlops"
        open
        onOpenChange={onOpenChange}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const photo = (n: number) =>
  new File(["x"], `photo-${n}.jpg`, { type: "image/jpeg" });
const video = (n: number) =>
  new File(["x"], `clip-${n}.mp4`, { type: "video/mp4" });

function pick(files: File[]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("no file input");
  fireEvent.change(input, { target: { files } });
}

const uploadButton = () =>
  screen.getByRole("button", { name: /^Upload( \d+)?$/ });

function file(
  over: Partial<GalleryUploadFile> & Pick<GalleryUploadFile, "id">,
): GalleryUploadFile {
  return {
    name: `photo-${over.id}.jpg`,
    mediaType: "photo",
    phase: "waiting",
    progress: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.state = IDLE;
  m.canTranscode = true;
  m.choices = {
    isPending: false,
    isError: false,
    data: CHOICES,
    refetch: vi.fn(),
  };
});

describe("GalleryUploadDialog: choosing", () => {
  it("offers the drop zone and keeps Upload off with no files", () => {
    renderDialog();
    expect(
      screen.getByRole("dialog", { name: "Add photos and videos" }),
    ).toBeVisible();
    expect(screen.getByText("Drop photos and videos here")).toBeVisible();
    const input = document.querySelector('input[type="file"]');
    expect(input).toHaveAttribute("accept", "image/*,video/*");
    expect(input).toHaveAttribute("multiple");
    expect(uploadButton()).toBeDisabled();
    expect(uploadButton()).toHaveTextContent("Upload");
  });

  it("refuses files past 30 with a line and keeps the first 30", async () => {
    renderDialog();
    pick(Array.from({ length: 31 }, (_, i) => photo(i)));
    expect(
      await screen.findByText(
        "You can add up to 30 files at a time. We kept the first 30.",
      ),
    ).toBeVisible();
    expect(uploadButton()).toHaveTextContent("Upload 30");
    expect(uploadButton()).toBeEnabled();
  });

  it("refuses videos past 10 with a line", async () => {
    renderDialog();
    pick(Array.from({ length: 11 }, (_, i) => video(i)));
    expect(
      await screen.findByText(
        "You can add up to 10 videos at a time. We left out the rest.",
      ),
    ).toBeVisible();
    expect(uploadButton()).toHaveTextContent("Upload 10");
  });

  it("leaves out only the videos where the browser cannot convert them", async () => {
    m.canTranscode = false;
    renderDialog();
    pick([video(1), photo(1)]);
    expect(
      await screen.findByText(en.communities.video.unsupported),
    ).toBeVisible();
    expect(uploadButton()).toHaveTextContent("Upload 1");
  });

  it("removes a chosen file", async () => {
    renderDialog();
    pick([photo(1), photo(2)]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove photo-1.jpg" }),
    );
    expect(uploadButton()).toHaveTextContent("Upload 1");
    expect(
      screen.queryByRole("button", { name: "Remove photo-1.jpg" }),
    ).toBeNull();
  });

  it("starts members-only, without an event, category or magazine permission", async () => {
    renderDialog();
    pick([photo(1), photo(2)]);
    await screen.findByText("Upload 2");
    expect(
      screen.getByRole("checkbox", {
        name: "The community may use these in its magazine",
      }),
    ).not.toBeChecked();
    expect(
      screen.getByText(
        "Editors can only feature photos with this ticked. People who can't see a members-only photo won't see it in the magazine either.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveTextContent(
      "Not from an event",
    );
    fireEvent.click(uploadButton());
    expect(m.start).toHaveBeenCalledWith([photo(1), photo(2)], {
      visibility: "community",
      magazineConsent: false,
    });
  });

  it("sends the chosen settings to the upload", async () => {
    renderDialog();
    pick([photo(1)]);
    await screen.findByText("Upload 1");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "The community may use these in its magazine",
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole("radiogroup", { name: "Who can see these" }),
      ).getByRole("radio", { name: "Everyone" }),
    );
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: "Category" })).getByRole(
        "radio",
        { name: "🍕 Meetups" },
      ),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Say something about these" }),
      { target: { value: "  What a night  " } },
    );
    expect(screen.getByText("16/500")).toBeVisible();
    fireEvent.click(uploadButton());
    expect(m.start).toHaveBeenCalledWith([photo(1)], {
      visibility: "public",
      magazineConsent: true,
      topicSlug: "meetups",
      caption: "What a night",
    });
  });

  it("lets a chosen category be cleared", async () => {
    renderDialog();
    pick([photo(1)]);
    await screen.findByText("Upload 1");
    const chips = screen.getByRole("radiogroup", { name: "Category" });
    fireEvent.click(within(chips).getByRole("radio", { name: "🍕 Meetups" }));
    fireEvent.click(within(chips).getByRole("radio", { name: "No category" }));
    fireEvent.click(uploadButton());
    expect(m.start.mock.calls[0]?.[1]).not.toHaveProperty("topicSlug");
  });

  it("starts with the linked event chosen", async () => {
    renderDialog({ initialEventId: 4 });
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveTextContent(
      "Autumn hack night",
    );
    expect(
      screen.getByText(
        "They'll go into the gallery and onto the page for Autumn hack night.",
      ),
    ).toBeVisible();
    pick([photo(1)]);
    await screen.findByText("Upload 1");
    fireEvent.click(uploadButton());
    expect(m.start).toHaveBeenCalledWith([photo(1)], {
      visibility: "community",
      magazineConsent: false,
      eventId: 4,
    });
  });

  it("drops a linked event that photos may not be added to", async () => {
    renderDialog({ initialEventId: 99 });
    expect(screen.getByRole("combobox", { name: "Event" })).toHaveTextContent(
      "Not from an event",
    );
    pick([photo(1)]);
    await screen.findByText("Upload 1");
    fireEvent.click(uploadButton());
    expect(m.start.mock.calls[0]?.[1]).not.toHaveProperty("eventId");
  });

  it("offers no Everyone where outsiders cannot see the community", () => {
    m.choices.data = { ...CHOICES, publicReachesOutsiders: false };
    renderDialog();
    expect(screen.queryByRole("radio", { name: "Everyone" })).toBeNull();
    expect(
      screen.getByText(
        "Only members can see them: this community's content is for members only.",
      ),
    ).toBeVisible();
  });

  it("says when the events could not load, with a retry", () => {
    m.choices = {
      isPending: false,
      isError: true,
      data: undefined,
      refetch: vi.fn(),
    };
    renderDialog();
    expect(screen.getByText("We couldn't load the events.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(m.choices.refetch).toHaveBeenCalled();
    // Until the community is known, nothing is offered beyond members.
    expect(screen.queryByRole("radio", { name: "Everyone" })).toBeNull();
  });

  it("closes on Cancel before anything is sent", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("GalleryUploadDialog: sending", () => {
  it("shows each file's progress, with conversion for a video", () => {
    m.state = {
      phase: "running",
      result: null,
      files: [
        file({ id: "1", phase: "done", progress: 1 }),
        file({
          id: "2",
          name: "clip.mp4",
          mediaType: "video",
          phase: "preparing",
          progress: 0.4,
        }),
        file({ id: "3", phase: "waiting" }),
      ],
    };
    renderDialog();
    const rows = within(
      screen.getByRole("list", { name: "Upload progress" }),
    ).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Added");
    expect(rows[1]).toHaveTextContent("Converting 40%");
    expect(
      within(rows[1]!).getByRole("progressbar", {
        name: "clip.mp4: Converting 40%",
      }),
    ).toHaveAttribute("aria-valuenow", "40");
    expect(rows[2]).toHaveTextContent("Waiting");
    expect(screen.getByText("1 of 3 added")).toBeInTheDocument();
  });

  it("stops the run on Cancel and cannot be dismissed while sending", () => {
    m.state = {
      phase: "running",
      result: null,
      files: [file({ id: "1", phase: "uploading", progress: 0.5 })],
    };
    renderDialog();
    expect(screen.queryByRole("button", { name: /^Upload/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(m.cancel).toHaveBeenCalled();
  });

  it("says what was added when everything uploaded", () => {
    m.state = {
      phase: "finished",
      result: { readyCount: 3, feedPostId: null },
      files: [
        file({ id: "1", phase: "done" }),
        file({ id: "2", phase: "done" }),
        file({ id: "3", mediaType: "video", phase: "done" }),
      ],
    };
    renderDialog({ initialEventId: 4 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 photos and 1 video added to Autumn hack night.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("lists failed files with the reason, Retry and Drop", () => {
    m.state = {
      phase: "finished",
      result: { readyCount: 1, feedPostId: null },
      files: [
        file({ id: "1", phase: "done" }),
        file({ id: "2", phase: "failed", error: "UPLOAD_FAILED" }),
        file({ id: "3", phase: "failed", error: "FILE_TOO_LARGE" }),
      ],
    };
    renderDialog();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 photo added to the gallery.",
    );
    expect(screen.getByText("2 files didn't upload.")).toBeVisible();
    const rows = within(
      screen.getByRole("list", { name: "Upload progress" }),
    ).getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("It didn't upload. Try again.");
    expect(rows[2]).toHaveTextContent("Too large, even after shrinking.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(m.retryUnsent).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Leave out failed files" }),
    );
    expect(m.dropFailed).toHaveBeenCalled();
  });

  it("offers only Drop when every failed file would fail again", () => {
    m.state = {
      phase: "finished",
      result: { readyCount: 0, feedPostId: null },
      files: [
        file({ id: "1", phase: "failed", error: "FILE_TOO_LARGE" }),
        file({ id: "2", phase: "failed", error: "FILE_TYPE_NOT_ALLOWED" }),
      ],
    };
    renderDialog();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Leave out failed files" }),
    ).toBeVisible();
  });

  it("shows a refusal of the whole batch first, and the daily limit note", () => {
    m.state = {
      phase: "finished",
      result: null,
      error: "UPLOAD_LIMIT",
      files: [file({ id: "1", phase: "failed", error: "UPLOAD_LIMIT" })],
    };
    renderDialog();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "You've added the most photos and videos allowed for today. Try again tomorrow.",
    );
    expect(
      screen.getByText(
        "Files that didn't finish still count toward today's limit, so trying again may go over it.",
      ),
    ).toBeVisible();
    // The batch refusal comes before the file list.
    expect(
      alert.compareDocumentPosition(
        screen.getByRole("list", { name: "Upload progress" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("names files a cancel left unsent and offers to send them", () => {
    m.state = {
      phase: "finished",
      result: { readyCount: 1, feedPostId: null },
      files: [
        file({ id: "1", phase: "done" }),
        file({ id: "2", phase: "waiting" }),
      ],
    };
    renderDialog();
    expect(screen.getByText("1 file wasn't sent.")).toBeVisible();
    const rows = within(
      screen.getByRole("list", { name: "Upload progress" }),
    ).getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent("Not sent");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(m.retryUnsent).toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Leave out failed files" }),
    ).toBeNull();
  });

  it("asks the browser to convert videos only when one is picked", async () => {
    m.canTranscode = false;
    renderDialog();
    pick([photo(1)]);
    await waitFor(() => expect(uploadButton()).toHaveTextContent("Upload 1"));
    expect(screen.queryByText(en.communities.video.unsupported)).toBeNull();
  });
});
