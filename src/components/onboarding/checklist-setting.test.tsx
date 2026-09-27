import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import type { OnboardingStatus } from "./checklist-view";

/**
 * Only the tRPC layer is faked. The fake keeps a "server" row and a query
 * cache with subscribers, so the real settings switch, the real dismissal
 * hook and the real floating reminder all read and write one shared cache,
 * exactly as they do through React Query in the app.
 */
const fake = vi.hoisted(() => ({
  server: {
    hasProfile: true,
    hasIntent: true,
    onboardingCompleted: false,
    dismissed: true,
    steps: [] as Array<{ slug: string; completed: boolean }>,
  },
  cache: undefined as OnboardingStatus | undefined,
  queryError: false,
  restoreFails: false,
  calls: { restore: 0, dismiss: 0 },
  /** Mutations sent but not settled; drives the hooks' isPending. */
  inflight: 0,
  /** When set, the server answers only once this promise resolves. */
  hold: null as Promise<void> | null,
  listeners: new Set<() => void>(),
}));

vi.mock("@/trpc/react", async () => {
  const emit = () => fake.listeners.forEach((listener) => listener());

  // What onboarding.getStatus returns for the current server row.
  function serverStatus(): OnboardingStatus {
    const s = fake.server;
    const hidden = !s.hasProfile || s.onboardingCompleted || s.dismissed;
    return {
      hasProfile: s.hasProfile,
      hasIntent: s.hasIntent,
      onboardingCompleted: s.onboardingCompleted,
      dismissed: s.dismissed,
      checklist: hidden
        ? []
        : s.steps.map((step) => ({
            slug: step.slug,
            labelKey: "readArticle",
            href: "/blog",
            completed: step.completed,
          })),
    } as OnboardingStatus;
  }

  const getStatus = {
    invalidate: async () => {
      fake.cache = serverStatus();
      emit();
    },
    cancel: async () => undefined,
    getData: () => fake.cache,
    setData: (
      _input: unknown,
      next:
        | OnboardingStatus
        | ((old: OnboardingStatus | undefined) => OnboardingStatus),
    ) => {
      fake.cache = typeof next === "function" ? next(fake.cache) : next;
      emit();
    },
  };

  type Options = {
    onMutate?: () => unknown;
    onSuccess?: () => void;
    onError?: (error: unknown, input: unknown, context: unknown) => void;
    onSettled?: () => unknown;
  };
  const mutation =
    (name: "dismiss" | "restore" | "noop") =>
    (options: Options = {}) => ({
      // Shared across mutations; enough for a switch that sends one at a time.
      isPending: useSyncExternalStore(subscribe, () => fake.inflight > 0),
      mutate: () => {
        if (name === "noop") return;
        fake.calls[name] += 1;
        fake.inflight += 1;
        emit();
        void (async () => {
          const context = await options.onMutate?.();
          if (fake.hold) await fake.hold;
          if (name === "restore" && fake.restoreFails) {
            options.onError?.(new Error("nope"), undefined, context);
          } else {
            fake.server.dismissed = name === "dismiss";
            options.onSuccess?.();
          }
          await options.onSettled?.();
          fake.inflight -= 1;
          emit();
        })();
      },
    });

  function subscribe(listener: () => void) {
    fake.listeners.add(listener);
    return () => fake.listeners.delete(listener);
  }

  return {
    api: {
      useUtils: () => ({ onboarding: { getStatus } }),
      onboarding: {
        getStatus: {
          useQuery: () => {
            const data = useSyncExternalStore(subscribe, () => fake.cache);
            return {
              data,
              // React Query v5: an errored query with no data is not pending.
              isLoading: !data && !fake.queryError,
              isPending: !data && !fake.queryError,
              isError: fake.queryError,
              refetch: getStatus.invalidate,
            };
          },
        },
        dismiss: { useMutation: mutation("dismiss") },
        restore: { useMutation: mutation("restore") },
        completeStep: { useMutation: mutation("noop") },
        syncAutoDetected: { useMutation: mutation("noop") },
      },
    },
  };
});

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard/settings",
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { ChecklistSetting } from "./checklist-setting";
import { OnboardingReminder } from "./onboarding-reminder";
import {
  HIDE_FOR_VISIT_KEY,
  resetHiddenForVisitForTests,
} from "./use-hidden-for-visit";

const STEPS = [
  { slug: "a", completed: true },
  { slug: "b", completed: false },
];

function seed(server: Partial<typeof fake.server> = {}) {
  fake.server = {
    hasProfile: true,
    hasIntent: true,
    onboardingCompleted: false,
    dismissed: true,
    steps: STEPS,
    ...server,
  };
}

async function renderSettings(locale: "en" | "nl" = "en") {
  const view = render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <main>
        <ChecklistSetting />
        <OnboardingReminder />
      </main>
    </NextIntlClientProvider>,
  );
  // First load of onboarding.getStatus.
  await act(async () => {
    fake.cache = undefined;
    fake.listeners.forEach((listener) => listener());
  });
  if (!fake.queryError) {
    const { api } = await import("@/trpc/react");
    await act(() => api.useUtils().onboarding.getStatus.invalidate());
  }
  return view;
}

const toggle = () =>
  screen.getByRole("switch", { name: "Show the getting-started checklist" });
const pill = () => screen.queryByRole("button", { name: /getting started/i });

beforeEach(() => {
  seed();
  fake.cache = undefined;
  fake.queryError = false;
  fake.restoreFails = false;
  fake.calls = { restore: 0, dismiss: 0 };
  fake.inflight = 0;
  fake.hold = null;
  fake.listeners.clear();
  toastError.mockReset();
  window.sessionStorage.clear();
  resetHiddenForVisitForTests();
});

