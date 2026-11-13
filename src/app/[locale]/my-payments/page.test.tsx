import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("@/i18n/navigation", () => ({ permanentRedirect: redirect }));

import MyPaymentsPage from "./page";

describe("legacy payments URL", () => {
  it.each(["en", "nl", "fr"])(
    "redirects to the dashboard while preserving %s",
    async (locale) => {
      await MyPaymentsPage({ params: Promise.resolve({ locale }) });
      expect(redirect).toHaveBeenLastCalledWith({
        href: "/dashboard/payments",
        locale,
      });
    },
  );
});
