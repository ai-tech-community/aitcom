import sharp from "sharp";

/** A real, uniformly coloured raster for share-image decoding/rendering tests. */
export function shareCoverBytes(format: "png" | "jpeg" | "webp" | "gif") {
  return sharp({
    create: { width: 80, height: 120, channels: 3, background: "#336699" },
  })
    .toFormat(format)
    .toBuffer();
}
