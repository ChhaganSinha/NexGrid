// The wire format. NexGrid.AspNetCore's binder parses exactly this, so these
// assertions are a cross-platform contract, not an implementation detail.

import test from "node:test";
import assert from "node:assert/strict";

import {
  serializeQuery,
  parseQuery,
  buildQueryUrl,
  defaultQuery,
  DEFAULT_PAGE_SIZE,
} from "../dist/index.js";

test("a full query serializes to the documented format", () => {
  const qs = serializeQuery({
    page: 2,
    pageSize: 25,
    sort: [{ field: "name", dir: "asc" }],
    q: "smith",
    filter: { status: "Active" },
  });
  const params = new URLSearchParams(qs);

  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "25");
  assert.equal(params.get("sort"), "name:asc");
  assert.equal(params.get("q"), "smith");
  assert.equal(params.get("filter[status]"), "Active");
});

test("multiple sorts serialize as repeated parameters", () => {
  const qs = serializeQuery({
    page: 1,
    pageSize: 10,
    sort: [
      { field: "grade", dir: "desc" },
      { field: "name", dir: "asc" },
    ],
  });
  assert.deepEqual(new URLSearchParams(qs).getAll("sort"), ["grade:desc", "name:asc"]);
});

test("serialize then parse round-trips", () => {
  const original = {
    page: 3,
    pageSize: 50,
    sort: [{ field: "createdAt", dir: "desc" }],
    q: "o'brien & sons",
    filter: { status: "Active", role: "Staff" },
  };
  assert.deepEqual(parseQuery(serializeQuery(original)), original);
});

test("a query with no search or filters round-trips without empty keys", () => {
  const parsed = parseQuery(serializeQuery(defaultQuery()));
  assert.deepEqual(parsed, defaultQuery());
});

test("parse accepts a leading question mark and URLSearchParams", () => {
  assert.equal(parseQuery("?page=4&pageSize=25").page, 4);
  assert.equal(parseQuery(new URLSearchParams("page=4&pageSize=25")).page, 4);
});

test("invalid values degrade safely instead of throwing", () => {
  const parsed = parseQuery("page=abc&pageSize=999&sort=&sort=name");

  assert.equal(parsed.page, 1, "an unparseable page becomes 1");
  assert.equal(parsed.pageSize, DEFAULT_PAGE_SIZE, "a non-allowlisted size becomes the default");
  assert.deepEqual(parsed.sort, [{ field: "name", dir: "asc" }],
    "an empty token is dropped and a directionless token defaults to ascending");
});

test("a negative page is rejected rather than propagated", () => {
  assert.equal(parseQuery("page=-5").page, 1);
});

test("an unknown sort direction falls back to ascending", () => {
  assert.deepEqual(parseQuery("sort=name:sideways").sort, [{ field: "name", dir: "asc" }]);
});

test("field names containing a colon keep their direction", () => {
  assert.deepEqual(parseQuery("sort=address:city:desc").sort, [
    { field: "address:city", dir: "desc" },
  ]);
});

test("buildQueryUrl respects an endpoint that already has parameters", () => {
  const query = { page: 2, pageSize: 10, sort: [] };

  assert.ok(buildQueryUrl("/api/students", query).startsWith("/api/students?page=2"));
  assert.ok(
    buildQueryUrl("/api/students?tenant=42", query).startsWith("/api/students?tenant=42&page=2"),
    "an existing query string is preserved with & rather than a second ?",
  );
});
