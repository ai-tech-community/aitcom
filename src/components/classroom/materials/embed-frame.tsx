import {
  resolveEmbed,
  type EmbedAspect,
} from "@/lib/classroom/embed-providers";

const FRAME_CLASS: Record<EmbedAspect, string> = {
  "16:9": "aspect-video",
  page: "h-[70vh] min-h-[480px]",
};

/** One embedded lesson material. The src is always built by the registry. */
export function EmbedFrame({ url }: { url: string }) {
  const embed = resolveEmbed(url);
  if (!embed) return null;
  return (
    <div
      className={`border-border relative my-6 w-full overflow-hidden rounded-lg border ${FRAME_CLASS[embed.aspect]}`}
    >
      <iframe
        src={embed.embedSrc}
        title={embed.label}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="fullscreen; picture-in-picture; encrypted-media; clipboard-write"
        allowFullScreen
        className="absolute inset-0 size-full"
      />
    </div>
  );
}
