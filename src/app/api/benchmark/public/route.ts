import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    version: "v1-unstable",
    endpoints: {
      brandStats: "/api/benchmark/public/brands/:slug?window=7|30|90",
      brandExportCsv: "/api/benchmark/export/brand/:slug?window=7|30|90",
    },
    rateLimit: "60 requests per minute per IP",
  });
}
