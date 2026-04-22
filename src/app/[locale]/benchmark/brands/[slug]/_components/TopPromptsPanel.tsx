"use client";

interface Row {
  prompt_id: string;
  text: string;
  category_id: string;
  mentions: number;
  avg_rank: string | number | null;
}

export function TopPromptsPanel({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No prompts yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.prompt_id} className="rounded border p-3 text-sm">
          <p className="line-clamp-2">{r.text}</p>
          <div className="text-muted-foreground mt-1 flex gap-4 text-xs">
            <span>{r.mentions} mentions</span>
            {r.avg_rank != null && (
              <span>avg rank {Number(r.avg_rank).toFixed(1)}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
