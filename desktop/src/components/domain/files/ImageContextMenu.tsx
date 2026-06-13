import { Copy, Download, FolderOpen } from "lucide-react";
import { useI18n } from "../../../hooks/useI18n";
import type { ImageContextMenuState } from "../../../hooks/useLongPressImageSave";
import { getRevealInFileManagerLabelKey } from "../../../utils/platformLogic";
import { usePlatformFlags } from "../../../hooks/usePlatform";
import { AppIcon } from "../../base/AppIcon";

interface ImageContextMenuProps {
  menu: ImageContextMenuState | null;
}

export function ImageContextMenu({ menu }: ImageContextMenuProps) {
  const { t } = useI18n();
  const { os } = usePlatformFlags();

  if (!menu) return null;

  const { point, availability } = menu;

  return (
    <div
      className="gm-menu-popover gm-image-context-menu"
      style={{ left: point.x, top: point.y }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {availability.canCopyImage ? (
        <button type="button" className="gm-menu-item" onClick={() => void menu.copyImage()}>
          <AppIcon icon={Copy} size="xs" />
          {t("common.copyImage")}
        </button>
      ) : null}
      {availability.canSaveImage ? (
        <button type="button" className="gm-menu-item" onClick={() => void menu.saveImage()}>
          <AppIcon icon={Download} size="xs" />
          {t("common.saveImage")}
        </button>
      ) : null}
      {availability.canRevealImage ? (
        <button type="button" className="gm-menu-item" onClick={() => void menu.revealImage()}>
          <AppIcon icon={FolderOpen} size="xs" />
          {t(getRevealInFileManagerLabelKey(os))}
        </button>
      ) : null}
    </div>
  );
}
