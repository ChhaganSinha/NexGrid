// Horizontal (column) virtualization windowing math for wide datasets (50-500+ columns).
//
// Calculates visible unpinned column slices and spacer cell widths while keeping
// left-pinned and right-pinned columns sticky and uninterrupted.

export const DEFAULT_COLUMN_WIDTH = 140;
export const DEFAULT_COLUMN_OVERSCAN = 2;

export interface VirtualColumnsInput<TCol> {
  /** All currently visible columns. */
  columns: readonly TCol[];
  /** Pinned column status dictionary (`left` | `right` | `none`). */
  pinnedCols?: Record<string, "left" | "right" | "none">;
  /** Explicit custom column widths dictionary. */
  columnWidths?: Record<string, number>;
  /** Current horizontal scroll offset (`scrollLeft`) of `.tbx-table-wrap` in px. */
  scrollLeft: number;
  /** Visible viewport width in px (defaults to 1024). */
  viewportWidth?: number;
  /** Default width applied to un-sized columns (defaults to 140). */
  defaultWidth?: number;
  /** Extra columns rendered to the left and right of the visible window (defaults to 2). */
  overscan?: number;
  /** Column ID extractor. */
  getColumnId: (col: TCol) => string;
  /** Pinned status checker function. */
  isPinned: (col: TCol, pinned?: Record<string, "left" | "right" | "none">) => "left" | "right" | "none" | false;
}

export interface VirtualColumnsWindow<TCol> {
  /** Columns pinned to the left edge (rendered before the virtual window). */
  leftPinned: readonly TCol[];
  /** Alias for leftPinned. */
  leftPinnedColumns: readonly TCol[];
  /** Sliced unpinned columns currently within the horizontal viewport window. */
  virtualColumns: readonly TCol[];
  /** Columns pinned to the right edge (rendered after the virtual window). */
  rightPinned: readonly TCol[];
  /** Alias for rightPinned. */
  rightPinnedColumns: readonly TCol[];
  /** Pixel width of the leading unpinned column spacer `<th>`/`<td>`. */
  leftSpacerWidth: number;
  /** Pixel width of the trailing unpinned column spacer `<th>`/`<td>`. */
  rightSpacerWidth: number;
  /** Index of the first visible unpinned column in the unpinned array. */
  startIndex: number;
  /** Exclusive end index of unpinned columns in the unpinned array. */
  endIndex: number;
  /** Total width of all unpinned columns combined in px. */
  totalUnpinnedWidth: number;
  /** Total width of all columns combined in px (including pinned and spacers). */
  totalGridWidth: number;
}

/**
 * Compute the visible `[startIndex, endIndex)` slice and horizontal spacers for
 * unpinned columns during horizontal scrolling.
 */
export function computeVirtualColumnsWindow<TCol>(
  input: VirtualColumnsInput<TCol>,
): VirtualColumnsWindow<TCol> {
  const {
    columns,
    pinnedCols,
    columnWidths = {},
    scrollLeft: rawScrollLeft,
    viewportWidth: rawViewportWidth = 1024,
    defaultWidth = DEFAULT_COLUMN_WIDTH,
    overscan: rawOverscan = DEFAULT_COLUMN_OVERSCAN,
    getColumnId,
    isPinned,
  } = input;

  const leftPinned: TCol[] = [];
  const rightPinned: TCol[] = [];
  const unpinned: TCol[] = [];

  let leftPinnedWidth = 0;
  let rightPinnedWidth = 0;

  for (const col of columns) {
    const pin = isPinned(col, pinnedCols);
    const cid = getColumnId(col);
    const w = Math.max(20, columnWidths[cid] ?? (col as { meta?: { width?: number; minWidth?: number } }).meta?.width ?? (col as { meta?: { width?: number; minWidth?: number } }).meta?.minWidth ?? defaultWidth);

    if (pin === "left") {
      leftPinned.push(col);
      leftPinnedWidth += w;
    } else if (pin === "right") {
      rightPinned.push(col);
      rightPinnedWidth += w;
    } else {
      unpinned.push(col);
    }
  }

  if (unpinned.length === 0) {
    return {
      leftPinned,
      leftPinnedColumns: leftPinned,
      virtualColumns: [],
      rightPinned,
      rightPinnedColumns: rightPinned,
      leftSpacerWidth: 0,
      rightSpacerWidth: 0,
      startIndex: 0,
      endIndex: 0,
      totalUnpinnedWidth: 0,
      totalGridWidth: leftPinnedWidth + rightPinnedWidth,
    };
  }

  // Calculate unpinned column widths and cumulative offsets
  const unpinnedWidths: number[] = new Array(unpinned.length);
  const unpinnedOffsets: number[] = new Array(unpinned.length + 1);
  unpinnedOffsets[0] = 0;

  for (let i = 0; i < unpinned.length; i++) {
    const col = unpinned[i]!;
    const cid = getColumnId(col);
    const w = Math.max(20, columnWidths[cid] ?? (col as { meta?: { width?: number; minWidth?: number } }).meta?.width ?? (col as { meta?: { width?: number; minWidth?: number } }).meta?.minWidth ?? defaultWidth);
    unpinnedWidths[i] = w;
    unpinnedOffsets[i + 1] = unpinnedOffsets[i]! + w;
  }

  const totalUnpinnedWidth = unpinnedOffsets[unpinned.length]!;
  const viewportWidth = Math.max(100, rawViewportWidth);
  const overscan = Math.max(0, Math.trunc(rawOverscan));

  // The scrollable area available to unpinned columns
  const unpinnedViewport = Math.max(100, viewportWidth - leftPinnedWidth - rightPinnedWidth);
  const scrollLeft = Math.max(0, Math.min(rawScrollLeft, Math.max(0, totalUnpinnedWidth - unpinnedViewport)));
  const scrollRight = scrollLeft + unpinnedViewport;

  // Binary search for first visible column
  let firstVisible = 0;
  for (let i = 0; i < unpinned.length; i++) {
    if (unpinnedOffsets[i + 1]! > scrollLeft) {
      firstVisible = i;
      break;
    }
  }

  // Find last visible column
  let lastVisible = firstVisible;
  for (let i = firstVisible; i < unpinned.length; i++) {
    if (unpinnedOffsets[i]! >= scrollRight) {
      break;
    }
    lastVisible = i;
  }

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(unpinned.length, lastVisible + 1 + overscan);

  const leftSpacerWidth = unpinnedOffsets[startIndex]!;
  const rightSpacerWidth = Math.max(0, totalUnpinnedWidth - unpinnedOffsets[endIndex]!);
  const virtualColumns = unpinned.slice(startIndex, endIndex);

  return {
    leftPinned,
    leftPinnedColumns: leftPinned,
    virtualColumns,
    rightPinned,
    rightPinnedColumns: rightPinned,
    leftSpacerWidth,
    rightSpacerWidth,
    startIndex,
    endIndex,
    totalUnpinnedWidth,
    totalGridWidth: leftPinnedWidth + totalUnpinnedWidth + rightPinnedWidth,
  };
}

