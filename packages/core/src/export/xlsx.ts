// Native OpenXML (.xlsx) binary workbook generator.
//
// Zero-dependency ECMA-376 SpreadsheetML + ZIP (Store + CRC-32) writer so
// exported `.xlsx` files open cleanly in Microsoft Excel, LibreOffice Calc,
// Google Sheets, and Apple Numbers without format-mismatch prompts — complete
// with frozen headers, auto-sized columns, zebra striping, native numeric
// cells, OWASP formula-injection defense, and colored status badges.

import { downloadBlob } from "./download.js";
import {
  DEFAULT_BADGE_RULES,
  type ExcelBadgeRule,
  type ExcelExportOptions,
} from "./excel.js";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const STRICT_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
// Invalid XML 1.0 control characters (everything < 0x20 except \t, \n, \r).
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g;

// ---- Precomputed CRC-32 table (IEEE 802.3) ---------------------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function buildZipStore(entries: readonly ZipEntry[]): Uint8Array {
  const nameBytesList = entries.map((e) => encodeUtf8(e.name));
  const crcList = entries.map((e) => crc32(e.data));

  let localTotal = 0;
  let centralTotal = 0;
  for (let i = 0; i < entries.length; i++) {
    const nameLen = nameBytesList[i]!.length;
    localTotal += 30 + nameLen + entries[i]!.data.length;
    centralTotal += 46 + nameLen;
  }

  const totalSize = localTotal + centralTotal + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  const localOffsets = new Uint32Array(entries.length);

  // Valid MS-DOS date (1980-01-01 00:00:00) so strict unzippers never flag 0.
  const dosTime = 0;
  const dosDate = 0x0021;

  let offset = 0;
  for (let i = 0; i < entries.length; i++) {
    const data = entries[i]!.data;
    const nameBytes = nameBytesList[i]!;
    const crc = crcList[i]!;
    localOffsets[i] = offset;

    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true); // Version needed (2.0)
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(offset + 8, 0, true); // Store (no compression)
    view.setUint16(offset + 10, dosTime, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, crc, true);
    view.setUint32(offset + 18, data.length, true);
    view.setUint32(offset + 22, data.length, true);
    view.setUint16(offset + 26, nameBytes.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(nameBytes, offset + 30);
    out.set(data, offset + 30 + nameBytes.length);
    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  for (let i = 0; i < entries.length; i++) {
    const data = entries[i]!.data;
    const nameBytes = nameBytesList[i]!;
    const crc = crcList[i]!;

    view.setUint32(offset, 0x02014b50, true); // Central directory file header
    view.setUint16(offset + 4, 20, true); // Version made by
    view.setUint16(offset + 6, 20, true); // Version needed
    view.setUint16(offset + 8, 0x0800, true); // UTF-8 filename flag
    view.setUint16(offset + 10, 0, true); // Store
    view.setUint16(offset + 12, dosTime, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, crc, true);
    view.setUint32(offset + 20, data.length, true);
    view.setUint32(offset + 24, data.length, true);
    view.setUint16(offset + 28, nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // Extra length
    view.setUint16(offset + 32, 0, true); // Comment length
    view.setUint16(offset + 34, 0, true); // Disk number start
    view.setUint16(offset + 36, 0, true); // Internal attrs
    view.setUint32(offset + 38, 0, true); // External attrs
    view.setUint32(offset + 42, localOffsets[i]!, true);
    out.set(nameBytes, offset + 46);
    offset += 46 + nameBytes.length;
  }

  // End of central directory record (EOCD)
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, centralTotal, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true);

  return out;
}

// ---- XML & SpreadsheetML helpers -------------------------------------------