describe("getting-started checklist setting", () => {
  it("shows the switch off for a member who chose Don't show again", async () => {
    await renderSettings();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(toggle()).toBeEnabled();
    expect(pill()).toBeNull();
  });

  it("shows the switch on while the checklist is showing", async () => {
    seed({ dismissed: false });
    await renderSettings();
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(pill()).toBeInTheDocument();
  });

  it("shows the switch on for a member without a profile row yet", async () => {
    seed({ hasProfile: false, hasIntent: false, dismissed: false });
    await renderSettings();
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("turning it on clears the dismissal and brings the reminder back without a reload", async () => {
    await renderSettings();
    fireEvent.click(toggle());

    await waitFor(() => expect(pill()).toBeInTheDocument());
    expect(fake.calls).toEqual({ restore: 1, dismiss: 0 });
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(pill()).toHaveAccessibleName(/1 of 2 steps done/);
  });

  it("turning it on also undoes an earlier 'hide until next visit'", async () => {
    window.sessionStorage.setItem(HIDE_FOR_VISIT_KEY, "1");
    await renderSettings();
    fireEvent.click(toggle());

    await waitFor(() => expect(pill()).toBeInTheDocument());
    expect(window.sessionStorage.getItem(HIDE_FOR_VISIT_KEY)).toBeNull();
  });

  it("shows the switch off, with the reason, when hidden only for this visit", async () => {
    seed({ dismissed: false });
    window.sessionStorage.setItem(HIDE_FOR_VISIT_KEY, "1");
    await renderSettings();

    expect(pill()).toBeNull();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(toggle()).toHaveAccessibleDescription(
      en.onboarding.setting.hiddenForVisit,
    );
  });

  it("turning it on after 'Hide until next visit' shows the pill without a server call", async () => {
    seed({ dismissed: false });
    window.sessionStorage.setItem(HIDE_FOR_VISIT_KEY, "1");
    await renderSettings();
    fireEvent.click(toggle());

    await waitFor(() => expect(pill()).toBeInTheDocument());
    expect(fake.calls).toEqual({ restore: 0, dismiss: 0 });
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(window.sessionStorage.getItem(HIDE_FOR_VISIT_KEY)).toBeNull();
  });

  it("follows 'Hide until next visit' chosen in the pill", async () => {
    seed({ dismissed: false });
    await renderSettings();
    fireEvent.click(pill()!);
    fireEvent.click(
      screen.getByRole("button", { name: "Hide until next visit" }),
    );

    await waitFor(() => expect(pill()).toBeNull());
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(fake.calls).toEqual({ restore: 0, dismiss: 0 });
  });

  it("keeps focus on the switch and stays enabled while saving", async () => {
    let release!: () => void;
    fake.hold = new Promise((resolve) => (release = resolve));
    await renderSettings();
    toggle().focus();
    fireEvent.click(toggle());

    await waitFor(() => expect(toggle()).toHaveAttribute("aria-busy", "true"));
    expect(toggle()).toBeEnabled();
    expect(toggle()).toHaveFocus();

    await act(async () => release());
    await waitFor(() => expect(toggle()).not.toHaveAttribute("aria-busy"));
    expect(toggle()).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("ignores a second change while the first is still saving", async () => {
    let release!: () => void;
    fake.hold = new Promise((resolve) => (release = resolve));
    await renderSettings();
    fireEvent.click(toggle());
    await waitFor(() => expect(toggle()).toHaveAttribute("aria-busy", "true"));

    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(fake.calls).toEqual({ restore: 1, dismiss: 0 });

    await act(async () => release());
    await waitFor(() => expect(pill()).toBeInTheDocument());
    expect(fake.calls).toEqual({ restore: 1, dismiss: 0 });
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("turning it off records Don't show again and hides the reminder", async () => {
    seed({ dismissed: false });
    await renderSettings();
    fireEvent.click(toggle());

    await waitFor(() => expect(pill()).toBeNull());
    expect(fake.calls).toEqual({ restore: 0, dismiss: 1 });
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });

  it("rolls back and says so when turning it on fails", async () => {
    fake.restoreFails = true;
    await renderSettings();
    fireEvent.click(toggle());

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Couldn't turn the checklist back on. Please try again.",
      ),
    );
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(pill()).toBeNull();
  });

  it("is disabled with the reason once every step is done", async () => {
    seed({ onboardingCompleted: true, dismissed: false });
    await renderSettings();
    expect(toggle()).toBeDisabled();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(toggle()).toHaveAccessibleDescription(
      "You finished every step, so there is nothing left to show.",
    );
  });

  it("describes what the switch controls", async () => {
    await renderSettings();
    expect(toggle()).toHaveAccessibleDescription(en.onboarding.setting.hint);
  });

  it("shows an error with a way to retry when the status cannot load", async () => {
    fake.queryError = true;
    await renderSettings();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again|retry/i }),
    ).toBeInTheDocument();
  });

  it("renders in Dutch", async () => {
    await renderSettings("nl");
    expect(
      screen.getByRole("switch", { name: nl.onboarding.setting.label }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /aan de slag/i }),
    ).toBeInTheDocument();
  });
});

describe("checklist setting i18n", () => {
  it("has the same keys in EN and NL, all filled in and different", () => {
    const enSetting = en.onboarding.setting as Record<string, string>;
    const nlSetting = nl.onboarding.setting as Record<string, string>;
    expect(Object.keys(nlSetting).sort()).toEqual(
      Object.keys(enSetting).sort(),
    );
    for (const key of Object.keys(enSetting)) {
      expect(enSetting[key]!.trim()).not.toBe("");
      expect(nlSetting[key]!.trim()).not.toBe("");
      expect(nlSetting[key]).not.toBe(enSetting[key]);
    }
  });
});
