import { cx } from "../../base/classNames";
import { LocalImagePreview } from "./LocalImagePreview";

interface ClipImageThumbProps {
  relPath: string;
  selected: boolean;
  wide?: boolean;
}

export function ClipImageThumb({ relPath, selected, wide = false }: ClipImageThumbProps) {
  const className = cx(
    "gm-clip-image-thumb",
    wide && "gm-clip-image-thumb-wide",
    selected && "gm-clip-image-thumb-selected",
  );

  return (
    <LocalImagePreview
      relPath={relPath}
      selected={selected}
      className={className}
      placeholderClassName={cx(className, "gm-clip-image-thumb-placeholder")}
    />
  );
}
