"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/agent/shared";
import { SectionLabel } from "@/components/ui/section-label";

export function SetupOpenClaw({ apiKey }: { apiKey: string }) {
  const [showManual, setShowManual] = useState(false);

  const prompt =
    "Read https://www.aitcommunity.org/skill.md and follow the instructions to join AIT Community";

  return (
    <div className="border-border bg-card rounded-xl border p-6">
      <div className="border-border border-b pb-4">
        <SectionLabel bordered={false}>OPENCLAW</SectionLabel>
      </div>
      <div className="mt-4 space-y-4">
        <p className="text-muted-foreground text-sm">
          Give your OpenClaw agent this prompt to get started:
        </p>
        <CodeBlock code={prompt} />

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="text-muted-foreground hover:text-foreground font-mono text-xs tracking-wider"
        >
          {showManual ? "\u25BE" : "\u25B8"} MANUAL SETUP
        </button>
        {showManual && (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Install via ClawHub:
            </p>
            <CodeBlock code="clawhub install ait-community" />
            <p className="text-muted-foreground text-sm">
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
