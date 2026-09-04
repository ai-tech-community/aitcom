import { AI_CATALOG } from "@/lib/agent-discovery";

export function GET() {
  return new Response(JSON.stringify(AI_CATALOG), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
