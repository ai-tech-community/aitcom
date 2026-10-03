import { describe, expect, it, vi } from "vitest";
import { type RobotsFetch, createRobotsCheck } from "./robots";

const TOKEN = "aitcom-collector";

describe("robots check", () => {
  it("applies rules for our token", async () => {
    const fetchRobots = vi.fn().mockResolvedValue({
      status: 200,
      body: "User-agent: aitcom-collector\nDisallow: /private\n\nUser-agent: *\nDisallow: /",
    });
    const allowed = createRobotsCheck(fetchRobots, TOKEN);
    expect(await allowed("https://e.com/public/1")).toBe(true);
    expect(await allowed("https://e.com/private/1")).toBe(false);
  });

  it("fetches robots.txt once per origin", async () => {
    const fetchRobots = vi
      .fn<RobotsFetch>()
      .mockResolvedValue({ status: 200, body: "" });
    const allowed = createRobotsCheck(fetchRobots, TOKEN);
    await allowed("https://e.com/a");
    await allowed("https://e.com/b");
    await allowed("https://other.com/a");
    expect(fetchRobots.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
      "https://other.com/robots.txt",
    ]);
  });

  it("allows everything when robots.txt is missing (4xx)", async () => {
    const allowed = createRobotsCheck(
      vi.fn().mockResolvedValue({ status: 404, body: "" }),
      TOKEN,
    );
    expect(await allowed("https://e.com/x")).toBe(true);
  });

  it.each([
    ["a server error", () => Promise.resolve({ status: 503, body: "" })],
    ["a network error", () => Promise.reject(new Error("boom"))],
  ])("disallows on %s (conservative)", async (_label, impl) => {
    const allowed = createRobotsCheck(vi.fn(impl), TOKEN);
    expect(await allowed("https://e.com/x")).toBe(false);
  });
});
