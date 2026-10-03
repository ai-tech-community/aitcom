# Pinned Outbound Connections (#419) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every outbound request to a member- or agent-supplied URL connects only to an address that passed our public-address check — closing the DNS-rebinding window (#419), the gaps in today's private-address check, and webhook delivery's redirect hole.

**Architecture:** One address policy (`isPublicAddress`, built on `ipaddr.js`) and one pinned transport (`pinnedFetch`: undici's own `fetch` plus one shared undici `Agent` whose `connect.lookup` checks every DNS answer and hands only checked answers to the socket — the check and the connection use the same answer). `safeFetch` (link previews, feed images, event import, data collectors) and webhook delivery (event delivery and the "test webhook" action) both go through `pinnedFetch` with `redirect: "manual"`. `validateWebhookUrl` keeps its public shape and friendly reasons but delegates address decisions to the policy.

**Tech Stack:** Node (CI 20, Vercel 24, local 26), `undici@^7` (its own `fetch` + `Agent`, version-consistent on all three), `ipaddr.js@^2`, Vitest.

**Spec / issue:** GitHub issue #419; `docs/adr/0040-data-collectors-are-built-in-strategies-run-from-a-queued-command.md` and `docs/superpowers/specs/2026-10-03-data-collectors-design.md` ("Gate before enabling"). Research evidence (undici/Node compatibility matrix, Payload's identical pattern in `node_modules/payload/dist/uploads/safeFetch.js`) is summarised under "Why this design".

## Why this design

- Passing an npm-`undici` `Agent` to Node's **global** `fetch` breaks across Node versions (undici 6 Agent fails on Node 26; undici 8 crashes on Node 20). Using undici's **own** `fetch` with its own `Agent` is version-consistent. Node 20 (CI) and 24 (Vercel) both work with `undici@7`; undici 8 needs Node ≥ 22.19, so pin `^7`.
- The lookup checks **every** answer (Happy Eyeballs asks with `all: true`) and refuses if any answer is not public. TLS SNI and certificate checks still use the URL's hostname.
- IP-literal URLs skip `lookup`, so the literal check before the request stays.
- `validateWebhookUrl`'s separate `resolve4`/`resolve6` check uses a different resolver than the connection (`getaddrinfo` also reads `/etc/hosts`), so it can never close the gap by itself; it stays only for early, friendly errors.
- Today's string-prefix checks miss `::`, `64:ff9b::/96`, `2002::/16`, `224.0.0.0/4`, `240.0.0.0/4`, `198.18.0.0/15` and more. `ipaddr.js`'s `range() === "unicast"` is the accepted rule (Payload uses it).
- Webhook delivery uses global `fetch`, which follows redirects: a public webhook URL can redirect the POST into an internal address after validation. Manual redirects (a 3xx is a failed delivery) close that.

## Global Constraints

- Branch: `fix/safe-fetch-ip-pinning` from `origin/main`. Commit steps start with `git branch --show-current`. Never `git checkout`/`switch`/`stash`/`add -A`/`add .`. No AI-credit lines. PR body ends with `Closes #419`.
- Dependencies: `undici@^7.22.0`, `ipaddr.js@^2.2.0` as direct production dependencies.
- Public rule: an address is allowed only if `ipaddr.process(ip).range() === "unicast"` (IPv4-mapped IPv6 is converted first). Anything unparsable is refused.
- Every request through `pinnedFetch` uses `redirect: "manual"`.
- No behaviour change for callers beyond refusing more internal addresses: same user agents, timeouts, error messages where they exist, same redirect handling in `safeFetch`.
- Tests that stubbed global `fetch` for these code paths mock `@/server/net/pinned-transport` instead; never weaken an assertion.
- Never run `pnpm build`; never point anything at `.env`'s `DATABASE_URL`. DB tests only with: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`.
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.

## Review Focus

1. **A hostname whose DNS answers include one private address among public ones** → refused before any connection. Task 1.
2. **A hostname that answers public at check time and private at connect time** (rebinding) → the connection never reaches the private address, because the connect step does the check. Task 1 (real socket test).
3. **A webhook URL that redirects (302) to an internal address** → delivery fails, the redirect is not followed. Task 3.
4. **IPv4-mapped IPv6, NAT64, 6to4 and multicast literals in a URL** → refused by the literal check. Task 1.
5. **Existing link previews, feed images, event import and collectors** keep working against public hosts (their existing tests pass unchanged in meaning). Task 2.

---

### Task 1: Address policy and pinned transport

**Files:**
- Create: `src/server/net/address-policy.ts`, `src/server/net/address-policy.test.ts`, `src/server/net/pinned-transport.ts`, `src/server/net/pinned-transport.test.ts`
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces:
  - `isPublicAddress(ip: string): boolean`
  - `class BlockedAddressError extends Error { hostname: string }`
  - `type Resolver = (hostname: string, options: LookupOptions, callback: LookupCallback) => void` (the `node:dns` `lookup` shape)
  - `createPinnedLookup(resolve?: Resolver, isAllowed?: (ip: string) => boolean)` → a `connect.lookup` function
  - `createPinnedFetch(options?: { resolve?: Resolver; isAllowed?: (ip: string) => boolean })` → `(url: string | URL, init?: RequestInit) => Promise<Response>` (undici types)
  - `pinnedFetch` = `createPinnedFetch()` (the shared instance)

- [ ] **Step 1: Add dependencies**

Run: `pnpm add undici@^7.22.0 ipaddr.js@^2.2.0`
Expected: both under `dependencies`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/server/net/address-policy.test.ts
import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./address-policy";

describe("isPublicAddress", () => {
  it.each([
    "93.184.216.34",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:80b::200e",
  ])("allows the public address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    ["loopback", "127.0.0.1"],
    ["private 10/8", "10.1.2.3"],
    ["private 172.16/12", "172.20.0.1"],
    ["private 192.168/16", "192.168.1.1"],
    ["link-local / metadata", "169.254.169.254"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["this network", "0.0.0.0"],
    ["benchmarking 198.18/15", "198.18.0.1"],
    ["multicast", "224.0.0.1"],
    ["reserved 240/4", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["IPv6 unspecified", "::"],
    ["IPv6 loopback", "::1"],
    ["IPv6 unique local", "fd00::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 multicast", "ff02::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped private", "::ffff:10.0.0.1"],
    ["NAT64", "64:ff9b::7f00:1"],
    ["6to4", "2002:7f00:1::1"],
    ["Teredo", "2001::1"],
    ["documentation", "2001:db8::1"],
    ["not an address", "example.com"],
    ["empty", ""],
  ])("refuses %s (%s)", (_label, ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it("judges an IPv4-mapped public address by its IPv4 part", () => {
    expect(isPublicAddress("::ffff:93.184.216.34")).toBe(true);
  });
});
```

```ts
// src/server/net/pinned-transport.test.ts
// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { BlockedAddressError, createPinnedFetch, createPinnedLookup, type Resolver } from "./pinned-transport";

function resolverReturning(addresses: { address: string; family: 4 | 6 }[]): Resolver {
  return vi.fn((_host, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  }) as unknown as Resolver;
}

function lookupOnce(lookup: ReturnType<typeof createPinnedLookup>, all: boolean) {
  return new Promise<{ err: Error | null; address: unknown; family?: number }>((resolve) => {
    lookup("example.test", { all }, (err, address, family) => resolve({ err, address, family }));
  });
}

describe("pinned lookup", () => {
  it("hands every checked answer to the connection", async () => {
    const lookup = createPinnedLookup(resolverReturning([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]));
    const result = await lookupOnce(lookup, true);
    expect(result.err).toBeNull();
    expect(result.address).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });

  it("answers the single-address form too", async () => {
    const lookup = createPinnedLookup(resolverReturning([{ address: "93.184.216.34", family: 4 }]));
    const result = await lookupOnce(lookup, false);
    expect([result.err, result.address, result.family]).toEqual([null, "93.184.216.34", 4]);
  });

  it("refuses the whole answer if any address is not public", async () => {
    const lookup = createPinnedLookup(resolverReturning([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]));
    const result = await lookupOnce(lookup, true);
    expect(result.err).toBeInstanceOf(BlockedAddressError);
    expect((result.err as BlockedAddressError).hostname).toBe("example.test");
  });

  it("passes DNS errors through", async () => {
    const failing = vi.fn((_h, _o, cb) => cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }))) as unknown as Resolver;
    const result = await lookupOnce(createPinnedLookup(failing), true);
    expect(result.err?.message).toBe("ENOTFOUND");
  });
});

describe("pinned fetch (real sockets)", () => {
  let server: Server;
  let port = 0;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.headers.host ?? "");
      res.writeHead(302, { location: "http://example.test/next" });
      res.end("moved");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("connects to the address the lookup checked, never re-resolving", async () => {
    // The policy here allows loopback only to prove the socket uses the pinned
    // answer: "example.test" does not exist in real DNS.
    const fetch = createPinnedFetch({
      resolve: resolverReturning([{ address: "127.0.0.1", family: 4 }]),
      isAllowed: (ip) => ip === "127.0.0.1",
    });
    const res = await fetch(`http://example.test:${port}/`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://example.test/next");
    expect(hits).toContain(`example.test:${port}`);
  });

  it("never connects when the answer is not public", async () => {
    const before = hits.length;
    const fetch = createPinnedFetch({ resolve: resolverReturning([{ address: "127.0.0.1", family: 4 }]) });
    await expect(fetch(`http://example.test:${port}/`)).rejects.toBeDefined();
    expect(hits.length).toBe(before);
  });

  it("never follows redirects", async () => {
    const fetch = createPinnedFetch({
      resolve: resolverReturning([{ address: "127.0.0.1", family: 4 }]),
      isAllowed: () => true,
    });
    const before = hits.length;
    const res = await fetch(`http://example.test:${port}/`, { redirect: "follow" });
    expect(res.status).toBe(302);
    expect(hits.length).toBe(before + 1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/net/address-policy.test.ts src/server/net/pinned-transport.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

```ts
// src/server/net/address-policy.ts
import ipaddr from "ipaddr.js";

/**
 * May we open a connection to this IP? Only ordinary public unicast
 * addresses: never loopback, private, link-local (cloud metadata),
 * carrier-grade NAT, multicast, reserved, documentation, benchmarking, or
 * IPv6 transition ranges (NAT64, 6to4, Teredo) that can tunnel to them.
 * IPv4-mapped IPv6 is judged by its IPv4 part. Anything unparsable is refused.
 */
export function isPublicAddress(ip: string): boolean {
  if (!ip || !ipaddr.isValid(ip)) return false;
  try {
    return ipaddr.process(ip).range() === "unicast";
  } catch {
    return false;
  }
}
```

Check while implementing: if `ipaddr.process("2001:db8::1").range()` or any refused row in the test table returns `"unicast"` in the installed `ipaddr.js`, add that range explicitly with `ipaddr.parseCIDR` and a comment naming it — the table is the contract.

```ts
// src/server/net/pinned-transport.ts
import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions, type LookupOneOptions } from "node:dns";

import { Agent, fetch as undiciFetch, type RequestInit, type Response } from "undici";

import { isPublicAddress } from "./address-policy";

export type LookupOptions = LookupOneOptions | LookupAllOptions;
export type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;
export type Resolver = (hostname: string, options: LookupOptions, callback: LookupCallback) => void;

/** A connection was refused because DNS answered with a non-public address. */
export class BlockedAddressError extends Error {
  constructor(readonly hostname: string) {
    super(`Refusing to connect to ${hostname}: it resolves to a non-public address`);
    this.name = "BlockedAddressError";
  }
}

/**
 * The connect-time DNS step: resolve once, check every answer, and give the
 * socket only answers that passed. The check and the connection use the same
 * answer, so a DNS server cannot switch to an internal address in between.
 */
export function createPinnedLookup(
  resolve: Resolver = dnsLookup as unknown as Resolver,
  isAllowed: (ip: string) => boolean = isPublicAddress,
) {
  return (hostname: string, options: LookupOptions, callback: LookupCallback): void => {
    resolve(hostname, { ...options, all: true }, (err, address) => {
      if (err) {
        callback(err, []);
        return;
      }
      const answers = (Array.isArray(address) ? address : []) as LookupAddress[];
      if (answers.length === 0 || answers.some((a) => !isAllowed(a.address))) {
        callback(new BlockedAddressError(hostname), []);
        return;
      }
      if ((options as LookupAllOptions).all) callback(null, answers);
      else callback(null, answers[0]!.address, answers[0]!.family);
    });
  };
}

/**
 * undici's own fetch with one pinned Agent (its own Agent, so the pair is
 * version-consistent on every Node we run). Redirects are never followed:
 * callers that follow them do it hop by hop, so each hop is checked again.
 */
export function createPinnedFetch(options: {
  resolve?: Resolver;
  isAllowed?: (ip: string) => boolean;
} = {}) {
  const dispatcher = new Agent({
    connect: { lookup: createPinnedLookup(options.resolve, options.isAllowed) },
  });
  return (url: string | URL, init: RequestInit = {}): Promise<Response> =>
    undiciFetch(url, { ...init, dispatcher, redirect: "manual" });
}

/** The shared pinned fetch for every outbound request to a supplied URL. */
export const pinnedFetch = createPinnedFetch();
```

If undici's `connect.lookup` type does not accept this signature exactly, adapt the types (not the behaviour) and note it in the report.

- [ ] **Step 5: Run tests on both Node versions**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/net`
Run: `SKIP_ENV_VALIDATION=true npx -y -p node@20 node node_modules/vitest/vitest.mjs run src/server/net/address-policy.test.ts src/server/net/pinned-transport.test.ts`
Expected: PASS on both.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print fix/safe-fetch-ip-pinning
git add package.json pnpm-lock.yaml src/server/net/address-policy.ts src/server/net/address-policy.test.ts src/server/net/pinned-transport.ts src/server/net/pinned-transport.test.ts
git commit -m "net: one public-address policy and a pinned transport that checks at connect time"
```

---

### Task 2: `safeFetch` and `validateWebhookUrl` on the policy and the pinned transport

**Files:**
- Modify: `src/server/net/safe-fetch.ts`, `src/server/net/safe-fetch.test.ts`, `src/server/agent/validate-webhook-url.ts`
- Create: `src/server/agent/validate-webhook-url.test.ts` (if none exists; otherwise extend it)
- Modify tests that stubbed global fetch for safeFetch callers: `src/server/link-preview/fetch-link-preview.test.ts`, `src/server/events/import-from-url.test.ts`
- Modify any caller whose types break on undici's `Response`/`Headers` (expected: `src/server/collectors/context/live.ts`, `src/server/link-preview/fetch-link-preview.ts`, `src/server/communities/feed-images.ts`, `src/server/events/import-from-url.ts`)

**Interfaces:**
- Consumes: `pinnedFetch`, `isPublicAddress` (Task 1).
- Produces: `safeFetch` unchanged in signature except `SafeResponse.response` is undici's `Response`; `readBodyCapped` accepts it. `validateWebhookUrl` / `validateWebhookUrlSync` unchanged in signature and reasons; address decisions now come from `isPublicAddress`.

- [ ] **Step 1: Write the failing tests**

In `src/server/net/safe-fetch.test.ts`, replace the global-fetch stubbing with a module mock (keep every existing test and assertion; only the seam changes):

```ts
vi.mock("@/server/net/pinned-transport", () => ({ pinnedFetch: vi.fn() }));
import { pinnedFetch } from "@/server/net/pinned-transport";
const fetchMock = vi.mocked(pinnedFetch);
```

…and in each test use `fetchMock.mockResolvedValue(new Response(...) as never)` (or `mockImplementation`) where it used `vi.stubGlobal("fetch", …)`. Add:

```ts
  it("refuses an IPv4-mapped loopback literal without a request", async () => {
    await expect(safeFetch("https://[::ffff:127.0.0.1]/", base)).rejects.toThrow("Refusing to fetch URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends every hop through the pinned transport", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://b.example/next" } }) as never)
      .mockResolvedValueOnce(new Response("ok") as never);
    await safeFetch("https://a.example/", base);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["https://a.example/", "https://b.example/next"]);
  });
```

The existing `validateWebhookUrl` mock in this file stays (it is the friendly pre-check).

Create or extend `src/server/agent/validate-webhook-url.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ v4: [] as string[], v6: [] as string[] }));
vi.mock("node:dns/promises", () => ({
  resolve4: async () => dns.v4,
  resolve6: async () => dns.v6,
}));

import { validateWebhookUrl, validateWebhookUrlSync } from "./validate-webhook-url";

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
    expect(await validateWebhookUrl("https://hooks.example/path")).toEqual({ ok: true });
  });

  it("keeps refusing http and localhost with the same reasons", async () => {
    expect(await validateWebhookUrl("http://hooks.example/")).toEqual({ ok: false, reason: "Webhook URL must use HTTPS" });
    expect(await validateWebhookUrl("https://localhost/")).toEqual({ ok: false, reason: "Webhook URL must not point to localhost" });
  });
});
```

In `fetch-link-preview.test.ts` and `import-from-url.test.ts`, replace `vi.stubGlobal("fetch", …)` with the same `vi.mock("@/server/net/pinned-transport")` seam; assertions unchanged (they read `fetchMock.mock.calls[i][1].headers` etc. — the init shape is the same).

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/net src/server/agent/validate-webhook-url.test.ts src/server/link-preview src/server/events/import-from-url`
Expected: FAIL — safeFetch still calls global fetch; the new literal/range cases are allowed today.

- [ ] **Step 3: Implement**

`src/server/agent/validate-webhook-url.ts`: keep both exports, their messages and order of checks; replace `isPrivateHostname`/`isPrivateIPv4`/the IPv6 prefix checks with the policy:

- Literal hostnames: normalise decimal / hex / octal IPv4 notations to dotted form (keep the existing parsing helpers for that), strip IPv6 brackets, and if the result is an IP (`ipaddr.isValid`), refuse unless `isPublicAddress(result)`.
- Resolved addresses (`checkResolvedIPs`): refuse if any `resolve4`/`resolve6` answer fails `isPublicAddress`.
- Keep the localhost and cloud-metadata hostname rules and their reasons.

`src/server/net/safe-fetch.ts`:
- Per hop: `validateWebhookUrl(current)` stays as the friendly pre-check; then `pinnedFetch(current, { signal, headers })` instead of global `fetch` (no `redirect` argument — the transport forces manual).
- `SafeResponse.response` becomes `import type { Response as PinnedResponse } from "undici"`; `readBodyCapped(res: { body: ReadableStream<Uint8Array> | null; arrayBuffer(): Promise<ArrayBuffer> }, …)` so it accepts both.
- A `BlockedAddressError` (or an undici error whose `cause` is one) becomes `Error("Refusing to fetch URL: it resolves to a non-public address")` so existing callers' "Refusing to fetch URL" handling (e.g. `userMessageFor` in `src/server/collectors/errors.ts`, which matches that prefix) still maps it.
- Replace the "Residual risk (accepted)" paragraph with: the connection is pinned to the checked answers (`pinned-transport.ts`), so the window is closed; IP-literal URLs are refused by the pre-check.

Callers: fix only the types the undici `Response`/`Headers` break (e.g. collectors `live.ts` builds `TransportResponse.headers: Headers` — wrap with `new Headers(response.headers)` or widen the type). No behaviour changes.

- [ ] **Step 4: Run every affected suite, both Node versions**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/net src/server/agent src/server/link-preview src/server/events src/server/communities src/server/collectors`
Run (DB): `<DB prefix> pnpm vitest run src/server/collectors`
Run: `SKIP_ENV_VALIDATION=true npx -y -p node@20 node node_modules/vitest/vitest.mjs run src/server/net src/server/link-preview src/server/events/import-from-url.test.ts src/server/agent/validate-webhook-url.test.ts`
Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print fix/safe-fetch-ip-pinning
git add src/server/net/safe-fetch.ts src/server/net/safe-fetch.test.ts src/server/agent/validate-webhook-url.ts src/server/agent/validate-webhook-url.test.ts src/server/link-preview/fetch-link-preview.test.ts src/server/events/import-from-url.test.ts <each caller file you changed for types>
git commit -m "net: safeFetch connects through the pinned transport; webhook URL checks use the address policy"
```

---

### Task 3: Webhook delivery through the pinned transport, redirects refused

**Files:**
- Modify: `src/server/agent/deliver-event.ts`, `src/server/api/routers/agent-management.ts` (the "test webhook" mutation only)
- Modify tests: `src/server/agent/deliver-event.test.ts`, `src/server/agent/event-delivery-scope.integration.test.ts`, `src/server/agent/dispatch-immediate.integration.test.ts`, and the agent-management test that covers the test-webhook mutation if one exists (grep `testWebhook` / the mutation name)

**Interfaces:**
- Consumes: `pinnedFetch` (Task 1).
- Produces: delivery returns `{ ok: false, status }` for any 3xx (never followed); the test-webhook mutation reports a 3xx as "Webhook test failed: redirects are not followed".

- [ ] **Step 1: Write the failing tests**

In each listed test, replace `vi.spyOn(globalThis, "fetch")` / `vi.stubGlobal("fetch", …)` with:

```ts
vi.mock("@/server/net/pinned-transport", () => ({ pinnedFetch: vi.fn() }));
import { pinnedFetch } from "@/server/net/pinned-transport";
const fetchMock = vi.mocked(pinnedFetch);
```

keeping every assertion on `fetchMock.mock.calls` (URL, method, headers, body, signature) as it is. Add to `deliver-event.test.ts`:

```ts
  it("treats a redirect as a failed delivery and never follows it", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://10.0.0.1/" } }) as never);
    const result = await deliverEvent(/* the same webhook + event fixture the other tests use */);
    expect(result).toEqual({ ok: false, status: 302 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
```

(Use the file's existing fixture helpers for the arguments; do not invent a new call shape.)

If a test for the test-webhook mutation exists, add the same 302 case asserting the `BAD_REQUEST` message `Webhook test failed: redirects are not followed`; if none exists, add one in the router's existing test file style (mocked db as in `onboarding-dismiss.test.ts`).

- [ ] **Step 2: Run to verify failure** — the 302 cases fail (global fetch is still used; a 302 counts as… not ok but the call goes to global fetch, so `fetchMock` sees 0 calls).

- [ ] **Step 3: Implement**

`deliver-event.ts`: `const res = await pinnedFetch(webhook.url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(5000) });` then `return { ok: res.status >= 200 && res.status < 300, status: res.status };` (a 3xx is not ok). Keep the try/catch → `{ ok: false }`.

`agent-management.ts` (test webhook): same call; if `res.status >= 300 && res.status < 400` throw `BAD_REQUEST` "Webhook test failed: redirects are not followed"; other non-2xx keep the existing message shape.

- [ ] **Step 4: Run tests** — the agent suites unit + DB (DB prefix for the two integration files), typecheck. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print fix/safe-fetch-ip-pinning
git add src/server/agent/deliver-event.ts src/server/agent/deliver-event.test.ts src/server/agent/event-delivery-scope.integration.test.ts src/server/agent/dispatch-immediate.integration.test.ts src/server/api/routers/agent-management.ts <the router test file>
git commit -m "agents: webhook delivery uses the pinned transport and never follows redirects"
```

---

### Task 4: Docs and full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-data-collectors-design.md` ("Gate before enabling": the IP-pinning gate is satisfied by this change; keep the rest of the gate text accurate), `docs/adr/0040-data-collectors-are-built-in-strategies-run-from-a-queued-command.md` (one line under Consequences: connections are pinned to checked addresses — `src/server/net/pinned-transport.ts`)

- [ ] **Step 1: Update the docs** — grep both files for "pinning", "#419", "rebinding" and fix every hit; do not only append.

- [ ] **Step 2: Commit, then verify the committed tree**

```bash
git branch --show-current   # must print fix/safe-fetch-ip-pinning
git add docs/superpowers/specs/2026-10-03-data-collectors-design.md docs/adr/0040-data-collectors-are-built-in-strategies-run-from-a-queued-command.md
git commit -m "docs: the collectors gate on pinned connections is met"
git status --short   # must be empty
```

Run: `pnpm check`; `SKIP_ENV_VALIDATION=1 pnpm test`; the DB prefix run of `src/server/agent` and `src/server/collectors`; the Node 20 run of `src/server/net src/server/agent/deliver-event.test.ts src/server/agent/validate-webhook-url.test.ts`. Report every result with output.

## Self-review

- Spec coverage: #419 (pinning) — Tasks 1–2; address-policy gaps — Tasks 1–2; webhook redirect hole — Task 3; docs — Task 4.
- Review Focus 1–5 each have an owning test (Tasks 1, 1, 3, 1–2, 2).
- Types: `pinnedFetch(url, init)` mirrors `fetch(url, init)` so test assertions on `mock.calls[i][0|1]` keep their shape.
