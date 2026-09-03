import test from "node:test";
import assert from "node:assert/strict";
import {
  flattenColumns,
  hasHeaderGroups,
  buildHeaderRows,
  getColumnId,
} from "../dist/index.js";

test("flattenColumns returns leaf columns from multi-tier hierarchy", () => {
  const columns = [
    {
      header: "User Details",
      columns: [
        { accessorKey: "firstName", header: "First Name" },
        { accessorKey: "lastName", header: "Last Name" },
      ],
    },
    {
      header: "Contact Info",
      columns: [
        { accessorKey: "email", header: "Email" },
        { accessorKey: "phone", header: "Phone" },
      ],
    },
    { accessorKey: "status", header: "Status" },
  ];

  assert.equal(hasHeaderGroups(columns), true);

  const leaves = flattenColumns(columns);
  assert.equal(leaves.length, 5);
  assert.deepEqual(
    leaves.map((c) => getColumnId(c)),
    ["firstName", "lastName", "email", "phone", "status"]
  );
});

test("hasHeaderGroups returns false for flat column definitions", () => {
  const flat = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
  ];
  assert.equal(hasHeaderGroups(flat), false);
  assert.equal(flattenColumns(flat).length, 2);
});

test("buildHeaderRows produces 2-tier structure with colSpan and rowSpan", () => {
  const columns = [
    {
      header: "User Details",
      columns: [
        { accessorKey: "firstName", header: "First Name" },
        { accessorKey: "lastName", header: "Last Name" },
      ],
    },
    {
      header: "Contact Info",
      columns: [
        { accessorKey: "email", header: "Email" },
        { accessorKey: "phone", header: "Phone" },
      ],
    },
    { accessorKey: "status", header: "Status" },
  ];

  const rows = buildHeaderRows(columns, {});
  assert.equal(rows.hasGroups, true);

  // Top row should have: User Details (group, colSpan 2, rowSpan 1), Contact Info (group, colSpan 2, rowSpan 1), status (standalone, colSpan 1, rowSpan 2)
  assert.equal(rows.topRow.length, 3);
  assert.equal(rows.topRow[0].title, "User Details");
  assert.equal(rows.topRow[0].isGroup, true);
  assert.equal(rows.topRow[0].colSpan, 2);
  assert.equal(rows.topRow[0].rowSpan, 1);

  assert.equal(rows.topRow[1].title, "Contact Info");
  assert.equal(rows.topRow[1].isGroup, true);
  assert.equal(rows.topRow[1].colSpan, 2);
  assert.equal(rows.topRow[1].rowSpan, 1);

  assert.equal(rows.topRow[2].id, "status");
  assert.equal(rows.topRow[2].isGroup, false);
  assert.equal(rows.topRow[2].colSpan, 1);
  assert.equal(rows.topRow[2].rowSpan, 2);

  // Bottom row should have child leaves: firstName, lastName, email, phone (each colSpan 1, rowSpan 1)
  assert.equal(rows.bottomRow.length, 4);
  assert.equal(rows.bottomRow[0].id, "firstName");
  assert.equal(rows.bottomRow[1].id, "lastName");
  assert.equal(rows.bottomRow[2].id, "email");
  assert.equal(rows.bottomRow[3].id, "phone");

  // Visible leaves
  assert.equal(rows.visibleLeafColumns.length, 5);
});

test("buildHeaderRows adjusts colSpan when child column is hidden", () => {
  const columns = [
    {
      header: "User Details",
      columns: [
        { accessorKey: "firstName", header: "First Name" },
        { accessorKey: "lastName", header: "Last Name" },
      ],
    },
    { accessorKey: "status", header: "Status" },
  ];

  // Hide lastName
  const rows = buildHeaderRows(columns, { lastName: true });
  assert.equal(rows.topRow.length, 2);
  assert.equal(rows.topRow[0].title, "User Details");
  assert.equal(rows.topRow[0].colSpan, 1); // Reduced from 2 to 1!

  assert.equal(rows.bottomRow.length, 1);
  assert.equal(rows.bottomRow[0].id, "firstName");
  assert.equal(rows.visibleLeafColumns.length, 2);
});
