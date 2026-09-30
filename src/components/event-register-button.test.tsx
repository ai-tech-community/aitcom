// What the register button hands the server (ADR-0038): names are asked
// once, pre-filled from the current name, and sent with the registration;
// an account that has them registers straight away; everyone sees what the
// organizer will see before registering.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
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
  register: vi.fn(),
  updateAnswers: vi.fn(),
  status: null as null | { status: string; answers?: Record<string, unknown> },
  refresh: vi.fn(),
  refetchSession: vi.fn(),
  options: {} as Record<string, MutationOptions>,
}));

vi.mock("@/server/better-auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: m.user ? { user: m.user } : null,
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
  m.register.mockReset();
  m.updateAnswers.mockReset();
  m.refresh.mockReset();
  m.status = null;
  m.refetchSession.mockReset();
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
