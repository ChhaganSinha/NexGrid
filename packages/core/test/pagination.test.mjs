// The pager model and footer math.

import test from "node:test";
import assert from "node:assert/strict";

import { getPageNumbers, getRecordRange, serialNumber } from "../dist/index.js";

test("seven or fewer pages are listed in full", () => {
  assert.deepEqual(getPageNumbers(1, 1), [1]);
  assert.deepEqual(getPageNumbers(3, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("an early page elides only the tail", () => {
  assert.deepEqual(getPageNumbers(2, 20), [1, 2, 3, "...", 20]);
});

test("a middle page elides both sides", () => {
  assert.deepEqual(getPageNumbers(10, 20), [1, "...", 9, 10, 11, "...", 20]);
});

test("a late page elides only the head", () => {
  assert.deepEqual(getPageNumbers(19, 20), [1, "...", 18, 19, 20]);
});

test("first and last page are always present", () => {
  for (const page of [1, 4, 8, 15, 20]) {
    const pages = getPageNumbers(page, 20);
    assert.equal(pages[0], 1);
    assert.equal(pages[pages.length - 1], 20);
    assert.ok(pages.includes(page), `the current page ${page} must be reachable`);
  }
});

test("no page number is ever repeated", () => {
  for (let page = 1; page <= 30; page++) {
    const numbers = getPageNumbers(page, 30).filter((p) => p !== "...");
    assert.equal(new Set(numbers).size, numbers.length, `page ${page} produced a duplicate`);
  }
});

test("record range reports the visible window", () => {
  assert.deepEqual(getRecordRange(1, 10, 95), { start: 1, end: 10, total: 95 });
  assert.deepEqual(getRecordRange(3, 10, 95), { start: 21, end: 30, total: 95 });
  assert.deepEqual(getRecordRange(10, 10, 95), { start: 91, end: 95, total: 95 },
    "the final page ends at the total, not at a full page boundary");
});

test("an empty result set reports a zero range", () => {
  assert.deepEqual(getRecordRange(1, 10, 0), { start: 0, end: 0, total: 0 });
});

test("serial numbers keep counting across pages", () => {
  assert.equal(serialNumber(1, 10, 0), 1);
  assert.equal(serialNumber(1, 10, 9), 10);
  assert.equal(serialNumber(2, 10, 0), 11);
  assert.equal(serialNumber(5, 25, 4), 105);
});
