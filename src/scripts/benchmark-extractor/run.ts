// src/scripts/benchmark-extractor/run.ts
import { EXTRACTOR_VERSION } from "@/server/benchmark/extractor-prompt";
import {
  completeJson,
  extractorModel,
  inferenceApiKey,
} from "@/server/inference/openai-compatible";

const API_BASE = process.env.AIT_API_BASE ?? "http://localhost:3000";
const API_KEY = process.env.AIT_EXTRACTOR_API_KEY;

if (!API_KEY || !inferenceApiKey()) {
  console.error("Set AIT_EXTRACTOR_API_KEY and OPENROUTER_API_KEY.");
  process.exit(1);
}

async function trpc<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/trpc/${path}?batch=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ 0: { json: body } }),
  });
  const data = await res.json();
  if (!res.ok || data[0]?.error) throw new Error(JSON.stringify(data));
  return data[0].result.data.json as T;
}

async function callExtractor(prompt: string): Promise<{ mentions: unknown }> {
  return completeJson<{ mentions: unknown }>({
    model: extractorModel(),
    temperature: 0,
    title: "AIT Benchmark Extractor",
    messages: [{ role: "user", content: prompt }],
  });
}

async function processRun(runId: string) {
  const fetched = await trpc<{ renderedPrompt: string }>(
    "benchmark.getRunForExtraction",
    { runId },
  );

  const json = await callExtractor(fetched.renderedPrompt);

  await trpc("benchmark.submitExtraction", {
    runId,
    extractorVersion: EXTRACTOR_VERSION,
    mentions: json.mentions,
  });
  console.log("ok", runId);
}

const runIds = process.argv.slice(2);
if (runIds.length === 0) {
  console.error("Usage: tsx run.ts <runId> [runId...]");
  process.exit(1);
}

void (async () => {
  for (const id of runIds) {
    try {
      await processRun(id);
    } catch (err) {
      console.error("fail", id, err);
    }
  }
})();
