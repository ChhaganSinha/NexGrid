import test from "node:test";
import assert from "node:assert/strict";

import { defaultQuery, queryClientData } from "../dist/index.js";

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
