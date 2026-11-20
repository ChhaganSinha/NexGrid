// Client-side row grouping engine (`groupBy`).
//
// Groups displayed rows by a column id or property path while preserving active
// sort order, and computes per-group inline aggregations for any column that
// declares `meta.aggregation`.

import {
  computeAggregation,
  flattenColumns,
  getCellText,
  getCellValue,
  getColumnId,
  getColumnTitle,
  readPropertyByPath,
  type NexGridColumn,
} from "./column.js";

export interface RowGroupSummary {
  /** Column id. */
  columnId: string;
  /** Column header title. */
  columnTitle: string;
  /** Aggregation label prefix (e.g. `"Avg:"`, `"sum:"`). */
  label: string;
  /** Formatted aggregation value. */
  value: string;
}

export interface RowGroupEntry<TData> {
  row: TData;
  originalIndex: number;
}

export interface RowGroup<TData> {
  /** Stable group key (`"__empty__"` for null/blank values). */
  key: string;
  /** Human-readable group value (`"—"` when blank). */
  displayValue: string;
  /** Resolved column header title (e.g. `"Department"`). */
  columnTitle: string;
  /** Member rows paired with their original 0-based index on the page. */
  entries: readonly RowGroupEntry<TData>[];
  /** Number of rows in this group. */
  count: number;
  /** Per-group aggregations computed from columns with `meta.aggregation`. */
  summaries: readonly RowGroupSummary[];
}

/**
 * Group `rows` by `groupByField` (matched case-insensitively against column `id`,
 * `accessorKey`, or raw row property path).
 */
export function groupRows<TData, TRender = unknown>(
  rows: readonly TData[],
  groupByField: string,
  columns: readonly NexGridColumn<TData, TRender>[],
  labels?: { yes: string; no: string },
): RowGroup<TData>[] {
  const fieldTrimmed = groupByField.trim();
  if (!fieldTrimmed || rows.length === 0) return [];

  const leafCols = flattenColumns(columns as NexGridColumn<TData, TRender>[]);
  const targetLower = fieldTrimmed.toLowerCase();
  const groupCol = leafCols.find(
    (col) =>
      getColumnId(col).toLowerCase() === targetLower ||
      (col.accessorKey !== undefined && String(col.accessorKey).toLowerCase() === targetLower),
  );
  const groupColId = groupCol ? getColumnId(groupCol) : fieldTrimmed;
  const columnTitle = groupCol
    ? getColumnTitle(groupCol) || fieldTrimmed
    : fieldTrimmed.charAt(0).toUpperCase() + fieldTrimmed.slice(1);

  const buckets = new Map<
    string,
    { displayValue: string; entries: RowGroupEntry<TData>[] }
  >();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row === undefined) continue;
    const rawVal = groupCol ? getCellValue(groupCol, row) : readPropertyByPath(row, fieldTrimmed);
    const text = getCellText(rawVal, labels).trim();
    const key = text !== "" ? text : "__empty__";
    const displayValue = text !== "" ? text : "—";

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { displayValue, entries: [] };
      buckets.set(key, bucket);
    }
    bucket.entries.push({ row, originalIndex: i });
  }

  const aggCols = leafCols.filter(
    (col) => col.meta?.aggregation !== undefined && getColumnId(col) !== groupColId,
  );

  const result: RowGroup<TData>[] = [];
  for (const [key, bucket] of buckets.entries()) {
    const groupOnlyRows = bucket.entries.map((e) => e.row);
    const summaries: RowGroupSummary[] = [];

    for (const col of aggCols) {
      const aggVal = computeAggregation(col, groupOnlyRows);
      if (aggVal !== null && aggVal !== undefined && String(aggVal) !== "") {
        const colId = getColumnId(col);
        const colTitle = getColumnTitle(col) || colId;
        const label =
          col.meta?.aggregationLabel ||
          (typeof col.meta?.aggregation === "string"
            ? `${colTitle} (${col.meta.aggregation}):`
            : `${colTitle}:`);
        summaries.push({
          columnId: colId,
          columnTitle: colTitle,
          label,
          value: String(aggVal),
        });
      }
    }

    result.push({
      key,
      displayValue: bucket.displayValue,
      columnTitle,
      entries: bucket.entries,
      count: bucket.entries.length,
      summaries,
    });
  }

  return result;
}
