// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  BlockedAddressError,
  createPinnedFetch,
  createPinnedLookup,
  refusedLiteralHost,
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

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected the request to be refused");
}

function expectBlocked(err: unknown) {
  expect(err).toBeInstanceOf(TypeError);
  expect((err as TypeError).message).toBe("fetch failed");
  expect((err as TypeError).cause).toBeInstanceOf(BlockedAddressError);
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

  it("refuses an empty answer", async () => {
    const lookup = createPinnedLookup(resolverReturning([]));
    const result = await lookupOnce(lookup, true);
    expect(result.err).toBeInstanceOf(BlockedAddressError);
  });

  it("refuses a single-address answer when every address was asked for", async () => {
    const singleOnly = vi.fn<Resolver>((_h, _o, cb) => {
      cb(null, "93.184.216.34", 4);
    });
    const result = await lookupOnce(createPinnedLookup(singleOnly), true);
    expect(result.err).toBeInstanceOf(BlockedAddressError);
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
  beforeEach(() => {
    hits.length = 0;
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
    const fetch = createPinnedFetch({
      resolve: resolverReturning([{ address: "127.0.0.1", family: 4 }]),
    });
    expectBlocked(await rejectionOf(fetch(`http://example.test:${port}/`)));
    expect(hits).toHaveLength(0);
  });

  it("never follows redirects", async () => {
    const fetch = createPinnedFetch({
      resolve: resolverReturning([{ address: "127.0.0.1", family: 4 }]),
      isAllowed: () => true,
    });
    const res = await fetch(`http://example.test:${port}/`, {
      redirect: "follow",
    });
    expect(res.status).toBe(302);
    expect(hits).toHaveLength(1);
  });

  it("connects to an allowed IP-literal host (control for the literal cases)", async () => {
    const fetch = createPinnedFetch({ isAllowed: (ip) => ip === "127.0.0.1" });
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(302);
    expect(hits).toHaveLength(1);
  });

  it("refuses the cloud metadata literal without connecting", async () => {
    const resolve = vi.fn<Resolver>();
    const fetch = createPinnedFetch({ resolve });
    expectBlocked(await rejectionOf(fetch("http://169.254.169.254/")));
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    ["short-form loopback", (p: number) => `http://127.1:${p}/`],
    ["decimal loopback", (p: number) => `http://2130706433:${p}/`],
    ["IPv4-mapped loopback", (p: number) => `http://[::ffff:127.0.0.1]:${p}/`],
  ])("refuses the %s literal without connecting", async (_label, urlFor) => {
    const fetch = createPinnedFetch();
    expectBlocked(await rejectionOf(fetch(urlFor(port))));
    expect(hits).toHaveLength(0);
  });
});

describe("pinned fetch against DNS rebinding (real sockets)", () => {
  let server: Server;
  let port = 0;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      res.writeHead(200, { connection: "close" });
      res.end("ok");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });
  beforeEach(() => {
    hits.length = 0;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  /** Public on the first question, loopback on every later one. */
  function rebindingResolver() {
    let calls = 0;
    return vi.fn<Resolver>((_host, options, callback) => {
      calls += 1;
      const address = calls === 1 ? "93.184.216.34" : "127.0.0.1";
      if (options.all) callback(null, [{ address, family: 4 }]);
      else callback(null, address, 4);
    });
  }

  it("refuses a host that was public at check time and private at connect time", async () => {
    const resolve = rebindingResolver();
    // The early check (validateWebhookUrl) asks DNS first and sees a public
    // address.
    const checked = await new Promise<unknown>((done) => {
      resolve("rebind.test", { all: true }, (_err, address) => done(address));
    });
    expect(checked).toEqual([{ address: "93.184.216.34", family: 4 }]);

    const fetch = createPinnedFetch({ resolve });
    const err = await rejectionOf(fetch(`http://rebind.test:${port}/secret`));
    expectBlocked(err);
    expect(hits).toHaveLength(0);
    // The connection asked DNS exactly once more and used that answer.
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("resolves exactly once per new connection", async () => {
    const resolve = vi.fn<Resolver>((_host, options, callback) => {
      if (options.all) callback(null, [{ address: "127.0.0.1", family: 4 }]);
      else callback(null, "127.0.0.1", 4);
    });
    const fetch = createPinnedFetch({
      resolve,
      isAllowed: (ip) => ip === "127.0.0.1",
    });
    // The server closes every connection, so each request opens a new one.
    for (let i = 1; i <= 2; i++) {
      const res = await fetch(`http://once.test:${port}/${i}`);
      await res.text();
      expect(resolve).toHaveBeenCalledTimes(i);
    }
    expect(hits).toEqual(["/1", "/2"]);
  });
});

describe("pinned fetch aborts (real sockets)", () => {
  let server: Server;
  let port = 0;
  let hung = 0;

  beforeAll(async () => {
    // Accepts the request and never answers.
    server = createServer(() => {
      hung += 1;
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });
  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );

  const loopbackOnly = () =>
    createPinnedFetch({ isAllowed: (ip) => ip === "127.0.0.1" });

  it("stops with AbortError when the caller's signal aborts", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const before = hung;
    const err = await rejectionOf(
      loopbackOnly()(`http://127.0.0.1:${port}/`, {
        signal: controller.signal,
      }),
    );
    expect((err as Error).name).toBe("AbortError");
    expect(hung).toBe(before + 1);
  });

  it("stops with TimeoutError when AbortSignal.timeout fires", async () => {
    const err = await rejectionOf(
      loopbackOnly()(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(50),
      }),
    );
    expect((err as Error).name).toBe("TimeoutError");
  });
});

describe("refusedLiteralHost", () => {
  it.each([
    ["https://127.0.0.1/", "127.0.0.1"],
    ["https://127.1/", "127.0.0.1"],
    ["https://2130706433/", "127.0.0.1"],
    ["https://0x7f000001/", "127.0.0.1"],
    ["https://[::1]/", "::1"],
    ["https://[::ffff:127.0.0.1]/", "::ffff:7f00:1"],
    ["https://169.254.169.254/latest", "169.254.169.254"],
    ["https://10.0.0.1/jobs", "10.0.0.1"],
  ])("refuses %s", (url, host) => {
    expect(refusedLiteralHost(url)).toBe(host);
    expect(refusedLiteralHost(new URL(url))).toBe(host);
  });

  it.each([
    "https://93.184.216.34/",
    "https://[2606:4700:4700::1111]/",
    "https://example.com/",
  ])("lets %s through", (url) => {
    expect(refusedLiteralHost(url)).toBeNull();
  });

  it("uses the policy it is given", () => {
    expect(refusedLiteralHost("http://127.0.0.1/", () => true)).toBeNull();
  });
});
