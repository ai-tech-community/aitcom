import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { env } from "@/env";
import * as schema from "./schema";

// The Neon WebSocket pool needs a WebSocket implementation in Node runtimes
// (Node < 22 ships no global WebSocket). Harmless where a global already exists.
// Safe to import here because no Edge code path imports the database — see
// ADR-0020.
neonConfig.webSocketConstructor = ws;

// Local development runs against a Dockerised Postgres reached through a local
// `wsproxy` container instead of Neon's cloud. Gated on NEON_LOCAL_PROXY
// (host:port, e.g. "wsproxy:80") so production behaviour is unchanged.
if (env.NEON_LOCAL_PROXY) {
  const proxy = env.NEON_LOCAL_PROXY;
  neonConfig.wsProxy = () => `${proxy}/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const conn =
  globalForDb.conn ?? new Pool({ connectionString: env.DATABASE_URL });
if (env.NODE_ENV !== "production") globalForDb.conn = conn;

export const db = drizzle(conn, { schema, casing: "snake_case" });
