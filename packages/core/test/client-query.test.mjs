import test from "node:test";
import assert from "node:assert/strict";

import { defaultQuery, queryClientData, searchableColumnIds } from "../dist/index.js";

const TEST_DATA = [
  { id: 1, name: "Alice Smith", department: "Engineering", score: 95 },
  { id: 2, name: "Bob Jones", department: "Marketing", score: 82 },
  { id: 3, name: "Charlie Brown", department: "Engineering", score: 88 },
  { id: 4, name: "Diana Prince", department: "Sales", score: 91 },
  { id: 5, name: "Evan Wright", department: "Marketing", score: 76 },
  { id: 6, name: "Fiona Gallagher", department: "Engineering", score: 85 },
  { id: 7, name: "George Clark", department: "Sales", score: 99 },
  { id: 8, name: "Hannah Abbott", department: "HR", score: 70 },
  { id: 9, name: "Ian Malcolm", department: "Engineering", score: 92 },
  { id: 10, name: "Julia Roberts", department: "Marketing", score: 89 },
  { id: 11, name: "Kevin Bacon", department: "Sales", score: 74 },
  { id: 12, name: "Laura Croft", department: "Engineering", score: 98 },
];

test("queryClientData returns first page and total count for defaultQuery", () => {
  const result = queryClientData(TEST_DATA, defaultQuery());
  assert.equal(result.total, 12);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 10);
  assert.equal(result.totalPages, 2);
  assert.equal(result.items.length, 10);
  assert.equal(result.items[0].name, "Alice Smith");
});

test("queryClientData handles pagination correctly", () => {
  const query = { page: 2, pageSize: 10, sort: [] };
  const result = queryClientData(TEST_DATA, query);
  assert.equal(result.page, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, "Kevin Bacon");
  assert.equal(result.items[1].name, "Laura Croft");
});

test("queryClientData performs global search", () => {
  const query = { page: 1, pageSize: 10, sort: [], q: "engineering" };
  const result = queryClientData(TEST_DATA, query);
  assert.equal(result.total, 5);
  assert.equal(result.items.length, 5);
  assert.ok(result.items.every((item) => item.department === "Engineering"));
});

test("queryClientData performs column filtering", () => {
  const query = {
    page: 1,
    pageSize: 10,
    sort: [],
    filter: { department: "Marketing" },
  };
  const result = queryClientData(TEST_DATA, query);
  assert.equal(result.total, 3);
  assert.equal(result.items.length, 3);
  assert.deepEqual(
    result.items.map((i) => i.name),
    ["Bob Jones", "Evan Wright", "Julia Roberts"],
  );
});

test("queryClientData performs numeric and percentage column filtering", () => {
  const query = {
    page: 1,
    pageSize: 10,
    sort: [],
    filter: { score: "95%" },
  };
  const result = queryClientData(TEST_DATA, query);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].name, "Alice Smith");
});

test("queryClientData performs date column filtering", () => {
  const dataWithDates = [
    { id: 1, name: "Alice", enrolledAt: "2023-04-12" },
    { id: 2, name: "Bob", enrolledAt: "2023-05-15" },
  ];
  const query = {
    page: 1,
    pageSize: 10,
    sort: [],
    filter: { enrolledAt: "Apr 12" },
  };
  const result = queryClientData(dataWithDates, query);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].name, "Alice");
});

test("queryClientData sorts ascending and descending", () => {
  const ascQuery = { page: 1, pageSize: 10, sort: [{ field: "score", dir: "asc" }] };
  const ascResult = queryClientData(TEST_DATA, ascQuery);
  assert.equal(ascResult.items[0].name, "Hannah Abbott"); // 70

  const descQuery = { page: 1, pageSize: 10, sort: [{ field: "score", dir: "desc" }] };
  const descResult = queryClientData(TEST_DATA, descQuery);
  assert.equal(descResult.items[0].name, "George Clark"); // 99
});

test("queryClientData clamps invalid or out-of-range page numbers", () => {
  const highPageQuery = { page: 999, pageSize: 10, sort: [] };
  const result = queryClientData(TEST_DATA, highPageQuery);
  assert.equal(result.page, 2);
  assert.equal(result.items.length, 2);
});

test("queryClientData handles empty datasets gracefully", () => {
  const result = queryClientData([], defaultQuery());
  assert.equal(result.total, 0);
  assert.equal(result.items.length, 0);
  assert.equal(result.totalPages, 1);
});

test("queryClientData filters numbers using min..max range", () => {
  const query = {
    page: 1,
    pageSize: 10,
    sort: [],
    filter: { score: "80..90" },
  };
  const result = queryClientData(TEST_DATA, query);
  assert.equal(result.total, 4); // Bob (82), Charlie (88), Fiona (85), Julia (89)
  assert.deepEqual(
    result.items.map((i) => i.name),
    ["Bob Jones", "Charlie Brown", "Fiona Gallagher", "Julia Roberts"],
  );
});

