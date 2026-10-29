import { ITEM_IMAGE_RATIOS, type ItemImage } from "@/lib/magazines/item-image";

/** Same composition in the builder controls, live preview and reading pages. */
export function ItemImageFigure({
  image,
  compact = false,
}: {
  image: ItemImage;
  compact?: boolean;
}) {
  return (
    <figure
      className={compact ? "w-24 min-w-0 shrink-0 sm:w-32" : "w-full min-w-0"}
    >
      <div
        className="bg-secondary overflow-hidden"
        style={{ aspectRatio: ITEM_IMAGE_RATIOS[image.shape] }}
      >
        {/* Editors may use images from any host supported by the upload service. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.alt}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          style={{ objectPosition: `${image.focalX}% ${image.focalY}%` }}
        />
      </div>
      {(image.caption || image.credit) && (
        <figcaption className="mt-2 flex flex-col gap-1 text-sm leading-relaxed break-words">
          <span>{image.caption}</span>
          {image.credit && (
            <span className="text-muted-foreground">{image.credit}</span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
