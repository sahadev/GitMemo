import { useEffect, useRef, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { AppIcon, type AppIconTone } from "../../base/AppIcon";
import { ClipboardToolbarButton } from "./ClipboardComponents";

export interface ClipboardToolbarMenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: "default" | "success" | "danger";
  active?: boolean;
}

function iconTone(item: ClipboardToolbarMenuItem): AppIconTone {
  if (item.active) return "accent";
  if (item.tone === "success") return "success";
  if (item.tone === "danger") return "danger";
  return "current";
}

export function ClipboardToolbarMenu({
  mobile,
  title,
  items,
}: {
  mobile: boolean;
  title: string;
  items: ClipboardToolbarMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="gm-menu-anchor">
      <ClipboardToolbarButton
        mobile={mobile}
        icon={ChevronDown}
        active={open}
        onClick={() => setOpen((value) => !value)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
      />
      {open ? (
        <div className="gm-menu-popover gm-clipboard-menu-popover" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="gm-menu-item"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              <AppIcon icon={item.icon} size="xs" tone={iconTone(item)} />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
