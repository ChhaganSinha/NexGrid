import test from "node:test";
import assert from "node:assert/strict";
import { createSSRApp, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import {
  TableX,
  NexGrid,
  useClientTableX,
  defaultQuery,
  withToggledSort,
  toPdfBytes,
  flattenTreeRows,
  buildNestedGroupItems,
} from "../dist/index.js";

test("Vue package exports TableX, NexGrid, useClientTableX, and core helpers", () => {
  assert.equal(TableX, NexGrid);
  assert.equal(typeof useClientTableX, "function");
  assert.equal(typeof toPdfBytes, "function");
  assert.equal(typeof flattenTreeRows, "function");
  assert.equal(typeof buildNestedGroupItems, "function");
});

test("useClientTableX reactively sorts, searches, filters, and paginates a Vue ref dataset", () => {
  const source = ref([
    { id: "1", name: "Charlie", dept: "Sales", score: 75 },
    { id: "2", name: "Alice", dept: "Engineering", score: 98 },
    { id: "3", name: "Bob", dept: "Engineering", score: 88 },
  ]);

  const grid = useClientTableX(source);
  assert.equal(grid.total.value, 3);
  assert.equal(grid.data.value.length, 3);

  grid.setQuery(withToggledSort(defaultQuery(), "name"));
  assert.deepEqual(
    grid.data.value.map((r) => r.name),
    ["Alice", "Bob", "Charlie"],
  );

  grid.setQuery({ ...grid.query.value, filter: { dept: "Engineering" } });
  assert.equal(grid.total.value, 2);
  assert.equal(grid.fetchAllData(grid.query.value).length, 2);
});

test("Vue TableX SSR renders scoped slots, tree data, pinned rows, nested groupBy, saved views, row reorder, and infinite footer", async () => {
  const columns = [
    { accessorKey: "name", header: "Unit", meta: { pinned: "left" } },
    { accessorKey: "budget", header: "Budget", meta: { align: "right", aggregation: "sum" } },
  ];

  const app = createSSRApp({
    setup() {
      return () =>
        h(
          TableX,
          {
            caption: "Vue Org Grid",
            columns,
            data: [
              {
                id: "eng",
                name: "Engineering",
                budget: 500,
                children: [{ id: "fe", name: "Frontend", budget: 200 }],
              },
            ],
            clientSidePagination: true,
            enableTreeData: true,
            defaultExpandedDepth: 1,
            pinnedTopRows: [{ id: "t1", name: "FY Target", budget: 1000 }],
            pinnedBottomRows: [{ id: "b1", name: "Reserve", budget: 50 }],
            enableSavedViews: true,
            enableRowReorder: true,
            enableInfiniteScroll: true,
            hasMore: true,
            enableSummaryRow: true,
            exportMode: "pdf",
          },
          {
            "cell-budget": ({ value }) => h("span", { class: "custom-budget" }, `$${value}k`),
            toolbar: () => h("button", { class: "custom-toolbar-btn" }, "Sync"),
          },
        );
    },
  });

  const html = await renderToString(app);
  assert.ok(html.includes("tbx-root"), "Renders .tbx-root container");
  assert.ok(html.includes("tbx-tree-toggle--open"), "Renders expanded tree toggle");
  assert.ok(html.includes("Frontend"), "Renders expanded child tree row");
  assert.ok(html.includes("tbx-row--pinned-top"), "Renders pinned top row");
  assert.ok(html.includes("tbx-row--pinned-bottom"), "Renders pinned bottom row");
  assert.ok(html.includes("custom-budget") && html.includes("$500k"), "Renders #cell-budget scoped slot");
  assert.ok(html.includes("custom-toolbar-btn"), "Renders #toolbar slot");
  assert.ok(html.includes("Views"), "Renders Saved Views toolbar button");
  assert.ok(html.includes("Export PDF"), "Renders direct PDF export button");
  assert.ok(html.includes("tbx-row-drag-handle"), "Renders row drag handle");
  assert.ok(html.includes("tbx-resize-handle"), "Renders column resize handle");
  assert.ok(html.includes("tbx-load-more-btn"), "Renders infinite scroll Load More button");
  assert.ok(html.includes("tbx-summary-row"), "Renders summary footer row");
  assert.ok(html.includes("tbx-card-head"), "Renders mobile card header");
});

test("Vue TableX renders split export mode, sticky pinned header/summary offsets, and nested group headers", async () => {
  const columns = [
    { accessorKey: "region", header: "Region" },
    { accessorKey: "team", header: "Team", meta: { pinned: "left" } },
    { accessorKey: "revenue", header: "Revenue", meta: { align: "right", aggregation: "sum" } },
  ];

  const app = createSSRApp({
    setup() {
      return () =>
        h(TableX, {
          caption: "Sales Breakdown",
          columns,
          data: [
            { id: "1", region: "APAC", team: "Core", revenue: 120 },
            { id: "2", region: "APAC", team: "Enterprise", revenue: 300 },
          ],
          clientSidePagination: true,
          enableSelection: true,
          enableSummaryRow: true,
          exportMode: "split",
          groupBy: ["region", "team"],
        });
    },
  });

  const html = await renderToString(app);
  assert.ok(html.includes("tbx-split-btn"), "Renders split export button group");
  assert.ok(html.includes('data-group-depth="1"'), "Renders multi-level nested group depth 1");
  assert.ok(html.includes("tbx-th--select tbx-th--pinned-left"), "Pins structural select header cell");
  assert.ok(html.includes("tbx-summary-cell tbx-td--pinned-left"), "Pins summary footer cell");
});
