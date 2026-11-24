import test from "node:test";
import assert from "node:assert/strict";

import {
  GridHistoryManager,
  computeVirtualColumnsWindow,
  computeAutosizeWidths,
  distributeContainerWidth,
  flattenTreeRows,
  computeFilterOptionCounts,
} from "../dist/index.js";

test("GridHistoryManager manages undo/redo stack, respects limits, and ignores zero-effect edits", () => {
  const manager = new GridHistoryManager(3);
  assert.equal(manager.canUndo(), false);
  assert.equal(manager.canRedo(), false);

  // Push single edit
  const a1 = manager.push({ rowId: "1", columnId: "name", oldValue: "Alice", newValue: "Alicia" });
  assert.ok(a1);
  assert.equal(manager.canUndo(), true);
  assert.equal(manager.canRedo(), false);
  assert.equal(manager.getState().undoCount, 1);

  // Ignore no-op edit
  const noop = manager.push({ rowId: "1", columnId: "name", oldValue: "Alicia", newValue: "Alicia" });
  assert.equal(noop, null);
  assert.equal(manager.getState().undoCount, 1);

  // Push batch edit
  manager.push({
    description: "Range fill",
    mutations: [
      { rowId: "2", columnId: "dept", oldValue: "Sales", newValue: "Engineering" },
      { rowId: "3", columnId: "dept", oldValue: "Marketing", newValue: "Engineering" },
    ],
  });
  assert.equal(manager.getState().undoCount, 2);

  // Undo batch edit
  const undoneBatch = manager.undo();
  assert.ok(undoneBatch);
  assert.equal(undoneBatch.description, "Range fill");
  assert.equal(undoneBatch.mutations.length, 2);
  assert.equal(manager.canUndo(), true);
  assert.equal(manager.canRedo(), true);
  assert.equal(manager.getState().redoCount, 1);

  // Redo batch edit
  const redoneBatch = manager.redo();
  assert.ok(redoneBatch);
  assert.equal(redoneBatch.id, undoneBatch.id);
  assert.equal(manager.canRedo(), false);

  // Push more edits to test maxHistory capping (limit 3)
  manager.push({ rowId: "4", columnId: "score", oldValue: 50, newValue: 90 });
  manager.push({ rowId: "5", columnId: "score", oldValue: 60, newValue: 95 });
  assert.equal(manager.getState().undoCount, 3);

  manager.clear();
  assert.equal(manager.canUndo(), false);
  assert.equal(manager.canRedo(), false);
});

test("computeVirtualColumnsWindow calculates horizontal column slices and spacer widths accurately", () => {
  // 10 columns, each 100px wide. First column pinned left, last pinned right.
  const columns = Array.from({ length: 10 }, (_, i) => ({
    id: `col_${i}`,
    title: `Col ${i}`,
    meta: { width: 100 },
  }));

  const getColumnId = (c) => c.id;
  const isPinned = (c) => (c.id === "col_0" ? "left" : c.id === "col_9" ? "right" : "none");

  // At scrollLeft = 0, viewport = 400px (100px left pinned + 100px right pinned + 200px available for unpinned)
  const win0 = computeVirtualColumnsWindow({
    columns,
    scrollLeft: 0,
    viewportWidth: 400,
    overscan: 1,
    getColumnId,
    isPinned,
  });

  assert.equal(win0.leftPinned.length, 1);
  assert.equal(win0.leftPinned[0].id, "col_0");
  assert.equal(win0.rightPinned.length, 1);
  assert.equal(win0.rightPinned[0].id, "col_9");
  assert.equal(win0.totalUnpinnedWidth, 800); // 8 unpinned columns * 100px
  assert.equal(win0.leftSpacerWidth, 0);

  // Unpinned columns are col_1 .. col_8. With overscan 1 and 200px unpinned viewport, indices 0..3 are visible
  assert.ok(win0.virtualColumns.length >= 3);
  assert.equal(win0.virtualColumns[0].id, "col_1");

  // Verify geometry identity
  const virtualWidth0 = win0.virtualColumns.length * 100;
  assert.equal(win0.leftSpacerWidth + virtualWidth0 + win0.rightSpacerWidth, win0.totalUnpinnedWidth);

  // Scroll to 300px
  const winScrolled = computeVirtualColumnsWindow({
    columns,
    scrollLeft: 300,
    viewportWidth: 400,
    overscan: 0,
    getColumnId,
    isPinned,
  });

  assert.ok(winScrolled.leftSpacerWidth >= 200);
  const virtualWidthScrolled = winScrolled.virtualColumns.length * 100;
  assert.equal(
    winScrolled.leftSpacerWidth + virtualWidthScrolled + winScrolled.rightSpacerWidth,
    winScrolled.totalUnpinnedWidth,
  );
});

