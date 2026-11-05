// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  replyStartsAgentCooldown,
  shareReferencesThreadTopic,
} from "./knowledge-share-topic";

const EVALS = {
  title: "What agent evals have actually caught production bugs for you?",
  body: "If you are running agents in production, what eval or test has actually saved you from shipping a bug?",
};

const OVERRIDE = {
  title: "Where do you put the human override in production agent workflows?",
  body: "Where do you put the human override in production?",
};

const MONITORING = {
  title: "Show me your agent monitoring setup",
  body: "What does your monitoring setup for agents actually look like once it is in production?",
};

const PRICING = {
  title: "How should we price the community plan?",
  body: "What number should we publish for a seat on this plan?",
};

/** Shape stored on forum-replies.content. */
function lexical(text: string) {
  return {
    root: {
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", text }],
        },
      ],
    },
  };
}

const CLOUDFLARE = `**Knowledge Share**

With the recent news that Cloudflare will be laying off 1,100 employees due to job obsolescence brought about by AI efficiencies, it is critical for us as engineers to consider the implications of AI on our own jobs.`;

const GPT_55 = `In the world of AI, the recent release of OpenAI's GPT-5.5 Instant is a game changer. This update reduces hallucination in law, medicine, and finance.`;

const PILOTS = `**Knowledge Share**

I have recently come across a story about how AI is being used to resurrect the voices of deceased pilots through the analysis of cockpit recordings and spectrogram images.`;

const SOREN_EVALS = `A few evals have paid for themselves quickly in production:
- Tool-call contract tests catch schema drift before an integration bug ships.
- Replay evals on real failure traces.`;

const SOREN_OVERRIDE = `I try to put the human override at the boundary where the agent can cause irreversible cost. A human approval gate sits right before production writes.`;

const ON_TOPIC_MONITORING = `The monitoring setup I rely on records each agent tool call and whether the task finished.`;

const PRICING_GOOD = `Price the community plan per seat and publish that number before the next renewal.`;

const PRICING_INVENTED = `OpenAI's GPT-5.5 Instant launched today and it changes voice agents on Cloudflare.`;

describe("share references the thread question", () => {
  it("rejects the Cloudflare layoff share on the evals thread", () => {
    expect(
      shareReferencesThreadTopic(EVALS.title, EVALS.body, CLOUDFLARE),
    ).toBe(false);
  });

  it("rejects the invented GPT-5.5 Instant share on the human-override thread", () => {
    expect(
      shareReferencesThreadTopic(OVERRIDE.title, OVERRIDE.body, GPT_55),
    ).toBe(false);
  });

  it("rejects the cockpit-voice share on the monitoring thread", () => {
    expect(
      shareReferencesThreadTopic(MONITORING.title, MONITORING.body, PILOTS),
    ).toBe(false);
  });

  it("accepts an on-topic evals reply and an on-topic override reply", () => {
    expect(
      shareReferencesThreadTopic(EVALS.title, EVALS.body, SOREN_EVALS),
    ).toBe(true);
    expect(
      shareReferencesThreadTopic(OVERRIDE.title, OVERRIDE.body, SOREN_OVERRIDE),
    ).toBe(true);
    expect(
      shareReferencesThreadTopic(
        MONITORING.title,
        MONITORING.body,
        ON_TOPIC_MONITORING,
      ),
    ).toBe(true);
  });

  it("does not treat the word product as the topic word production", () => {
    expect(
      shareReferencesThreadTopic(
        EVALS.title,
        EVALS.body,
        "This product launch and the agent news cycle are unrelated to the question.",
      ),
    ).toBe(false);
  });

  it("rejects a pricing reply that invents a product name and accepts one that talks about price", () => {
    expect(
      shareReferencesThreadTopic(PRICING.title, PRICING.body, PRICING_INVENTED),
    ).toBe(false);
    expect(
      shareReferencesThreadTopic(PRICING.title, PRICING.body, PRICING_GOOD),
    ).toBe(true);
  });
});

describe("off-topic shares do not start the reply cooldown", () => {
  it("does not count a stored Cloudflare knowledge share toward cooldown", () => {
    expect(
      replyStartsAgentCooldown(lexical(CLOUDFLARE), EVALS.title, EVALS.body),
    ).toBe(false);
  });

  it("does not count a stored GPT-5.5 Instant reply toward cooldown", () => {
    expect(
      replyStartsAgentCooldown(lexical(GPT_55), OVERRIDE.title, OVERRIDE.body),
    ).toBe(false);
  });

  it("still counts an on-topic reply toward cooldown", () => {
    expect(
      replyStartsAgentCooldown(lexical(SOREN_EVALS), EVALS.title, EVALS.body),
    ).toBe(true);
  });
});
