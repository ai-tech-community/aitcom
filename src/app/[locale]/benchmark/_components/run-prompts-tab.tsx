"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ManualRunForm } from "./manual-run-form";
import { AgentRunModal } from "./agent-run-modal";

const ALL = "__all__";

export function RunPromptsTab() {
  const categories = api.benchmark.listCategories.useQuery();
  const intents = api.benchmark.listIntents.useQuery();
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [intentId, setIntentId] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [agentFor, setAgentFor] = useState<string | null>(null);

  const prompts = api.benchmark.listApprovedPrompts.useQuery({
    categoryId: categoryId === ALL ? undefined : categoryId,
    intentId: intentId === ALL ? undefined : intentId,
    search: search || undefined,
    page: 1,
    pageSize: 24,
  });
  const mine = api.benchmark.listMySubmissions.useQuery();

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-wrap gap-3">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={intentId} onValueChange={setIntentId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All intents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All intents</SelectItem>
            {intents.data?.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          className="w-64"
          placeholder="Search prompts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {prompts.data?.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-md border p-4">
            <p className="font-medium leading-snug">{p.text}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setAgentFor(p.id)}>
                Run with my agent
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setManualFor((prev) => (prev === p.id ? null : p.id))
                }
              >
                Manual submit
              </Button>
            </div>
            {manualFor === p.id && (
              <ManualRunForm promptId={p.id} onDone={() => setManualFor(null)} />
            )}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">My recent runs</h2>
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {mine.data?.runs.length === 0 && (
            <li className="p-3 text-muted-foreground">No runs yet.</li>
          )}
          {mine.data?.runs.map((r) => (
            <li key={r.id} className="flex justify-between gap-3 p-3">
              <span className="truncate">
                {r.modelProvider} · {r.modelId}
              </span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {r.extractionStatus}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {agentFor && (
        <AgentRunModal promptId={agentFor} onClose={() => setAgentFor(null)} />
      )}
    </div>
  );
}
