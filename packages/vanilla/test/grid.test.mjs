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
    this.style = new Proxy(
      {
        _styles: new Map(),
        setProperty(k, v) {
          this._styles.set(k, v);
        },
        getPropertyValue(k) {
          return this._styles.get(k);
        },
      },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          const kebab = String(prop).replace(/([A-Z])/g, "-$1").toLowerCase();
          return target._styles.get(kebab) ?? "";
        },
        set(target, prop, value) {
          if (prop in target) {
            target[prop] = value;
            return true;
          }
          const kebab = String(prop).replace(/([A-Z])/g, "-$1").toLowerCase();
          if (value === "" || value === null || value === undefined) {
            target._styles.delete(kebab);
          } else {
            target._styles.set(kebab, String(value));
          }
          return true;
        },
      },
    );
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
    if (!event.target) {
      event.target = this;
    }
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
    if (k.startsWith("data-")) {
      const camel = k.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      this.dataset[camel] = String(v);
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
  if (selector.includes(",")) {
    return selector.split(",").some((part) => matches(node, part.trim()));
  }
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

class MockElement extends MockNode {
  click() {
    this.dispatchEvent(new MockMouseEvent("click"));
  }
  focus(options) {
    if (globalThis.document) {
      globalThis.document.activeElement = this;
    }
    this.lastFocusOptions = options;
  }
  getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, bottom: 600, left: 0, right: 800 };
  }
}
class MockHTMLElement extends MockElement {}
class MockSVGElement extends MockElement {}

class MockDocument extends MockNode {
  constructor() {
    super("#document");
    this.body = new MockHTMLElement("body");
    this.activeElement = this.body;
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

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }
}

class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.button = init.button ?? 0;
    this.shiftKey = Boolean(init.shiftKey);
    this.ctrlKey = Boolean(init.ctrlKey);
    this.metaKey = Boolean(init.metaKey);
    this.clientX = init.clientX ?? 100;
    this.clientY = init.clientY ?? 100;
    this.clipboardData = init.clipboardData ?? null;
    this.dataTransfer = init.dataTransfer ?? null;
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
globalThis.PointerEvent = MockMouseEvent;
globalThis.KeyboardEvent = MockKeyboardEvent;
globalThis.EventTarget = MockNode;
globalThis.document = new MockDocument();

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => "blob:mock";
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = () => {};
}

// Import vanilla package
const { createTableX, createNexGrid, mountFromConfig, destroyMounted } = await import("../dist/index.js");

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

  const filterBtns = container.querySelectorAll(".tbx-col-filter-btn");
  const filterBtn = filterBtns[1] || filterBtns[0];
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
  const filterBtnsActive = container.querySelectorAll(".tbx-col-filter-btn");
  const filterBtnActive = filterBtnsActive[1] || filterBtnsActive[0];
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

test("column filter supports selection, apply button, clear button, and outside click dismissal across multiple columns", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    {
      accessorKey: "company",
      header: "Company",
      meta: { serverFilterable: true, filterOptions: ["IPAI", "CIS"] },
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        serverFilterable: true,
        serverFilterField: "status",
        filterOptions: ["Probation", "Permanent", "Temporary"],
      },
    },
  ];

  const data = [
    { id: "1", company: "IPAI", status: "Probation" },
    { id: "2", company: "CIS", status: "Permanent" },
  ];

  let emittedQuery = null;
  const handle = createTableX(container, {
    caption: "Multi Filter Test",
    columns,
    data,
    total: 2,
    onQueryChange: (q) => {
      emittedQuery = q;
    },
  });

  // There are two filter wraps: company (index 0) and status (index 1)
  const filterBtns = container.querySelectorAll(".tbx-col-filter-btn");
  assert.equal(filterBtns.length, 2, "Both company and status should have filter buttons");

  // Open status column filter (2nd column)
  const statusFilterBtn = filterBtns[1];
  statusFilterBtn.dispatchEvent(new MockMouseEvent("click"));

  let popover = container.querySelector(".tbx-filter-popover");
  assert.ok(popover, "Status filter popover should be open");

  // Pointerdown inside the popover should not dismiss it
  const ptDownInside = new MockMouseEvent("pointerdown");
  ptDownInside.target = popover;
  document.dispatchEvent(ptDownInside);
  popover = container.querySelector(".tbx-filter-popover");
  assert.ok(popover, "Popover should remain open on pointerdown inside popover");

  // Options: All (0), Probation (1), Permanent (2), Temporary (3)
  const options = popover.querySelectorAll(".tbx-filter-option");
  assert.equal(options.length, 4, "Should have All + 3 status options");

  // Type into input and click Apply button
  const input = popover.querySelector(".tbx-filter-popover-input");
  assert.ok(input, "Filter input should exist");
  input.value = "Probation";

  const applyBtn = popover.querySelector(".tbx-filter-popover-btn--primary");
  assert.ok(applyBtn, "Apply button should exist");
  applyBtn.dispatchEvent(new MockMouseEvent("click"));

  assert.ok(emittedQuery, "Query should be emitted after clicking Apply");
  assert.equal(emittedQuery.filter?.status, "Probation", "Query filter should be Probation");
  assert.equal(container.querySelector(".tbx-filter-popover"), null, "Popover closes after Apply");

  // Re-open status filter popover
  const statusFilterBtnActive = container.querySelectorAll(".tbx-col-filter-btn")[1];
  statusFilterBtnActive.dispatchEvent(new MockMouseEvent("click"));
  popover = container.querySelector(".tbx-filter-popover");
  assert.ok(popover, "Status filter popover should re-open");

  // Click Clear button
  const clearBtn = popover.querySelector(".tbx-filter-popover-btn");
  assert.ok(clearBtn, "Clear button should exist");
  clearBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(emittedQuery.filter?.status, undefined, "Filter should be cleared after clicking Clear");
  assert.equal(container.querySelector(".tbx-filter-popover"), null, "Popover closes after Clear");

  // Re-open and test direct 1-click option selection
  const statusFilterBtn2 = container.querySelectorAll(".tbx-col-filter-btn")[1];
  statusFilterBtn2.dispatchEvent(new MockMouseEvent("click"));
  popover = container.querySelector(".tbx-filter-popover");
  assert.ok(popover, "Status filter popover should re-open for option test");
  const options2 = popover.querySelectorAll(".tbx-filter-option");
  options2[2].dispatchEvent(new MockMouseEvent("click")); // Permanent
  assert.equal(emittedQuery.filter?.status, "Permanent", "Filter should be Permanent after clicking option");
  assert.equal(container.querySelector(".tbx-filter-popover"), null, "Popover closes after option click");

  // Re-open and test outside click dismisses
  const statusFilterBtn3 = container.querySelectorAll(".tbx-col-filter-btn")[1];
  statusFilterBtn3.dispatchEvent(new MockMouseEvent("click"));
  assert.ok(container.querySelector(".tbx-filter-popover"), "Popover open before outside click");

  const ptDownOutside = new MockMouseEvent("pointerdown");
  ptDownOutside.target = document.body;
  document.dispatchEvent(ptDownOutside);
  assert.equal(container.querySelector(".tbx-filter-popover"), null, "Popover should close on outside click");

  handle.destroy();
});

