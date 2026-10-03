import type { db as appDb } from "@/server/db";

type Tx = Parameters<Parameters<(typeof appDb)["transaction"]>[0]>[0];

/** The app database or an open transaction on it. */
export type CollectorDb = typeof appDb | Tx;
