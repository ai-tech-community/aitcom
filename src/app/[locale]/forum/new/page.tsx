import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { CreateThreadForm } from "@/components/forum/create-thread-form";

export const metadata: Metadata = {
  title: "New Thread — Forum — AIT",
};

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect(`/${locale}/auth/signin?redirect=/${locale}/forum/new`);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12">
      <CreateThreadForm />
    </div>
  );
}