test("createTableX respects feature customization options to hide buttons/features", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
  ];

  const handle = createTableX(container, {
    caption: "Customization Test",
    columns,
    data: [{ id: "1", name: "Alice" }],
    total: 1,
    enableSearch: false,
    enableColumns: false,
    enableDensity: false,
    enableExport: false,
    enableRowsPerPage: false,
    enableJumpToPage: false,
    enableColumnFilters: false,
    showSerialNumber: false,
  });

  assert.equal(container.querySelector(".tbx-search"), null, "Search should be hidden");
  assert.equal(container.querySelector("#tbx-columns-btn"), null, "Columns button should be hidden");
  assert.equal(container.querySelector("#tbx-density-btn"), null, "Density button should be hidden");
  assert.equal(container.querySelector(".tbx-btn--export"), null, "Export button should be hidden");
  assert.equal(container.querySelector(".tbx-rows-per-page"), null, "Rows per page should be hidden");
  assert.equal(container.querySelector(".tbx-jump"), null, "Jump to page should be hidden");
  assert.equal(container.querySelector(".tbx-col-filter-btn"), null, "Column filters should be hidden");
  assert.equal(container.querySelector(".tbx-th--serial"), null, "Serial number column should be hidden");

  handle.destroy();
});

test("createTableX renders pinned columns, summary row, row expansion, and bulk bar", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "id", header: "ID", meta: { pinned: "left" } },
    {
      accessorKey: "score",
      header: "Score",
      meta: { aggregation: "avg", aggregationLabel: "Avg Score:" },
    },
    { accessorKey: "name", header: "Name" },
  ];

  const handle = createTableX(container, {
    caption: "Enterprise Test",
    columns,
    data: [
      { id: "1", name: "Alice", score: 90 },
      { id: "2", name: "Bob", score: 80 },
    ],
    total: 2,
    enableSelection: true,
    enableSummaryRow: true,
    enableBulkActions: true,
    renderExpandedRow: (row) => `Details for ${row.name}`,
  });

  // Pinned column
  const pinnedTh = container.querySelector(".tbx-th--pinned-left");
  assert.ok(pinnedTh, "Pinned th should have .tbx-th--pinned-left class");

  // Row expansion button
  const expandBtns = container.querySelectorAll(".tbx-expand-btn");
  assert.equal(expandBtns.length, 2, "Should have 2 expand buttons");

  expandBtns[0].dispatchEvent(new MockMouseEvent("click"));
  const expandedRow = container.querySelector(".tbx-expanded-row");
  assert.ok(expandedRow, "Expanded row should exist after clicking expand");

  // Summary row
  const summaryRow = container.querySelector(".tbx-summary-row");
  assert.ok(summaryRow, "Summary row should exist");

  // Bulk actions bar on selection
  const checkboxes = container.querySelectorAll(".tbx-checkbox");
  assert.ok(checkboxes.length > 1, "Checkboxes should exist");
  checkboxes[1].checked = true;
  checkboxes[1].dispatchEvent(new MockEvent("change"));

  const bulkBar = container.querySelector(".tbx-bulk-bar");
  assert.ok(bulkBar, "Bulk actions floating bar should appear when a row is selected");

  handle.destroy();
});

test("createTableX supports state persistence and active filter pills bar", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };

  // Seed persisted state
  store.set("nexgrid:test-persist", JSON.stringify({
    version: 1,
    density: "compact",
    columnWidths: { name: 220 },
  }));

  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
  ];

  const handle = createTableX(container, {
    caption: "Persistence Test",
    columns,
    data: [{ id: "1", name: "Alice" }],
    total: 1,
    storageKey: "test-persist",
    query: {
      page: 1,
      pageSize: 10,
      sort: [],
      q: "Alice",
      filter: { name: "Ali" },
    },
  });

  // Verify loaded density
  const root = container.querySelector(".tbx-root");
  assert.equal(root.dataset.density, "compact", "Density should be loaded from storage");

  // Verify filter pills bar
  const pillsBar = container.querySelector(".tbx-filter-pills-bar");
  assert.ok(pillsBar, "Filter pills bar should be rendered");
  const pills = pillsBar.querySelectorAll(".tbx-filter-pill");
  assert.equal(pills.length, 2, "Should have search pill and name filter pill");

  // Test double click on resize handle
  const resizeHandle = container.querySelector(".tbx-resize-handle");
  assert.ok(resizeHandle, "Resize handle should exist");
  resizeHandle.dispatchEvent(new MockMouseEvent("dblclick"));

  handle.destroy();
});

test("createTableX supports client-side pagination and setData", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "id", header: "ID" },
    { accessorKey: "name", header: "Name" },
  ];

  // 25 items
  const allItems = Array.from({ length: 25 }, (_, i) => ({
    id: String(i + 1),
    name: `User ${i + 1}`,
  }));

  const handle = createTableX(container, {
    caption: "Client Pagination Test",
    columns,
    data: allItems,
    clientSidePagination: true,
    query: {
      page: 1,
      pageSize: 10,
      sort: [],
    },
  });

  // Page 1 should render 10 rows
  const rows = container.querySelectorAll(".tbx-row");
  assert.equal(rows.length, 10, "Page 1 should render 10 rows");

  // Navigate to page 2
  const nextBtn = container.querySelector('[data-tbx-focus="page-next"]');
  assert.ok(nextBtn, "Next button should exist");
  nextBtn.dispatchEvent(new MockMouseEvent("click"));

  const page2Rows = container.querySelectorAll(".tbx-row");
  assert.equal(page2Rows.length, 10, "Page 2 should render 10 rows");
  assert.equal(handle.getQuery().page, 2, "Query page should be 2");

  // Navigate to page 3
  const nextBtn2 = container.querySelector('[data-tbx-focus="page-next"]');
  assert.ok(nextBtn2, "Next button should exist on page 2");
  nextBtn2.dispatchEvent(new MockMouseEvent("click"));
  const page3Rows = container.querySelectorAll(".tbx-row");
  assert.equal(page3Rows.length, 5, "Page 3 should render remaining 5 rows");

  // Test setData
  handle.setData([
    { id: "101", name: "New User 1" },
    { id: "102", name: "New User 2" },
  ]);
  const updatedRows = container.querySelectorAll(".tbx-row");
  assert.equal(updatedRows.length, 2, "Should render updated items");

  handle.destroy();
});

