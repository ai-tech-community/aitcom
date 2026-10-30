import {
  isAllowedEmbedSrc,
  resolveArticleVideo,
  type ArticleVideo,
} from "@/lib/articles/video-embed";

function VideoLinkCard({
  label,
  title,
  href,
}: {
  label: string;
  title: string;
  href: string;
}) {
  const showTitle = title.length > 0 && title !== label;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-video="card"
      className="border-border hover:bg-muted/40 my-6 flex flex-col gap-1 rounded-lg border p-4 no-underline"
    >
      <span className="text-muted-foreground font-mono text-xs tracking-wider">
        {label}
      </span>
      {showTitle ? (
        <span className="text-foreground font-medium">{title}</span>
      ) : null}
    </a>
  );
}

function cardFrom(video: ArticleVideo): {
  label: string;
  title: string;
  href: string;
} {
  switch (video.kind) {
    case "card":
      return video;
    case "embed":
      return { label: video.label, title: video.label, href: video.pageUrl };
    default: {
      const unreachable: never = video;
      return unreachable;
    }
  }
}

/** Player for an allowlisted embed, or a link card for every other http(s) page. */
export function VideoFrame({ url }: { url: string }) {
  const video = resolveArticleVideo(url);
  if (!video) return null;
  if (video.kind === "embed" && isAllowedEmbedSrc(video.embedSrc)) {
    return (
      <div
        data-video="embed"
        data-video-provider={video.provider}
        className="border-border relative my-6 aspect-video w-full overflow-hidden rounded-lg border"
      >
        <iframe
          src={video.embedSrc}
          title={video.label}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          className="absolute inset-0 size-full"
        />
      </div>
    );
  }
  const card = cardFrom(video);
  return <VideoLinkCard {...card} />;
}
