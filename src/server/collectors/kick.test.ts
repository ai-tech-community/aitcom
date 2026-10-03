import { describe, expect, it } from "vitest";

import { workerUrl } from "./kick";

const PATH = "/api/cron/collector-worker";

describe("workerUrl", () => {
  it("uses the production domain in production", () => {
    expect(
      workerUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "aitcommunity.org",
        VERCEL_URL: "aitcom-abc123.vercel.app",
        NEXT_PUBLIC_APP_URL: "https://app.example",
      }),
    ).toBe(`https://aitcommunity.org${PATH}`);
  });

  it("uses the deployment URL outside production", () => {
    expect(
      workerUrl({
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "aitcommunity.org",
        VERCEL_URL: "aitcom-abc123.vercel.app",
      }),
    ).toBe(`https://aitcom-abc123.vercel.app${PATH}`);
  });

  it("uses the deployment URL in production when no production domain is set", () => {
    expect(
      workerUrl({
        VERCEL_ENV: "production",
        VERCEL_URL: "aitcom-abc123.vercel.app",
      }),
    ).toBe(`https://aitcom-abc123.vercel.app${PATH}`);
  });

  it("falls back to the app URL off Vercel", () => {
    expect(workerUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe(
      `http://localhost:3000${PATH}`,
    );
  });

  it("gives no target when nothing is configured", () => {
    expect(workerUrl({})).toBeNull();
  });
});
