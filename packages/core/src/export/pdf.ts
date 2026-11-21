// Zero-dependency native PDF 1.4 report exporter & print-ready HTML builder.
//
// Produces a real, multi-page landscape A4 PDF document (`%PDF-1.4`) using
// built-in Type 1 Helvetica & Helvetica-Bold fonts — requiring zero external
// font files or third-party libraries. Every page carries a dark slate header
// bar, proportional column widths, zebra row tints, colored status badge fills,
// and page numbering ("Page X of Y").

import { downloadBlob } from "./download.js";
import {
  DEFAULT_BADGE_RULES,
  type ExcelBadgeRule,
  type ExcelExportOptions,
} from "./excel.js";

const PDF_MIME = "application/pdf";

// Landscape A4 in points (1 pt = 1/72 inch)
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN_X = 32;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const HEADER_HEIGHT = 22;
const ROW_HEIGHT = 18;

function hexToRgb01(cssColor: string, fallback: [number, number, number]): [number, number, number] {
  const cleaned = cssColor.trim().replace(/^#/, "");
  let hex = cleaned;
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    hex = cleaned
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return [
    Math.round(r * 1000) / 1000,
    Math.round(g * 1000) / 1000,
    Math.round(b * 1000) / 1000,
  ];
}

/**
 * Transliterate/normalize common Unicode punctuation into WinAnsi-safe ASCII
 * and escape PDF literal string delimiters `(`, `)`, `\`.
 */
function pdfSafeString(raw: string): string {
  const normalized = raw
    .replace(/\u2014|\u2013/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\r\n\t]+/g, " ")
    // Replace non-WinAnsi characters outside printable Latin-1 with '?'
    .replace(/[^\x20-\xFF]/g, "?");

  return normalized
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function truncateToWidth(text: string, colWidthPt: number, fontSize: number): string {
  const usable = Math.max(8, colWidthPt - 10);
  const avgCharWidth = fontSize * 0.52;
  const maxChars = Math.max(2, Math.floor(usable / avgCharWidth));
  if (text.length <= maxChars) return text;
  if (maxChars <= 3) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - 2)}..`;
}

function findBadgeRule(
  value: string,
  rules: readonly ExcelBadgeRule[],
): ExcelBadgeRule | undefined {
  const norm = value.trim().toLowerCase();
  if (!norm || norm === "—" || norm === "-") return undefined;
  return rules.find((r) => r.values.some((v) => v.toLowerCase() === norm));
}

/**
 * Generate a complete multi-page landscape A4 PDF 1.4 binary document as `Uint8Array`.
 */
export function toPdfBytes<T>(options: ExcelExportOptions<T>): Uint8Array {
  const {
    caption,
    rows,
    columns,
    badgeRules = DEFAULT_BADGE_RULES,
    serialHeader = "S.No.",
  } = options;

  const totalCols = columns.length + 1;
  const exportedDate = new Date().toISOString().slice(0, 10);
  const title = `${caption || "Export"} — Report`;
  const subtitle = `Exported ${rows.length} total records on ${exportedDate}`;

  // Compute proportional column weights from header + up to 100 sample rows
  const weights = new Array<number>(totalCols).fill(8);
  weights[0] = Math.max(6, serialHeader.length + 2, String(rows.length).length + 2);
  const sampleLimit = Math.min(rows.length, 100);
  for (let c = 0; c < columns.length; c++) {
    let w = Math.max(8, columns[c]!.header.length + 3);
    for (let r = 0; r < sampleLimit; r++) {
      const raw = columns[c]!.value(rows[r]!);
      const len = raw === null || raw === undefined ? 1 : String(raw).length;
      if (len + 2 > w) w = Math.min(36, len + 2);
    }
    weights[c + 1] = w;
  }

  const weightSum = weights.reduce((acc, w) => acc + w, 0) || 1;
  const colWidths = weights.map((w) => Math.round((w / weightSum) * CONTENT_WIDTH * 100) / 100);
  // Adjust last column to absorb rounding remainder
  if (colWidths.length > 0) {
    const allocated = colWidths.slice(0, -1).reduce((a, b) => a + b, 0);
    colWidths[colWidths.length - 1] = Math.max(24, Math.round((CONTENT_WIDTH - allocated) * 100) / 100);
  }

  // Pagination math
  const firstPageBannerHeight = 40;
  const firstPageAvailable = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - firstPageBannerHeight - HEADER_HEIGHT;
  const nextPageAvailable = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM - HEADER_HEIGHT;
  const rowsFirstPage = Math.max(1, Math.floor(firstPageAvailable / ROW_HEIGHT));
  const rowsNextPage = Math.max(1, Math.floor(nextPageAvailable / ROW_HEIGHT));

  const pageSlices: Array<{ start: number; end: number }> = [];
  if (rows.length === 0) {
    pageSlices.push({ start: 0, end: 0 });
  } else {
    let cursor = 0;
    let isFirst = true;
    while (cursor < rows.length) {
      const take = isFirst ? rowsFirstPage : rowsNextPage;
      pageSlices.push({ start: cursor, end: Math.min(rows.length, cursor + take) });
      cursor += take;
      isFirst = false;
    }
  }

  const totalPages = pageSlices.length;
  const pageStreams: string[] = [];

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const slice = pageSlices[pIdx]!;
    const ops: string[] = [];
    let topY = PAGE_HEIGHT - MARGIN_TOP;

    if (pIdx === 0) {
      // Title
      ops.push(`BT /F2 14 Tf 0.059 0.090 0.165 rg ${MARGIN_X} ${(topY - 14).toFixed(2)} Td (${pdfSafeString(title)}) Tj ET`);
      // Subtitle
      ops.push(`BT /F1 9 Tf 0.392 0.455 0.545 rg ${MARGIN_X} ${(topY - 28).toFixed(2)} Td (${pdfSafeString(subtitle)}) Tj ET`);
      topY -= firstPageBannerHeight;
    }

    // Header bar (#1E293B -> 0.118, 0.161, 0.231)
    const headerBottomY = topY - HEADER_HEIGHT;
    ops.push(`0.118 0.161 0.231 rg ${MARGIN_X} ${headerBottomY.toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ${HEADER_HEIGHT} re f`);

    let xCursor = MARGIN_X;
    const allHeaders = [serialHeader, ...columns.map((c) => c.header)];
    for (let c = 0; c < totalCols; c++) {
      const cw = colWidths[c]!;
      const label = truncateToWidth(allHeaders[c] ?? "", cw, 8.5);
      ops.push(
        `BT /F2 8.5 Tf 1 1 1 rg ${(xCursor + 5).toFixed(2)} ${(headerBottomY + 7).toFixed(2)} Td (${pdfSafeString(label)}) Tj ET`,
      );
      xCursor += cw;
    }

    let rowTopY = headerBottomY;
    if (rows.length === 0) {
      const emptyBottom = rowTopY - ROW_HEIGHT * 1.5;
      ops.push(`0.886 0.910 0.941 RG 0.5 w ${MARGIN_X} ${emptyBottom.toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ${(ROW_HEIGHT * 1.5).toFixed(2)} re S`);
      ops.push(`BT /F1 9 Tf 0.392 0.455 0.545 rg ${(MARGIN_X + 10).toFixed(2)} ${(emptyBottom + 9).toFixed(2)} Td (No records to display.) Tj ET`);
    } else {
      for (let rIdx = slice.start; rIdx < slice.end; rIdx++) {
        const row = rows[rIdx]!;
        const rowBottomY = rowTopY - ROW_HEIGHT;

        // Zebra background on odd rows (#F8FAFC -> 0.973, 0.980, 0.988)
        if (rIdx % 2 === 1) {
          ops.push(
            `0.973 0.980 0.988 rg ${MARGIN_X} ${rowBottomY.toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ${ROW_HEIGHT} re f`,
          );
        }

        // Row bottom border (#E2E8F0 -> 0.886, 0.910, 0.941)
        ops.push(
          `0.886 0.910 0.941 RG 0.5 w ${MARGIN_X} ${rowBottomY.toFixed(2)} m ${(MARGIN_X + CONTENT_WIDTH).toFixed(2)} ${rowBottomY.toFixed(2)} l S`,
        );

        let cellX = MARGIN_X;
        // Serial column
        const serialCw = colWidths[0]!;
        ops.push(
          `BT /F1 8 Tf 0.392 0.455 0.545 rg ${(cellX + 5).toFixed(2)} ${(rowBottomY + 5.5).toFixed(2)} Td (${rIdx + 1}) Tj ET`,
        );
        cellX += serialCw;

        for (let c = 0; c < columns.length; c++) {
          const cw = colWidths[c + 1]!;
          const raw = columns[c]!.value(row);
          const rawStr = raw === null || raw === undefined || raw === "" ? "-" : String(raw);
          const rule = findBadgeRule(rawStr, badgeRules);
          const display = truncateToWidth(rawStr, cw, 8);

          if (rule) {
            const [br, bg, bb] = hexToRgb01(rule.background, [0.88, 0.95, 0.99]);
            const [tr, tg, tb] = hexToRgb01(rule.color, [0.1, 0.2, 0.3]);
            const pillW = Math.min(cw - 6, Math.max(24, display.length * 4.7 + 10));
            ops.push(
              `${br} ${bg} ${bb} rg ${(cellX + 3).toFixed(2)} ${(rowBottomY + 3).toFixed(2)} ${pillW.toFixed(2)} ${(ROW_HEIGHT - 6).toFixed(2)} re f`,
            );
            ops.push(
              `BT /F2 7.5 Tf ${tr} ${tg} ${tb} rg ${(cellX + 7).toFixed(2)} ${(rowBottomY + 5.8).toFixed(2)} Td (${pdfSafeString(display)}) Tj ET`,
            );
          } else {
            ops.push(
              `BT /F1 8 Tf 0.200 0.255 0.333 rg ${(cellX + 5).toFixed(2)} ${(rowBottomY + 5.5).toFixed(2)} Td (${pdfSafeString(display)}) Tj ET`,
            );
          }
          cellX += cw;
        }

        rowTopY = rowBottomY;
      }

      // Outer border around table rows
      const tableHeight = headerBottomY - rowTopY + HEADER_HEIGHT;
      ops.push(
        `0.800 0.835 0.882 RG 0.6 w ${MARGIN_X} ${rowTopY.toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ${tableHeight.toFixed(2)} re S`,
      );
    }

    // Footer page indicator
    const pageLabel = `Page ${pIdx + 1} of ${totalPages}`;
    ops.push(
      `BT /F1 8 Tf 0.392 0.455 0.545 rg ${(PAGE_WIDTH - MARGIN_X - 58).toFixed(2)} 18 Td (${pdfSafeString(pageLabel)}) Tj ET`,
    );

    pageStreams.push(ops.join("\n"));
  }

  // Assemble PDF objects:
  // 1: Catalog
  // 2: Pages
  // 3: Font F1 (Helvetica)
  // 4: Font F2 (Helvetica-Bold)
  // For each page i (0..totalPages-1):
  //   5 + i*2: Page object
  //   6 + i*2: Content stream object
  const objects: string[] = [];
  const pageObjNums: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjNums.push(5 + i * 2);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${totalPages} >>\nendobj\n`,
  );
  objects.push(
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );
  objects.push(
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );

  const encoder = new TextEncoder();
  for (let i = 0; i < totalPages; i++) {
    const pageObjNum = 5 + i * 2;
    const streamObjNum = 6 + i * 2;
    const streamContent = pageStreams[i]!;
    const byteLen = encoder.encode(streamContent).length;

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObjNum} 0 R >>\nendobj\n`,
    );
    objects.push(
      `${streamObjNum} 0 obj\n<< /Length ${byteLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    );
  }

  const header = "%PDF-1.4\n";
  const chunks: Uint8Array[] = [encoder.encode(header)];
  const offsets: number[] = [0]; // index 0 is free entry
  let byteOffset = chunks[0]!.length;

  for (const objStr of objects) {
    offsets.push(byteOffset);
    const encoded = encoder.encode(objStr);
    chunks.push(encoded);
    byteOffset += encoded.length;
  }

  const xrefOffset = byteOffset;
  const xrefLines: string[] = [
    `xref`,
    `0 ${objects.length + 1}`,
    `0000000000 65535 f `,
  ];
  for (let i = 1; i < offsets.length; i++) {
    const padded = String(offsets[i]!).padStart(10, "0");
    xrefLines.push(`${padded} 00000 n `);
  }

  const trailer =
    `${xrefLines.join("\n")}\n` +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(trailer));

  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  const pdfBytes = new Uint8Array(totalBytes);
  let pos = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, pos);
    pos += chunk.length;
  }
  return pdfBytes;
}

/**
 * Build and download a native multi-page `.pdf` report. No-ops outside the browser.
 * Returns the exported row count.
 */
export function downloadPdf<T>(options: ExcelExportOptions<T>): number {
  const bytes = toPdfBytes(options);
  const blob = new Blob([bytes as BlobPart], { type: PDF_MIME });
  const cleanBase = options.filename.replace(/\.pdf$/i, "");
  const name = `${cleanBase}.pdf`;
  if (!downloadBlob(name, blob)) return 0;
  return options.rows.length;
}
