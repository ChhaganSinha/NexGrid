import test from "node:test";
import assert from "node:assert/strict";

import {
  computeVirtualWindow,
  DEFAULT_VIRTUAL_HEIGHT,
  DENSITY_ROW_HEIGHT,
} from "../dist/index.js";

test("computeVirtualWindow handles empty dataset safely", () => {
  const win = computeVirtualWindow({ totalRows: 0, scrollTop: 200 });
  assert.deepEqual(win, {
    startIndex: 0,
    endIndex: 0,
    topSpacerHeight: 0,
    bottomSpacerHeight: 0,
    totalHeight: 0,
    rowHeight: DENSITY_ROW_HEIGHT.default,
  });
});

test("computeVirtualWindow maintains invariant totalHeight across scroll offsets on 10,000 rows", () => {
  const totalRows = 10_000;
  const rowHeight = DENSITY_ROW_HEIGHT.default; // 44px
  const expectedTotal = totalRows * rowHeight;

  for (const scrollTop of [0, 440, 22_000, 200_000, 999_999]) {
    const win = computeVirtualWindow({
      totalRows,
      scrollTop,
      viewportHeight: DEFAULT_VIRTUAL_HEIGHT,
      density: "default",
      overscan: 6,
    });
    const renderedCount = win.endIndex - win.startIndex;
    assert.ok(renderedCount <= 30, `Rendered slice stays small (${renderedCount} rows)`);
    assert.equal(
      win.topSpacerHeight + renderedCount * win.rowHeight + win.bottomSpacerHeight,
      expectedTotal,
      `Height invariant holds at scrollTop=${scrollTop}`,
    );
  }
});

test("computeVirtualWindow respects density presets and clamps negative scrollTop", () => {
  const compactWin = computeVirtualWindow({
    totalRows: 1000,
    scrollTop: -50,
    viewportHeight: 360,
    density: "compact",
    overscan: 4,
  });
  assert.equal(compactWin.rowHeight, 36);
  assert.equal(compactWin.startIndex, 0);
  assert.equal(compactWin.topSpacerHeight, 0);
  assert.equal(compactWin.endIndex, 15); // ceil(360/36) + 1 + 4 = 15
});
