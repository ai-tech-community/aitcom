// What the register button hands the server (ADR-0038): names are asked
// once, pre-filled from the current name, and sent with the registration;
// an account that has them registers straight away; everyone sees what the
// organizer will see before registering.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { toast } from "sonner";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

interface MutationOptions {
  onSuccess?: (data: unknown) => void;
  onError?: (error: { message: string; data?: { code?: string } }) => void;
}

const m = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    name: string;
    firstName?: string | null;
    lastName?: string | null;
  },
  redesign: false,
  sessionPending: false,
  register: vi.fn(),
  updateAnswers: vi.fn(),
  status: null as null | { status: string; answers?: Record<string, unknown> },
  refresh: vi.fn(),
  refetchSession: vi.fn(),
  options: {} as Record<string, MutationOptions>,
}));

vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => m.redesign,
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: m.user ? { user: m.user } : null,
      isPending: m.sessionPending,
      refetch: m.refetchSession,
    }),
  },
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ promptAuth: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function mutation(key: string, mutate = vi.fn()) {
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
      registrationStatus: {
        useQuery: () => ({ data: m.status, isLoading: false }),
      },
      updateMyAnswers: mutation("answers", m.updateAnswers),
      register: mutation("register", m.register),
      cancelRegistration: mutation("cancel"),
      markIntent: mutation("markIntent"),
      removeIntent: mutation("removeIntent"),
    },
    useUtils: () => ({
      events: {
        registrationStatus: { invalidate: vi.fn() },
        myRegistrations: { invalidate: vi.fn() },
        registrationCount: { invalidate: vi.fn() },
        getAttendees: { invalidate: vi.fn() },
      },
    }),
  },
}));

import { EventRegisterButton } from "./event-register-button";

function renderButton(locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <EventRegisterButton eventId={7} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  m.redesign = false;
  m.sessionPending = false;
  m.register.mockReset();
  m.updateAnswers.mockReset();
  m.refresh.mockReset();
  m.status = null;
  m.refetchSession.mockReset();
  vi.mocked(toast.success).mockClear();
  m.options = {};
  m.user = { id: "u1", name: "Jan van der Berg" };
});

