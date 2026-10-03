// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  BlockedAddressError,
  createPinnedFetch,
  createPinnedLookup,
  type Resolver,
} from "./pinned-transport";

function resolverReturning(
  addresses: { address: string; family: 4 | 6 }[],
): Resolver {
  return vi.fn((_host, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  }) as unknown as Resolver;
}

function lookupOnce(
  lookup: ReturnType<typeof createPinnedLookup>,
  all: boolean,
) {
  return new Promise<{ err: Error | null; address: unknown; family?: number }>(
    (resolve) => {
      lookup("example.test", { all }, (err, address, family) =>
        resolve({ err, address, family }),
      );
    },
  );
}

describe("pinned lookup", () => {
  it("hands every checked answer to the connection", async () => {
    const lookup = createPinnedLookup(
      resolverReturning([
        { address: "93.184.216.34", family: 4 },
        { address: "2606:4700:4700::1111", family: 6 },
      ]),
    );
    const result = await lookupOnce(lookup, true);
    expect(result.err).toBeNull();
    expect(result.address).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });

  it("answers the single-address form too", async () => {
    const lookup = createPinnedLookup(
      resolverReturning([{ address: "93.184.216.34", family: 4 }]),
    );
    const result = await lookupOnce(lookup, false);
    expect([result.err, result.address, result.family]).toEqual([
      null,
      "93.184.216.34",
      4,
    ]);
  });

  it("refuses the whole answer if any address is not public", async () => {
    const lookup = createPinnedLookup(
      resolverReturning([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ]),
    );
    const result = await lookupOnce(lookup, true);
    expect(result.err).toBeInstanceOf(BlockedAddressError);
    expect((result.err as BlockedAddressError).hostname).toBe("example.test");
  });

  it("passes DNS errors through", async () => {
    const failing = vi.fn<Resolver>((_h, _o, cb) => {
      cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }), []);
    });
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
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
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
    const fetch = createPinnedFetch({
      resolve: resolverReturning([{ address: "127.0.0.1", family: 4 }]),
    });
    await expect(fetch(`http://example.test:${port}/`)).rejects.toBeDefined();
    expect(hits.length).toBe(before);
  });

  it("never follows redirects", async () => {
    const fetch = createPinnedFetch({
      resolve: resolverReturning([{ address: "127.0.0.1", family: 4 }]),
      isAllowed: () => true,
    });
    const before = hits.length;
    const res = await fetch(`http://example.test:${port}/`, {
      redirect: "follow",
    });
    expect(res.status).toBe(302);
    expect(hits.length).toBe(before + 1);
  });
});
