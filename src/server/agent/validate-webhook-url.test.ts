import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ v4: [] as string[], v6: [] as string[] }));
vi.mock("node:dns/promises", () => {
  const resolvers = {
    resolve4: async () => dns.v4,
    resolve6: async () => dns.v6,
  };
  // Node built-ins are also imported through their default export.
  return { ...resolvers, default: resolvers };
});

import {
  validateWebhookUrl,
  validateWebhookUrlSync,
} from "./validate-webhook-url";

beforeEach(() => {
  dns.v4 = ["93.184.216.34"];
  dns.v6 = [];
});

describe("validateWebhookUrl", () => {
  it.each([
    "https://[::]/",
    "https://[64:ff9b::7f00:1]/",
    "https://[2002:7f00:1::1]/",
    "https://224.0.0.1/",
    "https://240.0.0.1/",
    "https://198.18.0.1/",
    "https://[::ffff:10.0.0.1]/",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
  ])("refuses the internal literal %s", (url) => {
    expect(validateWebhookUrlSync(url).ok).toBe(false);
  });

  it("refuses a hostname that resolves to a benchmarking address", async () => {
    dns.v4 = ["198.18.0.7"];
    expect(await validateWebhookUrl("https://hooks.example/")).toEqual({
      ok: false,
      reason: "Webhook hostname resolves to a private/internal IP address",
    });
  });

  it("refuses a hostname with an IPv6 transition address", async () => {
    dns.v4 = [];
    dns.v6 = ["64:ff9b::a00:1"];
    expect((await validateWebhookUrl("https://hooks.example/")).ok).toBe(false);
  });

  it("allows a public https URL", async () => {
    expect(await validateWebhookUrl("https://hooks.example/path")).toEqual({
      ok: true,
    });
  });

  it("keeps refusing http and localhost with the same reasons", async () => {
    expect(await validateWebhookUrl("http://hooks.example/")).toEqual({
      ok: false,
      reason: "Webhook URL must use HTTPS",
    });
    expect(await validateWebhookUrl("https://localhost/")).toEqual({
      ok: false,
      reason: "Webhook URL must not point to localhost",
    });
  });
});