test("pagination preserves focus with preventScroll and locks tableWrap minHeight during loading", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [{ accessorKey: "name", header: "Name" }];
  const allItems = Array.from({ length: 30 }, (_, i) => ({
    id: String(i + 1),
    name: `User ${i + 1}`,
  }));

  const handle = createTableX(container, {
    caption: "Scroll & Focus Test",
    columns,
    data: allItems,
    clientSidePagination: true,
    query: {
      page: 1,
      pageSize: 10,
      sort: [],
    },
  });

  const nextBtn = container.querySelector('[data-tbx-focus="page-next"]');
  assert.ok(nextBtn, "Next button should exist");

  // Focus the next button
  nextBtn.focus();
  assert.equal(document.activeElement, nextBtn, "Next button should be active element before click");

  // Click next button
  nextBtn.dispatchEvent(new MockMouseEvent("click"));

  // Next button should be re-focused after page update with preventScroll: true
  const nextBtnAfter = container.querySelector('[data-tbx-focus="page-next"]');
  assert.equal(document.activeElement, nextBtnAfter, "Next button should retain focus after page update");
  assert.deepEqual(nextBtnAfter.lastFocusOptions, { preventScroll: true }, "Focus should be called with preventScroll: true");

  // Test loading state height preservation
  const tableWrap = container.querySelector(".tbx-table-wrap");
  assert.ok(tableWrap, "tableWrap should exist");

  handle.update({ isLoading: true });
  assert.equal(tableWrap.style.minHeight, "600px", "tableWrap minHeight should be locked to prevent collapsing during loading");

  handle.update({ isLoading: false });
  assert.equal(tableWrap.style.minHeight, "", "tableWrap minHeight should be cleared after loading completes");

  handle.destroy();
});

test("createTableX renders multi-level stacked column headers", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    {
      header: "User Details",
      columns: [
        { accessorKey: "firstName", header: "First Name" },
        { accessorKey: "lastName", header: "Last Name" },
      ],
    },
    { accessorKey: "status", header: "Status" },
  ];

  const handle = createTableX(container, {
    caption: "Grouping Test",
    columns,
    data: [{ id: "1", firstName: "Alice", lastName: "Smith", status: "Active" }],
    total: 1,
    showSerialNumber: false,
    enableSelection: false,
  });

  const thead = container.querySelector("thead");
  assert.ok(thead, "thead should exist");
  const trs = thead.querySelectorAll("tr");
  assert.equal(trs.length, 2, "thead should contain 2 rows for multi-level headers");

  // Top row: User Details (group) + Status (standalone)
  const row1Ths = trs[0].querySelectorAll("th");
  assert.equal(row1Ths.length, 2, "Top row should have 2 th elements");
  assert.ok(row1Ths[0].classList.contains("tbx-th--group"), "User Details should be group header");
  assert.equal(row1Ths[0].attributes.get("colspan"), "2", "User Details should span 2 columns");
  assert.equal(row1Ths[1].attributes.get("rowspan"), "2", "Status should span 2 rows");

  // Bottom row: First Name + Last Name
  const row2Ths = trs[1].querySelectorAll("th");
  assert.equal(row2Ths.length, 2, "Bottom row should have 2 th elements");
  assert.ok(row2Ths[0].classList.contains("tbx-th--grouped-child"), "First Name should be child header");
  assert.ok(row2Ths[1].classList.contains("tbx-th--grouped-child"), "Last Name should be child header");

  handle.destroy();
});

test("createTableX supports quickExport direct 1-click export", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let exportCalledWith = null;
  const items = Array.from({ length: 25 }, (_, i) => ({ id: String(i + 1), name: `User ${i + 1}` }));

  const handle = createTableX(container, {
    caption: "Export Test",
    columns: [{ accessorKey: "name", header: "Name" }],
    data: items,
    clientSidePagination: true,
    quickExport: true,
    onExportAll: (format) => {
      exportCalledWith = format;
      return items;
    },
  });

  const exportBtn = container.querySelector(".tbx-btn--export");
  assert.ok(exportBtn, "Direct export button should exist");
  assert.ok(exportBtn.textContent.includes("Export Excel"), "Should show direct Export Excel text");

  exportBtn.dispatchEvent(new MockMouseEvent("click"));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(exportCalledWith, "excel", "Should trigger excel export directly in 1 click");

  handle.destroy();
});

test("createTableX supports split export mode", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const handle = createTableX(container, {
    caption: "Split Export Test",
    columns: [{ accessorKey: "name", header: "Name" }],
    data: [{ id: "1", name: "User 1" }],
    total: 1,
    exportMode: "split",
  });

  const splitWrap = container.querySelector(".tbx-split-btn");
  assert.ok(splitWrap, "Split button wrapper should exist");
  const buttons = splitWrap.querySelectorAll("button");
  assert.equal(buttons.length, 2, "Split button should have main button and dropdown chevron trigger");

  handle.destroy();
});

