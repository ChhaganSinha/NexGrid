// The grid's complete icon set, inlined as components.
//
// WHY INLINE: NexGrid ships with zero runtime dependencies, so an icon package
// (lucide-react, heroicons) is not an option. It would also be a parity hazard —
// the Angular and vanilla adapters draw these same shapes from §7 of the
// adapter spec, and a version bump in one package's icon set would silently
// make one adapter look different from the others.
//
// Every icon shares the same 24x24 stroked geometry, so the wrapper below owns
// those attributes and each export contributes only its paths.

import * as React from "react";

/** Props accepted by every NexGrid icon. */
export interface NexGridIconProps {
  /**
   * Class supplying size and color — `.nxg-icon`, `.nxg-sort-icon`,
   * `.nxg-check`, `.nxg-icon--excel`, `.nxg-icon--csv`, `.nxg-search-icon`.
   * An SVG with no sizing resolves to 300x150, so every icon needs either a
   * class or {@link NexGridIconProps.size}.
   */
  className?: string;
  /** Explicit pixel size, for the pager chevrons which have no sizing class. */
  size?: number;
}

function Icon({
  className,
  size,
  children,
}: NexGridIconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
    >
      {children}
    </svg>
  );
}

/** Magnifier — the search field's leading adornment. */
export function SearchIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

/** Cross — clears the search field. */
export function XIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

/** Horizontal sliders — opens the column visibility menu. */
export function SlidersIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </Icon>
  );
}

/** Funnel — opens the density menu. */
export function FilterIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </Icon>
  );
}

/** Downward tray — opens the export menu. */
export function DownloadIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </Icon>
  );
}

/** Gridded document — the formatted Excel export option. */
export function FileSpreadsheetIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M8 13h2" />
      <path d="M14 13h2" />
      <path d="M8 17h2" />
      <path d="M14 17h2" />
    </Icon>
  );
}

/** Lined document — the raw CSV export option. */
export function FileTextIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </Icon>
  );
}

/** Left chevron — previous page. */
export function ChevronLeftIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

/** Right chevron — next page. */
export function ChevronRightIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

/** Up arrow — column sorted ascending. */
export function ArrowUpIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </Icon>
  );
}

/** Down arrow — column sorted descending. */
export function ArrowDownIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </Icon>
  );
}

/** Opposed arrows — column is sortable but not currently sorted. */
export function ArrowUpDownIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
    </Icon>
  );
}

/** Tick — the checked marker in menu checkbox items. */
export function CheckIcon(props: NexGridIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}
