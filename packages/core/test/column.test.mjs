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
  isPinned,
  isEditable,
  computeAggregation,
  initialHiddenColumns,
  visibleColumns,
  searchableColumnIds,
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

test("isPinned returns false or pinned direction", () => {
  assert.equal(isPinned({ accessorKey: "name" }), false);
  assert.equal(isPinned({ accessorKey: "name", meta: { pinned: "left" } }), "left");
  assert.equal(isPinned({ accessorKey: "action", meta: { pinned: "right" } }), "right");
});

test("isEditable returns false unless editable is set in meta", () => {
  assert.equal(isEditable({ accessorKey: "name" }), false);
  assert.equal(isEditable({ accessorKey: "name", meta: { editable: true } }), true);
});

test("computeAggregation calculates sum, avg, count, min, max, or custom", () => {
  const rows = [
    { score: 10, name: "A" },
    { score: 20, name: "B" },
    { score: 30, name: "C" },
  ];
  assert.equal(computeAggregation({ accessorKey: "score", meta: { aggregation: "sum" } }, rows), 60);
  assert.equal(computeAggregation({ accessorKey: "score", meta: { aggregation: "avg" } }, rows), 20);
  assert.equal(computeAggregation({ accessorKey: "score", meta: { aggregation: "count" } }, rows), 3);
  assert.equal(computeAggregation({ accessorKey: "score", meta: { aggregation: "min" } }, rows), 10);
  assert.equal(computeAggregation({ accessorKey: "score", meta: { aggregation: "max" } }, rows), 30);
  assert.equal(
    computeAggregation(
      { accessorKey: "score", meta: { aggregation: (r) => `${r.length} items` } },
      rows,
    ),
    "3 items",
  );
  assert.equal(computeAggregation({ accessorKey: "score" }, rows), null);
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

test("searchableColumnIds lists the fields a user can actually see", () => {
  const columns = [
    { id: "select" },
    { accessorKey: "name" },
    { accessorKey: "email" },
    { accessorKey: "secret" },
    { id: "actions" },
    {},
  ];

  // Structural columns, unnamed columns and hidden columns hold nothing the
  // user could point at, so a search hit on them would be unexplainable.
  assert.deepEqual(searchableColumnIds(columns, { secret: true }), ["name", "email"]);
  assert.deepEqual(searchableColumnIds(columns), ["name", "email", "secret"]);
});

test("searchableColumnIds descends into header groups", () => {
  const columns = [
    { accessorKey: "name" },
    { header: "Contact", columns: [{ accessorKey: "email" }, { accessorKey: "phone" }] },
  ];

  assert.deepEqual(searchableColumnIds(columns), ["name", "email", "phone"]);
  assert.deepEqual(searchableColumnIds(columns, { phone: true }), ["name", "email"]);
});

test("searchableColumnIds is empty when nothing is on screen", () => {
  assert.deepEqual(searchableColumnIds([]), []);
  assert.deepEqual(searchableColumnIds([{ accessorKey: "name" }], { name: true }), []);
});

test("searchableColumnIds returns the ROW FIELD when the id is a display slug", () => {
  // `getColumnId` prefers `id`, so a column written the TanStack way —
  // a slug id over the property it reads — would otherwise contribute
  // "lastLogin", a key no row carries. The column is on screen; confining the
  // search to a key that resolves to `undefined` would make a visible column
  // silently unsearchable, which is exactly the failure the narrow default
  // exists to avoid.
  const columns = [
    { id: "select" },
    { id: "fullName", accessorKey: "fullName" },
    { id: "lastLogin", accessorKey: "lastLoginAt" },
    // Composed cell with no accessorKey: the id is all there is, and no row
    // field backs it. It stays in the list (it is a visible column) but a host
    // that needs it searchable names the real fields via `searchableFields`.
    { id: "location", header: "Location" },
  ];

  assert.deepEqual(searchableColumnIds(columns), ["fullName", "lastLoginAt", "location"]);
  // Hiding still keys on the column ID, not the field it resolves to.
  assert.deepEqual(searchableColumnIds(columns, { lastLogin: true }), ["fullName", "location"]);
});
