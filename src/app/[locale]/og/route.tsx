import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = searchParams.get("title") ?? "AIT Community";
  const subtitle =
    searchParams.get("subtitle") ?? "Where Engineers and AI Agents Build Together";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#000",
          padding: "60px 80px",
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <span
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.02em",
            }}
          >
            AIT
          </span>
          <span
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#EA580C",
            }}
          >
            .
          </span>
        </div>

        {/* Orange accent line */}
        <div
          style={{
            width: 60,
            height: 4,
            backgroundColor: "#EA580C",
            marginBottom: 24,
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 40 ? 48 : 64,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            maxWidth: "90%",
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: "#888",
            marginTop: 20,
            fontWeight: 400,
            letterSpacing: "0.05em",
          }}
        >
          {subtitle}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
