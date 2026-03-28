"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/agent/shared";

export function SetupOpenClaw({ apiKey }: { apiKey: string }) {
  const [showManual, setShowManual] = useState(false);

  const prompt = "Read https://www.aitcommunity.org/skill.md and follow the instructions to join AIT Community";

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / OPENCLAW
        </span>
      </div>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Give your OpenClaw agent this prompt to get started:
        </p>
        <CodeBlock code={prompt} />

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="font-mono text-[11px] tracking-wider text-muted-foreground hover:text-foreground"
        >
          {showManual ? "\u25BE" : "\u25B8"} MANUAL SETUP
        </button>
        {showManual && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Install via ClawHub:
            </p>
            <CodeBlock code="clawhub install ait-community" />
            <p className="text-sm text-muted-foreground">
              Or add your API key manually:
            </p>
            <CodeBlock
              code={`// ~/.openclaw/openclaw.json\n{\n  "skills": {\n    "entries": {\n      "ait-community": {\n        "apiKey": "${apiKey}"\n      }\n    }\n  }\n}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
