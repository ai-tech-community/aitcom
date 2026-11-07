import { z } from "zod";
import type { PaymentConnection } from "./connections";
import { adyenRequest } from "./providers/adyen";
import { stripeRequest } from "./providers/stripe";

export async function loadPaymentFinance(
  connection: PaymentConnection,
  now = new Date(),
) {
  if (connection.provider === "stripe") {
    const balances = await stripeRequest(
      "balance",
      connection.accountId,
      z.object({
        available: z.array(
          z.object({ amount: z.number(), currency: z.string() }),
        ),
        pending: z.array(
          z.object({ amount: z.number(), currency: z.string() }),
        ),
      }),
    );
    const payouts = await stripeRequest(
      "payouts?limit=10",
      connection.accountId,
      z.object({
        data: z.array(
          z.object({
            id: z.string(),
            amount: z.number(),
            currency: z.string(),
            status: z.string(),
            arrival_date: z.number(),
          }),
        ),
      }),
    );
    const available =
      balances.available.find((balance) => balance.currency === "eur")
        ?.amount ?? 0;
    return {
      currency: "EUR",
      available,
      balance:
        available +
        (balances.pending.find((balance) => balance.currency === "eur")
          ?.amount ?? 0),
      payouts: payouts.data
        .filter((payout) => payout.currency === "eur")
        .map((payout) => ({
          id: payout.id,
          amount: payout.amount,
          status: payout.status,
          date: new Date(payout.arrival_date * 1000),
        })),
    };
  }
  if (!connection.balanceAccountId)
    throw new Error("Payout account setup is incomplete.");
  const balances = await adyenRequest(
    "balance",
    `balanceAccounts/${encodeURIComponent(connection.balanceAccountId)}`,
    z.object({
      balances: z.array(
        z.object({
          currency: z.string(),
          available: z.number().optional(),
          balance: z.number(),
        }),
      ),
    }),
  );
  const params = new URLSearchParams({
    balanceAccountId: connection.balanceAccountId,
    createdSince: new Date(now.getTime() - 30 * 86400000).toISOString(),
    createdUntil: now.toISOString(),
    category: "bank",
    sortOrder: "desc",
    limit: "20",
  });
  const transfers = await adyenRequest(
    "transfers",
    `transfers?${params}`,
    z.object({
      data: z.array(
        z.object({
          id: z.string(),
          status: z.string(),
          direction: z.string(),
          amount: z.object({ currency: z.string(), value: z.number() }),
          createdAt: z.string(),
        }),
      ),
    }),
  );
  const eur = balances.balances.find((balance) => balance.currency === "EUR");
  return {
    currency: "EUR",
    available: eur?.available ?? null,
    balance: eur?.balance ?? 0,
    payouts: transfers.data
      .filter(
        (transfer) =>
          transfer.direction === "outgoing" &&
          transfer.amount.currency === "EUR",
      )
      .slice(0, 10)
      .map((transfer) => ({
        id: transfer.id,
        amount: Math.abs(transfer.amount.value),
        status: transfer.status,
        date: new Date(transfer.createdAt),
      })),
  };
}
