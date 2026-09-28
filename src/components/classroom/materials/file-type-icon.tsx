import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Presentation,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  ppt: Presentation,
  pptx: Presentation,
  key: Presentation,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  zip: FileArchive,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  webp: FileImage,
};

/** A decorative icon for a file's type. */
export function FileTypeIcon({
  extension,
  className,
}: {
  extension: string;
  className?: string;
}) {
  const Icon = ICONS[extension] ?? FileIcon;
  return <Icon className={className} aria-hidden="true" />;
}
