import type { db } from "@/server/db";
import type { getPayloadClient } from "@/server/payload";

/** The Payload Local API client every magazine module reads and writes with. */
export type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>;

/** What a magazine service needs from the outside world. */
export type Deps = { db: typeof db; payload: PayloadClient };
