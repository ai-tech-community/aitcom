import { CommunityOffers } from "@/components/communities/payments/community-offers";
export default async function CommunityOffersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <CommunityOffers slug={(await params).slug} />;
}
