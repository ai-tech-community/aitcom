"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ITEM_IMAGE_SHAPES,
  newItemImage,
  readItemImage,
  type ItemImage,
} from "@/lib/magazines/item-image";
import { ItemImageFigure } from "../../items/item-image";
import { ImageUploadField } from "../image-upload-field";

export function ItemImageEditor({
  value,
  sourceImageUrl,
  onChange,
  onUploadingChange,
  disabled = false,
}: {
  value: ItemImage | null;
  sourceImageUrl?: string | null;
  onChange: (image: ItemImage | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("magazineEditor.builder.image");
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const busy = uploading || disabled;
  const source = readItemImage({ url: sourceImageUrl });
  const update = (patch: Partial<ItemImage>) => {
    if (value) onChange({ ...value, ...patch });
  };
  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <ImageUploadField
        disabled={disabled}
        value={value?.url ?? null}
        onChange={(url) => onChange(url ? newItemImage(url) : null)}
        uploadAlt={value?.alt ?? ""}
        text={{
          label: t("label"),
          hint: t("hint"),
          upload: t("upload"),
          replace: t("replace"),
          remove: t("remove"),
          uploading: t("uploading"),
          failed: t("failed"),
        }}
        renderPreview={() => null}
        onUploadingChange={(busy) => {
          setUploading(busy);
          onUploadingChange?.(busy);
        }}
      />
      {source && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => onChange(source)}
        >
          {t("useSource")}
        </Button>
      )}
      {value && (
        <>
          <ItemImageFigure image={value} />
          <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-shape`}>{t("shape")}</Label>
              <select
                id={`${id}-shape`}
                value={value.shape}
                onChange={(event) =>
                  update({ shape: event.target.value as ItemImage["shape"] })
                }
                className="border-input bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 text-sm focus-visible:ring-2"
              >
                {ITEM_IMAGE_SHAPES.map((shape) => (
                  <option key={shape} value={shape}>
                    {t(shape)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-x`}>{t("horizontal")}</Label>
              <input
                id={`${id}-x`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value.focalX}
                aria-valuetext={`${value.focalX}%`}
                onChange={(event) =>
                  update({ focalX: Number(event.target.value) })
                }
                className="accent-foreground w-full"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-y`}>{t("vertical")}</Label>
              <input
                id={`${id}-y`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={value.focalY}
                aria-valuetext={`${value.focalY}%`}
                onChange={(event) =>
                  update({ focalY: Number(event.target.value) })
                }
                className="accent-foreground w-full"
              />
              <p className="text-muted-foreground text-sm">{t("focalHint")}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-caption`}>{t("caption")}</Label>
              <Input
                id={`${id}-caption`}
                value={value.caption}
                maxLength={300}
                onChange={(event) => update({ caption: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-credit`}>{t("credit")}</Label>
              <Input
                id={`${id}-credit`}
                value={value.credit}
                maxLength={150}
                onChange={(event) => update({ credit: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-alt`}>{t("alt")}</Label>
              <Input
                id={`${id}-alt`}
                value={value.alt}
                maxLength={300}
                aria-describedby={`${id}-alt-hint`}
                onChange={(event) => update({ alt: event.target.value })}
              />
              <p
                id={`${id}-alt-hint`}
                className="text-muted-foreground text-sm"
              >
                {t("altHint")}
              </p>
            </div>
          </fieldset>
        </>
      )}
    </div>
  );
}
