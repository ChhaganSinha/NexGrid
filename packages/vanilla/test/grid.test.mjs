import test from "node:test";
import assert from "node:assert/strict";

// Simple mock DOM environment for node:test
class MockNode {
  constructor(nodeName) {
    this.nodeName = nodeName;
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = {
      _styles: new Map(),
      setProperty(k, v) {
        this._styles.set(k, v);
      },
      getPropertyValue(k) {
        return this._styles.get(k);
      },
    };
    this.classList = {
      _classes: new Set(),
      add: (...cls) => {
        cls.forEach((c) => this.classList._classes.add(c));
      },
      remove: (...cls) => {
        cls.forEach((c) => this.classList._classes.delete(c));
      },
      contains: (c) => {
        return this.classList._classes.has(c);
      },
    };
    this.dataset = {};
    this._textContent = "";
    this._value = "";
    this._checked = false;
    this._indeterminate = false;
  }

  get textContent() {
    if (this.childNodes.length > 0) {
      return this.childNodes.map((c) => c.textContent).join("");
    }
    return this._textContent;
  }

  set textContent(val) {
    this.childNodes = [];
    this._textContent = String(val);
  }

  get value() {
    return this._value;
  }
  set value(v) {
    this._value = String(v);
  }

  get checked() {
    return this._checked;
  }
  set checked(v) {
    this._checked = Boolean(v);
  }

  get indeterminate() {
    return this._indeterminate;
  }
  set indeterminate(v) {
    this._indeterminate = Boolean(v);
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  replaceChildren(...newChildren) {
    this.childNodes.forEach((c) => (c.parentNode = null));
    this.childNodes = [];
    newChildren.forEach((c) => {
      if (typeof c === "string") {
        const textNode = new MockNode("#text");
        textNode.textContent = c;
        this.appendChild(textNode);
      } else if (c) {
        this.appendChild(c);
      }
    });
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    const list = this.listeners.get(event.type);
    if (list) {
      list.forEach((h) => h(event));
    }
    return true;
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === "class") {
      this.classList._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    }
  }

  getAttribute(k) {
    if (k === "class" && this.classList._classes.size > 0) {
      return Array.from(this.classList._classes).join(" ");
    }
    return this.attributes.get(k) || null;
  }

  removeAttribute(k) {
    this.attributes.delete(k);
    if (k === "class") {
      this.classList._classes.clear();
    }
  }

  hasAttribute(k) {
    return this.attributes.has(k);
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const walk = (node) => {
      if (matches(node, selector)) {
        results.push(node);
      }
      node.childNodes.forEach(walk);
    };
    this.childNodes.forEach(walk);
    return results;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (matches(curr, selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  contains(node) {
    let curr = node;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }
}

function matches(node, selector) {
  if (!node) return false;
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    return node.classList?.contains(cls) ?? false;
  }
  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    return node.getAttribute("id") === id;
  }
  if (selector.startsWith("[")) {
    const attrMatch = selector.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/);
    if (attrMatch) {
      const [, attr, val] = attrMatch;
      if (val !== undefined) return node.getAttribute(attr) === val;
      return node.hasAttribute(attr);
    }
  }
  return node.nodeName.toLowerCase() === selector.toLowerCase();
}

class MockElement extends MockNode {}
class MockHTMLElement extends MockElement {}
class MockSVGElement extends MockElement {}

class MockDocument extends MockNode {
  constructor() {
    super("#document");
    this.body = new MockHTMLElement("body");
    this.appendChild(this.body);
  }

  createElement(tag) {
    return new MockHTMLElement(tag);
  }

  createElementNS(ns, tag) {
    return new MockSVGElement(tag);
  }

  createTextNode(text) {
    const n = new MockNode("#text");
    n.textContent = text;
    return n;
  }
}

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.shiftKey = Boolean(init.shiftKey);
    this.key = init.key || "";
    this.target = null;
    this.currentTarget = null;
  }
  preventDefault() {}
  stopPropagation() {}
}

class MockMouseEvent extends MockEvent {}
class MockKeyboardEvent extends MockEvent {}

// Setup global DOM mocks
globalThis.Node = MockNode;
globalThis.Element = MockElement;
globalThis.HTMLElement = MockHTMLElement;
globalThis.SVGElement = MockSVGElement;
globalThis.HTMLDivElement = MockHTMLElement;
globalThis.HTMLTableSectionElement = MockHTMLElement;
globalThis.HTMLInputElement = MockHTMLElement;
globalThis.HTMLButtonElement = MockHTMLElement;
globalThis.HTMLSelectElement = MockHTMLElement;
globalThis.HTMLSpanElement = MockHTMLElement;
globalThis.SVGSVGElement = MockSVGElement;
globalThis.Event = MockEvent;
globalThis.MouseEvent = MockMouseEvent;
globalThis.KeyboardEvent = MockKeyboardEvent;
globalThis.EventTarget = MockNode;
globalThis.document = new MockDocument();

// Import vanilla package
const { createTableX, createNexGrid } = await import("../dist/index.js");

