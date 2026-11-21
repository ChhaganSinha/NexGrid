// Export correctness — quoting, encoding, and the injection defense.

import test from "node:test";
import assert from "node:assert/strict";

import {
  toCsv,
  toExcelHtml,
  toXlsxBytes,
  toPdfBytes,
  excelColName,
  toExportColumns,
  getCellText,
  DEFAULT_BADGE_RULES,
  EXPORT_FORMATS,
  filePrefixFromCaption,
  timestampedFilename,
} from "../dist/index.js";

const columns = [
  { header: "Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email },
];

test("CSV writes a header row and CRLF line endings", () => {
  const csv = toCsv([{ name: "Ada", email: "ada@example.com" }], columns);
  assert.equal(csv, "Name,Email\r\nAda,ada@example.com");
});

test("values containing commas, quotes, or newlines are quoted", () => {
  const csv = toCsv(
    [
      { name: "Lovelace, Ada", email: 'a"b@example.com' },
      { name: "Line\nBreak", email: "x@example.com" },
    ],
    columns,
  );
  const rows = csv.split("\r\n");

  assert.equal(rows[1], '"Lovelace, Ada","a""b@example.com"', "quotes are doubled per RFC 4180");
  assert.equal(rows[2], '"Line\nBreak",x@example.com');
});

test("nullish values become empty cells rather than the string 'null'", () => {
  const csv = toCsv([{ name: null, email: undefined }], columns);
  assert.equal(csv.split("\r\n")[1], ",");
});

test("formula-triggering values are neutralized (OWASP CSV injection)", () => {
  const dangerous = ["=HYPERLINK(\"http://evil\")", "+1+1", "-1+1", "@SUM(A1)"];

  for (const value of dangerous) {
    const csv = toCsv([{ name: value, email: "x@example.com" }], columns);
    const cell = csv.split("\r\n")[1].split(",")[0];
    assert.ok(
      cell.startsWith("'") || cell.startsWith("\"'"),
      `${value} must be prefixed with a quote so spreadsheets treat it as text, got ${cell}`,
    );
  }
});

test("an ordinary value is not given a spurious prefix", () => {
  const csv = toCsv([{ name: "Ada", email: "ada@example.com" }], columns);
  assert.equal(csv.split("\r\n")[1], "Ada,ada@example.com");
});

test("export columns skip structural and opted-out columns", () => {
  const gridColumns = [
    { id: "select" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "secret", header: "Secret", meta: { exportable: false } },
    { id: "actions", header: "Actions" },
  ];

  const exported = toExportColumns(gridColumns);
  assert.deepEqual(exported.map((c) => c.header), ["Name"]);
});

test("export columns read values off the row as plain text", () => {
  const [nameCol] = toExportColumns([{ accessorKey: "name", header: "Name" }]);
  assert.equal(nameCol.value({ name: "Ada" }), "Ada");
});

test("getCellText renders each value kind predictably", () => {
  assert.equal(getCellText(null), "");
  assert.equal(getCellText(undefined), "");
  assert.equal(getCellText(true), "Yes");
  assert.equal(getCellText(false), "No");
  assert.equal(getCellText(true, { yes: "Oui", no: "Non" }), "Oui");
  assert.equal(getCellText(42), "42");
  assert.equal(getCellText({ a: 1 }), '{"a":1}');
});

test("Excel export renders a serial column, headers, and every row", () => {
  const html = toExcelHtml({
    filename: "students",
    caption: "Students",
    rows: [
      { name: "Ada", email: "ada@example.com" },
      { name: "Grace", email: "grace@example.com" },
    ],
    columns,
  });

  assert.match(html, /S\.No\./);
  assert.match(html, />Name</);
  assert.match(html, />Ada</);
  assert.match(html, />Grace</);
  assert.match(html, /Students Data Export/);
  assert.match(html, /<x:Name>Students<\/x:Name>/, "the worksheet is named after the caption");
});

test("Excel export escapes HTML rather than emitting live markup", () => {
  const html = toExcelHtml({
    filename: "x",
    caption: "Students",
    rows: [{ name: "<script>alert(1)</script>", email: "a@b.c" }],
    columns,
  });

  assert.ok(!html.includes("<script>alert(1)</script>"), "raw markup must not survive into the file");
  assert.match(html, /&lt;script&gt;/);
});

test("Excel export styles known status values as badges", () => {
  const statusColumn = [{ header: "Status", value: (r) => r.status }];
  const activeRule = DEFAULT_BADGE_RULES.find((r) => r.values.includes("active"));

  const html = toExcelHtml({
    filename: "x",
    caption: "Users",
    rows: [{ status: "Active" }],
    columns: statusColumn,
  });

  assert.ok(
    html.includes(activeRule.background),
    "a value matching a badge rule carries that rule's background color",
  );
});

test("empty cells render as an em dash in the workbook", () => {
  const html = toExcelHtml({
    filename: "x",
    caption: "Users",
    rows: [{ name: null, email: "a@b.c" }],
    columns,
  });
  assert.match(html, /—/);
});

test("file naming is slug-safe and dated", () => {
  assert.equal(filePrefixFromCaption("Student Records"), "student_records");
  assert.equal(filePrefixFromCaption(""), "table");
  assert.equal(
    timestampedFilename("students", new Date("2026-08-24T10:30:00Z")),
    "students_export_2026-08-24",
  );
});

test("every export menu destination is named by ExportFormat", () => {
  // A host that takes the export over is handed one of these; the menu and the
  // union must not drift apart.
  assert.deepEqual([...EXPORT_FORMATS], ["excel", "csv", "pdf", "clipboard"]);
});

test("Excel export neutralizes formula prefixes and adds mso text format", () => {
  const html = toExcelHtml({
    filename: "x",
    caption: "Users",
    rows: [{ name: '=HYPERLINK("http://evil")', email: "@SUM(1+1)" }],
    columns,
  });

  assert.ok(html.includes("'=HYPERLINK"));
  assert.ok(html.includes("'@SUM"));
  assert.ok(html.includes('mso-number-format:"\\@"'));
});

test("CSV export preserves legitimate negative numbers without quoting", () => {
  const numCol = [{ header: "Balance", value: (r) => r.balance }];
  const csv = toCsv([{ balance: -150.5 }], numCol);
  const cell = csv.split("\r\n")[1];
  assert.equal(cell, "-150.5");
});

function readStoredZipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compMethod = view.getUint16(offset + 8, true);
    assert.equal(compMethod, 0, "Uses Store (0) method");
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    assert.equal(compSize, uncompSize);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const content = decoder.decode(bytes.subarray(dataStart, dataStart + compSize));
    files.set(name, content);
    offset = dataStart + compSize;
  }
  return files;
}

