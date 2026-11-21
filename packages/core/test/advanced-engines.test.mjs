import test from "node:test";
import assert from "node:assert/strict";

import {
  flattenTreeRows,
  collectInitialExpandedTreeIds,
  upsertSavedView,
  removeSavedView,
  loadSavedViews,
  normalizeCellRange,
  isCellInRange,
  computeRangeStats,
  formatRangeTsv,
  parseClipboardTsv,
  moveFocusCoord,
  selectContiguousRowIds,
  reorderArrayItem,
  coerceEditedValue,
  validateEditedCell,
  defaultQuery,
} from "../dist/index.js";

test("flattenTreeRows and collectInitialExpandedTreeIds handle multi-level hierarchies", () => {
  const tree = [
    {
      id: "eng",
      name: "Engineering",
      children: [
        {
          id: "fe",
          name: "Frontend",
          children: [{ id: "u1", name: "Alice" }],
        },
      ],
    },
    { id: "hr", name: "HR" },
  ];

  // Collapsed by default -> only root nodes
  const collapsed = flattenTreeRows(tree);
  assert.deepEqual(collapsed.map((n) => [n.id, n.depth, n.hasChildren]), [
    ["eng", 0, true],
    ["hr", 0, false],
  ]);

  // Expand depth 2 (all levels)
  const initialExpanded = collectInitialExpandedTreeIds(tree, 2);
  const expanded = flattenTreeRows(tree, { expandedIds: initialExpanded });
  assert.deepEqual(expanded.map((n) => [n.id, n.depth, n.parentId]), [
    ["eng", 0, null],
    ["fe", 1, "eng"],
    ["u1", 2, "fe"],
    ["hr", 0, null],
  ]);
});

test("saved views upsert, overwrite by name, persist to localStorage, and remove cleanly", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };

  let views = upsertSavedView(
    [],
    {
      name: "High Performers",
      query: { ...defaultQuery(), filter: { score: ">=90" } },
      groupBy: ["dept"],
    },
    "students-grid",
  );
  assert.equal(views.length, 1);
  assert.equal(loadSavedViews("students-grid").length, 1);

  // Overwriting same name (case-insensitive) updates in place
  views = upsertSavedView(
    views,
    {
      name: "high performers",
      query: { ...defaultQuery(), filter: { score: ">=95" } },
    },
    "students-grid",
  );
  assert.equal(views.length, 1);
  assert.equal(views[0].query.filter.score, ">=95");

  views = removeSavedView(views, views[0].id, "students-grid");
  assert.equal(views.length, 0);
  assert.equal(loadSavedViews("students-grid").length, 0);
});

test("cell range selection, aggregations, TSV copy/paste, keyboard navigation, Shift+Click range, and row reorder", () => {
  const cols = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "q1", header: "Q1" },
    { accessorKey: "q2", header: "Q2" },
  ];
  const rows = [
    { id: "r1", name: "Alpha", q1: 10, q2: "$20.50" },
    { id: "r2", name: "Beta", q1: 30, q2: "$40.50" },
    { id: "r3", name: "Gamma", q1: 50, q2: "$60.00" },
  ];

  const range = normalizeCellRange({ rowIndex: 1, colIndex: 2 }, { rowIndex: 0, colIndex: 1 });
  assert.deepEqual(range, { minRow: 0, maxRow: 1, minCol: 1, maxCol: 2 });
  assert.equal(isCellInRange(0, 1, range), true);
  assert.equal(isCellInRange(2, 1, range), false);

  const stats = computeRangeStats(rows, cols, range);
  assert.deepEqual(stats, {
    cellCount: 4,
    numericCount: 4,
    sum: 101,
    avg: 25.25,
    min: 10,
    max: 40.5,
  });

  const tsv = formatRangeTsv(rows, cols, range);
  assert.equal(tsv, "10\t$20.50\n30\t$40.50");
  assert.deepEqual(parseClipboardTsv(`${tsv}\r\n`), [
    ["10", "$20.50"],
    ["30", "$40.50"],
  ]);

  assert.deepEqual(moveFocusCoord({ rowIndex: 0, colIndex: 0 }, "ArrowRight", 3, 3), {
    rowIndex: 0,
    colIndex: 1,
  });
  assert.deepEqual(moveFocusCoord({ rowIndex: 0, colIndex: 1 }, "End", 3, 3), {
    rowIndex: 0,
    colIndex: 2,
  });
  assert.deepEqual(moveFocusCoord({ rowIndex: 2, colIndex: 2 }, "ArrowDown", 3, 3), {
    rowIndex: 2,
    colIndex: 2,
  });

  const rangeSelected = selectContiguousRowIds(["r1", "r2", "r3"], 0, 2, new Set(), true);
  assert.deepEqual([...rangeSelected], ["r1", "r2", "r3"]);

  assert.deepEqual(reorderArrayItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
});

test("coerceEditedValue and validateEditedCell support date, boolean, number, and custom validation", () => {
  assert.equal(coerceEditedValue("true", "boolean"), true);
  assert.equal(coerceEditedValue("false", "boolean"), false);
  assert.equal(coerceEditedValue("42.5", "number"), 42.5);
  assert.equal(coerceEditedValue("2026-11-21", "date"), "2026-11-21");

  const scoreCol = {
    accessorKey: "score",
    meta: {
      editable: true,
      editType: "number",
      validateCell: (val) => (typeof val === "number" && (val < 0 || val > 100) ? "Score must be 0..100" : null),
    },
  };
  assert.equal(validateEditedCell(scoreCol, 85, {}), null);
  assert.equal(validateEditedCell(scoreCol, 120, {}), "Score must be 0..100");
});
