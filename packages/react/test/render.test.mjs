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
