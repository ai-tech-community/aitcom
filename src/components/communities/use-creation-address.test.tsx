import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RouterOutputs } from "@/trpc/react";
import { useCreationAddress } from "./use-creation-address";

type Availability = RouterOutputs["communities"]["isSlugAvailable"];

const { lookup } = vi.hoisted(() => ({
  lookup: vi.fn<(input: { slug: string }) => Promise<Availability>>(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      client: { communities: { isSlugAvailable: { query: lookup } } },
    }),
  },
}));

function renderAddress(
  initialProps: { name: string; customAddress: string | null },
  availability: Record<string, Availability> = {},
) {
  lookup.mockImplementation(async ({ slug }) => {
    return availability[slug] ?? { available: true };
  });
  const client = new QueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  return renderHook(
    (props) =>
      useCreationAddress({
        ...props,
        conflict: false,
        suffixes: ["Club", "Collective"],
      }),
    { initialProps, wrapper: Wrapper },
  );
}

beforeEach(() => {
  lookup.mockReset();
});

describe("useCreationAddress", () => {
  it("debounces edits and checks only the final valid address", async () => {
    const { result, rerender } = renderAddress({
      name: "",
      customAddress: null,
    });
    rerender({ name: "Sketch Club", customAddress: "Not valid" });
    expect(result.current.status).toBe("invalid");
    rerender({ name: "Sketch Club", customAddress: "first-address" });
    rerender({ name: "Sketch Club", customAddress: "final-address" });

    expect(result.current.status).toBe("checking");
    expect(lookup).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toBe("clear"));
    expect(lookup).toHaveBeenCalledExactlyOnceWith(
      { slug: "final-address" },
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("uses the same lookup for the address, alternatives, and the name's address", async () => {
    const { result, rerender } = renderAddress(
      { name: "Craft Circle", customAddress: "retired-address" },
      {
        "retired-address": { available: false, reason: "taken" },
        "craft-circle": { available: false, reason: "taken" },
        "craft-circle-club": { available: false, reason: "taken" },
      },
    );

    await waitFor(() =>
      expect(result.current.alternatives).toEqual(["craft-circle-collective"]),
    );
    expect(result.current.status).toBe("taken");
    expect(result.current.canUseNameAddress).toBe(false);
    expect(lookup.mock.calls.map(([input]) => input.slug)).toEqual(
      expect.arrayContaining([
        "retired-address",
        "craft-circle",
        "craft-circle-club",
      ]),
    );

    rerender({ name: "Open Atelier", customAddress: "retired-address" });
    await waitFor(() => expect(result.current.canUseNameAddress).toBe(true));
    expect(lookup).toHaveBeenCalledWith(
      { slug: "open-atelier" },
      expect.anything(),
    );
  });
});
