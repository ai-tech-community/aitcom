/** Print a message's persisted UI trust tier. Usage: tsx scripts/read-message-trust.ts <messageId> */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { messages } from "@/server/db/schema";

const id = process.argv[2];
if (!id) throw new Error("usage: read-message-trust.ts <messageId>");

const [m] = await db
  .select({
    id: messages.id,
    senderType: messages.senderType,
    uiProducerTrust: messages.uiProducerTrust,
    hasUiResource: messages.uiResource,
  })
  .from(messages)
  .where(eq(messages.id, id))
  .limit(1);

console.log(
  JSON.stringify(
    {
      id: m?.id,
      senderType: m?.senderType,
      uiProducerTrust: m?.uiProducerTrust,
      hasUiResource: m?.hasUiResource != null,
    },
    null,
    2,
  ),
);
process.exit(0);
