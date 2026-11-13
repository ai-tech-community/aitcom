import { permanentRedirect } from "@/i18n/navigation";

/** Keep bookmarks and existing payment-provider return URLs working. */
export default async function MyPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  permanentRedirect({ href: "/dashboard/payments", locale });
}
