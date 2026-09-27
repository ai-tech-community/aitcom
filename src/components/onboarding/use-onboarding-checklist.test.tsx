import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "@/test/memory-storage";
import type { OnboardingStatus } from "./checklist-view";

type MutationOptions = {
  onMutate?: () => unknown;
  onSuccess?: () => void;
  onError?: (error: unknown, input: unknown, context: unknown) => void;
  onSettled?: () => void;
};

const fake = vi.hoisted(() => ({
  status: undefined as OnboardingStatus | undefined,
  calls: {
    sync: 0,
    complete: [] as unknown[],
    dismiss: 0,
    invalidate: 0,
  },
  dismissFails: false,
}));

vi.mock("@/trpc/react", () => {
  function mutation(name: "sync" | "complete" | "dismiss") {
    return (options: MutationOptions = {}) => ({
      mutate: (input?: unknown) => {
        void (async () => {
          const context = await options.onMutate?.();
          if (name === "sync") fake.calls.sync += 1;
          if (name === "complete") fake.calls.complete.push(input);
          if (name === "dismiss") fake.calls.dismiss += 1;
          if (name === "dismiss" && fake.dismissFails) {
            options.onError?.(new Error("nope"), input, context);
          } else {
            options.onSuccess?.();
          }
          options.onSettled?.();
        })();
      },
    });
  }
  const syncMutation = mutation("sync");
  const completeMutation = mutation("complete");
  const dismissMutation = mutation("dismiss");
  const utils = {
    onboarding: {
      getStatus: {
        invalidate: () => {
          fake.calls.invalidate += 1;
        },
        cancel: async () => undefined,
        getData: () => fake.status,
        setData: (
          _input: unknown,
          next:
            | OnboardingStatus
            | ((old: OnboardingStatus | undefined) => OnboardingStatus),
        ) => {
          fake.status = typeof next === "function" ? next(fake.status) : next;
        },
      },
    },
  };
  return {
    api: {
      useUtils: () => utils,
      onboarding: {
        getStatus: {
          useQuery: () => ({ data: fake.status, isLoading: !fake.status }),
        },
        syncAutoDetected: { useMutation: syncMutation },
        completeStep: { useMutation: completeMutation },
        dismiss: { useMutation: dismissMutation },
      },
    },
  };
});

import {
  LEGACY_DISMISS_KEY,
  useOnboardingChecklist,
} from "./use-onboarding-checklist";

const step = (slug: string, completed: boolean) => ({
  slug,
  labelKey: slug,
  href: `/${slug}`,
  completed,
});

// Loose overrides: getStatus returns a union, so Partial<> of it is too narrow.
function status(overrides: Record<string, unknown> = {}): OnboardingStatus {
  return {
    hasProfile: true,
    hasIntent: true,
    onboardingCompleted: false,
    dismissed: false,
    checklist: [step("a", true), step("b", false)],
    ...overrides,
  } as OnboardingStatus;
}

// Let queued microtasks (fake mutations) settle inside act().
const flush = () => act(() => Promise.resolve());

beforeEach(() => {
  fake.status = status();
  fake.calls = { sync: 0, complete: [], dismiss: 0, invalidate: 0 };
  fake.dismissFails = false;
  vi.stubGlobal("localStorage", createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOnboardingChecklist", () => {
  it("derives the view from the server status", () => {
    const { result } = renderHook(() =>
      useOnboardingChecklist({ sync: "off" }),
    );
    expect(result.current.view).toMatchObject({
      kind: "checklist",
      completedCount: 1,
      totalCount: 2,
    });
  });

  it('"on-mount" syncs auto-detected steps once while onboarding is open', async () => {
    const { rerender } = renderHook(() =>
      useOnboardingChecklist({ sync: "on-mount" }),
    );
    rerender();
    await flush();
    expect(fake.calls.sync).toBe(1);
  });

  it('"on-finish" does not sync while steps are still open', async () => {
    renderHook(() => useOnboardingChecklist({ sync: "on-finish" }));
    await flush();
    expect(fake.calls.sync).toBe(0);
  });

  it('"on-finish" syncs when every step reads done so the server can close onboarding', async () => {
    fake.status = status({ checklist: [step("a", true), step("b", true)] });
    renderHook(() => useOnboardingChecklist({ sync: "on-finish" }));
    await flush();
    expect(fake.calls.sync).toBe(1);
  });

  it('"off" never syncs', async () => {
    fake.status = status({ checklist: [step("a", true), step("b", true)] });
    renderHook(() => useOnboardingChecklist({ sync: "off" }));
    await flush();
    expect(fake.calls.sync).toBe(0);
  });

  it("completeStep sends the step slug", async () => {
    const { result } = renderHook(() =>
      useOnboardingChecklist({ sync: "off" }),
    );
    act(() => result.current.completeStep("b"));
    await flush();
    expect(fake.calls.complete).toEqual([{ stepSlug: "b" }]);
  });

  it("dismiss calls the account mutation and hides at once", async () => {
    const { result } = renderHook(() =>
      useOnboardingChecklist({ sync: "off" }),
    );
    act(() => result.current.dismiss());
    await flush();
    expect(fake.calls.dismiss).toBe(1);
    expect(fake.status?.dismissed).toBe(true);
    expect(fake.calls.invalidate).toBeGreaterThan(0);
  });

  it("rolls the optimistic hide back when the server write fails", async () => {
    fake.dismissFails = true;
    const { result } = renderHook(() =>
      useOnboardingChecklist({ sync: "off" }),
    );
    act(() => result.current.dismiss());
    await flush();
    expect(fake.status?.dismissed).toBe(false);
  });

  it("carries an old browser-only dismissal over to the account, once", async () => {
    window.localStorage.setItem(LEGACY_DISMISS_KEY, "true");
    const { rerender } = renderHook(() =>
      useOnboardingChecklist({ sync: "off" }),
    );
    rerender();
    await flush();
    expect(fake.calls.dismiss).toBe(1);
    expect(window.localStorage.getItem(LEGACY_DISMISS_KEY)).toBeNull();
  });

  it("only clears the old flag when the account is already dismissed", async () => {
    fake.status = status({ dismissed: true });
    window.localStorage.setItem(LEGACY_DISMISS_KEY, "true");
    renderHook(() => useOnboardingChecklist({ sync: "off" }));
    await flush();
    expect(fake.calls.dismiss).toBe(0);
    expect(window.localStorage.getItem(LEGACY_DISMISS_KEY)).toBeNull();
  });

  it("keeps the old flag until a profile exists to store it on", async () => {
    fake.status = status({ hasProfile: false, hasIntent: false });
    window.localStorage.setItem(LEGACY_DISMISS_KEY, "true");
    renderHook(() => useOnboardingChecklist({ sync: "off" }));
    await flush();
    expect(fake.calls.dismiss).toBe(0);
    expect(window.localStorage.getItem(LEGACY_DISMISS_KEY)).toBe("true");
  });
});
