import { redirect } from "next/navigation";

export default async function JoinByInviteRedirect({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/invite/${code}`);
}
