// src/scripts/benchmark-extractor/run.ts
import { EXTRACTOR_VERSION } from "@/server/benchmark/extractor-prompt";

const API_BASE = process.env.AIT_API_BASE ?? "http://localhost:3000";
const API_KEY = process.env.AIT_EXTRACTOR_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.EXTRACTOR_MODEL ?? "moonshotai/kimi-k2.5";

if (!API_KEY || !OPENROUTER_KEY) {
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

async function callExtractor(prompt: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://aitcommunity.org",
      "X-Title": "AIT Benchmark Extractor",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`Empty response: ${JSON.stringify(data)}`);
  return text;
}

async function processRun(runId: string) {
  const fetched = await trpc<{ renderedPrompt: string }>(
    "benchmark.getRunForExtraction",
    { runId },
  );

  const text = await callExtractor(fetched.renderedPrompt);
  const json = JSON.parse(text);

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
