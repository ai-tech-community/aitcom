import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { MyArticlesList } from "@/components/my-articles-list";

export default async function MyArticlesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <div className="px-6 py-16 sm:px-12">
      <MyArticlesList />
    </div>
  );
}
