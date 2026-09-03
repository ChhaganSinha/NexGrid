import test from "node:test";
import assert from "node:assert/strict";
import { saveGridState, loadGridState, clearGridState } from "../dist/index.js";

test("saveGridState and loadGridState persist state correctly in localStorage mock", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };

  const key = "test-table";
  const state = {
    density: "compact",
    hiddenColumns: ["email"],
    columnOrder: ["name", "age", "status"],
    columnWidths: { name: 200, age: 100 },
  };

  const saved = saveGridState(key, state);
  assert.equal(saved, true);

  const loaded = loadGridState(key);
  assert.ok(loaded);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.density, "compact");
  assert.deepEqual(loaded.hiddenColumns, ["email"]);
  assert.deepEqual(loaded.columnOrder, ["name", "age", "status"]);
  assert.deepEqual(loaded.columnWidths, { name: 200, age: 100 });

  const cleared = clearGridState(key);
  assert.equal(cleared, true);
  assert.equal(loadGridState(key), null);

  delete globalThis.window;
});

test("saveGridState degrades gracefully when window or localStorage is unavailable", () => {
  delete globalThis.window;
  assert.equal(saveGridState("key", {}), false);
  assert.equal(loadGridState("key"), null);
  assert.equal(clearGridState("key"), false);
});
