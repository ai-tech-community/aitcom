import { CommunityOffers } from "@/components/communities/payments/community-offers";
export default async function CommunityOfferPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; offerId: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const { slug, offerId } = await params;
  return (
    <CommunityOffers
      slug={slug}
      offerId={offerId}
      orderId={(await searchParams).order}
    />
  );
}
