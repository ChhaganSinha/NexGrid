// TSV (Tab-Separated Values) format for clipboard copy-paste to Excel / Google Sheets.

import type { ExportColumn } from "./columns.js";

function tsvCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let text = String(raw);
  // Replace internal tabs and newlines with spaces so each cell stays in its row/column
  return text.replace(/[\t\r\n]+/g, " ");
}

/** Render rows to a TSV string suitable for clipboard paste into spreadsheet programs. */
export function toTsv<T>(rows: readonly T[], columns: readonly ExportColumn<T>[]): string {
  const head = columns.map((c) => tsvCell(c.header)).join("\t");
  const body = rows.map((r) => columns.map((c) => tsvCell(c.value(r))).join("\t"));
  return [head, ...body].join("\n");
}

/** Copy rows to the clipboard as formatted TSV. Returns true on success. */
export async function copyToClipboard<T>(
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    const text = toTsv(rows, columns);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
