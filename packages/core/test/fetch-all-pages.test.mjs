// Full-dataset collection: the loop must terminate on every server behavior,
// including servers whose `total` disagrees with what they actually return.

import test from "node:test";
import assert from "node:assert/strict";

import { fetchAllPages, MAX_PAGE_SIZE, DEFAULT_ROW_CAP } from "../dist/index.js";

/** A fake endpoint over a fixed dataset that honours page/pageSize. */
function pagedSource(total, { reportedTotal = total } = {}) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls = [];

  return {
    calls,
    fetchPage: async (page, pageSize) => {
      calls.push({ page, pageSize });
      const start = (page - 1) * pageSize;
      return {
        items: rows.slice(start, start + pageSize),
        page,
        pageSize,
        total: reportedTotal,
        totalPages: Math.ceil(reportedTotal / pageSize),
      };
    },
  };
}

test("a single short page ends the walk immediately", async () => {
  const source = pagedSource(42);
  const result = await fetchAllPages(source.fetchPage);

  assert.equal(result.items.length, 42);
  assert.equal(result.total, 42);
  assert.equal(result.complete, true);
  assert.equal(source.calls.length, 1);
});

test("pages are requested at the maximum allowlisted size", async () => {
  const source = pagedSource(250);
  await fetchAllPages(source.fetchPage);

  assert.ok(source.calls.every((c) => c.pageSize === MAX_PAGE_SIZE));
  assert.deepEqual(source.calls.map((c) => c.page), [1, 2, 3]);
});

test("an exact multiple of the page size still terminates", async () => {
  const source = pagedSource(200);
  const result = await fetchAllPages(source.fetchPage);

  assert.equal(result.items.length, 200);
  assert.equal(result.complete, true);
});

test("an empty dataset returns nothing and reports complete", async () => {
  const source = pagedSource(0);
  const result = await fetchAllPages(source.fetchPage);

  assert.deepEqual(result.items, []);
  assert.equal(result.complete, true);
  assert.equal(source.calls.length, 1);
});

test("the row cap stops collection and reports incompleteness", async () => {
  const source = pagedSource(1000);
  const result = await fetchAllPages(source.fetchPage, 250);

  assert.equal(result.items.length, 300, "collection stops at the first page past the cap");
  assert.equal(result.total, 1000, "the server's true total is still reported");
  assert.equal(result.complete, false, "callers can tell the export is partial");
});

test("the default cap bounds an unbounded dataset", async () => {
  const source = pagedSource(100000);
  const result = await fetchAllPages(source.fetchPage);

  assert.equal(result.items.length, DEFAULT_ROW_CAP);
  assert.equal(result.complete, false);
});

test("a server whose total overstates its rows cannot loop forever", async () => {
  const source = pagedSource(150, { reportedTotal: 10000 });
  const result = await fetchAllPages(source.fetchPage);

  assert.equal(result.items.length, 150, "a short page ends the walk regardless of the claimed total");
  assert.equal(result.complete, false);
});

test("errors propagate so callers can degrade honestly", async () => {
  await assert.rejects(
    () => fetchAllPages(async () => { throw new Error("HTTP 500"); }),
    /HTTP 500/,
  );
});
