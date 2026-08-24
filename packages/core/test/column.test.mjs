// Column model resolution: ids, titles, and the visibility/sortability rules
// that every adapter's menus and headers are driven by.

import test from "node:test";
import assert from "node:assert/strict";

import {
  getColumnId,
  getColumnTitle,
  getCellValue,
  isSortable,
  isHideable,
  isExportable,
  isStructuralColumn,
  initialHiddenColumns,
  visibleColumns,
} from "../dist/index.js";

test("column id prefers id, then accessorKey", () => {
  assert.equal(getColumnId({ id: "name", accessorKey: "fullName" }), "name");
  assert.equal(getColumnId({ accessorKey: "email" }), "email");
  assert.equal(getColumnId({}), "");
});

test("column title falls back to a title-cased id for rendered headers", () => {
  assert.equal(getColumnTitle({ accessorKey: "name", header: "Full Name" }), "Full Name");
  assert.equal(getColumnTitle({ accessorKey: "email", header: () => null }), "Email");
  assert.equal(getColumnTitle({ accessorKey: "email" }), "Email");
});

test("cell values are read by column id", () => {
  const row = { name: "Ada", email: "ada@example.com" };
  assert.equal(getCellValue({ accessorKey: "name" }, row), "Ada");
  assert.equal(getCellValue({ id: "missing" }, row), undefined);
});

test("sorting is on by default and opt-out", () => {
  assert.equal(isSortable({ accessorKey: "name" }), true);
  assert.equal(isSortable({ accessorKey: "name", enableSorting: false }), false);
});

test("structural columns are never sortable, hideable, or exportable", () => {
  for (const id of ["select", "actions"]) {
    assert.equal(isStructuralColumn({ id }), true);
    assert.equal(isSortable({ id }), false);
    assert.equal(isHideable({ id }), false);
    assert.equal(isExportable({ id }), false);
  }
});

test("a column with no id is inert", () => {
  assert.equal(isSortable({}), false);
  assert.equal(isHideable({}), false);
  assert.equal(isExportable({}), false);
});

test("hideable and exportable are opt-out via meta", () => {
  assert.equal(isHideable({ accessorKey: "name" }), true);
  assert.equal(isHideable({ accessorKey: "name", meta: { hideable: false } }), false);
  assert.equal(isExportable({ accessorKey: "name" }), true);
  assert.equal(isExportable({ accessorKey: "name", meta: { exportable: false } }), false);
});

test("columns marked hidden start hidden", () => {
  const columns = [
    { accessorKey: "name" },
    { accessorKey: "internalId", meta: { hidden: true } },
  ];
  assert.deepEqual(initialHiddenColumns(columns), { internalId: true });
});

test("visibleColumns filters by the hidden map and keeps unnamed columns", () => {
  const columns = [{ accessorKey: "name" }, { accessorKey: "email" }, {}];
  const visible = visibleColumns(columns, { email: true });

  assert.deepEqual(visible.map(getColumnId), ["name", ""]);
});