test("free-text column filter edits and clears cleanly, range filters work, and filterOptions show all options on re-open", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "status",
      header: "Status",
      meta: { filterOptions: ["Active", "Inactive", "Pending"] },
    },
    {
      accessorKey: "score",
      header: "Score",
      meta: { filterType: "number-range" },
    },
  ];

  const rows = [
    { id: "1", name: "Alice Smith", status: "Active", score: 92 },
    { id: "2", name: "Bob Jones", status: "Inactive", score: 75 },
    { id: "3", name: "Alice Brown", status: "Pending", score: 84 },
  ];

  const handle = createTableX(container, {
    caption: "Filter Edge Cases",
    columns,
    data: rows,
    clientSidePagination: true,
  });

  // Verify column reorder is opt-in (disabled by default so text selection in headers/inputs isn't hijacked)
  const ths = container.querySelectorAll(".tbx-th--sortable");
  assert.equal(ths[0].getAttribute("draggable"), null);

  // 1. Free-text filter: apply "Alice", then edit to "Bob", then clear to ""
  const openColFilter = (colId) => {
    const btn = container
      .querySelectorAll(".tbx-col-filter-btn")
      .find((b) => b.getAttribute("data-filter-col") === colId);
    assert.ok(btn, `Filter button for ${colId} should exist`);
    btn.dispatchEvent(new MockMouseEvent("click"));
    const pop = container.querySelector(".tbx-filter-popover");
    assert.ok(pop, `Filter popover for ${colId} should open`);
    assert.equal(pop.parentNode, container.querySelector(".tbx-root"), "Popover mounts on .tbx-root");
    return pop;
  };

  let pop = openColFilter("name");
  let input = pop.querySelector(".tbx-filter-popover-input");
  input.value = "Alice";
  pop.querySelector(".tbx-filter-popover-btn--primary").dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.getQuery().filter?.name, "Alice");
  assert.equal(container.querySelectorAll(".tbx-row").length, 2);

  // Re-open and change text to "Bob" (verifies stale selectedVal bug is fixed)
  pop = openColFilter("name");
  input = pop.querySelector(".tbx-filter-popover-input");
  assert.equal(input.value, "Alice");
  input.value = "Bob";
  pop.querySelector(".tbx-filter-popover-btn--primary").dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.getQuery().filter?.name, "Bob");
  assert.equal(container.querySelectorAll(".tbx-row").length, 1);

  // Re-open, clear input manually, press Enter -> clears filter
  pop = openColFilter("name");
  input = pop.querySelector(".tbx-filter-popover-input");
  input.value = "   ";
  input.dispatchEvent(new MockKeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(handle.getQuery().filter?.name, undefined);
  assert.equal(container.querySelectorAll(".tbx-row").length, 3);

  // 2. Select filterOptions: pick "Active" (must NOT match "Inactive"), then re-open and verify ALL options still show
  pop = openColFilter("status");
  let opts = pop.querySelectorAll(".tbx-filter-option");
  assert.equal(opts.length, 4); // All + 3 statuses
  opts[1].dispatchEvent(new MockMouseEvent("click")); // "Active"
  assert.equal(handle.getQuery().filter?.status, "Active");
  assert.equal(container.querySelectorAll(".tbx-row").length, 1, "Active must not match Inactive");

  pop = openColFilter("status");
  opts = pop.querySelectorAll(".tbx-filter-option");
  assert.equal(opts.length, 4, "Re-opening active select filter shows all options until user types");
  pop.querySelector(".tbx-filter-popover-btn").dispatchEvent(new MockMouseEvent("click")); // Clear

  // 3. Number-range filter: set From=80, To=95
  pop = openColFilter("score");
  const rangeInputs = pop.querySelectorAll(".tbx-range-input");
  assert.equal(rangeInputs.length, 2, "Range filter renders From and To inputs");
  rangeInputs[0].value = "80";
  rangeInputs[1].value = "95";
  rangeInputs[1].dispatchEvent(new MockKeyboardEvent("keydown", { key: "Enter" }));
  assert.equal(handle.getQuery().filter?.score, "80..95");
  assert.equal(container.querySelectorAll(".tbx-row").length, 2); // 92 and 84

  handle.destroy();
});

test("pinned offsets honor minWidth and skip pinning serial/select when no data column is pinned, inline edit handles frozen rows, and mountFromConfig upgrades cleanly", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  // 1. Unpinned grid should NOT sticky-pin S.No. or Select
  const unpinned = createTableX(container, {
    caption: "Unpinned Grid",
    columns: [{ accessorKey: "name", header: "Name" }],
    data: [{ id: "1", name: "Alice" }],
    total: 1,
    enableSelection: true,
    showSerialNumber: true,
  });
  assert.equal(container.querySelector(".tbx-th--pinned-left"), null);
  unpinned.destroy();

  // 2. Pinned columns with minWidth compute non-overlapping offsets + inline edit on frozen row with accessorKey
  let editedPayload = null;
  const frozenRow = Object.freeze({ id: "1", fullName: "Alice", dept: "CS" });
  const pinnedGrid = createTableX(container, {
    caption: "Pinned & Frozen Edit",
    columns: [
      { id: "student", accessorKey: "fullName", header: "Student", meta: { minWidth: 230, pinned: "left", editable: true } },
      { accessorKey: "dept", header: "Dept", meta: { width: 120, pinned: "left" } },
    ],
    data: [frozenRow],
    total: 1,
    showSerialNumber: false,
    enableSelection: false,
    onCellEdit: (edit) => {
      editedPayload = edit;
    },
  });

  const pinnedHeaders = container.querySelectorAll(".tbx-th--pinned-left");
  assert.equal(pinnedHeaders.length, 2);
  assert.equal(pinnedHeaders[0].style.left, "0px");
  assert.equal(pinnedHeaders[1].style.left, "230px", "Second pinned column offsets by first column's minWidth (230px)");

  // Trigger inline cell edit on frozen row
  const editableCell = container.querySelector(".tbx-cell--editable");
  assert.ok(editableCell);
  editableCell.dispatchEvent(new MockMouseEvent("dblclick"));
  const editInput = container.querySelector(".tbx-cell-edit-input");
  assert.ok(editInput);
  assert.equal(editInput.value, "Alice", "Reads initial value via accessorKey");
  editInput.value = "Alicia";
  editInput.dispatchEvent(new MockKeyboardEvent("keydown", { key: "Enter" }));
  assert.deepEqual(editedPayload, {
    row: frozenRow,
    columnId: "student",
    oldValue: "Alice",
    newValue: "Alicia",
  });
  pinnedGrid.destroy();

  // 3. mountFromConfig & destroyMounted (Blazor / TagHelper lifecycle)
  const host = document.createElement("div");
  host.setAttribute("id", "blazor-host-1");
  const cfg = document.createElement("script");
  cfg.setAttribute("id", "blazor-host-1-config");
  cfg.textContent = JSON.stringify({ caption: "Blazor Grid", columns: [], data: [] });
  document.body.appendChild(host);
  document.body.appendChild(cfg);

  const firstHandle = mountFromConfig("blazor-host-1", "blazor-host-1-config");
  assert.ok(firstHandle);

  // Simulate Blazor second pass populating child <TableXColumn> definitions
  cfg.textContent = JSON.stringify({
    caption: "Blazor Grid",
    columns: [{ accessorKey: "name", header: "Employee" }],
    data: [{ id: "1", name: "Manju" }],
    clientSidePagination: true,
  });
  const upgradedHandle = mountFromConfig("blazor-host-1", "blazor-host-1-config");
  assert.notEqual(upgradedHandle, firstHandle, "Upgrades empty-column initial SSR mount once columns arrive");
  assert.equal(host.querySelectorAll(".tbx-row").length, 1);

  destroyMounted("blazor-host-1");
  assert.equal(host.tablex, undefined);
  host.remove();
  cfg.remove();
});

