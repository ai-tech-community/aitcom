import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

import {
  type ActivityEvent,
  type AgentWebhook,
  deliverEvent,
  webhookMatchesEvent,
} from "./deliver-event";

function webhook(p: Partial<AgentWebhook> = {}): AgentWebhook {
  return {
    id: "wh1",
    agentId: "agent1",
    ownerId: "owner1",
    url: "https://example.com/hook",
    secret: "s3cr3t",
    categories: ["inbox"],
    cursor: null,
    consecutiveFailures: 0,
    consecutiveAgentEvents: 0,
    isEnabled: true,
    status: "active",
    createdAt: new Date("2026-06-21T00:00:00Z"),
    updatedAt: null,
    ...p,
  } as AgentWebhook;
}

function event(p: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: "evt1",
    actorId: "human1",
    actorType: "member",
    action: "message.sent",
    targetType: "conversations",
    targetId: "conv1",
    metadata: null,
    collabSessionId: null,
    contextType: null,
    recipientId: "owner1",
    communityId: null,
    createdAt: new Date("2026-06-21T01:00:00Z"),
    ...p,
  } as ActivityEvent;
}

describe("webhookMatchesEvent", () => {
  it("matches an inbox message destined for the webhook owner", () => {
    expect(webhookMatchesEvent(webhook(), event(), 0)).toBe(true);
  });
  it("treats a null-recipient event as public (matches any subscriber)", () => {
    expect(
      webhookMatchesEvent(webhook(), event({ recipientId: null }), 0),
    ).toBe(true);
  });
  it("rejects events addressed to a different recipient", () => {
    expect(
      webhookMatchesEvent(webhook(), event({ recipientId: "someone-else" }), 0),
    ).toBe(false);
  });
  it("rejects the webhook agent's own actions", () => {
    expect(
      webhookMatchesEvent(
        webhook(),
        event({ actorId: "agent1", actorType: "agent", recipientId: null }),
        0,
      ),
    ).toBe(false);
  });
  it("rejects actions the webhook's categories don't subscribe to", () => {
    expect(
      webhookMatchesEvent(webhook({ categories: ["forum"] }), event(), 0),
    ).toBe(false);
  });
  it("dampens agent chains after 2 consecutive agent events", () => {
    expect(
      webhookMatchesEvent(
        webhook(),
        event({ actorType: "agent", actorId: "agent2", recipientId: null }),
        2,
      ),
    ).toBe(false);
  });
  it("rejects a pending webhook even when category and recipient match", () => {
    expect(
      webhookMatchesEvent(
        webhook({ status: "pending", categories: ["inbox"] }),
        event({ action: "message.created", recipientId: "owner1" }),
        0,
      ),
    ).toBe(false);
  });
  it("accepts an active webhook on the same event", () => {
    expect(
      webhookMatchesEvent(
        webhook({ status: "active", categories: ["inbox"] }),
        event({ action: "message.created", recipientId: "owner1" }),
        0,
      ),
    ).toBe(true);
  });
});

describe("deliverEvent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("POSTs a signed wake payload and returns ok on 2xx", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const outcome = await deliverEvent(webhook(), event(), "Alice");

    expect(outcome).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/hook");
    const body = init!.body as string;
    expect(JSON.parse(body)).toMatchObject({
      type: "message.sent",
      eventId: "evt1",
      data: { actorName: "Alice", actorType: "member" },
    });
    const headers = init!.headers as Record<string, string>;
    const expectedSig = createHmac("sha256", "s3cr3t")
      .update(body)
      .digest("hex");
    expect(headers["X-AIT-Signature"]).toBe(`sha256=${expectedSig}`);
    expect(headers["X-AIT-Event"]).toBe("message.sent");
  });

  it("returns not-ok on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    expect(await deliverEvent(webhook(), event(), "Alice")).toEqual({
      ok: false,
      status: 500,
    });
  });

  it("returns not-ok when the request throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    expect(await deliverEvent(webhook(), event(), "Alice")).toEqual({
      ok: false,
    });
  });
});
