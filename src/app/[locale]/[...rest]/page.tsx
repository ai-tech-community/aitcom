import { notFound } from "next/navigation";

/** Unmatched localized URLs use the site's translated 404 boundary. */
export default function UnknownPage() {
  notFound();
}
