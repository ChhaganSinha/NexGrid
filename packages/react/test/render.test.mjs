import test from "node:test";
import assert from "node:assert/strict";
import React from "react";

// Test the re-exported core engine and React rendering utilities
import {
  TableX,
  useClientTableX,
  defaultQuery,
  withToggledSort,
  withToggledMultiSort,
  withFilter,
  withPage,
  matchesFilterValue,
  compareValues,
  getSortField,
  getFilterField,
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

test("React package exports sorting/filtering helpers and TableX / useClientTableX", () => {
  assert.equal(typeof TableX, "function");
  assert.equal(typeof useClientTableX, "function");

  const columns = [
    { id: "student", accessorKey: "name", header: "Student" },
    {
      accessorKey: "status",
      header: "Status",
      meta: { filterOptions: ["Active", "Inactive"] },
    },
    { accessorKey: "score", header: "Score", meta: { filterType: "number-range" } },
  ];

  assert.equal(getSortField(columns[0]), "name");
  assert.equal(getFilterField(columns[0]), "name");
  assert.equal(matchesFilterValue("Inactive", "Active", { filterOptions: ["Active", "Inactive"] }), false);
  assert.ok(compareValues(-15, -3, "asc") < 0);

  const rows = Array.from({ length: 35 }, (_, i) => ({
    id: String(i + 1),
    name: `Student ${i + 1}`,
    status: i % 2 === 0 ? "Active" : "Inactive",
    score: 60 + i,
  }));

  let q = defaultQuery();
  q = withFilter(q, "status", "Active");
  q = withFilter(q, "score", "70..90");
  q = withToggledSort(q, "score");
  q = withToggledSort(q, "score"); // desc

  const paged = queryClientData(rows, q, { columns });
  assert.ok(paged.total > 0 && paged.total < 35);
  assert.ok(paged.items.every((r) => r.status === "Active" && r.score >= 70 && r.score <= 90));
  assert.ok(paged.items[0].score >= paged.items[paged.items.length - 1].score);

  const element = React.createElement(TableX, {
    caption: "Students",
    columns,
    data: paged.items,
    total: paged.total,
    query: q,
  });
  assert.equal(element.type, TableX);
  assert.equal(element.props.total, paged.total);
});

test("React TableX SSR renders tree data, pinned top/bottom rows, nested groupBy, saved views button, row reorder, and infinite footer", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const {
    toPdfBytes,
    buildNestedGroupItems,
    flattenTreeRows,
    computeRangeStats,
    parseClipboardTsv,
    upsertSavedView,
  } = await import("../dist/index.js");

  assert.equal(typeof toPdfBytes, "function");
  assert.equal(typeof buildNestedGroupItems, "function");
  assert.equal(typeof flattenTreeRows, "function");
  assert.equal(typeof computeRangeStats, "function");
  assert.equal(typeof parseClipboardTsv, "function");
  assert.equal(typeof upsertSavedView, "function");

  const treeMarkup = renderToStaticMarkup(
    React.createElement(TableX, {
      caption: "Org Tree",
      columns: [
        { accessorKey: "name", header: "Department" },
        { accessorKey: "headcount", header: "Headcount" },
      ],
      data: [
        {
          id: "eng",
          name: "Engineering",
          headcount: 42,
          children: [{ id: "fe", name: "Frontend", headcount: 18 }],
        },
      ],
      clientSidePagination: true,
      enableTreeData: true,
      defaultExpandedDepth: 1,
      pinnedTopRows: [{ id: "pin-t", name: "Company Target", headcount: 100 }],
      pinnedBottomRows: [{ id: "pin-b", name: "Unallocated", headcount: 5 }],
      enableSavedViews: true,
      enableRowReorder: true,
      enableInfiniteScroll: true,
      hasMore: true,
      exportMode: "pdf",
    }),
  );

  assert.ok(treeMarkup.includes("tbx-tree-toggle--open"), "Expanded root tree chevron renders");
  assert.ok(treeMarkup.includes("Frontend"), "Expanded child tree row renders");
  assert.ok(treeMarkup.includes("tbx-row--pinned-top"), "Pinned top row renders");
  assert.ok(treeMarkup.includes("tbx-row--pinned-bottom"), "Pinned bottom row renders");
  assert.ok(treeMarkup.includes("Views"), "Saved Views toolbar button renders");
  assert.ok(treeMarkup.includes("Export PDF"), "Direct PDF export button renders");
  assert.ok(treeMarkup.includes("tbx-row-drag-handle"), "Row drag handle column renders");
  assert.ok(treeMarkup.includes("tbx-load-more-btn"), "Infinite scroll Load More button renders");

  const groupedMarkup = renderToStaticMarkup(
    React.createElement(TableX, {
      caption: "Nested Grouping",
      columns: [
        { accessorKey: "region", header: "Region" },
        { accessorKey: "dept", header: "Dept" },
      ],
      data: [
        { id: "1", region: "APAC", dept: "Sales" },
        { id: "2", region: "EMEA", dept: "Eng" },
      ],
      clientSidePagination: true,
      groupBy: ["region", "dept"],
    }),
  );

  assert.ok(groupedMarkup.includes('data-group-depth="0"'), "Outer group depth 0 renders");
  assert.ok(groupedMarkup.includes('data-group-depth="1"'), "Inner nested group depth 1 renders");
});

