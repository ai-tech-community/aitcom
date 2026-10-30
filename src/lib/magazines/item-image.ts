import { z } from "zod";

export const ITEM_IMAGE_SHAPES = ["landscape", "portrait", "square"] as const;
export const ITEM_IMAGE_RATIOS = {
  landscape: "3 / 2",
  portrait: "3 / 4",
  square: "1 / 1",
} as const;

function isImageUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"))
    return true;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Issue-owned metadata only; never a replacement for the source content. */
export const itemImageSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine(isImageUrl, "Use an image URL"),
  alt: z.string().trim().max(300).default(""),
  caption: z.string().trim().max(300).default(""),
  credit: z.string().trim().max(150).default(""),
  shape: z.enum(ITEM_IMAGE_SHAPES).default("landscape"),
  focalX: z.number().int().min(0).max(100).default(50),
  focalY: z.number().int().min(0).max(100).default(50),
});
export type ItemImage = z.infer<typeof itemImageSchema>;

/** Stored JSON and older records are always checked before reaching a reader. */
export function readItemImage(value: unknown): ItemImage | null {
  const parsed = itemImageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function newItemImage(url: string): ItemImage {
  return itemImageSchema.parse({ url });
}
