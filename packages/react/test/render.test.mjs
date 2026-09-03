import test from "node:test";
import assert from "node:assert/strict";
import React from "react";

// Test the re-exported core engine and React rendering utilities
import {
  defaultQuery,
  withToggledSort,
  withToggledMultiSort,
  withPage,
  queryClientData,
  parseQuery,
  serializeQuery,
} from "../dist/index.js";

test("React package re-exports query reducers including withToggledMultiSort", () => {
  const base = defaultQuery();
  const sorted1 = withToggledSort(base, "name");
  assert.equal(sorted1.sort[0].field, "name");
  assert.equal(sorted1.sort[0].dir, "asc");

  const multi = withToggledMultiSort(sorted1, "score");
  assert.equal(multi.sort.length, 2);
  assert.equal(multi.sort[1].field, "score");
  assert.equal(multi.sort[1].dir, "asc");
});

test("React package re-exports queryClientData for in-memory grid datasets", () => {
  const data = [
    { id: "1", name: "Alice", score: 95 },
    { id: "2", name: "Bob", score: 85 },
  ];

  const query = { page: 1, pageSize: 10, sort: [{ field: "score", dir: "desc" }] };
  const response = queryClientData(data, query);

  assert.equal(response.total, 2);
  assert.equal(response.items[0].name, "Alice");
  assert.equal(response.items[1].name, "Bob");
});

test("queryClientData slices pages and returns all matching when paginate is false", () => {
  const items = Array.from({ length: 45 }, (_, i) => ({
    id: String(i + 1),
    name: `User ${i + 1}`,
  }));

  // Page 1 of 10
  const page1 = queryClientData(items, { page: 1, pageSize: 10, sort: [] });
  assert.equal(page1.items.length, 10);
  assert.equal(page1.total, 45);
  assert.equal(page1.totalPages, 5);
  assert.equal(page1.items[0].id, "1");

  // Page 5 of 10 (remaining 5)
  const page5 = queryClientData(items, { page: 5, pageSize: 10, sort: [] });
  assert.equal(page5.items.length, 5);
  assert.equal(page5.items[0].id, "41");

  // Export mode (paginate: false)
  const all = queryClientData(items, { page: 1, pageSize: 10, sort: [] }, { paginate: false });
  assert.equal(all.items.length, 45);
  assert.equal(all.total, 45);
});

