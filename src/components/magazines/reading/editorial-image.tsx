"use client";

import Image, { type ImageLoader } from "next/image";

/** Editor images can live on any host, so the optimizer is not asked to fetch them. */
const passthrough: ImageLoader = ({ src }) => src;

function isHttpUrl(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * A magazine photo. `next/image` still lazy-loads and reserves space.
 * `unoptimized` keeps an editor's own host from having to be allowlisted.
 */
export function EditorialImage({
  src,
  alt,
  priority = false,
  sizes = "(max-width: 768px) 100vw, 1200px",
  className,
  width = 1600,
  height = 1066,
  fill = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  if (!isHttpUrl(src)) return null;
  if (fill) {
    return (
      <Image
        loader={passthrough}
        src={src}
        alt={alt}
        fill
        unoptimized
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        sizes={sizes}
        className={className}
      />
    );
  }
  return (
    <Image
      loader={passthrough}
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      sizes={sizes}
      className={className}
    />
  );
}