test("createTableX mounts table, renders rows and updates correctly", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
    { accessorKey: "score", header: "Score" },
  ];

  const data = [
    { id: "1", name: "Alice", score: 95 },
    { id: "2", name: "Bob", score: 85 },
  ];

  let emittedQuery = null;
  let emittedSelection = null;

  const handle = createTableX(container, {
    caption: "Students Test",
    columns,
    data,
    total: 2,
    enableSelection: true,
    onQueryChange: (q) => {
      emittedQuery = q;
    },
    onSelectionChange: (ids, all) => {
      emittedSelection = { ids, all };
    },
  });

  // Verify initial state
  assert.equal(handle.getQuery().page, 1);
  assert.deepEqual(handle.getSelection(), []);

  const table = container.querySelector(".tbx-table");
  assert.ok(table, "Table element should be rendered");

  // Verify rows rendered
  const rows = container.querySelectorAll(".tbx-row");
  assert.equal(rows.length, 2, "Should render 2 rows");

  // Test row selection
  const checkboxes = container.querySelectorAll(".tbx-checkbox");
  assert.ok(checkboxes.length > 0, "Checkboxes should be rendered");

  // Toggle select row 1 (index 1 is first row checkbox, index 0 is select-all)
  checkboxes[1].checked = true;
  checkboxes[1].dispatchEvent(new MockEvent("change"));
  assert.deepEqual(handle.getSelection(), ["1"]);
  assert.deepEqual(emittedSelection, { ids: ["1"], all: false });

  // Test sorting - click name column header
  const headers = container.querySelectorAll(".tbx-th--sortable");
  assert.ok(headers.length >= 3, "Sortable headers rendered");

  // Single sort
  headers[0].dispatchEvent(new MockMouseEvent("click", { shiftKey: false }));
  assert.ok(emittedQuery, "Should emit query change on sort");
  assert.equal(emittedQuery.sort[0].field, "id");
  assert.equal(emittedQuery.sort[0].dir, "asc");
  handle.update({ query: emittedQuery });

  // Multi-sort (Shift+Click) on score header (index 2)
  headers[2].dispatchEvent(new MockMouseEvent("click", { shiftKey: true }));
  assert.equal(emittedQuery.sort.length, 2, "Should append secondary sort");
  assert.equal(emittedQuery.sort[1].field, "score");
  assert.equal(emittedQuery.sort[1].dir, "asc");
  handle.update({ query: emittedQuery });

  // Update with new query and data
  handle.update({
    data: [{ id: "3", name: "Charlie", score: 70 }],
    total: 3,
    query: { page: 1, pageSize: 10, sort: [{ field: "name", dir: "desc" }] },
  });

  assert.equal(handle.getQuery().sort[0].dir, "desc");
  const updatedRows = container.querySelectorAll(".tbx-row");
  assert.equal(updatedRows.length, 1);

  // Test teardown
  handle.destroy();
  assert.equal(container.childNodes.length, 0, "Container should be emptied on destroy");
});

test("createTableX single selection mode selects only one row", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
  ];

  const data = [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ];

  let selectedIds = [];
  const handle = createTableX(container, {
    caption: "Single Select Test",
    columns,
    data,
    total: 2,
    enableSelection: true,
    selectionMode: "single",
    onSelectionChange: (ids) => {
      selectedIds = ids;
    },
  });

  const checkboxes = container.querySelectorAll(".tbx-checkbox");
  // In single select mode, checkboxes are radio inputs for rows
  checkboxes[0].checked = true;
  checkboxes[0].dispatchEvent(new MockEvent("change"));
  assert.deepEqual(selectedIds, ["1"]);

  checkboxes[1].checked = true;
  checkboxes[1].dispatchEvent(new MockEvent("change"));
  assert.deepEqual(selectedIds, ["2"]);

  handle.destroy();
});

test("createTableX renders column filter trigger and applies filter", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "id", header: "ID" },
    {
      accessorKey: "status",
      header: "Status",
      meta: { serverFilterable: true, filterOptions: ["Active", "Pending"] },
    },
  ];

  const data = [
    { id: "1", status: "Active" },
    { id: "2", status: "Pending" },
  ];

  let emittedQuery = null;
  const handle = createTableX(container, {
    caption: "Filter Test",
    columns,
    data,
    total: 2,
    onQueryChange: (q) => {
      emittedQuery = q;
    },
  });

  const filterBtn = container.querySelector(".tbx-col-filter-btn");
  assert.ok(filterBtn, "Filter button should be rendered on status column");

  filterBtn.dispatchEvent(new MockMouseEvent("click"));
  const popover = container.querySelector(".tbx-filter-popover");
  assert.ok(popover, "Filter popover should be open");

  const options = popover.querySelectorAll(".tbx-filter-option");
  assert.equal(options.length, 3); // All, Active, Pending

  options[1].dispatchEvent(new MockMouseEvent("click")); // Active
  assert.ok(emittedQuery, "Query should be emitted with filter");
  assert.equal(emittedQuery.filter?.status, "Active");

  // Open popover again and click Clear button
  const filterBtnActive = container.querySelector(".tbx-col-filter-btn");
  filterBtnActive.dispatchEvent(new MockMouseEvent("click"));
  const popover2 = container.querySelector(".tbx-filter-popover");
  assert.ok(popover2, "Filter popover should be open again");

  const clearBtn = popover2.querySelector(".tbx-filter-popover-btn");
  assert.ok(clearBtn, "Clear button should exist");
  clearBtn.dispatchEvent(new MockMouseEvent("click"));

  assert.equal(emittedQuery.filter?.status, undefined, "Filter should be cleared");
  assert.equal(handle.getQuery().filter?.status, undefined, "Internal query filter should be cleared");

  handle.destroy();
});
