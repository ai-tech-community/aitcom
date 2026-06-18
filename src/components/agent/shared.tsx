"use client";

import { useState } from "react";

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="border-border bg-secondary text-muted-foreground overflow-x-auto rounded border p-4 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <div className="absolute top-2 right-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="border-border bg-background text-muted-foreground hover:text-foreground rounded border px-2 py-1 font-mono text-[10px] tracking-wider transition-colors"
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}
