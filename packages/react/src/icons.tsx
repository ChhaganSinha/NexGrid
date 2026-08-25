// The grid's complete icon set, inlined as components.
//
// WHY INLINE: TableX ships with zero runtime dependencies, so an icon package
// (lucide-react, heroicons) is not an option. It would also be a parity hazard —
// the Angular and vanilla adapters draw these same shapes from §7 of the
// adapter spec, and a version bump in one package's icon set would silently
// make one adapter look different from the others.
//
// Every icon shares the same 24x24 stroked geometry, so the wrapper below owns
// those attributes and each export contributes only its paths.

import * as React from "react";

/** Props accepted by every TableX icon. */
export interface TableXIconProps {
  /**
   * Class supplying size and color — `.tbx-icon`, `.tbx-sort-icon`,
   * `.tbx-check`, `.tbx-icon--excel`, `.tbx-icon--csv`, `.tbx-search-icon`.
   * An SVG with no sizing resolves to 300x150, so every icon needs either a
   * class or {@link TableXIconProps.size}.
   */
  className?: string;
  /** Explicit pixel size, for the pager chevrons which have no sizing class. */
  size?: number;
}
export type NexGridIconProps = TableXIconProps;

function Icon({
  className,
  size,
  children,
}: TableXIconProps & { children: React.ReactNode }): React.JSX.Element {
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
export function SearchIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

/** Cross used by the "clear search" button. */
export function XIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

/** Columns icon — 3 vertical columns inside a rounded box. */
export function ColumnsIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </Icon>
  );
}

/** Horizontal sliders — backwards compatible alias to ColumnsIcon. */
export function SlidersIcon(props: TableXIconProps): React.JSX.Element {
  return <ColumnsIcon {...props} />;
}

/** Density icon — horizontal rows / stacked bars. */
export function DensityIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="6" rx="1.5" />
      <rect x="3" y="13.5" width="18" height="6" rx="1.5" />
    </Icon>
  );
}

/** Funnel — backwards compatible alias to DensityIcon. */
export function FilterIcon(props: TableXIconProps): React.JSX.Element {
  return <DensityIcon {...props} />;
}

/** Chevron down for dropdowns. */
export function ChevronDownIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Edit / pencil icon for actions. */
export function EditIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </Icon>
  );
}

/** Download tray — the Export menu trigger. */
export function DownloadIcon(props: TableXIconProps): React.JSX.Element {
  return <ChevronDownIcon {...props} />;
}

/** Spreadsheet document — the Excel export option. */
export function FileSpreadsheetIcon(props: TableXIconProps): React.JSX.Element {
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

/** Text document — the CSV export option. */
export function FileTextIcon(props: TableXIconProps): React.JSX.Element {
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
export function ChevronLeftIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

/** Right chevron — next page. */
export function ChevronRightIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

/** Up arrow — ascending sort. */
export function ArrowUpIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </Icon>
  );
}

/** Down arrow — descending sort. */
export function ArrowDownIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </Icon>
  );
}

/** Opposed arrows — sortable but not currently sorted. */
export function ArrowUpDownIcon(props: TableXIconProps): React.JSX.Element {
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
export function CheckIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

/** Funnel icon for column filter trigger. */
export function FunnelIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </Icon>
  );
}

/** Rotate counter-clockwise / reset icon. */
export function RotateCcwIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

/** Trash / delete icon for actions. */
export function TrashIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </Icon>
  );
}

/** Eye / view icon. */
export function EyeIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

/** Download tray icon. */
export function DownloadTrayIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </Icon>
  );
}

/** Three vertical dots (⋮) icon for column filter & options menu trigger. */
export function DotsVerticalIcon(props: TableXIconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </Icon>
  );
}

export function MoreVerticalIcon(props: TableXIconProps): React.JSX.Element {
  return <DotsVerticalIcon {...props} />;
}
