// Row virtualization windowing math for 10,000+ row datasets.
//
// Pure, framework-agnostic calculation used by Vanilla, React, and Angular
// adapters to slice visible rows and render top/bottom `<tr class="tbx-virtual-spacer">`
// rows inside native `<table>` elements — preserving column widths, sticky
// headers, sticky summary footers, and sticky left/right pinned columns.

import { DENSITY_ROW_HEIGHT, type Density } from "./types.js";

export const DEFAULT_VIRTUAL_HEIGHT = 520;
export const DEFAULT_VIRTUAL_OVERSCAN = 6;

export interface VirtualWindowInput {
  /** Total number of rows in the current view. */
  totalRows: number;
  /** Current vertical scroll offset (`scrollTop`) of `.tbx-table-wrap` in px. */
  scrollTop: number;
  /** Visible viewport height in px (defaults to `520`). */
  viewportHeight?: number;
  /** Height of a single row in px (or derived from `density`). */
  rowHeight?: number;
  /** Grid density preset used when `rowHeight` is omitted. */
  density?: Density;
  /** Extra buffer rows rendered above and below the viewport (defaults to `6`). */
  overscan?: number;
}

export interface VirtualWindow {
  /** Inclusive start index (`0 <= startIndex <= endIndex`). */
  startIndex: number;
  /** Exclusive end index (`startIndex <= endIndex <= totalRows`). */
  endIndex: number;
  /** Pixel height of the top spacer `<tr>`. */
  topSpacerHeight: number;
  /** Pixel height of the bottom spacer `<tr>`. */
  bottomSpacerHeight: number;
  /** Total virtual scroll height in px (`totalRows * rowHeight`). */
  totalHeight: number;
  /** Resolved row height in px. */
  rowHeight: number;
}

/**
 * Compute the visible `[startIndex, endIndex)` slice and spacer heights for a
 * virtualized table body.
 *
 * Guarantees `topSpacerHeight + (endIndex - startIndex) * rowHeight + bottomSpacerHeight === totalHeight`
 * at every scroll offset so scrollbar geometry stays rock-steady.
 */
export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindow {
  const totalRows = Math.max(0, Math.trunc(input.totalRows));
  const rawRowHeight =
    input.rowHeight ?? DENSITY_ROW_HEIGHT[input.density ?? "default"] ?? 44;
  const rowHeight = Math.max(
    16,
    Number.isFinite(rawRowHeight) && rawRowHeight > 0 ? rawRowHeight : 44,
  );

  if (totalRows === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalHeight: 0,
      rowHeight,
    };
  }

  const rawViewport = input.viewportHeight ?? DEFAULT_VIRTUAL_HEIGHT;
  const viewportHeight = Math.max(
    rowHeight,
    Number.isFinite(rawViewport) && rawViewport > 0 ? rawViewport : DEFAULT_VIRTUAL_HEIGHT,
  );
  const overscan = Math.max(
    0,
    Number.isFinite(input.overscan) ? Math.trunc(input.overscan!) : DEFAULT_VIRTUAL_OVERSCAN,
  );

  const totalHeight = totalRows * rowHeight;
  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const scrollTop = Math.min(
    Math.max(0, Number.isFinite(input.scrollTop) ? input.scrollTop : 0),
    maxScrollTop,
  );

  const firstVisible = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 1;

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(totalRows, firstVisible + visibleCount + overscan);

  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * rowHeight);

  return {
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
    totalHeight,
    rowHeight,
  };
}
