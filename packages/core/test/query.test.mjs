// Query reducer behavior. These are the rules every adapter inherits, so a
// regression here is a regression on all four platforms at once.

import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultQuery,
  primarySort,
  withToggledSort,
  withToggledMultiSort,
  withSort,
  withSearch,
  withPage,
  withPageSize,
  withFilter,
  totalPagesFor,
  DEFAULT_PAGE_SIZE,
} from "../dist/index.js";

test("defaultQuery starts on page 1 with no sort", () => {
  const q = defaultQuery();
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, DEFAULT_PAGE_SIZE);
  assert.deepEqual(q.sort, []);
  assert.equal(q.q, undefined);
  assert.equal(q.filter, undefined);
});

test("sort cycles asc -> desc -> cleared on the same column", () => {
  const base = defaultQuery();

  const asc = withToggledSort(base, "name");
  assert.deepEqual(asc.sort, [{ field: "name", dir: "asc" }]);

  const desc = withToggledSort(asc, "name");
  assert.deepEqual(desc.sort, [{ field: "name", dir: "desc" }]);

  const cleared = withToggledSort(desc, "name");
  assert.deepEqual(cleared.sort, []);
});

test("withToggledMultiSort appends, cycles, and removes columns in multi-sort", () => {
  const base = defaultQuery();

  // 1. Add first sort column
  const sort1 = withToggledMultiSort(base, "name");
  assert.deepEqual(sort1.sort, [{ field: "name", dir: "asc" }]);

  // 2. Add second sort column
  const sort2 = withToggledMultiSort(sort1, "score");
  assert.deepEqual(sort2.sort, [
    { field: "name", dir: "asc" },
    { field: "score", dir: "asc" },
  ]);

  // 3. Cycle second sort column to desc
  const sort3 = withToggledMultiSort(sort2, "score");
  assert.deepEqual(sort3.sort, [
    { field: "name", dir: "asc" },
    { field: "score", dir: "desc" },
  ]);

  // 4. Cycle second sort column to cleared
  const sort4 = withToggledMultiSort(sort3, "score");
  assert.deepEqual(sort4.sort, [{ field: "name", dir: "asc" }]);

  // 5. Verify page resets to 1
  const onPage3 = { ...sort2, page: 3 };
  assert.equal(withToggledMultiSort(onPage3, "name").page, 1);
});

test("sorting a different column restarts at ascending", () => {
  const desc = withToggledSort(withToggledSort(defaultQuery(), "name"), "name");
  const other = withToggledSort(desc, "email");
  assert.deepEqual(other.sort, [{ field: "email", dir: "asc" }]);
});

test("sorting resets to page 1", () => {
  const onPage5 = { ...defaultQuery(), page: 5 };
  assert.equal(withToggledSort(onPage5, "name").page, 1);
  assert.equal(withSort(onPage5, "name", "desc").page, 1);
});

test("primarySort reads the first sort", () => {
  assert.equal(primarySort(defaultQuery()), undefined);
  const q = withSort(defaultQuery(), "name", "desc");
  assert.deepEqual(primarySort(q), { field: "name", dir: "desc" });
});

test("search sets the term, resets the page, and clears on empty", () => {
  const onPage7 = { ...defaultQuery(), page: 7 };

  const searched = withSearch(onPage7, "smith");
  assert.equal(searched.q, "smith");
  assert.equal(searched.page, 1);

  const cleared = withSearch(searched, "");
  assert.equal(cleared.q, undefined, "an empty search is removed, not stored as an empty string");
});

test("page navigation clamps into range", () => {
  const q = defaultQuery();
  assert.equal(withPage(q, 3, 10).page, 3);
  assert.equal(withPage(q, 0, 10).page, 1, "below the first page clamps up");
  assert.equal(withPage(q, 99, 10).page, 10, "past the last page clamps down");
  assert.equal(withPage(q, 5, 0).page, 1, "an empty result set still has page 1");
  assert.equal(withPage(q, 2.7, 10).page, 2, "fractional input truncates");
});

test("page size only accepts allowlisted values and resets the page", () => {
  const onPage4 = { ...defaultQuery(), page: 4 };

  const resized = withPageSize(onPage4, 50);
  assert.equal(resized.pageSize, 50);
  assert.equal(resized.page, 1);

  const rejected = withPageSize(onPage4, 37);
  assert.equal(rejected, onPage4, "a non-allowlisted size is ignored entirely");
});

test("filters set, replace, and clear", () => {
  const q = defaultQuery();

  const filtered = withFilter(q, "status", "Active");
  assert.deepEqual(filtered.filter, { status: "Active" });
  assert.equal(filtered.page, 1);

  const two = withFilter(filtered, "role", "Staff");
  assert.deepEqual(two.filter, { status: "Active", role: "Staff" });

  const one = withFilter(two, "status", undefined);
  assert.deepEqual(one.filter, { role: "Staff" });

  const none = withFilter(one, "role", "");
  assert.equal(none.filter, undefined, "the last filter removed drops the whole object");
});

test("reducers never mutate the query they are given", () => {
  const original = defaultQuery();
  const snapshot = JSON.parse(JSON.stringify(original));

  withToggledSort(original, "name");
  withSearch(original, "x");
  withPage(original, 3, 5);
  withPageSize(original, 25);
  withFilter(original, "status", "Active");

  assert.deepEqual(original, snapshot);
});

test("totalPagesFor never returns zero", () => {
  assert.equal(totalPagesFor(0, 10), 1, "an empty grid still renders one page");
  assert.equal(totalPagesFor(10, 10), 1);
  assert.equal(totalPagesFor(11, 10), 2);
  assert.equal(totalPagesFor(1284, 25), 52);
});