/**
 * Automatically compute optimal column widths from text content lengths.
 */
export function computeAutosizeWidths<TData, TCol>(
  columns: readonly TCol[],
  rows: readonly TData[],
  options: {
    getColumnId: (col: TCol) => string;
    getColumnTitle: (col: TCol) => string;
    getCellValue: (col: TCol, row: TData) => unknown;
    getCellText: (val: unknown) => string;
    minWidth?: number;
    maxWidth?: number;
    charWidthPx?: number;
    paddingPx?: number;
  },
): Record<string, number> {
  const {
    getColumnId,
    getColumnTitle,
    getCellValue,
    getCellText,
    minWidth = 60,
    maxWidth = 600,
    charWidthPx = 8,
    paddingPx = 36,
  } = options;

  const result: Record<string, number> = {};
  const sampleRows = rows.length > 200 ? rows.slice(0, 200) : rows;

  for (const col of columns) {
    const cid = getColumnId(col);
    if (!cid) continue;

    const title = getColumnTitle(col) || cid;
    let maxChars = title.length;

    for (let r = 0; r < sampleRows.length; r++) {
      const val = getCellValue(col, sampleRows[r]!);
      const text = getCellText(val);
      if (text.length > maxChars) {
        maxChars = text.length;
      }
    }

    const calculated = Math.round(maxChars * charWidthPx + paddingPx);
    result[cid] = Math.max(minWidth, Math.min(maxWidth, calculated));
  }

  return result;
}

/**
 * Distribute excess container width across unpinned columns so the table
 * fills 100% of the viewport width without gaps.
 */
export function distributeContainerWidth<TCol>(
  columns: readonly TCol[],
  containerWidth: number,
  currentWidths: Record<string, number>,
  options: {
    getColumnId: (col: TCol) => string;
    isPinned: (col: TCol) => boolean;
    defaultWidth?: number;
  },
): Record<string, number> {
  if (containerWidth <= 0 || columns.length === 0) return { ...currentWidths };

  const { getColumnId, isPinned, defaultWidth = DEFAULT_COLUMN_WIDTH } = options;

  let totalAllocated = 0;
  const unpinned: string[] = [];

  for (const col of columns) {
    const cid = getColumnId(col);
    const w = currentWidths[cid] ?? (col as { meta?: { width?: number } }).meta?.width ?? defaultWidth;
    totalAllocated += w;
    if (!isPinned(col)) {
      unpinned.push(cid);
    }
  }

  const surplus = containerWidth - totalAllocated;
  if (surplus <= 0 || unpinned.length === 0) return { ...currentWidths };

  const extraPerCol = Math.floor(surplus / unpinned.length);
  const remainder = surplus % unpinned.length;

  const nextWidths = { ...currentWidths };
  for (let i = 0; i < unpinned.length; i++) {
    const cid = unpinned[i]!;
    const cur = nextWidths[cid] ?? defaultWidth;
    nextWidths[cid] = cur + extraPerCol + (i === 0 ? remainder : 0);
  }

  return nextWidths;
}