test("multi-select checkbox column filter and column header quick actions (sort, pin, unpin, hide)", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        filterType: "multi-select",
        filterOptions: ["Active", "Pending", "Suspended"],
      },
    },
    { accessorKey: "score", header: "Score" },
  ];

  const rows = [
    { id: "1", name: "Alice", status: "Active", score: 91 },
    { id: "2", name: "Bob", status: "Pending", score: 78 },
    { id: "3", name: "Charlie", status: "Suspended", score: 85 },
  ];

  const handle = createTableX(container, {
    caption: "Multi-Select & Quick Menu",
    columns,
    data: rows,
    clientSidePagination: true,
  });

  const openMenu = (colId) => {
    const btn = container
      .querySelectorAll(".tbx-col-filter-btn")
      .find((b) => b.getAttribute("data-filter-col") === colId);
    assert.ok(btn, `Menu button for ${colId} should exist`);
    btn.dispatchEvent(new MockMouseEvent("click"));
    const pop = container.querySelector(".tbx-filter-popover");
    assert.ok(pop, `Popover for ${colId} should open`);
    return pop;
  };

  // 1. Multi-select checkboxes: check Active and Pending -> Apply -> "Active|Pending"
  let pop = openMenu("status");
  const checks = pop.querySelectorAll(".tbx-filter-option-check");
  assert.equal(checks.length, 3, "Should render 3 multi-select option checkboxes");
  checks[0].checked = true;
  checks[0].dispatchEvent(new MockEvent("change"));
  checks[1].checked = true;
  checks[1].dispatchEvent(new MockEvent("change"));

  pop.querySelector(".tbx-filter-popover-btn--primary").dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.getQuery().filter?.status, "Active|Pending");
  assert.equal(container.querySelectorAll(".tbx-row").length, 2, "Matches Active OR Pending rows");

  const pill = container.querySelector(".tbx-filter-pill");
  assert.ok(pill && pill.textContent.includes("Active, Pending"), "Pill formats multi-select values cleanly");

  // 2. Column quick action: Sort Descending on Score
  pop = openMenu("score");
  const sortDescBtn = pop
    .querySelectorAll(".tbx-col-menu-btn")
    .find((b) => b.getAttribute("data-col-action") === "sort-desc");
  assert.ok(sortDescBtn, "Sort descending quick action should exist");
  sortDescBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.deepEqual(handle.getQuery().sort, [{ field: "score", dir: "desc" }]);

  // 3. Column quick action: Pin Left on Name -> adds .tbx-th--pinned-left, then Unpin removes it
  assert.equal(container.querySelector(".tbx-th--pinned-left"), null);
  pop = openMenu("name");
  const pinLeftBtn = pop
    .querySelectorAll(".tbx-col-menu-btn")
    .find((b) => b.getAttribute("data-col-action") === "pin-left");
  assert.ok(pinLeftBtn, "Pin left quick action should exist");
  pinLeftBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.ok(container.querySelector(".tbx-th--pinned-left"), "Name column becomes sticky left-pinned at runtime");

  pop = openMenu("name");
  const unpinBtn = pop
    .querySelectorAll(".tbx-col-menu-btn")
    .find((b) => b.getAttribute("data-col-action") === "unpin");
  assert.ok(unpinBtn, "Unpin quick action appears when column is pinned");
  unpinBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(container.querySelector(".tbx-th--pinned-left"), null, "Column unpins cleanly");

  // 4. Column quick action: Hide Column on Score
  pop = openMenu("score");
  const hideBtn = pop
    .querySelectorAll(".tbx-col-menu-btn")
    .find((b) => b.getAttribute("data-col-action") === "hide");
  assert.ok(hideBtn, "Hide column quick action should exist");
  hideBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(
    container.querySelectorAll(".tbx-col-filter-btn").some((b) => b.getAttribute("data-filter-col") === "score"),
    false,
    "Hidden column is removed from header",
  );

  handle.destroy();
});

test("select all across all pages banner sets allAcrossSelected, populates matching IDs, and resets on filter or clear", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const items = Array.from({ length: 25 }, (_, i) => ({
    id: String(i + 1),
    name: `Student ${i + 1}`,
    dept: i % 2 === 0 ? "CS" : "Math",
  }));

  let lastEvent = null;
  const handle = createTableX(container, {
    caption: "Select All Across Pages Test",
    columns: [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "dept", header: "Department" },
    ],
    data: items,
    clientSidePagination: true,
    enableSelection: true,
    onSelectionChange: (ids, allAcrossSelected) => {
      lastEvent = { ids, allAcrossSelected };
    },
  });

  const banner = container.querySelector(".tbx-select-all-banner");
  assert.ok(banner);
  assert.equal(banner.style.display, "none", "Banner is hidden initially");

  // 1. Check header Select-All on page 1 (10 rows out of 25)
  const headerCheckbox = container.querySelector('[data-tbx-focus="select-all"]');
  assert.ok(headerCheckbox);
  headerCheckbox.checked = true;
  headerCheckbox.dispatchEvent(new MockEvent("change"));

  assert.equal(handle.getSelection().length, 10);
  assert.equal(handle.isAllAcrossSelected(), false);
  assert.equal(lastEvent.allAcrossSelected, false);
  assert.equal(banner.style.display, "flex", "Banner appears when full page is selected and total > pageSize");
  const selectAllAcrossBtn = banner.querySelector(".tbx-select-all-banner-btn");
  assert.ok(selectAllAcrossBtn.textContent.includes("25"), "Button names total matching records (25)");

  // 2. Click "Select all 25 matching records"
  selectAllAcrossBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.isAllAcrossSelected(), true);
  assert.equal(handle.getSelection().length, 25, "All 25 matching rows across all pages are selected");
  assert.equal(lastEvent.allAcrossSelected, true);
  assert.equal(lastEvent.ids.length, 25);
  assert.ok(container.querySelector(".tbx-bulk-badge").textContent.includes("25"));

  // 3. Navigating to page 2 keeps allAcrossSelected = true
  container.querySelector('[data-tbx-focus="page-next"]').dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.isAllAcrossSelected(), true, "Page navigation preserves cross-page selection");

  // 4. Clicking "Clear selection" resets everything
  const clearBtn = banner.querySelector(".tbx-select-all-banner-btn");
  assert.ok(clearBtn.textContent.includes("Clear"));
  clearBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.isAllAcrossSelected(), false);
  assert.equal(handle.getSelection().length, 0);
  assert.equal(banner.style.display, "none");

  // 5. Re-select all across pages, then change filter -> resets allAcrossSelected to false
  const headerCheckbox2 = container.querySelector('[data-tbx-focus="select-all"]');
  headerCheckbox2.checked = true;
  headerCheckbox2.dispatchEvent(new MockEvent("change"));
  banner.querySelector(".tbx-select-all-banner-btn").dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.isAllAcrossSelected(), true);

  handle.update({
    query: { ...handle.getQuery(), page: 1, filter: { dept: "CS" } },
  });
  assert.equal(handle.isAllAcrossSelected(), false, "Changing filter resets allAcrossSelected");

  handle.destroy();
});

