import { NVIDIA_NL_ENGLISH_LINKS } from "@/lib/events/seo-event-pages";

/** English doors on the Dutch NVIDIA GTC page. Plain anchors, so the href stays /en. */
export function NvidiaGtcEnglishLinks() {
  return (
    <nav aria-label="AIT Community" className="mt-6">
      <ul className="mt-0">
        {NVIDIA_NL_ENGLISH_LINKS.map((link) => (
          <li key={link.href} className="border-border border-b py-3.5">
            <a
              href={link.href}
              className="focus-visible:ring-ring text-base leading-snug font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