test("computeAutosizeWidths and distributeContainerWidth optimize and flex column widths", () => {
  const columns = [
    { id: "id", title: "ID", meta: { width: 50 } },
    { id: "name", title: "Full Name" },
    { id: "notes", title: "Brief Notes" },
  ];

  const rows = [
    { id: "1", name: "Short", notes: "A" },
    { id: "2", name: "A very long employee full name for auto-sizing test", notes: "B" },
  ];

  const widths = computeAutosizeWidths(columns, rows, {
    getColumnId: (c) => c.id,
    getColumnTitle: (c) => c.title,
    getCellValue: (c, r) => r[c.id],
    getCellText: (val) => String(val ?? ""),
  });

  assert.ok(widths.name > widths.id);
  assert.ok(widths.name >= 300);

  // Distribute remaining width to fill 1200px container
  const current = { id: 80, name: 300, notes: 120 }; // Total = 500
  const flexed = distributeContainerWidth(columns, 1200, current, {
    getColumnId: (c) => c.id,
    isPinned: (c) => c.id === "id", // id is pinned, so only name and notes flex
  });

  assert.equal(flexed.id, 80); // Pinned column untouched
  assert.ok(flexed.name > current.name);
  assert.ok(flexed.notes > current.notes);
  assert.equal(flexed.id + flexed.name + flexed.notes, 1200);
});

test("flattenTreeRows handles async lazy children and node loading indicators", () => {
  const rootRows = [
    { id: "root_1", name: "Org Root", isExpandable: true },
    { id: "root_2", name: "External", isExpandable: false },
  ];

  const lazyChildren = new Map();
  lazyChildren.set("root_1", [
    { id: "child_1", name: "Department A", isExpandable: false },
    { id: "child_2", name: "Department B", isExpandable: false },
  ]);

  const loadingNodeIds = new Set(["root_2"]);
  const expandedIds = new Set(["root_1"]);

  const nodes = flattenTreeRows(rootRows, {
    lazyChildren,
    loadingNodeIds,
    hasChildren: (r) => Boolean(r.isExpandable),
    expandedIds,
  });

  assert.equal(nodes.length, 4); // root_1, child_1, child_2, and root_2
  assert.equal(nodes[0].id, "root_1");
  assert.equal(nodes[0].hasChildren, true);
  assert.equal(nodes[0].isExpanded, true);
  assert.equal(nodes[0].isLoading, false);

  assert.equal(nodes[1].id, "child_1");
  assert.equal(nodes[1].depth, 1);
  assert.equal(nodes[1].parentId, "root_1");

  assert.equal(nodes[3].id, "root_2");
  assert.equal(nodes[3].depth, 0);

  // Check loading state on root_2 when expanded
  const nodesLoading = flattenTreeRows(rootRows, {
    loadingNodeIds,
    hasChildren: (r) => Boolean(r.isExpandable),
    expandedIds: new Set(["root_2"]),
  });

  const root2Node = nodesLoading.find((n) => n.id === "root_2");
  assert.ok(root2Node);
  assert.equal(root2Node.isLoading, true);
});

test("computeFilterOptionCounts aggregates matching option frequencies accurately", () => {
  const col = {
    id: "department",
    meta: {
      filterOptions: ["Engineering", "Sales", "Marketing", "HR"],
    },
  };

  const rows = [
    { id: "1", department: "Engineering" },
    { id: "2", department: "Sales" },
    { id: "3", department: "Engineering" },
    { id: "4", department: "Engineering" },
    { id: "5", department: "HR" },
  ];

  const counts = computeFilterOptionCounts(col, rows);
  assert.equal(counts.Engineering, 3);
  assert.equal(counts.Sales, 1);
  assert.equal(counts.HR, 1);
  assert.equal(counts.Marketing, 0);
});

test("distributeContainerWidth preserves column meta.width and subtracts reservedWidth cleanly", () => {
  const cols = [
    { id: "a", meta: { width: 200 } },
    { id: "b", meta: {} },
  ];
  const distributed = distributeContainerWidth(cols, 1000, {}, {
    getColumnId: (c) => c.id,
    isPinned: () => false,
    reservedWidth: 100, // e.g., selection (44) + serial (56)
  });
  // Total available = 900. Allocated = 200 + 140 = 340. Surplus = 560 -> 280 extra per column
  assert.equal(distributed.a, 200 + 280);
  assert.equal(distributed.b, 140 + 280);
  assert.equal(distributed.a + distributed.b, 900);

  // Respects meta.minWidth during computeAutosizeWidths
  const auto = computeAutosizeWidths(
    [{ id: "a", header: "A", meta: { minWidth: 150 } }],
    [{ a: "x" }],
    {
      getColumnId: (c) => c.id,
      getColumnTitle: (c) => c.header,
      getCellValue: (c, r) => r[c.id],
      getCellText: (v) => String(v ?? ""),
    },
  );
  assert.equal(auto.a, 150);

  // Supports boolean and Date values in computeFilterOptionCounts
  const boolCounts = computeFilterOptionCounts(
    { id: "active", meta: { filterOptions: ["Yes", "No"] } },
    [{ active: true }, { active: false }, { active: true }],
  );
  assert.equal(boolCounts.Yes, 2);
  assert.equal(boolCounts.No, 1);
});
