// Formatted Excel (.xls) export.
//
// This produces an HTML-based workbook (the `mso` HTML dialect Excel has
// opened for two decades): styled header row, zebra striping, an automatic
// serial-number column, and value-based "badge" styling so status-like values
// (Active / Pending / Rejected, ...) arrive colored the way they look in the
// grid. Consumers can extend or replace the badge rules per export.

import type { ExportColumn } from "./columns.js";
import { downloadBlob } from "./download.js";

/** A value-based styling rule: any cell whose text matches gets badge styling. */
export interface ExcelBadgeRule {
  /** Case-insensitive cell values this rule applies to. */
  values: readonly string[];
  /** Badge background color (any CSS color Excel understands, e.g. hex). */
  background: string;
  /** Badge text color. */
  color: string;
}

/** Default badge rules: success / warning / danger / info value families. */
export const DEFAULT_BADGE_RULES: readonly ExcelBadgeRule[] = [
  {
    values: ["active", "approved", "graded", "yes", "published", "completed", "success"],
    background: "#dcfce7",
    color: "#15803d",
  },
  {
    values: ["pending", "submitted", "underreview", "invited", "draft", "in progress"],
    background: "#fef3c7",
    color: "#b45309",
  },
  {
    values: ["disabled", "rejected", "no", "critical", "revoked", "failed", "inactive"],
    background: "#fee2e2",
    color: "#b91c1c",
  },
  {
    values: ["superadmin", "admin", "staff", "student", "parent", "user"],
    background: "#e0f2fe",
    color: "#0369a1",
  },
];

export interface ExcelExportOptions<T> {
  /** File name without extension (`.xls` is appended). */
  filename: string;
  /** Sheet name / document title. */
  caption: string;
  rows: readonly T[];
  columns: readonly ExportColumn<T>[];
  /** Value-based badge styling; defaults to {@link DEFAULT_BADGE_RULES}. */
  badgeRules?: readonly ExcelBadgeRule[];
  /** Header text for the automatic serial-number column. Default `"S.No."`. */
  serialHeader?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeStyle(value: string, rules: readonly ExcelBadgeRule[]): string {
  const v = value.trim().toLowerCase();
  for (const rule of rules) {
    if (rule.values.some((candidate) => candidate.toLowerCase() === v)) {
      return (
        `background-color: ${rule.background}; color: ${rule.color}; font-weight: bold; ` +
        `border-radius: 12px; padding: 4px 10px; display: inline-block;`
      );
    }
  }
  return "color: #334155;";
}

/** Render rows to the styled HTML workbook string. Exposed for testing. */
export function toExcelHtml<T>(options: ExcelExportOptions<T>): string {
  const {
    caption,
    rows,
    columns,
    badgeRules = DEFAULT_BADGE_RULES,
    serialHeader = "S.No.",
  } = options;

  const headerHtml = columns
    .map(
      (c) =>
        `<th style="padding: 12px 14px; background-color: #1e293b; color: #ffffff; font-size: 12px; font-weight: bold; text-align: left; border: 1px solid #334155;">${escapeHtml(c.header)}</th>`,
    )
    .join("");

  const bodyHtml = rows
    .map((row, idx) => {
      const bg = idx % 2 === 0 ? "#ffffff" : "#f8fafc";
      const cells = columns.map((col) => {
        const raw = col.value(row);
        const text = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
        const style = badgeStyle(text, badgeRules);
        return `<td style="padding: 10px 14px; border: 1px solid #e2e8f0; font-size: 12px; ${style}">${escapeHtml(text)}</td>`;
      });
      return (
        `<tr style="background-color: ${bg};">` +
        `<td style="padding: 10px 14px; border: 1px solid #e2e8f0; font-size: 12px; font-weight: bold; text-align: center; color: #64748b;">${idx + 1}</td>` +
        cells.join("") +
        `</tr>`
      );
    })
    .join("");

  const sheetName = escapeHtml(caption.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Export");
  const exportedAt = new Date();

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <!--[if gte mso 9]>
    <xml>
      <x:ExcelWorkbook>
        <x:ExcelWorksheets>
          <x:ExcelWorksheet>
            <x:Name>${sheetName}</x:Name>
            <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
          </x:ExcelWorksheet>
        </x:ExcelWorksheets>
      </x:ExcelWorkbook>
    </xml>
    <![endif]-->
  </head>
  <body style="font-family: Arial, sans-serif; padding: 16px;">
    <h2 style="color: #0f172a; font-size: 18px; margin-bottom: 6px;">${escapeHtml(caption)} Data Export</h2>
    <p style="color: #64748b; font-size: 12px; margin-top: 0; margin-bottom: 16px;">Exported ${rows.length} total records on ${exportedAt.toLocaleDateString()} at ${exportedAt.toLocaleTimeString()}</p>
    <table style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th style="padding: 12px 14px; background-color: #1e293b; color: #ffffff; font-size: 12px; font-weight: bold; text-align: center; border: 1px solid #334155;">${escapeHtml(serialHeader)}</th>
          ${headerHtml}
        </tr>
      </thead>
      <tbody>
        ${bodyHtml}
      </tbody>
    </table>
  </body>
</html>`;
}

/**
 * Build and download the formatted workbook. No-ops outside the browser.
 * Returns the row count so the caller can report the result.
 */
export function downloadExcel<T>(options: ExcelExportOptions<T>): number {
  const html = toExcelHtml(options);
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const name = options.filename.endsWith(".xls") ? options.filename : `${options.filename}.xls`;
  if (!downloadBlob(name, blob)) return 0;
  return options.rows.length;
}
