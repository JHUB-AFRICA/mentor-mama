import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import "./content-detail.css";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** A small accessible "more actions" menu (button + menu with arrow-key navigation). */
export function ActionMenu({
  label,
  items,
  trigger,
  align = "end",
}: {
  label: string;
  items: ActionMenuItem[];
  /** Optional custom trigger content; defaults to a three-dot icon button. */
  trigger?: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  // Fixed positioning keeps the menu from being clipped by scrolling tables.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const place = () => {
      const trigger = buttonRef.current!.getBoundingClientRect();
      const height = rootRef.current?.querySelector<HTMLElement>('[role="menu"]')?.offsetHeight ?? 240;
      const below = window.innerHeight - trigger.bottom;
      const top = below < height + 12 && trigger.top > height + 12 ? trigger.top - height - 6 : trigger.bottom + 6;
      const width = 208;
      const left = align === "end" ? Math.max(8, trigger.right - width) : Math.min(trigger.left, window.innerWidth - width - 8);
      setStyle({ top, left, visibility: "visible" });
    };
    place();
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const itemsEls = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
    itemsEls()[0]?.focus({ preventScroll: true });
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const list = itemsEls();
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % list.length : (index - 1 + list.length) % list.length;
        list[next]?.focus({ preventScroll: true });
      } else if (event.key === "Tab") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="cd-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={trigger ? "pa-btn pa-btn--secondary pa-btn--sm" : "cd-menu__trigger"}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger ?? <MoreHorizontal size={18} />}
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className="cd-menu__list" style={style}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`cd-menu__item${item.danger ? " is-danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
