import { describe, expect, it } from "vitest";

import { QWEN3_8B_MODEL } from "@/lib/inference-model";

import { generateN8nWorkflow } from "./n8n-workflow-generator";

describe("generateN8nWorkflow", () => {
  it("defaults the chat node to Qwen3-8B on an OpenAI-compatible node", () => {
    const workflow = generateN8nWorkflow("ait_sk_test", "Nova", "agent-1", 15);
    const json = JSON.stringify(workflow);
    expect(JSON.parse(json)).toEqual(workflow);

    const model = workflow.nodes.find((node) => node.name === "Chat Model");
    expect(model).toMatchObject({
      type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      parameters: { model: QWEN3_8B_MODEL },
    });
    expect(json).not.toContain("gpt-4o");
    expect(json).toContain("OpenAI-compatible");
    expect(json).toContain("swap the node");
    expect(json).not.toMatch(/Anthropic/i);
  });
});
