import type { ReactNode } from "react";
import Image from "next/image";

export function EventHeading({
  title,
  labels,
  facts,
  cover,
}: {
  title: string;
  labels?: ReactNode;
  facts?: ReactNode;
  cover?: { url: string; alt: string } | null;
}) {
  return (
    <header className="border-border border-b pb-5 sm:pb-6">
      {labels ? (
        <div className="flex flex-wrap items-center gap-2">{labels}</div>
      ) : null}
      <h1 className="mt-3 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-pretty break-words sm:text-5xl">
        {title}
      </h1>
      {facts ? (
        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {facts}
        </div>
      ) : null}
      {cover ? <EventCover {...cover} /> : null}
    </header>
  );
}

export function EventCover({ url, alt }: { url: string; alt: string }) {
  return (
    <div className="border-border relative mt-4 aspect-[2/1] overflow-hidden rounded-lg border sm:mt-5">
      <Image
        src={url}
        alt={alt}
        fill
        priority
        className="object-cover"
        sizes="(min-width: 1024px) 720px, 100vw"
      />
    </div>
  );
}
