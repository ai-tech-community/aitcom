import { AUTH_MD } from "@/lib/agent-discovery";

export function GET() {
  return new Response(AUTH_MD, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
