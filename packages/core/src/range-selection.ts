// Spreadsheet keyboard navigation, Shift+Click contiguous row selection,
// drag-and-drop row reordering, rectangular cell range selection, status-bar
// range aggregations, and multi-cell TSV clipboard copy/paste.

import { getCellText, getCellValue, type NexGridColumn } from "./column.js";

export interface CellCoord {
  rowIndex: number;
  colIndex: number;
}

export interface NormalizedCellRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export interface RangeAggregationStats {
  /** Total cells inside the selected rectangle. */
  cellCount: number;
  /** Count of finite numeric cells inside the rectangle. */
  numericCount: number;
  /** Sum of numeric cells (`null` when `numericCount === 0`). */
  sum: number | null;
  /** Arithmetic mean of numeric cells (`null` when `numericCount === 0`). */
  avg: number | null;
  /** Minimum numeric value (`null` when `numericCount === 0`). */
  min: number | null;
  /** Maximum numeric value (`null` when `numericCount === 0`). */
  max: number | null;
}

/** Normalize two corner coordinates into an ordered `{ minRow, maxRow, minCol, maxCol }` box. */
export function normalizeCellRange(a: CellCoord, b: CellCoord): NormalizedCellRange {
  return {
    minRow: Math.max(0, Math.min(a.rowIndex, b.rowIndex)),
    maxRow: Math.max(0, Math.max(a.rowIndex, b.rowIndex)),
    minCol: Math.max(0, Math.min(a.colIndex, b.colIndex)),
    maxCol: Math.max(0, Math.max(a.colIndex, b.colIndex)),
  };
}

/** True when `(rowIndex, colIndex)` falls inside `range`. */
export function isCellInRange(
  rowIndex: number,
  colIndex: number,
  range: NormalizedCellRange | null | undefined,
): boolean {
  if (!range) return false;
  return (
    rowIndex >= range.minRow &&
    rowIndex <= range.maxRow &&
    colIndex >= range.minCol &&
    colIndex <= range.maxCol
  );
}

/**
 * Compute Excel-style status-bar statistics (Count, Sum, Avg, Min, Max) over a
 * rectangular cell range. Returns `null` when fewer than 2 cells are selected.
 */