describe("EventRegisterButton — names for the organizer", () => {
  it("tells the member what the organizer will see", () => {
    renderButton();
    expect(
      screen.getByText(/The organizer will see your name and email/),
    ).toBeInTheDocument();
  });

  it("asks for names first, pre-filled from the current name", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(m.register).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "Your name for the organizer",
    });
    expect(screen.getByLabelText("First name")).toHaveValue("Jan");
    expect(screen.getByLabelText("Last name")).toHaveValue("van der Berg");
    expect(dialog).toHaveTextContent(/The organizer will see/);
  });

  it("registers with the names the member confirmed", () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.change(screen.getByLabelText("Last name"), {
      target: { value: "Van der Berg" },
    });
    fireEvent.submit(screen.getByLabelText("Last name").closest("form")!);

    expect(m.register).toHaveBeenCalledWith({
      eventId: 7,
      firstName: "Jan",
      lastName: "Van der Berg",
      answers: {}, // this event asks no questions
    });
  });

  it("does not register with a missing last name, and says why", () => {
    m.user = { id: "u1", name: "octocat" };
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.submit(screen.getByLabelText("Last name").closest("form")!);

    expect(m.register).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Last name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Please fill this in.")).toBeInTheDocument();
  });

  it("registers straight away when the account has names", () => {
    m.user = {
      id: "u1",
      name: "Ada",
      firstName: "Ada",
      lastName: "Lovelace",
    };
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(m.register).toHaveBeenCalledWith({ eventId: 7 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks for names when the server says they are missing", () => {
    m.user = { id: "u1", name: "Ada", firstName: "Ada", lastName: "L" };
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    act(() =>
      m.options.register?.onError?.({
        message: "NAME_REQUIRED",
        data: { code: "PRECONDITION_FAILED" },
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Your name for the organizer" }),
    ).toBeInTheDocument();
  });

  it("refreshes the session after registering, so it never asks again", () => {
    renderButton();
    act(() =>
      m.options.register?.onSuccess?.({
        alreadyRegistered: false,
        checkoutUrl: null,
        registration: { status: "registered" },
      }),
    );
    expect(m.refetchSession).toHaveBeenCalled();
  });

  it("speaks Dutch", () => {
    renderButton("nl");
    expect(
      screen.getByText(/De organisator ziet je naam en e-mailadres/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    expect(screen.getByLabelText("Voornaam")).toHaveValue("Jan");
  });
});

const QUESTIONS = [
  {
    id: "hope",
    type: "long_text" as const,
    label: "What do you hope to learn?",
    required: true,
  },
  {
    id: "level",
    type: "single_choice" as const,
    label: "Your AI experience",
    required: false,
    options: [
      { id: "new", label: "New to it" },
      { id: "pro", label: "Daily" },
    ],
  },
];
const FUTURE = {
  date: "2099-11-02T00:00:00.000Z",
  startTime: "19:00",
  timezone: "Europe/Amsterdam",
};
const PAST = { ...FUTURE, date: "2020-01-01T00:00:00.000Z" };

function renderWithQuestions(timing = FUTURE) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <EventRegisterButton eventId={7} questions={QUESTIONS} timing={timing} />
    </NextIntlClientProvider>,
  );
}

describe("EventRegisterButton — the organizer's questions", () => {
  beforeEach(() => {
    m.user = { id: "u1", name: "Ada", firstName: "Ada", lastName: "Lovelace" };
  });

  it("asks the questions before registering, even when names are known", () => {
    renderWithQuestions();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(m.register).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "A few questions from the organizer",
    });
    expect(within(dialog).queryByLabelText("First name")).toBeNull();
    expect(dialog).toHaveTextContent(/The organizer will see/);
  });

  it("sends the answers, cleaned, with the registration", () => {
    renderWithQuestions();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.change(screen.getByLabelText(/What do you hope to learn\?/), {
      target: { value: "  Agents " },
    });
    fireEvent.click(screen.getByLabelText("Daily"));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    expect(m.register).toHaveBeenCalledWith({
      eventId: 7,
      answers: { hope: "Agents", level: "pro" },
    });
  });

  it("does not register without a required answer, and says which", () => {
    renderWithQuestions();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    expect(m.register).not.toHaveBeenCalled();
    expect(
      screen.getByText("Please answer this question."),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/What do you hope to learn\?/),
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("reloads the questions when the organizer changed them meanwhile", () => {
    renderWithQuestions();
    act(() =>
      m.options.register?.onError?.({
        message: "ANSWERS_INVALID",
        data: { code: "BAD_REQUEST" },
      }),
    );
    expect(m.refresh).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lets a registered member edit their answers until the event starts", () => {
    m.status = { status: "registered", answers: { hope: "Agents" } };
    renderWithQuestions();
    fireEvent.click(screen.getByRole("button", { name: "Edit my answers" }));

    const dialog = screen.getByRole("dialog", { name: "Your answers" });
    const hope = within(dialog).getByLabelText(/What do you hope to learn\?/);
    expect(hope).toHaveValue("Agents");
    fireEvent.change(hope, { target: { value: "Evals" } });
    fireEvent.submit(dialog.querySelector("form")!);

    expect(m.updateAnswers).toHaveBeenCalledWith({
      eventId: 7,
      answers: { hope: "Evals" },
    });
  });

  it("offers no editing once the event has started", () => {
    m.status = { status: "registered", answers: {} };
    renderWithQuestions(PAST);
    expect(
      screen.queryByRole("button", { name: "Edit my answers" }),
    ).toBeNull();
  });
});

describe("redesigned RSVP", () => {
  beforeEach(() => {
    m.redesign = true;
  });

  it("hydrates even when the session resolves before the RSVP hydrates", () => {
    m.user = null;
    m.sessionPending = true;
    const component = (
      <NextIntlClientProvider locale="en" messages={en}>
        <EventRegisterButton eventId={7} timing={FUTURE} />
      </NextIntlClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(component);
    expect(within(container).getByLabelText("Loading your RSVP")).toBeTruthy();

    m.sessionPending = false;
    const onRecoverableError = vi.fn();
    render(component, { container, hydrate: true, onRecoverableError });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(
      within(container).getByRole("button", { name: "Sign in to RSVP" }),
    ).toBeEnabled();
  });

  it("confirms a cancellation inline and leaves RSVP available", () => {
    m.status = { status: "registered" };
    const component = () => (
      <NextIntlClientProvider locale="en" messages={en}>
        <EventRegisterButton eventId={7} timing={FUTURE} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(component());
    fireEvent.click(screen.getByText("Manage RSVP"));
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel registration" }),
    );
    act(() => m.options.cancel?.onSuccess?.(undefined));
    m.status = null;
    rerender(component());

    expect(screen.getByRole("status")).toHaveTextContent(
      "Registration cancelled",
    );
    expect(screen.getByRole("button", { name: "RSVP" })).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("uses the existing required answers and shows a confirmed RSVP after registration", () => {
    m.user = {
      id: "u1",
      name: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
    };
    const component = () => (
      <NextIntlClientProvider locale="en" messages={en}>
        <EventRegisterButton
          eventId={7}
          questions={QUESTIONS}
          timing={FUTURE}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(component());
    fireEvent.click(screen.getByRole("button", { name: "RSVP" }));
    const dialog = screen.getByRole("dialog", { name: "RSVP for this event" });
    const confirm = within(dialog).getByRole("button", {
      name: "Confirm RSVP",
    });
    fireEvent.click(confirm);
    expect(m.register).not.toHaveBeenCalled();
    fireEvent.change(
      within(dialog).getByLabelText(/What do you hope to learn/),
      { target: { value: "Time zones" } },
    );
    fireEvent.click(confirm);
    expect(m.register).toHaveBeenCalledWith({
      eventId: 7,
      answers: { hope: "Time zones" },
    });

    m.status = { status: "registered" };
    act(() => m.options.register?.onSuccess?.({ registration: m.status }));
    rerender(component());
    expect(screen.getByRole("status")).toHaveTextContent("You’re going");
    expect(screen.getByRole("status")).toHaveTextContent("02 Nov 2099");
    fireEvent.click(screen.getByText("Manage RSVP"));
    expect(
      screen.getByRole("button", { name: "Edit my answers" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cancel registration" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the ended state without offering a new RSVP or changes to a past registration", () => {
    m.status = { status: "registered" };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <EventRegisterButton
          eventId={7}
          ended
          questions={QUESTIONS}
          timing={PAST}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("This event has ended")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Manage RSVP")).not.toBeInTheDocument();
  });

  it("shows a cancelled event without a registration prompt", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <EventRegisterButton eventId={7} cancelled />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText("This event has been cancelled."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("allows withdrawal of an external intent after the event is cancelled", () => {
    m.status = { status: "intent" };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <EventRegisterButton
          eventId={7}
          isExternal
          cancelled
          sourceUrl="https://example.org/event"
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText("This event has been cancelled."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove from My Events" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Register on event site" }),
    ).not.toBeInTheDocument();
  });

  it("preserves the external registration link for guests", () => {
    m.user = null;
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <EventRegisterButton
          eventId={7}
          isExternal
          sourceUrl="https://example.org/event"
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Register on event site" }),
    ).toHaveAttribute("href", "https://example.org/event");
    expect(
      screen.getByRole("button", { name: "Sign in to mark as going" }),
    ).toBeInTheDocument();
  });
});