test("excelColName maps 0-based indices to Excel A..Z, AA..ZZ, AAA column coordinates", () => {
  assert.equal(excelColName(0), "A");
  assert.equal(excelColName(25), "Z");
  assert.equal(excelColName(26), "AA");
  assert.equal(excelColName(51), "AZ");
  assert.equal(excelColName(52), "BA");
  assert.equal(excelColName(701), "ZZ");
  assert.equal(excelColName(702), "AAA");
});

test("toXlsxBytes generates a valid OpenXML .xlsx ZIP workbook with typed numbers, badges, frozen header, and formula defense", () => {
  const xlsxCols = [
    { header: "Code", value: (r) => r.code },
    { header: "Name", value: (r) => r.name },
    { header: "Score", value: (r) => r.score },
    { header: "Status", value: (r) => r.status },
  ];

  const bytes = toXlsxBytes({
    filename: "students_export",
    caption: "Students / Q4 [2026]: Full Report With Extra Long Sheet Title",
    rows: [
      { code: "0042", name: "Ada <script>&", score: 95.5, status: "Active" },
      { code: "0043", name: '=HYPERLINK("http://evil")', score: -12, status: "Pending" },
      { code: null, name: "", score: "88", status: "Inactive" },
    ],
    columns: xlsxCols,
  });

  // 1. Valid ZIP local header ("PK\x03\x04") and EOCD ("PK\x05\x06" atbytes.length - 22)
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.equal(bytes[2], 0x03);
  assert.equal(bytes[3], 0x04);
  const eocdOffset = bytes.length - 22;
  assert.equal(bytes[eocdOffset], 0x50);
  assert.equal(bytes[eocdOffset + 1], 0x4b);
  assert.equal(bytes[eocdOffset + 2], 0x05);
  assert.equal(bytes[eocdOffset + 3], 0x06);

  // 2. All 6 required OpenXML parts exist
  const parts = readStoredZipEntries(bytes);
  assert.deepEqual(
    [...parts.keys()],
    [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ],
  );

  // 3. Workbook sheet name strips forbidden chars (/, [, ], :) and truncates to <= 31 chars
  const workbookXml = parts.get("xl/workbook.xml");
  const sheetNameMatch = workbookXml.match(/<sheet name="([^"]+)"/);
  assert.ok(sheetNameMatch);
  assert.ok(sheetNameMatch[1].length <= 31);
  assert.ok(!/[\\/*?:[\]]/.test(sheetNameMatch[1]));

  // 4. Styles contain ARGB badge colors (Active -> #dcfce7 -> FFDCFCE7)
  const stylesXml = parts.get("xl/styles.xml");
  assert.ok(stylesXml.includes("FFDCFCE7"));
  assert.ok(stylesXml.includes("FF15803D"));

  // 5. Worksheet has frozen header pane, preserves leading-zero string "0042", emits numbers as t="n", escapes XML, and neutralizes formulas
  const sheetXml = parts.get("xl/worksheets/sheet1.xml");
  assert.ok(sheetXml.includes('state="frozen"'));
  assert.ok(sheetXml.includes(">0042</t>"), "Leading-zero code stays inlineStr so Excel does not strip 00");
  assert.ok(sheetXml.includes('t="n"><v>95.5</v></c>'), "Numeric values emit native numeric cells");
  assert.ok(sheetXml.includes('t="n"><v>-12</v></c>'), "Negative numbers emit native numeric cells");
  assert.ok(sheetXml.includes('t="n"><v>88</v></c>'), "Strict numeric strings emit native numeric cells");
  assert.ok(sheetXml.includes("Ada &lt;script&gt;&amp;"), "Escapes XML entities");
  assert.ok(sheetXml.includes("&apos;=HYPERLINK"), "Neutralizes formula injection with leading quote");
  assert.ok(sheetXml.includes(">—</t>"), "Null/empty cells render em dash");
});

test("toPdfBytes generates a valid multi-page PDF 1.4 binary document with xref table and escaped text", () => {
  const pdfCols = [
    { header: "Name", value: (r) => r.name },
    { header: "Status", value: (r) => r.status },
  ];
  const manyRows = Array.from({ length: 65 }, (_, i) => ({
    name: `Student (${i + 1}) \\ Test`,
    status: i % 2 === 0 ? "Active" : "Pending",
  }));

  const pdfBytes = toPdfBytes({
    filename: "report",
    caption: "Enrollment Report",
    rows: manyRows,
    columns: pdfCols,
  });

  const text = new TextDecoder().decode(pdfBytes);
  assert.ok(text.startsWith("%PDF-1.4\n"), "Starts with %PDF-1.4 signature");
  assert.ok(text.endsWith("%%EOF"), "Ends with %%EOF trailer");
  assert.ok(text.includes("/Type /Catalog"), "Contains PDF Catalog");
  assert.ok(text.includes("/Count 3"), "Paginates 65 rows across 3 landscape A4 pages");
  assert.ok(text.includes("Enrollment Report"), "Renders report title");
  assert.ok(text.includes("Student \\(1\\) \\\\ Test"), "Escapes PDF literal parentheses and backslashes");
  assert.ok(text.includes("Page 1 of 3") && text.includes("Page 3 of 3"), "Renders page footers");
});