test("queryClientData filters dates using from..to range", () => {
  const dataWithDates = [
    { id: 1, name: "Jan", created: "2024-01-15" },
    { id: 2, name: "Feb", created: "2024-02-20" },
    { id: 3, name: "Mar", created: "2024-03-10" },
  ];
  const query = {
    page: 1,
    pageSize: 10,
    sort: [],
    filter: { created: "2024-01-01..2024-02-28" },
  };
  const result = queryClientData(dataWithDates, query);
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.items.map((i) => i.name),
    ["Jan", "Feb"],
  );
});

// Rows carry keys the grid never renders — a GUID id, a tenant id. Searching
// every property on the row makes those invisible fields match, which is what
// `searchableFields` exists to prevent.
const ROWS_WITH_HIDDEN_KEYS = [
  { id: "5b1f0c4a-1111-4a5b-9c3d-000000000001", tenantId: "ab-42", name: "Alice", department: "Engineering" },
  { id: "7d2e9f8b-2222-4c6d-8e1f-000000000002", tenantId: "ab-43", name: "Bob", department: "Marketing" },
  { id: "9a3b8c7d-3333-4e7f-9a2b-000000000003", tenantId: "cd-44", name: "Carol", department: "Sales" },
];

test("without searchableFields the search matches invisible row keys", () => {
  const query = { ...defaultQuery(), q: "ab" };

  // Documents the fallback: "ab" appears only inside `tenantId`, yet every row matches.
  const result = queryClientData(ROWS_WITH_HIDDEN_KEYS, query);
  assert.equal(result.total, 2);
});

test("searchableFields confines the search to the named fields", () => {
  const query = { ...defaultQuery(), q: "ab" };
  const result = queryClientData(ROWS_WITH_HIDDEN_KEYS, query, {
    searchableFields: ["name", "department"],
  });

  assert.equal(result.total, 0, "no visible cell contains 'ab'");

  const hit = queryClientData(ROWS_WITH_HIDDEN_KEYS, { ...defaultQuery(), q: "market" }, {
    searchableFields: ["name", "department"],
  });
  assert.deepEqual(hit.items.map((r) => r.name), ["Bob"]);
});

test("the columns on screen drive the searchable set", () => {
  const columns = [{ id: "select" }, { accessorKey: "name" }, { accessorKey: "department" }];
  const fields = searchableColumnIds(columns);
  const query = { ...defaultQuery(), q: "0000" };

  // A GUID fragment matches nothing once the search follows the columns.
  assert.equal(queryClientData(ROWS_WITH_HIDDEN_KEYS, query).total, 3);
  assert.equal(queryClientData(ROWS_WITH_HIDDEN_KEYS, query, { searchableFields: fields }).total, 0);
});

test("a hidden column stops being searchable, and comes back when shown", () => {
  const columns = [{ accessorKey: "name" }, { accessorKey: "department" }];
  const query = { ...defaultQuery(), q: "sales" };

  const shown = queryClientData(ROWS_WITH_HIDDEN_KEYS, query, {
    searchableFields: searchableColumnIds(columns),
  });
  assert.deepEqual(shown.items.map((r) => r.name), ["Carol"]);

  const hidden = queryClientData(ROWS_WITH_HIDDEN_KEYS, query, {
    searchableFields: searchableColumnIds(columns, { department: true }),
  });
  assert.equal(hidden.total, 0);
});

test("a column whose id is a display slug is still searchable by its field", () => {
  // The regression the narrow default can introduce: `getColumnId` prefers
  // `id`, so `{ id: "lastLogin", accessorKey: "lastLoginAt" }` would contribute
  // the key "lastLogin" — which no row carries — and a column the user is
  // looking at would match nothing. The wide match this replaces always found
  // it, so getting this wrong is a downgrade, not a narrowing.
  const rows = [
    { id: "u1", fullName: "Alice", lastLoginAt: "2026-03-04T10:00:00Z" },
    { id: "u2", fullName: "Bob", lastLoginAt: "2025-11-20T10:00:00Z" },
  ];
  const columns = [
    { id: "select" },
    { id: "fullName", accessorKey: "fullName" },
    { id: "lastLogin", accessorKey: "lastLoginAt" },
  ];
  const fields = searchableColumnIds(columns);
  assert.deepEqual(fields, ["fullName", "lastLoginAt"]);

  const result = queryClientData(rows, { ...defaultQuery(), q: "2026-03" }, {
    searchableFields: fields,
  });
  assert.deepEqual(result.items.map((r) => r.fullName), ["Alice"]);
});
