// Export correctness — quoting, encoding, and the injection defense.

import test from "node:test";
import assert from "node:assert/strict";

import {
  toCsv,
  toExcelHtml,
  toExportColumns,
  getCellText,
  DEFAULT_BADGE_RULES,
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
