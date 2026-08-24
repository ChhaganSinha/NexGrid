// Bridging grid column definitions to export columns.

import {
  getCellText,
  getCellValue,
  getColumnId,
  getColumnTitle,
  isExportable,
  type NexGridColumn,
} from "../column.js";

/** One export column: a header and a plain-text value per row. */
export interface ExportColumn<T> {
  /** Header text written to the file. */
  header: string;
  /** Cell value for a row. Nullish becomes an empty cell. */
  value: (row: T) => string | number | null | undefined;
}

/**
 * Build export columns from grid columns: structural columns (`select`,
 * `actions`) and columns marked `exportable: false` are dropped; values are
 * read by column id and rendered as plain text (custom cell renderers are
 * presentation, not data, so exports use the underlying row value).
 */
export function toExportColumns<TData, TRender>(
  columns: readonly NexGridColumn<TData, TRender>[],
  labels?: { yes: string; no: string },
): ExportColumn<TData>[] {
  return columns.filter(isExportable).map((col) => ({
    header: getColumnTitle(col) || getColumnId(col),
    value: (row: TData) => getCellText(getCellValue(col, row), labels),
  }));
}
