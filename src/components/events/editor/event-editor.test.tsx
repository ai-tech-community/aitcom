// The event editor page: which sections each viewer gets, what saving
// sends (asserted on the mutation call, not the result), and that an
// unfinished question stops the save.
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

interface MutationOptions {
  onSuccess?: () => void;
}

const m = vi.hoisted(() => ({
  create: vi.fn(),
  submit: vi.fn(),
  update: vi.fn(),
  resubmit: vi.fn(),
  push: vi.fn(),
  editData: null as unknown,
  options: {} as Record<string, MutationOptions>,
}));

function mutation(key: string, mutate: ReturnType<typeof vi.fn>) {
  return {
    useMutation: (options: MutationOptions) => {
      m.options[key] = options;
      return { mutate, isPending: false };
    },
  };
}

vi.mock("@/trpc/react", () => ({
  api: {
    events: {
      getEventForEdit: {
        useQuery: (_input: unknown, opts: { enabled: boolean }) => ({
          data: opts.enabled ? m.editData : undefined,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      checkConflicts: {
        useQuery: () => ({
          data: undefined,
          isFetching: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      importEventFromUrl: mutation("import", vi.fn()),
      createEvent: mutation("create", m.create),
      submitEvent: mutation("submit", m.submit),
      updateEvent: mutation("update", m.update),
      resubmitEvent: mutation("resubmit", m.resubmit),
    },
    audiences: {
      list: {
        useQuery: () => ({
          data: [{ slug: "builders", name: "Builders" }],
          isLoading: false,
        }),
      },
    },
    useUtils: () => ({
      events: {
        getCommunityEvents: { invalidate: vi.fn() },
        getMyEventSubmissions: { invalidate: vi.fn() },
        getPendingCommunityEvents: { invalidate: vi.fn() },
      },
    }),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  useRouter: () => ({ push: m.push }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// jsdom has no layout; the editor scrolls to an unfinished question.
Element.prototype.scrollIntoView = vi.fn();

import { EventEditor } from "./event-editor";

function renderEditor(
  props: Partial<React.ComponentProps<typeof EventEditor>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <EventEditor
        communitySlug="builders"
        communityName="Builders"
        mode="create"
        canPublish
        title="Create event"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(en.events.eventTitle), {
    target: { value: "Builders night" },
  });
  fireEvent.change(screen.getByLabelText(en.events.eventDate), {
    target: { value: "2026-11-02" },
  });
  fireEvent.change(screen.getByLabelText(en.events.eventLocation), {
    target: { value: "Amsterdam" },
  });
}

function save(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.editData = null;
  m.options = {};
});

describe("EventEditor — sections", () => {
  it("gives an admin creating an event every section, in order", () => {
    renderEditor();
    const nav = screen.getByRole("navigation", {
      name: en.events.editor.sectionsNav,
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([
      "Start from a link",
      "Basics",
      "Who it's for",
      "When",
      "Where",
      "Registration",
      "Curation",
    ]);
    expect(
      within(nav)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual([
      "#import",
      "#basics",
      "#audience",
      "#when",
      "#where",
      "#registration",
      "#curation",
    ]);
  });

  it("hides curation from members, and the link import when editing", () => {
    renderEditor({ canPublish: false });
    expect(document.getElementById("curation")).toBeNull();
    expect(document.getElementById("import")).not.toBeNull();
  });
});

describe("EventEditor — saving", () => {
  it("publishes an admin's event with its questions", () => {
    renderEditor();
    fillRequired();
    fireEvent.click(
      screen.getByRole("button", { name: en.events.editor.questions.add }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        en.events.editor.questions.questionPlaceholder,
      ),
      { target: { value: "What do you hope to learn?" } },
    );
    fireEvent.click(screen.getByLabelText(en.events.editor.questions.required));
    save(en.events.createEvent);

    expect(m.submit).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create.mock.calls[0]![0]).toMatchObject({
      communitySlug: "builders",
      title: "Builders night",
      date: "2026-11-02",
      location: "Amsterdam",
      registrationQuestions: [
        {
          type: "short_text",
          label: "What do you hope to learn?",
          required: true,
        },
      ],
    });
  });

  it("submits a member's event for approval", () => {
    renderEditor({ canPublish: false });
    fillRequired();
    save(en.events.submitForApproval);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.submit).toHaveBeenCalledTimes(1);
  });

  it("stops at an unfinished question and says what to fix", () => {
    renderEditor();
    fillRequired();
    fireEvent.click(
      screen.getByRole("button", { name: en.events.editor.questions.add }),
    );
    save(en.events.createEvent);

    expect(m.create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      en.events.editor.questions.fixBeforeSaving,
    );
    expect(
      screen.getByText(en.events.editor.questions.problem.label),
    ).toBeInTheDocument();
  });

  it("drops the questions for an event people register for elsewhere", () => {
    renderEditor();
    fillRequired();
    fireEvent.change(screen.getByLabelText(en.events.editor.externalLink), {
      target: { value: "https://lu.ma/x" },
    });
    expect(
      screen.getByText(en.events.editor.externalNoQuestions),
    ).toBeInTheDocument();
    save(en.events.createEvent);
    expect(m.create.mock.calls[0]![0]).toMatchObject({
      sourceUrl: "https://lu.ma/x",
      registrationQuestions: [],
    });
  });

  it("goes back to the community's events after saving", () => {
    renderEditor();
    m.options.create?.onSuccess?.();
    expect(m.push).toHaveBeenCalledWith("/communities/builders/events");
  });
});

describe("EventEditor — editing", () => {
  const EDIT_DATA = {
    title: "Builders night",
    summary: "",
    description: "",
    type: "meetup",
    date: "2026-11-02",
    startTime: "19:00",
    endTime: "22:00",
    timezone: "Europe/Amsterdam",
    location: "Amsterdam",
    format: "in-person",
    region: "",
    country: "",
    city: "",
    focus: "",
    level: "",
    audience: [{ slug: "builders", name: "Builders" }],
    sourceUrl: "",
    aitFitScore: "",
    tags: "",
    curatedByAgent: false,
    discoverySource: "",
    confidenceScore: "",
    lastVerifiedAt: "",
    videoUrl: "",
    maxAttendees: "40",
    registrationQuestions: [
      {
        id: "q1",
        type: "single_choice",
        label: "Level",
        required: false,
        options: [
          { id: "a", label: "New" },
          { id: "b", label: "Daily" },
        ],
      },
    ],
    coverImageId: null,
    coverImageUrl: null,
  };

  it("loads the event and saves changes to the same questions", async () => {
    m.editData = EDIT_DATA;
    renderEditor({ mode: "edit", eventId: 7 });
    await waitFor(() =>
      expect(screen.getByLabelText(en.events.eventTitle)).toHaveValue(
        "Builders night",
      ),
    );
    expect(document.getElementById("import")).toBeNull();
    expect(screen.getByDisplayValue("Daily")).toBeInTheDocument();

    save(en.events.editor.saveChanges);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.update.mock.calls[0]![0]).toMatchObject({
      eventId: 7,
      maxAttendees: 40,
      audience: ["builders"],
      registrationQuestions: EDIT_DATA.registrationQuestions,
    });
  });

  it("resubmits a rejected submission", async () => {
    m.editData = EDIT_DATA;
    renderEditor({ mode: "resubmit", eventId: 7, canPublish: false });
    await waitFor(() =>
      expect(screen.getByLabelText(en.events.eventTitle)).toHaveValue(
        "Builders night",
      ),
    );
    save(en.events.resubmitForApproval);
    expect(m.resubmit).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 7 }),
    );
  });
});
