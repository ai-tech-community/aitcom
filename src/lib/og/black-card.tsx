import type { ReactNode } from "react";

/** The site's 1200×630 black share-image frame. */
export function BlackCard({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        backgroundColor: "#000",
        color: "#fff",
        fontFamily: "Geist Sans",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
          padding: "60px 64px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          {children}
        </div>
        <div
          style={{
            width: 60,
            height: 4,
            backgroundColor: "#EA580C",
            marginTop: 32,
            marginBottom: 24,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          <span>AIT Community</span>
          <span style={{ color: "#EA580C" }}>.</span>
        </div>
      </div>
      {aside && (
        <div style={{ display: "flex", width: 400, height: 630 }}>{aside}</div>
      )}
    </div>
  );
}
