import test from "node:test";
import assert from "node:assert/strict";

import {
  toODataParams,
  buildODataUrl,
  fromODataResponse,
  defaultQuery,
} from "../dist/index.js";

test("toODataParams builds standard $top, $skip, and $count", () => {
  const query = { page: 3, pageSize: 25, sort: [] };
  const params = toODataParams(query);

  assert.equal(params.$top, "25");
  assert.equal(params.$skip, "50");
  assert.equal(params.$count, "true");
});

test("toODataParams builds $orderby clause", () => {
  const query = {
    page: 1,
    pageSize: 10,
    sort: [
      { field: "name", dir: "asc" },
      { field: "createdAt", dir: "desc" },
    ],
  };
  const params = toODataParams(query, {
    fieldMap: { createdAt: "CreatedOn" },
  });

  assert.equal(params.$orderby, "name asc, CreatedOn desc");
});

test("toODataParams builds $filter for column filters and global search", () => {
  const query = {
    page: 1,
    pageSize: 10,
    sort: [],
    q: "john",
    filter: { status: "Active", dept: "Sales" },
  };
  const params = toODataParams(query, {
    searchableFields: ["name", "email"],
    fieldMap: { status: "Status", dept: "Department" },
  });

  assert.ok(params.$filter.includes("Status eq 'Active'"));
  assert.ok(params.$filter.includes("Department eq 'Sales'"));
  assert.ok(
    params.$filter.includes(
      "(contains(tolower(name), 'john') or contains(tolower(email), 'john'))",
    ),
  );
});

test("buildODataUrl appends OData params to endpoint", () => {
  const query = defaultQuery();
  const url = buildODataUrl("https://api.example.com/odata/Students", query);

  assert.ok(url.includes("top=10") && url.includes("skip=0") && url.includes("count=true"));
});


test("fromODataResponse maps OData payload to PagedResponse", () => {
  const odataPayload = {
    "@odata.count": 1284,
    value: [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ],
  };
  const query = { page: 1, pageSize: 10, sort: [] };
  const result = fromODataResponse(odataPayload, query);

  assert.equal(result.total, 1284);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 10);
  assert.equal(result.totalPages, 129);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].name, "Alice");
});
