import test from "node:test";
import assert from "node:assert/strict";

import { toTsv, toExportColumns } from "../dist/index.js";

test("toTsv writes header row and tab-separated values", () => {
  const columns = toExportColumns([
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Full Name" },
    { accessorKey: "score", header: "Score" },
  ]);

  const rows = [
    { id: 1, name: "Alice Johnson", score: 95 },
    { id: 2, name: "Bob\tSmith", score: 85 }, // tab should be sanitized to space
  ];

  const tsv = toTsv(rows, columns);
  const lines = tsv.split("\n");

  assert.equal(lines.length, 3);
  assert.equal(lines[0], "ID\tFull Name\tScore");
  assert.equal(lines[1], "1\tAlice Johnson\t95");
  assert.equal(lines[2], "2\tBob Smith\t85");
});
