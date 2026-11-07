import { z } from "zod";
import type { BillingInterval } from "@/lib/payments";
import { providerRequest, requiredPaymentEnv } from "./http";

type AdyenApi = "checkout" | "balance" | "legal" | "management" | "transfers";
function apiRoot(api: AdyenApi) {
  const live = process.env.ADYEN_ENVIRONMENT === "live";
  if (api === "transfers")
    return `https://balanceplatform-api-${live ? "live" : "test"}.adyen.com/btl/v4`;
  if (api === "balance")
    return `https://balanceplatform-api-${live ? "live" : "test"}.adyen.com/bcl/v2`;
  if (api === "legal")
    return `https://kyc-${live ? "live" : "test"}.adyen.com/lem/v4`;
  if (api === "management")
    return `https://management-${live ? "live" : "test"}.adyen.com/v3`;
  if (!live) return "https://checkout-test.adyen.com/v72";
  const prefix = requiredPaymentEnv("ADYEN_LIVE_PREFIX");
  if (!/^[a-zA-Z0-9-]+$/.test(prefix))
    throw new Error("Invalid Adyen live endpoint prefix.");
  return `https://${prefix}-checkout-live.adyenpayments.com/checkout/v72`;
}

export function adyenRequest<T>(
  api: AdyenApi,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  idempotencyKey?: string,
  method?: "PATCH",
) {
  return providerRequest(
    `${apiRoot(api)}/${path}`,
    {
      method: method ?? (body ? "POST" : "GET"),
      headers: {
        "X-API-Key": requiredPaymentEnv(
          api === "checkout"
            ? "ADYEN_API_KEY"
            : api === "management"
              ? "ADYEN_MANAGEMENT_API_KEY"
              : "ADYEN_PLATFORM_API_KEY",
        ),
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    schema,
  );
}

export function adyenConfigured() {
  return !!(
    process.env.ADYEN_API_KEY &&
    process.env.ADYEN_PLATFORM_API_KEY &&
    process.env.ADYEN_MANAGEMENT_API_KEY &&
    process.env.ADYEN_MERCHANT_ACCOUNT &&
    process.env.ADYEN_BALANCE_PLATFORM &&
    process.env.ADYEN_HMAC_KEY &&
    process.env.ADYEN_INDUSTRY_CODE &&
    process.env.ADYEN_CAPTURE_MODE === "manual" &&
    (process.env.ADYEN_ENVIRONMENT !== "live" || process.env.ADYEN_LIVE_PREFIX)
  );
}

const capabilitySchema = z
  .object({ allowed: z.boolean().optional() })
  .passthrough();
export const adyenAccountSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  capabilities: z.record(z.string(), capabilitySchema).optional(),
});

export function adyenAccount(accountId: string) {
  return adyenRequest(
    "balance",
    `accountHolders/${encodeURIComponent(accountId)}`,
    adyenAccountSchema,
  );
}

/** Persist each resource before making the next call so interrupted setup is resumable. */
export async function adyenLegalEntity(
  type: "individual" | "organization",
  country: string,
  key: string,
) {
  return adyenRequest(
    "legal",
    "legalEntities",
    z.object({ id: z.string() }),
    type === "individual"
      ? { type, individual: { residentialAddress: { country } } }
      : { type, organization: { registeredAddress: { country } } },
    key,
  );
}

export function adyenAccountHolder(
  legalEntityId: string,
  label: string,
  key: string,
) {
  return adyenRequest(
    "balance",
    "accountHolders",
    z.object({ id: z.string() }),
    {
      balancePlatform: requiredPaymentEnv("ADYEN_BALANCE_PLATFORM"),
      legalEntityId,
      description: label,
    },
    key,
  );
}

export function adyenBalanceAccount(accountHolderId: string, key: string) {
  return adyenRequest(
    "balance",
    "balanceAccounts",
    z.object({ id: z.string() }),
    { accountHolderId, defaultCurrencyCode: "EUR" },
    key,
  );
}

export function adyenOnboarding(legalEntityId: string, returnUrl: string) {
  return adyenRequest(
    "legal",
    `legalEntities/${encodeURIComponent(legalEntityId)}/onboardingLinks`,
    z.object({ url: z.string().url() }),
    { redirectUrl: returnUrl },
  );
}

export function adyenBusinessLine(
  legalEntityId: string,
  webAddress: string,
  key: string,
) {
  return adyenRequest(
    "legal",
    "businessLines",
    z.object({ id: z.string() }),
    {
      legalEntityId,
      industryCode: requiredPaymentEnv("ADYEN_INDUSTRY_CODE"),
      service: "paymentProcessing",
      salesChannels: ["eCommerce", "payByLink"],
      webData: [{ webAddress }],
    },
    key,
  );
}

