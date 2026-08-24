// RFC 4180 CSV export.
//
// Quoting is not optional: names carry commas, free-text fields carry quotes
// and newlines, and a naive `join(",")` would silently corrupt exactly the
// rows an operator is most likely to be investigating.
//
// The leading-character guard is a spreadsheet-injection defense: a cell that
// begins `=`, `+`, `-` or `@` is executed as a formula by Excel/Sheets on
// open. Grid data is frequently user-supplied, so a value like
// `=HYPERLINK(...)` would otherwise become a live formula in an operator's
// spreadsheet (OWASP CSV Injection).

import type { ExportColumn } from "./columns.js";
import { downloadBlob } from "./download.js";

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function cell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let text = String(raw);

  // Neutralize a leading formula trigger by prefixing a single quote, which
  // spreadsheets treat as "this is text". The visible value is unchanged.
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;

  if (NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Render rows to an RFC 4180 CSV string (CRLF line endings — Excel is the primary consumer). */
export function toCsv<T>(rows: readonly T[], columns: readonly ExportColumn<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

/**
 * Build and download a CSV. No-ops outside the browser. Returns the row count
 * so the caller can report "Exported N rows" rather than guessing.
 */
export function downloadCsv<T>(
  filename: string,
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
): number {
  // The BOM makes Excel read the file as UTF-8; without it, accented names
  // arrive mojibake'd.
  const blob = new Blob(["﻿", toCsv(rows, columns)], {
    type: "text/csv;charset=utf-8;",
  });
  if (!downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, blob)) return 0;
  return rows.length;
}
