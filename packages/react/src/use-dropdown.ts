// Open/close state for the toolbar menus.
//
// The grid has no dependency on a popover library, so the two behaviors users
// expect from any menu — clicking elsewhere dismisses it, Escape dismisses it —
// have to be implemented here. They are worth getting right: a menu that only
// closes by clicking its own trigger feels broken, and a menu that traps focus
// after Escape strands keyboard users.
//
// Listeners are attached only while a menu is open, so a page with several
// grids on it is not paying for document-level handlers it never uses.

import * as React from "react";

/** Everything a menu needs to wire itself up. */
export interface Dropdown {
  /** Is the menu currently open? */
  isOpen: boolean;
  /** Toggle — bind to the trigger's `onClick`. */
  toggle: () => void;
  /** Close programmatically, e.g. after a menu item is activated. */
  close: () => void;
  /** Attach to the `.tbx-menu-wrap` element; defines what counts as "outside". */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the trigger button so Escape can return focus to it. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Self-contained dropdown state: opens on toggle, closes on outside pointer
 * down and on Escape (returning focus to the trigger).
 */
export function useDropdown(): Dropdown {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    // `pointerdown` rather than `click`: dismissing on press matches every
    // native menu, and it fires before the trigger's own click handler would
    // re-open a menu the user meant to close.
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      const target = event.target;
      if (container && target instanceof Node && container.contains(target)) return;
      setIsOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const toggle = React.useCallback(() => setIsOpen((open) => !open), []);
  const close = React.useCallback(() => setIsOpen(false), []);

  return { isOpen, toggle, close, containerRef, triggerRef };
}