test("enableVirtualization windows 10,000 rows with top/bottom spacers and preserves accurate serial numbers on scroll", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const bigData = Array.from({ length: 10_000 }, (_, i) => ({
    id: String(i + 1),
    name: `Record ${i + 1}`,
  }));

  const handle = createTableX(container, {
    caption: "Virtual 10k Grid",
    columns: [{ accessorKey: "name", header: "Name" }],
    data: bigData,
    clientSidePagination: true,
    enablePagination: false,
    enableVirtualization: true,
    virtualHeight: 440,
    virtualOverscan: 4,
  });

  const wrap = container.querySelector(".tbx-table-wrap");
  assert.ok(wrap.classList.contains("tbx-table-wrap--virtual"));
  assert.equal(wrap.style.maxHeight, "440px");

  // At scrollTop = 0, only ~15 rows are mounted out of 10,000 (plus 1 bottom spacer)
  const initialRows = container.querySelectorAll(".tbx-row");
  assert.ok(initialRows.length > 0 && initialRows.length <= 20, `Expected <=20 DOM rows, got ${initialRows.length}`);
  assert.equal(container.querySelectorAll(".tbx-virtual-spacer").length, 1, "Only bottom spacer at scrollTop=0");
  assert.equal(initialRows[0].querySelector(".tbx-td--serial").textContent, "1");

  // Scroll down to row 500 (500 * 44px = 22,000px)
  wrap.scrollTop = 22_000;
  wrap.dispatchEvent(new MockEvent("scroll"));

  const scrolledRows = container.querySelectorAll(".tbx-row");
  assert.ok(scrolledRows.length <= 25, "DOM row count stays bounded mid-scroll");
  const spacers = container.querySelectorAll(".tbx-virtual-spacer");
  assert.equal(spacers.length, 2, "Both top and bottom spacers exist mid-scroll");

  // With overscan=4, startIndex = 500 - 4 = 496 -> serial number 497!
  assert.equal(scrolledRows[0].querySelector(".tbx-td--serial").textContent, "497");

  handle.destroy();
});

test("groupBy renders collapsible group header rows with counts, summaries, and menu group/ungroup toggle", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const columns = [
    { accessorKey: "name", header: "Employee" },
    { accessorKey: "dept", header: "Department" },
    { accessorKey: "score", header: "Score", meta: { aggregation: "avg", aggregationLabel: "Avg:" } },
  ];
  const rows = [
    { id: "1", name: "Alice", dept: "Engineering", score: 90 },
    { id: "2", name: "Bob", dept: "Sales", score: 80 },
    { id: "3", name: "Charlie", dept: "Engineering", score: 100 },
  ];

  const handle = createTableX(container, {
    caption: "Grouped Employees",
    columns,
    data: rows,
    clientSidePagination: true,
    groupBy: "dept",
  });

  const groupRowsEls = container.querySelectorAll(".tbx-group-row");
  assert.equal(groupRowsEls.length, 2, "Renders Engineering and Sales group header rows");
  assert.equal(container.querySelectorAll(".tbx-row").length, 3, "All 3 member rows start expanded");
  assert.ok(groupRowsEls[0].textContent.includes("Engineering"));
  assert.ok(groupRowsEls[0].textContent.includes("95"), "Shows Engineering Avg: 95 summary chip");

  // Collapse Engineering group
  groupRowsEls[0].dispatchEvent(new MockMouseEvent("click"));
  assert.equal(container.querySelectorAll(".tbx-row").length, 1, "Collapsing Engineering hides its 2 rows");

  // Expand Engineering group again
  container.querySelectorAll(".tbx-group-row")[0].dispatchEvent(new MockMouseEvent("click"));
  assert.equal(container.querySelectorAll(".tbx-row").length, 3, "Expanding Engineering restores its 2 rows");

  // Ungroup via Department column ⋮ menu quick action
  const deptMenuBtn = container
    .querySelectorAll(".tbx-col-filter-btn")
    .find((b) => b.getAttribute("data-filter-col") === "dept");
  deptMenuBtn.dispatchEvent(new MockMouseEvent("click"));
  const ungroupBtn = container
    .querySelector(".tbx-filter-popover")
    .querySelectorAll(".tbx-col-menu-btn")
    .find((b) => b.getAttribute("data-col-action") === "ungroup");
  assert.ok(ungroupBtn, "Ungroup quick action appears on active grouped column");
  ungroupBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(container.querySelectorAll(".tbx-group-row").length, 0, "Table returns to flat rows on Ungroup");

  handle.destroy();
});

