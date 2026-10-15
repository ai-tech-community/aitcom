import type { Metadata } from "next";

/** Unfinished collectors pages stay out of the index. */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function CollectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