function escapeXml(raw: string): string {
  return raw
    .replace(INVALID_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 0-based column index -> Excel column letters (`0 -> A`, `25 -> Z`, `26 -> AA`). */
export function excelColName(colIndex: number): string {
  let n = colIndex + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function normalizeArgb(cssColor: string, fallbackHex6: string): string {
  const cleaned = cssColor.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `FF${cleaned.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toUpperCase();
    return `FF${expanded}`;
  }
  return `FF${fallbackHex6}`;
}

function findBadgeRuleIndex(value: string, rules: readonly ExcelBadgeRule[]): number {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "—") return -1;
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule.values.some((candidate) => candidate.toLowerCase() === normalized)) {
      return i;
    }
  }
  return -1;
}

function buildStylesXml(badgeRules: readonly ExcelBadgeRule[]): string {
  const fonts: string[] = [
    // 0: Body default
    `<font><sz val="11"/><color rgb="FF334155"/><name val="Calibri"/></font>`,
    // 1: Title banner
    `<font><b/><sz val="14"/><color rgb="FF0F172A"/><name val="Calibri"/></font>`,
    // 2: Subtitle & serial number
    `<font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>`,
    // 3: Table header
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`,
  ];

  // Excel requires fills 0 and 1 to be "none" and "gray125".
  const fills: string[] = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    // 2: Header dark slate
    `<fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>`,
    // 3: Zebra odd-row tint
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>`,
  ];

  for (const rule of badgeRules) {
    const textArgb = normalizeArgb(rule.color, "1E293B");
    const bgArgb = normalizeArgb(rule.background, "E2E8F0");
    fonts.push(`<font><b/><sz val="11"/><color rgb="${textArgb}"/><name val="Calibri"/></font>`);
    fills.push(
      `<fill><patternFill patternType="solid"><fgColor rgb="${bgArgb}"/><bgColor indexed="64"/></patternFill></fill>`,
    );
  }

  const borders = [
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,
    `<border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>`,
    `<border><left style="thin"><color rgb="FF334155"/></left><right style="thin"><color rgb="FF334155"/></right><top style="thin"><color rgb="FF334155"/></top><bottom style="thin"><color rgb="FF334155"/></bottom><diagonal/></border>`,
  ];

  // Style indices:
  // 0: default
  // 1: title
  // 2: subtitle
  // 3: header left
  // 4: header center (S.No.)
  // 5: serial even
  // 6: serial odd
  // 7: body even
  // 8: body odd
  // 9 + i: badge rule i
  const xfs: string[] = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
  ];

  for (let i = 0; i < badgeRules.length; i++) {
    const fontIdx = 4 + i;
    const fillIdx = 4 + i;
    xfs.push(
      `<xf numFmtId="0" fontId="${fontIdx}" fillId="${fillIdx}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    );
  }

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
    `<fills count="${fills.length}">${fills.join("")}</fills>` +
    `<borders count="${borders.length}">${borders.join("")}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    `</styleSheet>`
  );
}

/**
 * Build a complete OpenXML `.xlsx` binary workbook as a `Uint8Array`.
 * Pure & synchronous — safe in browsers, Web Workers, and Node.js tests.
 */
export function toXlsxBytes<T>(options: ExcelExportOptions<T>): Uint8Array {
  const {
    caption,
    rows,
    columns,
    badgeRules = DEFAULT_BADGE_RULES,
    serialHeader = "S.No.",
  } = options;

  const safeSheetName =
    escapeXml((caption || "Export").replace(/[\\/*?:[\]]/g, "").trim().slice(0, 31)) || "Export";
  const totalCols = columns.length + 1;
  const lastCol = excelColName(Math.max(0, totalCols - 1));
  const exportedAt = new Date();
  const titleText = `${caption || "Export"} Data Export`;
  const subtitleText = `Exported ${rows.length} total records on ${exportedAt.toISOString().slice(0, 10)}`;

  // Track max character length per column to auto-fit column widths cleanly.
  const colMaxChars = new Array<number>(totalCols).fill(8);
  colMaxChars[0] = Math.max(6, serialHeader.length + 2, String(rows.length).length + 3);
  for (let c = 0; c < columns.length; c++) {
    colMaxChars[c + 1] = Math.max(10, columns[c]!.header.length + 4);
  }

  const xmlRows: string[] = [];

  // Row 1: Title
  xmlRows.push(
    `<row r="1" ht="24" customHeight="1">` +
      `<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(titleText)}</t></is></c>` +
      `</row>`,
  );

  // Row 2: Subtitle
  xmlRows.push(
    `<row r="2" ht="18" customHeight="1">` +
      `<c r="A2" s="2" t="inlineStr"><is><t xml:space="preserve">${escapeXml(subtitleText)}</t></is></c>` +
      `</row>`,
  );

  // Row 4: Table headers
  const headerCells: string[] = [
    `<c r="A4" s="4" t="inlineStr"><is><t xml:space="preserve">${escapeXml(serialHeader)}</t></is></c>`,
  ];
  for (let c = 0; c < columns.length; c++) {
    const ref = `${excelColName(c + 1)}4`;
    headerCells.push(
      `<c r="${ref}" s="3" t="inlineStr"><is><t xml:space="preserve">${escapeXml(columns[c]!.header)}</t></is></c>`,
    );
  }
  xmlRows.push(`<row r="4" ht="24" customHeight="1">${headerCells.join("")}</row>`);

  // Rows 5+: Data rows
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx]!;
    const excelRowNum = rIdx + 5;
    const isOdd = rIdx % 2 === 1;
    const serialStyle = isOdd ? 6 : 5;
    const defaultBodyStyle = isOdd ? 8 : 7;

    const rowCells: string[] = [
      `<c r="A${excelRowNum}" s="${serialStyle}" t="n"><v>${rIdx + 1}</v></c>`,
    ];

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c]!;
      const ref = `${excelColName(c + 1)}${excelRowNum}`;
      const raw = col.value(row);

      if (typeof raw === "number" && Number.isFinite(raw)) {
        const numText = String(raw);
        if (numText.length + 3 > colMaxChars[c + 1]!) {
          colMaxChars[c + 1] = Math.min(48, numText.length + 3);
        }
        rowCells.push(`<c r="${ref}" s="${defaultBodyStyle}" t="n"><v>${numText}</v></c>`);
        continue;
      }

      const text = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
      const trimmed = text.trim();

      if (STRICT_NUMBER.test(trimmed)) {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed) && String(parsed) === trimmed) {
          if (trimmed.length + 3 > colMaxChars[c + 1]!) {
            colMaxChars[c + 1] = Math.min(48, trimmed.length + 3);
          }
          rowCells.push(`<c r="${ref}" s="${defaultBodyStyle}" t="n"><v>${trimmed}</v></c>`);
          continue;
        }
      }

      const safeText =
        text !== "—" && FORMULA_PREFIX.test(text) ? `'${text}` : text;
      const badgeIdx = findBadgeRuleIndex(text, badgeRules);
      const cellStyle = badgeIdx >= 0 ? 9 + badgeIdx : defaultBodyStyle;

      if (safeText.length + 3 > colMaxChars[c + 1]!) {
        colMaxChars[c + 1] = Math.min(48, safeText.length + 3);
      }

      rowCells.push(
        `<c r="${ref}" s="${cellStyle}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(safeText)}</t></is></c>`,
      );
    }

    xmlRows.push(`<row r="${excelRowNum}" ht="20" customHeight="1">${rowCells.join("")}</row>`);
  }

  const colsXml = colMaxChars
    .map((chars, idx) => {
      const colNum = idx + 1;
      const width = Math.max(7, Math.min(50, chars));
      return `<col min="${colNum}" max="${colNum}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const mergeXml =
    totalCols > 1
      ? `<mergeCells count="2"><mergeCell ref="A1:${lastCol}1"/><mergeCell ref="A2:${lastCol}2"/></mergeCells>`
      : "";

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${xmlRows.join("")}</sheetData>` +
    mergeXml +
    `</worksheet>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${XLSX_MIME}.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const stylesXml = buildStylesXml(badgeRules);

  return buildZipStore([
    { name: "[Content_Types].xml", data: encodeUtf8(contentTypesXml) },
    { name: "_rels/.rels", data: encodeUtf8(rootRelsXml) },
    { name: "xl/workbook.xml", data: encodeUtf8(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encodeUtf8(workbookRelsXml) },
    { name: "xl/styles.xml", data: encodeUtf8(stylesXml) },
    { name: "xl/worksheets/sheet1.xml", data: encodeUtf8(sheetXml) },
  ]);
}

/**
 * Build and download a native OpenXML `.xlsx` workbook. No-ops outside the browser.
 * Returns the exported row count.
 */
export function downloadXlsx<T>(options: ExcelExportOptions<T>): number {
  const bytes = toXlsxBytes(options);
  const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
  const cleanBase = options.filename.replace(/\.(xlsx|xls)$/i, "");
  const name = `${cleanBase}.xlsx`;
  if (!downloadBlob(name, blob)) return 0;
  return options.rows.length;
}