test("keyboard arrow navigation, Enter to edit, and Shift+Click contiguous row selection", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const rows = [
    { id: "1", name: "Alice", score: 80 },
    { id: "2", name: "Bob", score: 85 },
    { id: "3", name: "Charlie", score: 90 },
    { id: "4", name: "Diana", score: 95 },
  ];

  const handle = createTableX(container, {
    caption: "Keyboard & Shift Select",
    columns: [
      { accessorKey: "name", header: "Name", meta: { editable: true } },
      { accessorKey: "score", header: "Score", meta: { editable: true, editType: "number" } },
    ],
    data: rows,
    clientSidePagination: true,
    enableSelection: true,
    enableKeyboardNavigation: true,
  });

  // Shift+Click contiguous row selection from row 0 to row 2 (selects rows 1, 2, 3)
  const rowChecks = container.querySelectorAll(".tbx-td--select").map((td) => td.querySelector(".tbx-checkbox"));
  assert.equal(rowChecks.length, 4);
  rowChecks[0].checked = true;
  rowChecks[0].dispatchEvent(new MockEvent("change"));
  assert.deepEqual(handle.getSelection(), ["1"]);

  rowChecks[2].checked = true;
  rowChecks[2].dispatchEvent(new MockEvent("change", { shiftKey: true }));
  assert.deepEqual(handle.getSelection(), ["1", "2", "3"], "Shift+Click selects contiguous range 0..2");

  // Keyboard navigation on root: ArrowDown -> cell (1, 0), ArrowRight -> cell (1, 1), Enter -> opens editor
  const root = container.querySelector(".tbx-root");
  root.dispatchEvent(new MockKeyboardEvent("keydown", { key: "ArrowDown" }));
  let focused = container.querySelector(".tbx-td--focused");
  assert.ok(focused, "Focused cell exists after ArrowDown");
  assert.equal(focused.getAttribute("data-row-idx"), "1");
  assert.equal(focused.getAttribute("data-col-idx"), "0");

  root.dispatchEvent(new MockKeyboardEvent("keydown", { key: "ArrowRight" }));
  focused = container.querySelector(".tbx-td--focused");
  assert.equal(focused.getAttribute("data-col-idx"), "1");

  root.dispatchEvent(new MockKeyboardEvent("keydown", { key: "Enter" }));
  assert.ok(container.querySelector(".tbx-cell-edit-input"), "Pressing Enter on focused editable cell opens editor");

  handle.destroy();
});

test("right-click cell context menu filters by cell value and invokes custom contextMenuItems", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let customActionPayload = null;
  const handle = createTableX(container, {
    caption: "Context Menu Grid",
    columns: [
      { accessorKey: "name", header: "Name" },
      { accessorKey: "dept", header: "Department" },
    ],
    data: [
      { id: "1", name: "Alice", dept: "Engineering" },
      { id: "2", name: "Bob", dept: "Sales" },
    ],
    clientSidePagination: true,
    enableContextMenu: true,
    contextMenuItems: ({ row, columnId, value }) => [
      {
        id: "inspect",
        label: `Inspect ${row.name}`,
        onSelect: () => {
          customActionPayload = { id: row.id, columnId, value };
        },
      },
    ],
  });

  // Right-click Department cell of row 0 ("Engineering")
  const firstRowCells = container.querySelectorAll(".tbx-row")[0].querySelectorAll(".tbx-td");
  const deptTd = firstRowCells[firstRowCells.length - 1];
  deptTd.dispatchEvent(new MockMouseEvent("contextmenu", { clientX: 120, clientY: 160 }));

  const menu = document.body.querySelector(".tbx-context-menu");
  assert.ok(menu, "Context menu mounts on document.body");

  const customBtn = menu.querySelector('[data-ctx-action="inspect"]');
  assert.ok(customBtn, "Custom context menu item renders");
  customBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.deepEqual(customActionPayload, { id: "1", columnId: "dept", value: "Engineering" });
  assert.equal(document.body.querySelector(".tbx-context-menu"), null, "Context menu closes after click");

  // Re-open and click "Filter by "Engineering""
  const deptTd2 = container.querySelectorAll(".tbx-row")[0].querySelectorAll(".tbx-td").at(-1);
  deptTd2.dispatchEvent(new MockMouseEvent("contextmenu"));
  const filterBtn = document.body.querySelector('[data-ctx-action="filter-by-value"]');
  assert.ok(filterBtn);
  filterBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(handle.getQuery().filter?.dept, "Engineering");
  assert.equal(container.querySelectorAll(".tbx-row").length, 1);

  handle.destroy();
});

test("hierarchical tree data expands/collapses nested children and renders pinnedTopRows & pinnedBottomRows", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const treeRows = [
    {
      id: "eng",
      name: "Engineering",
      budget: 500,
      children: [
        { id: "fe", name: "Frontend", budget: 200 },
        { id: "be", name: "Backend", budget: 300 },
      ],
    },
    { id: "ops", name: "Operations", budget: 150 },
  ];

  const handle = createTableX(container, {
    caption: "Org Tree",
    columns: [
      { accessorKey: "name", header: "Unit" },
      { accessorKey: "budget", header: "Budget" },
    ],
    data: treeRows,
    clientSidePagination: true,
    enableTreeData: true,
    defaultExpandedDepth: 0,
    pinnedTopRows: [{ id: "top-pin", name: "Company Target", budget: 1000 }],
    pinnedBottomRows: [{ id: "bot-pin", name: "Contingency Reserve", budget: 50 }],
  });

  assert.equal(container.querySelectorAll(".tbx-row--pinned-top").length, 1);
  assert.equal(container.querySelectorAll(".tbx-row--pinned-bottom").length, 1);
  // 2 root tree rows + 1 top pinned + 1 bottom pinned = 4 total .tbx-row
  assert.equal(container.querySelectorAll(".tbx-row").length, 4);

  const treeToggle = container.querySelector(".tbx-tree-toggle");
  assert.ok(treeToggle, "Root node with children renders expand chevron");
  treeToggle.dispatchEvent(new MockMouseEvent("click"));

  // Expanding Engineering adds 2 child rows -> 6 total .tbx-row
  assert.equal(container.querySelectorAll(".tbx-row").length, 6);
  const labels = container.querySelectorAll(".tbx-tree-label").map((n) => n.textContent);
  assert.deepEqual(labels, ["Engineering", "Frontend", "Backend", "Operations"]);

  handle.destroy();
});