export function computeRangeStats<TData, TRender = unknown>(
  rows: readonly TData[],
  columns: readonly NexGridColumn<TData, TRender>[],
  range: NormalizedCellRange | null | undefined,
): RangeAggregationStats | null {
  if (!range || rows.length === 0 || columns.length === 0) return null;

  const maxRow = Math.min(rows.length - 1, range.maxRow);
  const maxCol = Math.min(columns.length - 1, range.maxCol);
  if (maxRow < range.minRow || maxCol < range.minCol) return null;

  const cellCount = (maxRow - range.minRow + 1) * (maxCol - range.minCol + 1);
  if (cellCount < 2) return null;

  const nums: number[] = [];
  for (let r = range.minRow; r <= maxRow; r++) {
    const row = rows[r];
    if (row === undefined) continue;
    for (let c = range.minCol; c <= maxCol; c++) {
      const col = columns[c];
      if (!col) continue;
      const raw = getCellValue(col, row);
      if (typeof raw === "number" && Number.isFinite(raw)) {
        nums.push(raw);
      } else if (typeof raw === "string") {
        const cleaned = raw.trim().replace(/^[$€£¥₹]\s*/, "").replace(/,/g, "").replace(/%$/, "");
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
          const n = Number(cleaned);
          if (Number.isFinite(n)) nums.push(n);
        }
      }
    }
  }

  if (nums.length === 0) {
    return {
      cellCount,
      numericCount: 0,
      sum: null,
      avg: null,
      min: null,
      max: null,
    };
  }

  const sumRaw = nums.reduce((acc, n) => acc + n, 0);
  const sum = Math.round(sumRaw * 100) / 100;
  const avg = Math.round((sumRaw / nums.length) * 100) / 100;
  return {
    cellCount,
    numericCount: nums.length,
    sum,
    avg,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

/** Serialize a rectangular cell selection into TSV for `Ctrl+C` / `Cmd+C`. */
export function formatRangeTsv<TData, TRender = unknown>(
  rows: readonly TData[],
  columns: readonly NexGridColumn<TData, TRender>[],
  range: NormalizedCellRange,
  labels?: { yes: string; no: string },
): string {
  const maxRow = Math.min(rows.length - 1, range.maxRow);
  const maxCol = Math.min(columns.length - 1, range.maxCol);
  const lines: string[] = [];

  for (let r = range.minRow; r <= maxRow; r++) {
    const row = rows[r];
    if (row === undefined) continue;
    const cells: string[] = [];
    for (let c = range.minCol; c <= maxCol; c++) {
      const col = columns[c];
      if (!col) continue;
      const text = getCellText(getCellValue(col, row), labels).replace(/[\t\r\n]+/g, " ");
      cells.push(text);
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

/** Parse tab-separated / newline-separated clipboard text for `Ctrl+V` multi-cell paste. */
export function parseClipboardTsv(rawText: string): string[][] {
  if (!rawText) return [];
  const trimmed = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Drop trailing single newline that Excel/Sheets append on copy
  const normalized = trimmed.endsWith("\n") ? trimmed.slice(0, -1) : trimmed;
  if (!normalized) return [];
  return normalized.split("\n").map((line) => line.split("\t"));
}

/**
 * Compute next cell coordinate for spreadsheet keyboard navigation
 * (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`).
 * Returns `null` for non-navigation keys.
 */
export function moveFocusCoord(
  current: CellCoord,
  key: string,
  rowCount: number,
  colCount: number,
  pageStep = 10,
): CellCoord | null {
  if (rowCount <= 0 || colCount <= 0) return null;
  const maxR = rowCount - 1;
  const maxC = colCount - 1;
  const r = Math.min(Math.max(0, current.rowIndex), maxR);
  const c = Math.min(Math.max(0, current.colIndex), maxC);

  switch (key) {
    case "ArrowUp":
      return { rowIndex: Math.max(0, r - 1), colIndex: c };
    case "ArrowDown":
      return { rowIndex: Math.min(maxR, r + 1), colIndex: c };
    case "ArrowLeft":
      return { rowIndex: r, colIndex: Math.max(0, c - 1) };
    case "ArrowRight":
      return { rowIndex: r, colIndex: Math.min(maxC, c + 1) };
    case "Home":
      return { rowIndex: r, colIndex: 0 };
    case "End":
      return { rowIndex: r, colIndex: maxC };
    case "PageUp":
      return { rowIndex: Math.max(0, r - pageStep), colIndex: c };
    case "PageDown":
      return { rowIndex: Math.min(maxR, r + pageStep), colIndex: c };
    default:
      return null;
  }
}

/**
 * Update selected row IDs across the contiguous `[anchorIndex..targetIndex]` range
 * when a user `Shift+Click`s a row checkbox.
 */
export function selectContiguousRowIds(
  pageRowIds: readonly string[],
  anchorIndex: number,
  targetIndex: number,
  currentSelected: ReadonlySet<string>,
  shouldSelect: boolean,
): Set<string> {
  const next = new Set(currentSelected);
  if (pageRowIds.length === 0) return next;
  const start = Math.max(0, Math.min(anchorIndex, targetIndex));
  const end = Math.min(pageRowIds.length - 1, Math.max(anchorIndex, targetIndex));
  for (let i = start; i <= end; i++) {
    const id = pageRowIds[i];
    if (!id) continue;
    if (shouldSelect) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** Non-mutating array move helper for drag-and-drop row reordering. */
export function reorderArrayItem<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const result = [...items];
  if (
    fromIndex < 0 ||
    fromIndex >= result.length ||
    toIndex < 0 ||
    toIndex >= result.length ||
    fromIndex === toIndex
  ) {
    return result;
  }
  const [moved] = result.splice(fromIndex, 1);
  if (moved !== undefined) {
    result.splice(toIndex, 0, moved);
  }
  return result;
}
