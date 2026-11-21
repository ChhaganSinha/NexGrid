import test from "node:test";
import assert from "node:assert/strict";

import { groupRows, normalizeGroupBy, buildNestedGroupItems } from "../dist/index.js";

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

test("buildNestedGroupItems supports multi-column nested grouping and hierarchical collapsing", () => {
  const columns = [
    { accessorKey: "region", header: "Region" },
    { accessorKey: "dept", header: "Department" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "revenue", header: "Revenue", meta: { aggregation: "sum" } },
  ];
  const rows = [
    { id: 1, region: "APAC", dept: "Eng", name: "Asha", revenue: 100 },
    { id: 2, region: "APAC", dept: "Sales", name: "Ravi", revenue: 250 },
    { id: 3, region: "EMEA", dept: "Eng", name: "Clara", revenue: 180 },
  ];

  assert.deepEqual(normalizeGroupBy("region, dept, region"), ["region", "dept"]);

  const expandedAll = buildNestedGroupItems(rows, ["region", "dept"], columns);
  // APAC (depth 0) -> Eng (depth 1) -> row A -> Sales (depth 1) -> row B -> EMEA (depth 0) -> Eng (depth 1) -> row C
  assert.equal(expandedAll.length, 8);
  assert.equal(expandedAll[0].kind, "group");
  assert.equal(expandedAll[0].key, "APAC");
  assert.equal(expandedAll[0].depth, 0);
  assert.equal(expandedAll[0].summaries[0].value, "350");

  assert.equal(expandedAll[1].kind, "group");
  assert.equal(expandedAll[1].key, "APAC||Eng");
  assert.equal(expandedAll[1].depth, 1);

  // Collapsing top-level APAC hides its sub-groups and rows
  const collapsedApac = buildNestedGroupItems(rows, ["region", "dept"], columns, new Set(["APAC"]));
  assert.equal(collapsedApac.length, 4); // APAC (collapsed), EMEA, EMEA||Eng, Clara
});