export async function adyenPrepareStore(connection: {
  id: string;
  legalEntityId: string | null;
  businessLineId: string | null;
  accountLabel: string | null;
  country: string;
}) {
  if (!connection.legalEntityId || !connection.businessLineId) return null;
  const addressSchema = z.object({
    country: z.string(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    street: z.string().optional(),
    houseNumberOrName: z.string().optional(),
  });
  const entity = await adyenRequest(
    "legal",
    `legalEntities/${encodeURIComponent(connection.legalEntityId)}`,
    z.object({
      individual: z
        .object({ residentialAddress: addressSchema.optional() })
        .optional(),
      organization: z
        .object({ registeredAddress: addressSchema.optional() })
        .optional(),
    }),
  );
  const address =
    entity.organization?.registeredAddress ??
    entity.individual?.residentialAddress;
  if (!address?.city || !address.postalCode || !address.street) return null;
  const store = await adyenRequest(
    "management",
    `merchants/${encodeURIComponent(requiredPaymentEnv("ADYEN_MERCHANT_ACCOUNT"))}/stores`,
    z.object({ id: z.string() }),
    {
      reference: `ait-${connection.id}`,
      description: connection.accountLabel ?? "Community",
      shopperStatement:
        (connection.accountLabel ?? "Community")
          .replace(/[^a-zA-Z0-9 ]/g, "")
          .slice(0, 22) || "Community",
      businessLineIds: [connection.businessLineId],
      address,
    },
    `store-${connection.id}`,
  );
  return store.id;
}

export function adyenSplits(
  balanceAccountId: string,
  amount: number,
  reference: string,
) {
  return [
    {
      type: "BalanceAccount",
      account: balanceAccountId,
      amount: { currency: "EUR", value: amount },
      reference,
    },
    {
      type: "PaymentFee",
      account: balanceAccountId,
      reference: `${reference}-fees`,
    },
  ];
}

export function adyenCheckout(
  balanceAccountId: string,
  storeId: string,
  order: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    interval: BillingInterval;
    buyerEmail: string;
    buyerId: string | null;
    returnUrl: string;
    reservationUntil?: Date | null;
    shopperReference?: string;
  },
) {
  return adyenRequest(
    "checkout",
    "paymentLinks",
    z.object({ id: z.string(), url: z.string().url() }),
    {
      merchantAccount: requiredPaymentEnv("ADYEN_MERCHANT_ACCOUNT"),
      store: storeId,
      manualCapture: true,
      amount: { currency: order.currency, value: order.amount },
      reference: order.id,
      description: order.title,
      returnUrl: order.returnUrl,
      shopperEmail: order.buyerEmail,
      expiresAt: (
        order.reservationUntil ?? new Date(Date.now() + 30 * 60000)
      ).toISOString(),
      splits: adyenSplits(balanceAccountId, order.amount, order.id),
      ...(order.interval !== "once"
        ? {
            shopperReference: order.shopperReference ?? order.id,
            recurringProcessingModel: "Subscription",
            storePaymentMethodMode: "enabled",
          }
        : {}),
    },
    `checkout-${order.id}`,
  );
}

export function adyenRefund(
  balanceAccountId: string,
  paymentReference: string,
  amount: number,
  orderId: string,
) {
  return adyenRequest(
    "checkout",
    `payments/${encodeURIComponent(paymentReference)}/refunds`,
    z.object({ pspReference: z.string() }),
    {
      merchantAccount: requiredPaymentEnv("ADYEN_MERCHANT_ACCOUNT"),
      reference: `refund-${orderId}`,
      amount: { currency: "EUR", value: amount },
      splits: adyenSplits(balanceAccountId, amount, `refund-${orderId}`),
    },
    `refund-${orderId}`,
  );
}

export function adyenRenew(
  balanceAccountId: string,
  storeId: string,
  payment: {
    id: string;
    amount: number;
    token: string;
    shopperReference: string;
  },
) {
  return adyenRequest(
    "checkout",
    "payments",
    z.object({ pspReference: z.string().optional(), resultCode: z.string() }),
    {
      merchantAccount: requiredPaymentEnv("ADYEN_MERCHANT_ACCOUNT"),
      reference: payment.id,
      store: storeId,
      amount: { currency: "EUR", value: payment.amount },
      paymentMethod: { storedPaymentMethodId: payment.token },
      shopperReference: payment.shopperReference,
      shopperInteraction: "ContAuth",
      recurringProcessingModel: "Subscription",
      splits: adyenSplits(balanceAccountId, payment.amount, payment.id),
    },
    payment.id,
  );
}

export function adyenCapture(
  balanceAccountId: string,
  reference: string,
  amount: number,
  orderId: string,
) {
  return adyenRequest(
    "checkout",
    `payments/${encodeURIComponent(reference)}/captures`,
    z.object({ pspReference: z.string() }),
    {
      merchantAccount: requiredPaymentEnv("ADYEN_MERCHANT_ACCOUNT"),
      reference: orderId,
      amount: { currency: "EUR", value: amount },
      splits: adyenSplits(balanceAccountId, amount, `capture-${orderId}`),
    },
    `capture-${orderId}`,
  );
}

export function adyenCancelAuthorization(reference: string, orderId: string) {
  return adyenRequest(
    "checkout",
    `payments/${encodeURIComponent(reference)}/cancels`,
    z.object({ pspReference: z.string() }),
    {
      merchantAccount: requiredPaymentEnv("ADYEN_MERCHANT_ACCOUNT"),
      reference: orderId,
    },
    `void-${orderId}`,
  );
}

export async function adyenExpireCheckout(id: string) {
  const link = await adyenRequest(
    "checkout",
    `paymentLinks/${encodeURIComponent(id)}`,
    z.object({ status: z.string() }),
  );
  if (link.status === "active")
    await adyenRequest(
      "checkout",
      `paymentLinks/${encodeURIComponent(id)}`,
      z.object({ status: z.string() }),
      { status: "expired" },
      `expire-${id}`,
      "PATCH",
    );
  else if (link.status === "paymentPending")
    throw new Error("Payment is processing.");
}
