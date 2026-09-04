import { ROBOTS_TXT } from "@/lib/agent-discovery";

export function GET() {
  return new Response(ROBOTS_TXT, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
