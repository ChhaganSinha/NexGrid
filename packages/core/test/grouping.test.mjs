import test from "node:test";
import assert from "node:assert/strict";

import { groupRows } from "../dist/index.js";

test("groupRows buckets rows in first-seen order, handles blank values, and computes group aggregations", () => {
  const columns = [
    { accessorKey: "name", header: "Employee" },
    { accessorKey: "dept", header: "Department" },
    { accessorKey: "score", header: "Score", meta: { aggregation: "avg", aggregationLabel: "Avg:" } },
  ];
  const rows = [
    { id: 1, name: "Alice", dept: "Engineering", score: 90 },
    { id: 2, name: "Bob", dept: "Sales", score: 80 },
    { id: 3, name: "Charlie", dept: "Engineering", score: 100 },
    { id: 4, name: "Diana", dept: "", score: 70 },
  ];

  const groups = groupRows(rows, "dept", columns);
  assert.equal(groups.length, 3);

  assert.equal(groups[0].key, "Engineering");
  assert.equal(groups[0].columnTitle, "Department");
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].entries.map((e) => e.originalIndex), [0, 2]);
  assert.equal(groups[0].summaries.length, 1);
  assert.equal(groups[0].summaries[0].label, "Avg:");
  assert.equal(groups[0].summaries[0].value, "95");

  assert.equal(groups[1].key, "Sales");
  assert.equal(groups[1].count, 1);

  assert.equal(groups[2].key, "__empty__");
  assert.equal(groups[2].displayValue, "—");
  assert.equal(groups[2].count, 1);
});
