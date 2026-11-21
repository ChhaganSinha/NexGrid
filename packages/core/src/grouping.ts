// Client-side single & multi-column nested row grouping engine (`groupBy`).
//
// Supports both single-column (`groupBy: "department"`) and multi-level nested
// grouping (`groupBy: ["region", "department"]` or `"region,department"`),
// preserving active sort order and computing per-group inline aggregations for
// any column that declares `meta.aggregation`.

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
  /** Nesting depth (`0` for top-level group). */
  depth?: number;
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

export type NestedGroupRenderItem<TData> =
  | {
      kind: "group";
      key: string;
      depth: number;
      field: string;
      columnTitle: string;
      displayValue: string;
      count: number;
      collapsed: boolean;
      summaries: readonly RowGroupSummary[];
    }
  | {
      kind: "row";
      row: TData;
      originalIndex: number;
      depth: number;
    };

/**
 * Normalize `groupBy` (`"dept"`, `"region,dept"`, or `["region", "dept"]`) into
 * a deduplicated array of non-empty field names.
 */
export function normalizeGroupBy(
  groupBy?: string | readonly string[] | null,
): string[] {
  if (!groupBy) return [];
  const rawList = Array.isArray(groupBy)
    ? groupBy
    : String(groupBy).split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of rawList) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

function computeGroupSummaries<TData, TRender>(
  entries: readonly RowGroupEntry<TData>[],
  leafCols: readonly NexGridColumn<TData, TRender>[],
  excludedIdsLower: ReadonlySet<string>,
): RowGroupSummary[] {
  const aggCols = leafCols.filter(
    (col) =>
      col.meta?.aggregation !== undefined &&
      !excludedIdsLower.has(getColumnId(col).toLowerCase()),
  );
  if (aggCols.length === 0) return [];

  const groupOnlyRows = entries.map((e) => e.row);
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
  return summaries;
}

/**
 * Group `rows` by a single `groupByField` (matched case-insensitively against
 * column `id`, `accessorKey`, or raw row property path).
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

  const excluded = new Set([groupColId.toLowerCase()]);
  const result: RowGroup<TData>[] = [];
  for (const [key, bucket] of buckets.entries()) {
    result.push({
      key,
      depth: 0,
      displayValue: bucket.displayValue,
      columnTitle,
      entries: bucket.entries,
      count: bucket.entries.length,
      summaries: computeGroupSummaries(bucket.entries, leafCols, excluded),
    });
  }

  return result;
}

/**
 * Recursively group `rows` across 1 or more nested `groupByFields` and flatten
 * visible group headers + expanded rows according to `collapsedKeys`.
 */
export function buildNestedGroupItems<TData, TRender = unknown>(
  rows: readonly TData[],
  groupByFields: string | readonly string[],
  columns: readonly NexGridColumn<TData, TRender>[],
  collapsedKeys?: ReadonlySet<string>,
  labels?: { yes: string; no: string },
): NestedGroupRenderItem<TData>[] {
  const fields = normalizeGroupBy(groupByFields);
  if (fields.length === 0 || rows.length === 0) return [];

  const leafCols = flattenColumns(columns as NexGridColumn<TData, TRender>[]);
  const collapsed = collapsedKeys ?? new Set<string>();
  const excludedIds = new Set<string>();

  const resolvedFields = fields.map((field) => {
    const lower = field.toLowerCase();
    const col = leafCols.find(
      (c) =>
        getColumnId(c).toLowerCase() === lower ||
        (c.accessorKey !== undefined && String(c.accessorKey).toLowerCase() === lower),
    );
    const colId = col ? getColumnId(col) : field;
    excludedIds.add(colId.toLowerCase());
    const columnTitle = col
      ? getColumnTitle(col) || field
      : field.charAt(0).toUpperCase() + field.slice(1);
    return { field, col, columnTitle };
  });

  const initialEntries: RowGroupEntry<TData>[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row !== undefined) initialEntries.push({ row, originalIndex: i });
  }

  const out: NestedGroupRenderItem<TData>[] = [];

  const recurse = (
    entries: readonly RowGroupEntry<TData>[],
    depth: number,
    parentKeyPrefix: string,
  ): void => {
    const level = resolvedFields[depth];
    if (!level) {
      for (const entry of entries) {
        out.push({
          kind: "row",
          row: entry.row,
          originalIndex: entry.originalIndex,
          depth,
        });
      }
      return;
    }

    const buckets = new Map<
      string,
      { displayValue: string; entries: RowGroupEntry<TData>[] }
    >();

    for (const entry of entries) {
      const rawVal = level.col
        ? getCellValue(level.col, entry.row)
        : readPropertyByPath(entry.row, level.field);
      const text = getCellText(rawVal, labels).trim();
      const rawKey = text !== "" ? text : "__empty__";
      const displayValue = text !== "" ? text : "—";
      let bucket = buckets.get(rawKey);
      if (!bucket) {
        bucket = { displayValue, entries: [] };
        buckets.set(rawKey, bucket);
      }
      bucket.entries.push(entry);
    }

    for (const [rawKey, bucket] of buckets.entries()) {
      const compositeKey = parentKeyPrefix ? `${parentKeyPrefix}||${rawKey}` : rawKey;
      const isCollapsed = collapsed.has(compositeKey);
      out.push({
        kind: "group",
        key: compositeKey,
        depth,
        field: level.field,
        columnTitle: level.columnTitle,
        displayValue: bucket.displayValue,
        count: bucket.entries.length,
        collapsed: isCollapsed,
        summaries: computeGroupSummaries(bucket.entries, leafCols, excludedIds),
      });

      if (!isCollapsed) {
        recurse(bucket.entries, depth + 1, compositeKey);
      }
    }
  };

  recurse(initialEntries, 0, "");
  return out;
}