test("full-row editMode, date & boolean editors, validateCell error blocking, and dirty cell markers", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let rowEditEvent = null;
  const rows = [
    { id: "1", title: "Task A", score: 80, dueDate: "2026-05-01", done: false },
  ];

  const handle = createTableX(container, {
    caption: "Row Edit & Validation",
    columns: [
      { accessorKey: "title", header: "Title", meta: { editable: true } },
      {
        accessorKey: "score",
        header: "Score",
        meta: {
          editable: true,
          editType: "number",
          validateCell: (v) => (Number(v) > 100 ? "Max 100" : null),
        },
      },
      { accessorKey: "dueDate", header: "Due", meta: { editable: true, editType: "date" } },
      { accessorKey: "done", header: "Done", meta: { editable: true, editType: "boolean" } },
    ],
    data: rows,
    clientSidePagination: true,
    showSerialNumber: false,
    editMode: "row",
    onRowEdit: (ev) => {
      rowEditEvent = ev;
    },
  });

  // Double-click Title cell -> opens editors across ALL 4 editable columns in the row!
  const firstCell = container.querySelector(".tbx-cell--editable");
  firstCell.dispatchEvent(new MockMouseEvent("dblclick"));
  assert.ok(container.querySelector(".tbx-row--editing"), "Row enters editing mode");
  const inputs = container.querySelectorAll(".tbx-cell-edit-wrap");
  assert.equal(inputs.length, 4, "All 4 editable columns render editors simultaneously");

  const scoreInput = inputs[1].querySelector("input");
  const dateInput = inputs[2].querySelector("input");
  const boolInput = inputs[3].querySelector("input");
  assert.equal(dateInput.getAttribute("type"), "date");
  assert.equal(boolInput.getAttribute("type"), "checkbox");

  // Enter invalid score 150 -> Save is blocked and shows .tbx-cell-edit-error
  scoreInput.value = "150";
  scoreInput.dispatchEvent(new MockEvent("input"));
  container.querySelector(".tbx-cell-edit-btn--save").dispatchEvent(new MockMouseEvent("click"));
  assert.equal(rowEditEvent, null, "Invalid row edit is blocked");
  assert.equal(container.querySelector(".tbx-cell-edit-error")?.textContent, "Max 100");

  // Fix score to 95 and toggle done = true -> Save commits and marks dirty cells!
  const refreshedWraps = container.querySelectorAll(".tbx-cell-edit-wrap");
  const fixedScore = refreshedWraps[1].querySelector("input");
  const fixedBool = refreshedWraps[3].querySelector("input");
  fixedScore.value = "95";
  fixedScore.dispatchEvent(new MockEvent("input"));
  fixedBool.checked = true;
  fixedBool.dispatchEvent(new MockEvent("change"));
  container.querySelector(".tbx-cell-edit-btn--save").dispatchEvent(new MockMouseEvent("click"));

  assert.ok(rowEditEvent, "onRowEdit fired once validation passed");
  assert.equal(rowEditEvent.updatedRow.score, 95);
  assert.equal(rowEditEvent.updatedRow.done, true);
  assert.equal(container.querySelectorAll(".tbx-td--dirty").length, 2, "2 modified cells carry .tbx-td--dirty");

  handle.destroy();
});

test("saved views menu, row drag-reorder, infinite scroll Load More, nested groupBy, and cell range paste/stats", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);

  let loadMoreCalls = 0;
  let reordered = null;
  let savedViewsSnapshot = [];

  const handle = createTableX(container, {
    caption: "Power Grid",
    columns: [
      { accessorKey: "region", header: "Region" },
      { accessorKey: "dept", header: "Dept" },
      { accessorKey: "amount", header: "Amount", meta: { editable: true, editType: "number" } },
    ],
    data: [
      { id: "1", region: "APAC", dept: "Eng", amount: 100 },
      { id: "2", region: "APAC", dept: "Sales", amount: 200 },
      { id: "3", region: "EMEA", dept: "Eng", amount: 300 },
    ],
    clientSidePagination: true,
    showSerialNumber: false,
    enableSavedViews: true,
    onSavedViewsChange: (views) => {
      savedViewsSnapshot = views;
    },
    enableRowReorder: true,
    onRowOrderChange: (ev) => {
      reordered = ev;
    },
    enableInfiniteScroll: true,
    hasMore: true,
    nextCursor: "cur-2",
    onLoadMore: (cursor) => {
      if (cursor === "cur-2") loadMoreCalls++;
    },
    enableRangeSelection: true,
  });

  // 1. Infinite scroll footer button
  const loadMoreBtn = container.querySelector(".tbx-load-more-btn");
  assert.ok(loadMoreBtn, "Load more button renders when hasMore=true");
  loadMoreBtn.dispatchEvent(new MockMouseEvent("click"));
  assert.equal(loadMoreCalls, 1);

  // 2. Saved views: open menu, save "High Value", verify it appears
  const viewsBtn = Array.from(container.querySelectorAll(".tbx-btn")).find((b) =>
    b.textContent.includes("Views"),
  );
  assert.ok(viewsBtn, "Views toolbar button renders");
  viewsBtn.dispatchEvent(new MockMouseEvent("click"));
  const viewInput = container.querySelector(".tbx-views-input");
  viewInput.value = "Default APAC";
  container.querySelector(".tbx-views-save-btn").dispatchEvent(new MockMouseEvent("click"));
  assert.equal(savedViewsSnapshot.length, 1);
  assert.equal(savedViewsSnapshot[0].name, "Default APAC");
  viewsBtn.dispatchEvent(new MockMouseEvent("click")); // close menu

  // 3. Row drag-and-drop reorder: drag row 0 onto row 2
  const dataRows = container.querySelectorAll(".tbx-row");
  dataRows[0].dispatchEvent(new MockEvent("dragstart"));
  dataRows[2].dispatchEvent(new MockEvent("drop"));
  assert.ok(reordered, "onRowOrderChange emitted");
  assert.equal(reordered.fromIndex, 0);
  assert.equal(reordered.toIndex, 2);
  assert.deepEqual(
    reordered.rows.map((r) => r.id),
    ["2", "3", "1"],
  );

  // 4. Rectangular cell range paste & footer range stats badge
  // Focus row 0, col 2 (Amount) via pointerdown, then paste 2 vertical numbers "500\n700"
  const amountTd0 = container.querySelectorAll(".tbx-row")[0].querySelectorAll(".tbx-td").at(-1);
  amountTd0.dispatchEvent(new MockMouseEvent("pointerdown", { button: 0 }));
  const root = container.querySelector(".tbx-root");
  root.dispatchEvent(
    new MockEvent("paste", {
      clipboardData: {
        getData: () => "500\n700",
      },
    }),
  );
  const statsBadge = container.querySelector(".tbx-range-stats-badge");
  assert.ok(statsBadge, "Range stats badge appears in footer for multi-cell range");
  assert.ok(statsBadge.textContent.includes("Sum: 1,200"), `Expected Sum: 1,200 in "${statsBadge.textContent}"`);
  assert.ok(statsBadge.textContent.includes("Avg: 600"));
  assert.ok(container.querySelector(".tbx-fill-handle"), "Fill handle renders on bottom-right range cell");

  // 5. Multi-column nested grouping via update({ groupBy: ["region", "dept"] })
  handle.update({ groupBy: ["region", "dept"] });
  const nestedGroupRows = container.querySelectorAll(".tbx-group-row");
  assert.ok(nestedGroupRows.length >= 4, "Renders outer Region and nested Dept group header rows");
  assert.equal(nestedGroupRows[1].getAttribute("data-group-depth"), "1");

  handle.destroy();
});




