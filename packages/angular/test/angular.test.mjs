import "@angular/compiler";
import test from "node:test";
import assert from "node:assert/strict";
import {
  TableXComponent,
  NexGridComponent,
  GridHistoryManager,
  computeVirtualColumnsWindow,
  computeAutosizeWidths,
  distributeContainerWidth,
  computeFilterOptionCounts,
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_COLUMN_OVERSCAN,
} from "../dist/fesm2022/nexgrid-angular.mjs";

test("Angular package exports TableXComponent, NexGridComponent and enterprise helpers", () => {
  assert.equal(TableXComponent, NexGridComponent);
  assert.equal(typeof TableXComponent, "function");
  assert.equal(typeof GridHistoryManager, "function");
  assert.equal(typeof computeVirtualColumnsWindow, "function");
  assert.equal(typeof computeAutosizeWidths, "function");
  assert.equal(typeof distributeContainerWidth, "function");
  assert.equal(typeof computeFilterOptionCounts, "function");
  assert.equal(typeof DEFAULT_COLUMN_WIDTH, "number");
  assert.equal(typeof DEFAULT_COLUMN_OVERSCAN, "number");
});

test("GridHistoryManager in Angular bundle handles undo / redo stack correctly", () => {
  const history = new GridHistoryManager(10);
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);

  history.push({
    description: "cell edit",
    mutations: [{ rowId: "1", columnId: "name", oldValue: "Alice", newValue: "Alicia" }],
  });
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);

  const undone = history.undo();
  assert.ok(undone);
  assert.equal(undone.mutations[0].oldValue, "Alice");
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), true);

  const redone = history.redo();
  assert.ok(redone);
  assert.equal(redone.mutations[0].newValue, "Alicia");
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);
});

test("computeVirtualColumnsWindow in Angular bundle computes column window correctly", () => {
  const columns = [
    { id: "id", title: "ID", meta: { pinned: "left", width: 50 } },
    { id: "c1", title: "C1", meta: { width: 100 } },
    { id: "c2", title: "C2", meta: { width: 100 } },
    { id: "c3", title: "C3", meta: { width: 100 } },
    { id: "c4", title: "C4", meta: { width: 100 } },
    { id: "c5", title: "C5", meta: { width: 100 } },
  ];

  const win = computeVirtualColumnsWindow({
    columns,
    scrollLeft: 100,
    viewportWidth: 150,
    columnWidths: {},
    defaultWidth: 100,
    overscan: 0,
    isPinned: (col) => (col.meta?.pinned ? "left" : false),
    getColumnId: (col) => col.id,
  });

  assert.ok(win);
  assert.equal(win.leftSpacerWidth, 100);
  assert.deepEqual(win.virtualColumns.map((c) => c.id), ["c2"]);
});

test("computeFilterOptionCounts in Angular bundle computes option frequencies", () => {
  const col = { id: "dept", accessorKey: "dept", meta: { filterOptions: ["Engineering", "Sales", "HR"] } };
  const data = [
    { id: "1", dept: "Engineering" },
    { id: "2", dept: "Engineering" },
    { id: "3", dept: "Sales" },
  ];

  const counts = computeFilterOptionCounts(col, data);
  assert.equal(counts["Engineering"], 2);
  assert.equal(counts["Sales"], 1);
  assert.equal(counts["HR"], 0);
});

test("Angular bundle re-exports fixed distributeContainerWidth and computeAutosizeWidths", () => {
  const cols = [
    { id: "id", header: "ID", meta: { width: 80, pinned: "left" } },
    { id: "name", header: "Name", meta: { minWidth: 160 } },
    { id: "role", header: "Role" },
  ];
  const dist = distributeContainerWidth(cols, 700, {}, {
    getColumnId: (c) => c.id,
    isPinned: (c) => Boolean(c.meta?.pinned),
    defaultWidth: DEFAULT_COLUMN_WIDTH,
    reservedWidth: 44,
  });
  assert.equal(dist.id, undefined, "Pinned column without override stays untouched (uses meta.width)");
  assert.ok(dist.name >= 160);
  assert.equal(80 + dist.name + dist.role, 700 - 44);

  const autosized = computeAutosizeWidths(
    cols,
    [{ id: 1, name: "A", role: "B" }],
    {
      getColumnId: (c) => c.id,
      getColumnTitle: (c) => c.header,
      getCellValue: (c, r) => r[c.id],
      getCellText: (val) => String(val ?? ""),
    },
  );
  assert.ok(autosized.name >= 160, "Honors column meta.minWidth");
});
