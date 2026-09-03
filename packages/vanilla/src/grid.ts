// The vanilla NexGrid renderer/controller.
//
// WHY A CLASS INSTEAD OF A RENDER FUNCTION: the grid owns real state (open
// menu, hidden columns, running selection, in-flight request) and real
// listeners on `document`. A closure could hold the state, but `destroy()` has
// to be able to prove it released everything it took — every global listener is
// registered through one helper that records it, and teardown walks that list.
// A leaked outside-click handler on a page that mounts a grid per route is the
// kind of bug that only shows up in production.
//
// RE-RENDER STRATEGY: state changes rebuild the body, the header, the cards and
// the pager wholesale — a page is at most 100 rows, so this is cheap and there
// is no diffing to get subtly wrong. What is NOT rebuilt is anything the user
// can be typing into: the search input, the rows-per-page select and the
// page-jump form are created once and live for the lifetime of the grid, and
// controls that ARE rebuilt carry a `data-tbx-focus` key so focus survives the
// swap. Without that, a keyboard user toggling "select all" would be dumped
// back to the top of the document on every toggle.

import {
  DENSITIES,
  PAGE_SIZES,
  buildQueryUrl,
  computeAggregation,
  copyToClipboard,
  defaultQuery,
  downloadCsv,
  downloadExcel,
  fetchAllPages,
  filePrefixFromCaption,
  formatMessage,
  getCellText,
  getCellValue,
  getColumnId,
  getColumnTitle,
  getPageNumbers,
  getRecordRange,
  initialHiddenColumns,
  isEditable,
  isExportable,
  isFilterable,
  isHideable,
  isPageSize,
  isPinned,
  isSortable,
  primarySort,
  resolveLocale,
  serialNumber,
  timestampedFilename,
  toExportColumns,
  totalPagesFor,
  visibleColumns,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withToggledMultiSort,
  withToggledSort,
  clearGridState,
  loadGridState,
  saveGridState,
  queryClientData,
  flattenColumns,
  hasHeaderGroups,
  buildHeaderRows,
  type Density,
  type PagedResponse,
  type QueryState,
  type TableXLocale,
} from "@nexgrid/core";

import { append, el, replaceChildren, type ElementChild } from "./dom.js";
import {
  arrowDownIcon,
  arrowUpDownIcon,
  arrowUpIcon,
  checkIcon,
  chevronDownIcon,
  chevronLeftIcon,
  chevronRightIcon,
  columnsIcon,
  densityIcon,
  dotsVerticalIcon,
  downloadIcon,
  downloadTrayIcon,
  editIcon,
  eyeIcon,
  fileSpreadsheetIcon,
  fileTextIcon,
  filterIcon,
  funnelIcon,
  moreVerticalIcon,
  rotateCcwIcon,
  searchIcon,
  slidersIcon,
  trashIcon,
  xIcon,
} from "./icons.js";
import type {
  TableXHandle,
  TableXNode,
  TableXNoticeType,
  TableXOptions,
  TableXUpdate,
  TableXVanillaColumn,
} from "./types.js";

/** Debounce applied to the search field before a query is emitted. */
const SEARCH_DEBOUNCE_MS = 350;

/** The three dropdowns, keyed so only one can be open at a time. */
type MenuName = "columns" | "density" | "export";

/** A listener registered outside the grid's own subtree, tracked for teardown. */
interface GlobalListener {
  target: EventTarget;
  type: string;
  handler: EventListener;
}

/** Instance counter, used to mint DOM ids unique across grids on one page. */
let instanceCounter = 0;

/** Default row identity: `row.id` when present, else the stringified row. */
function defaultGetRowId<TData>(row: TData): string {
  if (row !== null && typeof row === "object" && "id" in row) {
    const id = (row as { id?: unknown }).id;
    if (id !== null && id !== undefined) return String(id);
  }
  return String(row);
}

/** Structural equality for queries, so identical intents never refetch. */
function queryEquals(a: QueryState, b: QueryState): boolean {
  if (a.page !== b.page || a.pageSize !== b.pageSize) return false;
  if ((a.q ?? "") !== (b.q ?? "")) return false;
  if (a.sort.length !== b.sort.length) return false;
  for (let i = 0; i < a.sort.length; i++) {
    const left = a.sort[i];
    const right = b.sort[i];
    if (left?.field !== right?.field || left?.dir !== right?.dir) return false;
  }
  const aFilter = a.filter ?? {};
  const bFilter = b.filter ?? {};
  const aKeys = Object.keys(aFilter);
  if (aKeys.length !== Object.keys(bFilter).length) return false;
  return aKeys.every((key) => aFilter[key] === bFilter[key]);
}

class NexGridController<TData> implements TableXHandle<TData> {
  private readonly options: TableXOptions<TData>;
  private readonly locale: TableXLocale;
  private readonly caption: string;
  private readonly rowId: (row: TData) => string;
  private readonly uid: string;

  // ---- State ---------------------------------------------------------------
  private columns: TableXVanillaColumn<TData>[];
  private data: TData[];
  private rawClientData: TData[] = [];
  private isClientSide: boolean;
  private total: number;
  private query: QueryState;
  private density: Density;
  private hidden: Record<string, boolean>;
  private readonly selected = new Set<string>();
  private isLoading: boolean;
  private isError: boolean;
  private isExporting = false;
  private openMenu: MenuName | null = null;
  private openFilterColumn: string | null = null;
  private readonly columnWidths: Record<string, number> = {};
  private focusMenuOnRender = false;
  private mounted: "grid" | "error" | null = null;
  private destroyed = false;

  // ---- Async bookkeeping ---------------------------------------------------
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;
  private inFlight: AbortController | null = null;
  private readonly globalListeners: GlobalListener[] = [];

  // ---- Long-lived DOM ------------------------------------------------------
  private readonly root: HTMLDivElement;
  private readonly toolbar: HTMLDivElement;
  private readonly searchInput: HTMLInputElement | null = null;
  private readonly searchWrap: HTMLDivElement | null = null;
  private readonly menuButtons = new Map<MenuName, HTMLButtonElement>();
  private readonly menuWraps = new Map<MenuName, HTMLDivElement>();
  private readonly densityLabel: HTMLSpanElement | null = null;
  private readonly exportLabel: HTMLSpanElement | null = null;
  private readonly tableWrap: HTMLDivElement;
  private readonly thead: HTMLTableSectionElement;
  private readonly tbody: HTMLTableSectionElement;
  private readonly tfoot: HTMLTableSectionElement;
  private readonly cards: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private readonly bulkBar: HTMLDivElement;
  private readonly range: HTMLDivElement;
  private readonly pager: HTMLDivElement;
  private readonly rowsSelect: HTMLSelectElement | null = null;
  private readonly jumpInput: HTMLInputElement | null = null;
  private readonly filterPillsBar: HTMLDivElement;
  private expandedRows = new Set<string>();
  private editingCell: { rowId: string; columnId: string } | null = null;
  private draggedColumnId: string | null = null;

  constructor(container: HTMLElement, options: TableXOptions<TData>) {
    this.options = options;
    this.locale = resolveLocale(options.locale);
    this.caption = options.caption;
    this.rowId = options.getRowId ?? defaultGetRowId;
    this.uid = `tbx-${++instanceCounter}`;

    this.columns = options.columns;
    this.query = options.query ?? defaultQuery();
    this.density = options.density ?? "default";
    this.hidden = initialHiddenColumns(flattenColumns(this.columns));
    this.isLoading = options.isLoading ?? false;
    this.isError = options.error ?? false;

    this.isClientSide =
      options.clientSidePagination === true ||
      options.paginationMode === "client" ||
      (options.endpoint === undefined && options.onQueryChange === undefined);
    this.rawClientData = options.data ? [...options.data] : [];

    if (this.isClientSide && this.rawClientData.length > 0) {
      const paged = queryClientData(this.rawClientData, this.query);
      this.data = paged.items;
      this.total = paged.total;
    } else {
      this.data = options.data ?? [];
      this.total = options.total ?? 0;
    }

    if (options.storageKey) {
      const persisted = loadGridState(options.storageKey);
      if (persisted) {
        if (persisted.density) this.density = persisted.density;
        if (persisted.columnWidths) Object.assign(this.columnWidths, persisted.columnWidths);
        if (persisted.hiddenColumns && Array.isArray(persisted.hiddenColumns)) {
          const hiddenMap: Record<string, boolean> = {};
          for (const col of this.columns) {
            const id = getColumnId(col);
            if (id) hiddenMap[id] = persisted.hiddenColumns.includes(id);
          }
          this.hidden = hiddenMap;
        }
        if (persisted.columnOrder && Array.isArray(persisted.columnOrder)) {
          const colMap = new Map(this.columns.map((c) => [getColumnId(c), c]));
          const reordered: TableXVanillaColumn<TData>[] = [];
          for (const id of persisted.columnOrder) {
            const col = colMap.get(id);
            if (col) {
              reordered.push(col);
              colMap.delete(id);
            }
          }
          for (const remaining of colMap.values()) {
            reordered.push(remaining);
          }
          if (reordered.length === this.columns.length) {
            this.columns = reordered;
          }
        }
      }
    }

    this.filterPillsBar = el("div", { class: "tbx-filter-pills-bar", style: { display: "none" } });

    // ---- Root -------------------------------------------------------------
    const rootClasses = ["tbx-root"];
    if (options.theme === "dark") rootClasses.push("tbx-dark");
    else if (options.theme === "auto") rootClasses.push("tbx-auto");
    if (options.className) rootClasses.push(options.className);
    this.root = el("div", { class: rootClasses.join(" ") });

    // ---- Toolbar ----------------------------------------------------------
    const startGroup = el("div", { class: "tbx-toolbar-group" });
    const endGroup = el("div", { class: "tbx-toolbar-group tbx-toolbar-group--end" });
    this.toolbar = el("div", { class: "tbx-toolbar" }, [startGroup, endGroup]);

    if (options.enableSearch !== false) {
      const input = el("input", {
        class: "tbx-search-input",
        attrs: {
          type: "search",
          placeholder: options.searchPlaceholder ?? this.locale.searchPlaceholder,
          "aria-label": `Search ${this.caption}`,
          autocomplete: "off",
        },
      });
      input.value = this.query.q ?? "";
      input.addEventListener("input", () => {
        this.syncSearchClear();
        this.scheduleSearch(input.value);
      });
      this.searchInput = input;
      this.searchWrap = el("div", { class: "tbx-search" }, [searchIcon(), input]);
      startGroup.appendChild(this.searchWrap);
    }

    const showColumns = options.enableColumns !== false && options.showColumnsButton !== false;
    if (showColumns) {
      const columnsButton = this.createMenuButton("columns", columnsIcon(), this.locale.columnsButton);
      endGroup.appendChild(this.wrapMenu("columns", columnsButton));
    }

    const showDensity = options.enableDensity !== false && options.showDensityButton !== false;
    if (showDensity) {
      this.densityLabel = el("span", { class: "tbx-capitalize" });
      const densityButton = this.createMenuButton("density", densityIcon(), this.densityLabel);
      endGroup.appendChild(this.wrapMenu("density", densityButton));
    }

    const showExport = options.enableExport !== false && options.showExportButton !== false;
    if (showExport) {
      this.exportLabel = el("span", { text: this.locale.exportButton });
      const exportButton = this.createMenuButton(
        "export",
        downloadTrayIcon(),
        this.exportLabel,
        chevronDownIcon("tbx-icon tbx-chevron"),
      );
      exportButton.classList.add("tbx-btn--export");
      endGroup.appendChild(this.wrapMenu("export", exportButton));
    }

    if (options.toolbarActions !== undefined) {
      append(endGroup, [options.toolbarActions]);
    }

    // ---- Table ------------------------------------------------------------
    this.thead = el("thead");
    this.tbody = el("tbody");
    this.tfoot = el("tfoot");
    const table = el("table", { class: "tbx-table", attrs: { "aria-label": this.caption } }, [
      this.thead,
      this.tbody,
      this.tfoot,
    ]);
    this.bulkBar = el("div", { class: "tbx-bulk-bar" });
    this.tableWrap = el("div", { class: "tbx-table-wrap" }, [table]);

    // ---- Cards ------------------------------------------------------------
    this.cards = el("div", { class: "tbx-cards" });

    // ---- Footer -----------------------------------------------------------
    this.range = el("div", { class: "tbx-range" });
    this.pager = el("div", { class: "tbx-pager" });

    const showRowsPerPage = options.enableRowsPerPage !== false && options.showRowsPerPage !== false;
    let rowsPerPage: HTMLElement | null = null;
    if (showRowsPerPage) {
      const rowsLabelId = `${this.uid}-rows-label`;
      const rowsLabel = el("span", { attrs: { id: rowsLabelId }, text: this.locale.rowsPerPage });
      this.rowsSelect = el("select", {
        class: "tbx-rows-select",
        attrs: { "aria-labelledby": rowsLabelId },
      });
      for (const size of PAGE_SIZES) {
        this.rowsSelect.appendChild(el("option", { attrs: { value: String(size) }, text: `${size} rows` }));
      }
      this.rowsSelect.addEventListener("change", () => {
        if (this.rowsSelect) {
          this.applyQuery(withPageSize(this.query, Number.parseInt(this.rowsSelect.value, 10)));
        }
      });
      rowsPerPage = el("div", { class: "tbx-rows-per-page" }, [rowsLabel, this.rowsSelect]);
    }

    const showJump = options.enableJumpToPage !== false && options.showJumpToPage !== false;
    let jumpForm: HTMLElement | null = null;
    if (showJump) {
      const jumpId = `${this.uid}-jump`;
      this.jumpInput = el("input", {
        class: "tbx-jump-input",
        attrs: {
          id: jumpId,
          type: "number",
          min: "1",
          "aria-label": this.locale.goToPageOf,
        },
      });
      jumpForm = el("form", { class: "tbx-jump" }, [
        el("label", {
          class: "tbx-jump-label",
          attrs: { for: jumpId },
          text: this.locale.goToPage,
        }),
        this.jumpInput,
      ]);
      jumpForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submitJump();
      });
      this.jumpInput.addEventListener("blur", () => this.submitJump());
    }

    const showPagination = options.enablePagination !== false && options.showPagination !== false;

    const paginationChildren: HTMLElement[] = [];
    if (rowsPerPage) paginationChildren.push(rowsPerPage);
    if (showPagination) paginationChildren.push(this.pager);
    if (jumpForm) paginationChildren.push(jumpForm);

    const pagination = el("div", { class: "tbx-pagination" }, paginationChildren);
    this.footer = el("div", { class: "tbx-footer" }, [this.range, pagination]);

    // ---- Global listeners --------------------------------------------------
    this.addGlobalListener(document, "pointerdown", this.handleDocumentPointerDown);
    this.addGlobalListener(document, "keydown", this.handleDocumentKeyDown);

    container.appendChild(this.root);
    this.render();

    if (options.endpoint !== undefined) void this.fetchFromEndpoint();
  }

  // =========================================================================
  // Public handle
  // =========================================================================

  update(patch: Partial<TableXUpdate<TData>>): void {
    if (this.destroyed) return;

    let queryChanged = false;
    if (patch.data !== undefined) {
      this.rawClientData = [...patch.data];
      if (this.isClientSide) {
        const paged = queryClientData(this.rawClientData, patch.query ?? this.query);
        this.data = paged.items;
        this.total = paged.total;
      } else {
        this.data = patch.data;
      }
    }
    if (patch.total !== undefined && !this.isClientSide) this.total = patch.total;
    if (patch.query !== undefined) {
      queryChanged = !queryEquals(patch.query, this.query);
      this.query = patch.query;
      if (this.isClientSide && patch.data === undefined) {
        const paged = queryClientData(this.rawClientData, this.query);
        this.data = paged.items;
        this.total = paged.total;
      }
    }
    if (patch.isLoading !== undefined) this.isLoading = patch.isLoading;
    if (patch.error !== undefined) this.isError = patch.error;

    if (queryChanged && this.options.endpoint !== undefined) {
      void this.fetchFromEndpoint();
      return;
    }
    this.render();
  }

  setData(data: TData[]): void {
    if (this.destroyed) return;
    this.rawClientData = [...data];
    if (this.isClientSide) {
      const paged = queryClientData(this.rawClientData, this.query);
      this.data = paged.items;
      this.total = paged.total;
    } else {
      this.data = data;
    }
    this.render();
  }

  refresh(): void {
    if (this.destroyed) return;
    if (this.options.endpoint !== undefined) void this.fetchFromEndpoint();
    else this.render();
  }

  getQuery(): QueryState {
    return this.query;
  }

  getSelection(): string[] {
    return Array.from(this.selected);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.inFlight?.abort();
    this.inFlight = null;

    for (const listener of this.globalListeners) {
      listener.target.removeEventListener(listener.type, listener.handler);
    }
    this.globalListeners.length = 0;

    this.root.remove();
    this.mounted = null;
  }

  // =========================================================================
  // Wiring helpers
  // =========================================================================

  private addGlobalListener(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.globalListeners.push({ target, type, handler });
  }

  private notify(type: TableXNoticeType, message: string): void {
    this.options.onNotify?.({ type, message });
  }

  private createMenuButton(
    name: MenuName,
    leadingGlyph: SVGSVGElement | null,
    label: string | HTMLSpanElement,
    trailingGlyph: SVGSVGElement | null = null,
  ): HTMLButtonElement {
    const children: ElementChild[] = [];
    if (leadingGlyph) children.push(leadingGlyph);
    children.push(typeof label === "string" ? el("span", { text: label }) : label);
    if (trailingGlyph) children.push(trailingGlyph);

    const button = el(
      "button",
      {
        class: "tbx-btn",
        attrs: {
          type: "button",
          id: `${this.uid}-${name}-btn`,
          "aria-haspopup": "menu",
          "aria-expanded": "false",
        },
      },
      children,
    );
    button.addEventListener("click", () => this.toggleMenu(name));
    this.menuButtons.set(name, button);
    return button;
  }

  private wrapMenu(name: MenuName, button: HTMLButtonElement): HTMLDivElement {
    const wrap = el("div", { class: "tbx-menu-wrap" }, [button]);
    this.menuWraps.set(name, wrap);
    return wrap;
  }

  private toggleMenu(name: MenuName): void {
    // Closing by clicking the trigger needs no focus handling — the click has
    // already put focus on the trigger.
    if (this.openMenu === name) this.setOpenMenu(null);
    else this.setOpenMenu(name, { focusInto: true });
  }

  /**
   * Open one dropdown (or close them all).
   *
   * @param name         Menu to open, or `null` to close.
   * @param focus.focusInto     Move focus to the first item of the opened menu.
   * @param focus.returnFocusTo Move focus back to this menu's trigger on close,
   *                            so Escape does not strand a keyboard user.
   */
  private setOpenMenu(
    name: MenuName | null,
    focus?: { focusInto?: boolean; returnFocusTo?: MenuName },
  ): void {
    if (this.openMenu === name) return;
    this.openMenu = name;
    this.focusMenuOnRender = name !== null && focus?.focusInto === true;
    this.render();
    if (name === null && focus?.returnFocusTo !== undefined) {
      this.menuButtons.get(focus.returnFocusTo)?.focus();
    }
  }

  private readonly handleDocumentPointerDown = (event: Event): void => {
    const target = event.target;
    if (this.openMenu !== null) {
      const wrap = this.menuWraps.get(this.openMenu);
      if (!(wrap && target instanceof Node && wrap.contains(target))) {
        this.setOpenMenu(null);
      }
    }
    if (this.openFilterColumn !== null) {
      if (!(target instanceof Node && this.root.querySelector(".tbx-col-filter-wrap")?.contains(target))) {
        this.openFilterColumn = null;
        this.render();
      }
    }
  };

  private readonly handleDocumentKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    if (this.openFilterColumn !== null) {
      this.openFilterColumn = null;
      this.render();
      return;
    }
    const open = this.openMenu;
    if (open === null) return;
    this.setOpenMenu(null, { returnFocusTo: open });
  };

  // =========================================================================
  // Query mutations — every one of them routed through a core reducer
  // =========================================================================

  private applyQuery(next: QueryState): void {
    if (queryEquals(next, this.query)) {
      this.render();
      return;
    }
    this.query = next;
    if (this.options.endpoint !== undefined) {
      this.options.onQueryChange?.(next);
      void this.fetchFromEndpoint();
      return;
    }
    if (this.isClientSide) {
      const paged = queryClientData(this.rawClientData, this.query);
      this.data = paged.items;
      this.total = paged.total;
      this.options.onQueryChange?.(next);
      this.render();
      return;
    }
    // Controlled mode: emit to host and re-render with updated state
    this.options.onQueryChange?.(next);
    this.render();
  }

  private scheduleSearch(value: string): void {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.applyQuery(withSearch(this.query, value));
    }, SEARCH_DEBOUNCE_MS);
  }

  private submitJump(): void {
    if (!this.jumpInput) return;
    const totalPages = this.totalPages();
    const parsed = Number.parseInt(this.jumpInput.value, 10);
    if (!Number.isFinite(parsed)) {
      this.jumpInput.value = String(this.currentPage());
      return;
    }
    this.applyQuery(withPage(this.query, parsed, totalPages));
    this.jumpInput.value = String(this.currentPage());
  }

  // =========================================================================
  // Endpoint mode
  // =========================================================================

  /**
   * Fetch the current query's page.
   *
   * Every request carries a sequence number and an AbortController: a user who
   * types "smith" and then jumps to page 3 has two requests in the air, and
   * without the guard the slower one lands last and shows the wrong page. The
   * response of a superseded request is discarded, never rendered.
   */
  private async fetchFromEndpoint(): Promise<void> {
    const endpoint = this.options.endpoint;
    if (endpoint === undefined || this.destroyed) return;

    this.requestSeq += 1;
    const seq = this.requestSeq;
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;

    this.isLoading = true;
    this.isError = false;
    this.render();

    try {
      const response = await fetch(buildQueryUrl(endpoint, this.query), {
        cache: "no-store",
        ...this.options.fetchOptions,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as PagedResponse<TData>;
      if (seq !== this.requestSeq || this.destroyed) return;

      this.data = Array.isArray(body.items) ? body.items : [];
      this.total = typeof body.total === "number" ? body.total : this.data.length;
      this.isLoading = false;
    } catch {
      if (seq !== this.requestSeq || this.destroyed) return;
      this.isLoading = false;
      this.isError = true;
    } finally {
      if (seq === this.requestSeq) this.inFlight = null;
    }

    if (!this.destroyed && seq === this.requestSeq) this.render();
  }

  // =========================================================================
  // Export (adapter spec §5)
  // =========================================================================

  private async collectExportRows(): Promise<TData[]> {
    const endpoint = this.options.fetchEndpoint ?? this.options.endpoint;
    if (this.data.length >= this.total || endpoint === undefined) return this.data;

    this.isExporting = true;
    this.render();
    this.notify(
      "info",
      formatMessage(this.locale.exportFetchingAll, { total: this.total.toLocaleString() }),
    );

    try {
      const collected = await fetchAllPages<TData>(async (page, pageSize) => {
        const pageQuery: QueryState = {
          ...this.query,
          page,
          pageSize: isPageSize(pageSize) ? pageSize : this.query.pageSize,
        };
        const response = await fetch(buildQueryUrl(endpoint, pageQuery), {
          cache: "no-store",
          ...this.options.fetchOptions,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PagedResponse<TData>;
      });
      return collected.items;
    } catch {
      this.notify("error", this.locale.exportFetchFailed);
      return this.data;
    } finally {
      this.isExporting = false;
      this.render();
    }
  }

  private async runExport(format: "excel" | "csv" | "clipboard"): Promise<void> {
    if (this.isExporting) return;
    this.setOpenMenu(null, { returnFocusTo: "export" });

    const { onExportAll } = this.options;
    if (onExportAll && format !== "clipboard") {
      void onExportAll();
      return;
    }

    const rows = await this.collectExportRows();
    if (rows.length === 0) {
      this.notify("error", this.locale.exportNoData);
      return;
    }

    const columns = toExportColumns(this.visibleCols(), {
      yes: this.locale.booleanYes,
      no: this.locale.booleanNo,
    });
    const prefix = this.options.exportFileName ?? filePrefixFromCaption(this.caption);

    if (format === "clipboard") {
      const ok = await copyToClipboard(rows, columns);
      if (ok) {
        this.notify(
          "success",
          formatMessage(this.locale.exportClipboardSuccess, { count: rows.length.toLocaleString() }),
        );
      } else {
        this.notify("error", "Failed to copy to clipboard");
      }
      return;
    }

    if (format === "excel") {
      const count = downloadExcel({
        filename: prefix,
        caption: this.caption,
        rows,
        columns,
        badgeRules: this.options.badgeRules,
        serialHeader: this.locale.serialHeader,
      });
      this.notify(
        "success",
        formatMessage(this.locale.exportExcelSuccess, { count: count.toLocaleString() }),
      );
    } else {
      const count = downloadCsv(timestampedFilename(prefix), rows, columns);
      this.notify(
        "success",
        formatMessage(this.locale.exportCsvSuccess, { count: count.toLocaleString() }),
      );
    }
  }

  // =========================================================================
  // Derived state
  // =========================================================================

  private leafCols(): TableXVanillaColumn<TData>[] {
    return flattenColumns(this.columns);
  }

  private visibleCols(): TableXVanillaColumn<TData>[] {
    return visibleColumns(this.leafCols(), this.hidden);
  }

  private currentPage(): number {
    return Math.max(1, this.query.page);
  }

  private totalPages(): number {
    return totalPagesFor(this.total, this.query.pageSize);
  }

  private showSerial(): boolean {
    return this.options.showSerialNumber !== false;
  }

  private selectionEnabled(): boolean {
    return this.options.enableSelection === true;
  }

  private pageRowIds(): string[] {
    return this.data.map((row) => this.rowId(row));
  }

  private isSingleSelection(): boolean {
    return this.options.selectionMode === "single";
  }

  private toggleSelectAll(): void {
    if (this.isSingleSelection()) return;
    const ids = this.pageRowIds();
    const allSelected = ids.length > 0 && ids.every((id) => this.selected.has(id));
    for (const id of ids) {
      if (allSelected) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.emitSelection();
    this.render();
  }

  private toggleSelectRow(id: string): void {
    if (this.isSingleSelection()) {
      if (this.selected.has(id)) this.selected.clear();
      else {
        this.selected.clear();
        this.selected.add(id);
      }
    } else {
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.emitSelection();
    this.render();
  }

  private emitSelection(): void {
    this.options.onSelectionChange?.(Array.from(this.selected), false);
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  private render(): void {
    if (this.destroyed) return;

    const focusKey = this.captureFocusKey();
    this.root.dataset["density"] = this.density;

    if (this.isError) {
      this.mount("error");
      this.restoreFocus(focusKey);
      return;
    }

    this.mount("grid");
    this.renderToolbar();
    this.renderFilterPills();
    this.renderHead();
    this.renderBody();
    this.renderSummary();
    this.renderCards();
    this.renderFooter();
    this.renderBulkBar();

    if (this.focusMenuOnRender) {
      this.focusMenuOnRender = false;
      const wrap = this.openMenu === null ? null : this.menuWraps.get(this.openMenu);
      const first = wrap?.querySelector<HTMLElement>('[role^="menuitem"]');
      if (first) {
        first.focus();
        return;
      }
    }
    this.restoreFocus(focusKey);
  }

  /**
   * Attach the right top-level children. Guarded by `mounted` so a normal
   * re-render never detaches and re-inserts the table wrapper — moving a node
   * resets its scroll offset, which on a horizontally scrolled grid would
   * snap the user back to column one on every keystroke.
   */
  private mount(mode: "grid" | "error"): void {
    if (this.mounted === mode) return;
    this.mounted = mode;
    if (mode === "error") {
      replaceChildren(this.root, [this.buildErrorCard()]);
    } else {
      const children: HTMLElement[] = [];
      if (this.options.showToolbar !== false) children.push(this.toolbar);
      if (this.options.showFilterPills !== false) children.push(this.filterPillsBar);
      children.push(this.tableWrap, this.cards);
      if (this.options.showFooter !== false) children.push(this.footer);
      replaceChildren(this.root, children);
    }
  }

  private saveState(): void {
    if (!this.options.storageKey) return;
    const hiddenList: string[] = [];
    for (const [id, isHidden] of Object.entries(this.hidden)) {
      if (isHidden) hiddenList.push(id);
    }
    saveGridState(this.options.storageKey, {
      density: this.density,
      columnWidths: { ...this.columnWidths },
      columnOrder: this.columns.map(getColumnId).filter(Boolean) as string[],
      hiddenColumns: hiddenList,
    });
  }

  private resetState(): void {
    if (this.options.storageKey) {
      clearGridState(this.options.storageKey);
    }
    this.density = this.options.density ?? "default";
    for (const key of Object.keys(this.columnWidths)) {
      delete this.columnWidths[key];
    }
    this.columns = [...this.options.columns];
    this.hidden = initialHiddenColumns(this.leafCols());
    this.render();
  }

  private autoFitColumn(id: string): void {
    const col = this.leafCols().find((c) => getColumnId(c) === id);
    if (!col) return;
    const meta = col.meta ?? {};

    let maxContentWidth = 0;
    const headerTitle = getColumnTitle(col) || id;
    maxContentWidth = Math.max(maxContentWidth, headerTitle.length * 8.5 + 50);

    for (const row of this.data) {
      const rawVal = getCellValue(col, row);
      const val = getCellText(rawVal);
      if (val) {
        maxContentWidth = Math.max(maxContentWidth, String(val).length * 8 + 26);
      }
    }

    const minW = meta.minWidth ?? 60;
    const maxW = 550;
    const finalWidth = Math.min(maxW, Math.max(minW, Math.round(maxContentWidth)));

    this.columnWidths[id] = finalWidth;
    this.saveState();
    this.render();
  }

  private renderFilterPills(): void {
    if (this.options.showFilterPills === false) {
      this.filterPillsBar.style.display = "none";
      return;
    }

    const pills: HTMLElement[] = [];
    const q = this.query.q?.trim();
    if (q) {
      const pill = el("div", { class: "tbx-filter-pill" }, [
        el("span", { class: "tbx-filter-pill-label", text: `${this.locale.searchPlaceholder || "Search"}:` }),
        el("span", { class: "tbx-filter-pill-val", text: `"${q}"` }),
      ]);
      const removeBtn = el("button", {
        class: "tbx-filter-pill-remove",
        attrs: { type: "button", "aria-label": "Clear search filter", title: "Clear search" },
        text: "✕",
      });
      removeBtn.addEventListener("click", () => {
        if (this.searchInput) this.searchInput.value = "";
        this.syncSearchClear();
        this.applyQuery(withSearch(this.query, ""));
      });
      pill.appendChild(removeBtn);
      pills.push(pill);
    }

    const filters = this.query.filter ?? {};
    for (const [key, val] of Object.entries(filters)) {
      if (val === undefined || val === "") continue;
      const col = this.leafCols().find((c) => getColumnId(c) === key);
      const title = col ? (getColumnTitle(col) || key) : key;
      const pill = el("div", { class: "tbx-filter-pill" }, [
        el("span", { class: "tbx-filter-pill-label", text: `${title}:` }),
        el("span", { class: "tbx-filter-pill-val", text: String(val) }),
      ]);
      const removeBtn = el("button", {
        class: "tbx-filter-pill-remove",
        attrs: { type: "button", "aria-label": `Remove filter for ${title}`, title: `Remove ${title} filter` },
        text: "✕",
      });
      removeBtn.addEventListener("click", () => {
        this.applyQuery(withFilter(this.query, key, undefined));
      });
      pill.appendChild(removeBtn);
      pills.push(pill);
    }

    if (pills.length === 0) {
      this.filterPillsBar.style.display = "none";
      replaceChildren(this.filterPillsBar, []);
      return;
    }

    const clearAllBtn = el("button", {
      class: "tbx-filter-pill-clear-all",
      attrs: { type: "button" },
      text: "Clear all",
    });
    clearAllBtn.addEventListener("click", () => {
      if (this.searchInput) this.searchInput.value = "";
      this.syncSearchClear();
      this.applyQuery({
        ...this.query,
        page: 1,
        q: undefined,
        filter: {},
      });
    });

    const children: HTMLElement[] = [
      el("span", { class: "tbx-filter-pills-title", text: "Active filters:" }),
      ...pills,
      clearAllBtn,
    ];
    this.filterPillsBar.style.display = "";
    replaceChildren(this.filterPillsBar, children);
  }

  private buildErrorCard(): HTMLElement {
    const children: ElementChild[] = [
      el("p", { class: "tbx-state-text", text: this.locale.errorText }),
    ];
    // In endpoint mode the grid owns fetching, so it can always offer a retry
    // even when the host did not supply one.
    const onRetry = this.options.onRetry;
    if (onRetry || this.options.endpoint !== undefined) {
      const button = el(
        "button",
        {
          class: "tbx-btn",
          attrs: { type: "button", "data-tbx-focus": "retry" },
        },
        [rotateCcwIcon(), el("span", { text: this.locale.retryButton })],
      );
      button.addEventListener("click", () => {
        if (onRetry) onRetry();
        else this.refresh();
      });
      children.push(button);
    }
    return el("div", { class: "tbx-state-card" }, children);
  }

  // ---- Focus preservation --------------------------------------------------

  private captureFocusKey(): string | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.root.contains(active)) return null;
    return active.dataset["nxgFocus"] ?? null;
  }

  private restoreFocus(key: string | null): void {
    if (key === null) return;
    const candidates = this.root.querySelectorAll<HTMLElement>("[data-tbx-focus]");
    for (const candidate of Array.from(candidates)) {
      if (candidate.dataset["nxgFocus"] === key) {
        candidate.focus();
        return;
      }
    }
  }

  // ---- Toolbar -------------------------------------------------------------

  private renderToolbar(): void {
    this.syncSearchInput();
    this.syncSearchClear();

    if (this.densityLabel) {
      this.densityLabel.textContent = formatMessage(this.locale.densityButton, {
        density: this.density,
      });
    }
    if (this.exportLabel) {
      this.exportLabel.textContent = this.isExporting
        ? this.locale.exportingButton
        : this.locale.exportButton;
    }

    const exportButton = this.menuButtons.get("export");
    if (exportButton) exportButton.disabled = this.isExporting;

    this.syncMenu("columns", () => this.buildColumnsMenu());
    this.syncMenu("density", () => this.buildDensityMenu());
    this.syncMenu("export", () => this.buildExportMenu());
  }

  /**
   * Mirror external `query.q` changes into the input — but never while the user
   * has the caret in it, or a slow host round-trip would rewrite what they are
   * still typing.
   */
  private syncSearchInput(): void {
    const input = this.searchInput;
    if (!input || document.activeElement === input) return;
    const next = this.query.q ?? "";
    if (input.value !== next) input.value = next;
  }

  private syncSearchClear(): void {
    const input = this.searchInput;
    const wrap = this.searchWrap;
    if (!input || !wrap) return;

    const existing = wrap.querySelector(".tbx-search-clear");
    if (input.value === "") {
      existing?.remove();
      return;
    }
    if (existing) return;

    const button = el(
      "button",
      {
        class: "tbx-search-clear",
        attrs: { type: "button", "aria-label": this.locale.clearSearch },
      },
      [xIcon("tbx-icon"), el("span", { class: "tbx-sr-only", text: this.locale.clearSearch })],
    );
    button.addEventListener("click", () => {
      input.value = "";
      this.syncSearchClear();
      input.focus();
      this.scheduleSearch("");
    });
    wrap.appendChild(button);
  }

  private syncMenu(name: MenuName, build: () => HTMLElement): void {
    const wrap = this.menuWraps.get(name);
    const button = this.menuButtons.get(name);
    if (!wrap || !button) return;

    const isOpen = this.openMenu === name;
    button.setAttribute("aria-expanded", String(isOpen));
    wrap.querySelector(".tbx-menu")?.remove();
    if (isOpen) wrap.appendChild(build());
  }

  private buildMenu(name: MenuName, modifier: string, children: readonly ElementChild[]): HTMLElement {
    const menu = el(
      "div",
      {
        class: modifier ? `tbx-menu ${modifier}` : "tbx-menu",
        attrs: { role: "menu", "aria-labelledby": `${this.uid}-${name}-btn` },
      },
      children,
    );
    menu.addEventListener("keydown", (event) => this.handleMenuKeyDown(name, event));
    return menu;
  }

  /** Roving focus inside an open menu, as `role="menu"` promises. */
  private handleMenuKeyDown(name: MenuName, event: KeyboardEvent): void {
    const wrap = this.menuWraps.get(name);
    if (!wrap) return;
    const items = Array.from(wrap.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
    if (items.length === 0) return;

    const active = document.activeElement;
    const index = active instanceof HTMLElement ? items.indexOf(active) : -1;
    let next: number | null = null;

    if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = index <= 0 ? items.length - 1 : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;

    event.preventDefault();
    items[next]?.focus();
  }

  private menuItem(
    role: "menuitem" | "menuitemcheckbox",
    focusKey: string,
    children: readonly ElementChild[],
    onSelect: () => void,
    checked?: boolean,
  ): HTMLButtonElement {
    const button = el(
      "button",
      {
        class: "tbx-menu-item",
        attrs: {
          type: "button",
          role,
          "data-tbx-focus": focusKey,
          ...(checked === undefined ? {} : { "aria-checked": String(checked) }),
        },
      },
      children,
    );
    button.addEventListener("click", onSelect);
    return button;
  }

  private buildColumnsMenu(): HTMLElement {
    const items: ElementChild[] = [
      el("div", { class: "tbx-menu-label", text: this.locale.toggleColumnsLabel }),
      el("div", { class: "tbx-menu-separator" }),
    ];

    for (const column of this.leafCols()) {
      if (!isHideable(column)) continue;
      const id = getColumnId(column);
      const visible = this.hidden[id] !== true;
      items.push(
        this.menuItem(
          "menuitemcheckbox",
          `menu:columns:${id}`,
          [checkIcon(), el("span", { text: getColumnTitle(column) || id })],
          () => {
            // The menu deliberately stays open: hiding four columns should be
            // four clicks, not four round trips through the trigger button.
            this.hidden = { ...this.hidden, [id]: visible };
            this.saveState();
            this.render();
          },
          visible,
        ),
      );
    }

    if (this.options.storageKey) {
      items.push(
        el("div", { class: "tbx-menu-separator" }),
        this.menuItem(
          "menuitem",
          "menu:columns:reset",
          [el("span", { class: "tbx-menu-item--reset", text: "Reset to default view" })],
          () => {
            this.resetState();
            this.setOpenMenu(null);
          },
        ),
      );
    }

    return this.buildMenu("columns", "", items);
  }

  private buildDensityMenu(): HTMLElement {
    const labels: Record<Density, string> = {
      compact: this.locale.densityCompact,
      default: this.locale.densityDefault,
      comfortable: this.locale.densityComfortable,
    };

    const items = DENSITIES.map((value) =>
      this.menuItem(
        "menuitemcheckbox",
        `menu:density:${value}`,
        [checkIcon(), el("span", { text: labels[value] })],
        () => {
          this.density = value;
          this.saveState();
          this.setOpenMenu(null, { returnFocusTo: "density" });
        },
        this.density === value,
      ),
    );

    return this.buildMenu("density", "", items);
  }

  private buildExportMenu(): HTMLElement {
    const option = (
      key: "excel" | "csv" | "clipboard",
      glyph: SVGSVGElement,
      title: string,
      subtitle: string,
    ): HTMLButtonElement =>
      this.menuItem(
        "menuitem",
        `menu:export:${key}`,
        [
          glyph,
          el("div", { class: "tbx-menu-item-title" }, [
            el("strong", { text: title }),
            el("small", { text: subtitle }),
          ]),
        ],
        () => void this.runExport(key),
      );

    return this.buildMenu("export", "tbx-menu--end", [
      option(
        "excel",
        fileSpreadsheetIcon(),
        this.locale.exportExcelTitle,
        this.locale.exportExcelSubtitle,
      ),
      option("csv", fileTextIcon(), this.locale.exportCsvTitle, this.locale.exportCsvSubtitle),
      option(
        "clipboard",
        fileTextIcon(),
        this.locale.exportClipboardTitle,
        this.locale.exportClipboardSubtitle,
      ),
    ]);
  }

  // ---- Pinned offsets helper -----------------------------------------------

  private getPinnedOffsets(visibleCols: readonly TableXVanillaColumn<TData>[]): {
    leftOffsets: Map<string, number>;
    rightOffsets: Map<string, number>;
    lastLeftPinnedId: string | null;
    firstRightPinnedId: string | null;
  } {
    const leftOffsets = new Map<string, number>();
    const rightOffsets = new Map<string, number>();
    let currentLeft = 0;
    let lastLeftPinnedId: string | null = null;

    if (this.options.renderExpandedRow) {
      leftOffsets.set("__expand", currentLeft);
      currentLeft += 40;
      lastLeftPinnedId = "__expand";
    }

    if (this.selectionEnabled()) {
      leftOffsets.set("__select", currentLeft);
      currentLeft += 44;
      lastLeftPinnedId = "__select";
    }

    if (this.showSerial()) {
      leftOffsets.set("__serial", currentLeft);
      currentLeft += 56;
      lastLeftPinnedId = "__serial";
    }

    for (const col of visibleCols) {
      const id = getColumnId(col);
      const pin = col.meta?.pinned;
      const width = this.columnWidths[id] ?? col.meta?.width ?? 140;
      if (pin === "left") {
        leftOffsets.set(id, currentLeft);
        currentLeft += width;
        lastLeftPinnedId = id;
      }
    }

    let currentRight = 0;
    let firstRightPinnedId: string | null = null;
    for (let i = visibleCols.length - 1; i >= 0; i--) {
      const col = visibleCols[i];
      if (!col) continue;
      const id = getColumnId(col);
      const pin = col.meta?.pinned;
      const width = this.columnWidths[id] ?? col.meta?.width ?? 140;
      if (pin === "right") {
        rightOffsets.set(id, currentRight);
        currentRight += width;
        firstRightPinnedId = id;
      }
    }

    return { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId };
  }

  // ---- Table head ----------------------------------------------------------

  private renderHead(): void {
    const visibleCols = this.visibleCols();
    const { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId } =
      this.getPinnedOffsets(visibleCols);
    const headerRows = buildHeaderRows(this.columns, this.hidden);
    const rowSpan = headerRows.hasGroups ? 2 : 1;

    const row1Cells: ElementChild[] = [];

    if (this.options.renderExpandedRow) {
      const th = el("th", {
        class: "tbx-th tbx-th--expand",
        style: { width: "40px" },
        attrs: rowSpan > 1 ? { rowspan: rowSpan } : {},
      });
      if (leftOffsets.has("__expand")) {
        th.classList.add("tbx-th--pinned-left");
        th.style.left = `${leftOffsets.get("__expand")}px`;
        if (lastLeftPinnedId === "__expand") th.classList.add("tbx-pinned-border-left");
      }
      row1Cells.push(th);
    }

    if (this.selectionEnabled()) {
      const thClasses = ["tbx-th", "tbx-th--select"];
      const thStyle: Record<string, string | undefined> = {};
      if (leftOffsets.has("__select")) {
        thClasses.push("tbx-th--pinned-left");
        thStyle.left = `${leftOffsets.get("__select")}px`;
        if (lastLeftPinnedId === "__select") thClasses.push("tbx-pinned-border-left");
      }

      const attrs: Record<string, string | number | boolean | null | undefined> =
        rowSpan > 1 ? { rowspan: rowSpan } : {};

      if (this.isSingleSelection()) {
        row1Cells.push(el("th", { class: thClasses.join(" "), style: thStyle, attrs }));
      } else {
        const ids = this.pageRowIds();
        const allSelected = ids.length > 0 && ids.every((id) => this.selected.has(id));
        const someSelected = ids.some((id) => this.selected.has(id));
        const checkbox = el("input", {
          class: "tbx-checkbox",
          attrs: {
            type: "checkbox",
            "aria-label": this.locale.selectAllLabel,
            "data-tbx-focus": "select-all",
          },
        });
        checkbox.checked = allSelected;
        checkbox.indeterminate = !allSelected && someSelected;
        checkbox.addEventListener("change", () => this.toggleSelectAll());
        row1Cells.push(el("th", { class: thClasses.join(" "), style: thStyle, attrs }, [checkbox]));
      }
    }

    if (this.showSerial()) {
      const thClasses = ["tbx-th", "tbx-th--serial"];
      const thStyle: Record<string, string | undefined> = {};
      if (leftOffsets.has("__serial")) {
        thClasses.push("tbx-th--pinned-left");
        thStyle.left = `${leftOffsets.get("__serial")}px`;
        if (lastLeftPinnedId === "__serial") thClasses.push("tbx-pinned-border-left");
      }
      const attrs: Record<string, string | number | boolean | null | undefined> =
        rowSpan > 1 ? { rowspan: rowSpan } : {};
      row1Cells.push(el("th", { class: thClasses.join(" "), style: thStyle, attrs, text: this.locale.serialHeader }));
    }

    if (!headerRows.hasGroups) {
      for (const col of visibleCols) {
        row1Cells.push(
          this.buildLeafTh(col, 1, false, leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId),
        );
      }
      replaceChildren(this.thead, [el("tr", {}, row1Cells)]);
      return;
    }

    for (const cell of headerRows.topRow) {
      if (cell.isGroup) {
        const th = el(
          "th",
          {
            class: "tbx-th tbx-th--group",
            attrs: { colspan: cell.colSpan },
          },
          [el("span", { class: "tbx-th-group-title", text: cell.title })],
        );
        row1Cells.push(th);
      } else if (cell.leafColumn) {
        row1Cells.push(
          this.buildLeafTh(cell.leafColumn, cell.rowSpan, false, leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId),
        );
      }
    }

    const row2Cells: ElementChild[] = [];
    for (const cell of headerRows.bottomRow) {
      if (cell.leafColumn) {
        row2Cells.push(
          this.buildLeafTh(cell.leafColumn, 1, true, leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId),
        );
      }
    }

    replaceChildren(this.thead, [el("tr", {}, row1Cells), el("tr", {}, row2Cells)]);
  }

  private buildLeafTh(
    column: TableXVanillaColumn<TData>,
    rowSpan: number,
    isGroupChild: boolean,
    leftOffsets: Map<string, number>,
    rightOffsets: Map<string, number>,
    lastLeftPinnedId: string | null,
    firstRightPinnedId: string | null,
  ): HTMLElement {
    const id = getColumnId(column);
    const sortable = isSortable(column) && this.options.enableSorting !== false;
    const filterable = isFilterable(column, this.options.enableColumnFilters !== false);
    const sorts = this.query.sort;
    const sortIndex = sorts.findIndex((s) => s.field === id);
    const sortItem = sortIndex >= 0 ? sorts[sortIndex] : undefined;
    const sorted = sortable && sortItem ? sortItem.dir : null;
    const meta = column.meta ?? {};
    const align = meta.align ?? "left";

    const inner = el("div", {
      class:
        align === "center"
          ? "tbx-th-inner tbx-th-inner--center"
          : align === "right"
            ? "tbx-th-inner tbx-th-inner--right"
            : "tbx-th-inner",
    });
    inner.appendChild(this.buildHeaderLabel(column));

    if (sortable) {
      const glyph =
        sorted === "asc" ? arrowUpIcon() : sorted === "desc" ? arrowDownIcon() : arrowUpDownIcon();
      const iconWrap = el("span", { class: "tbx-sort-icon-wrap" }, [glyph]);
      if (sorts.length > 1 && sortIndex >= 0) {
        iconWrap.appendChild(
          el("span", { class: "tbx-sort-order", text: String(sortIndex + 1) }),
        );
      }
      inner.appendChild(iconWrap);
    }

    if (filterable) {
      const activeFilter = this.query.filter?.[id];
      const isFilterActive = activeFilter !== undefined && activeFilter !== "";
      const filterWrap = el("div", { class: "tbx-col-filter-wrap" });
      const filterBtn = el(
        "button",
        {
          class: isFilterActive
            ? "tbx-col-filter-btn tbx-col-filter-btn--active"
            : "tbx-col-filter-btn",
          attrs: {
            type: "button",
            "aria-label": `Options and filter for ${getColumnTitle(column) || id}`,
          },
        },
        [dotsVerticalIcon("tbx-icon")],
      );
      filterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openFilterColumn = this.openFilterColumn === id ? null : id;
        this.render();
      });
      filterWrap.appendChild(filterBtn);

      if (this.openFilterColumn === id) {
        filterWrap.appendChild(this.buildColumnFilterPopover(id, column, meta, activeFilter));
      }
      inner.appendChild(filterWrap);
    }

    const ariaSort =
      sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";

    const customWidth = this.columnWidths[id];
    const effectiveWidth =
      customWidth !== undefined
        ? customWidth
        : meta.width !== undefined
          ? meta.width
          : undefined;

    const thAttrs: Record<string, string | number | boolean | null | undefined> = {
      scope: "col",
      "aria-sort": sortable ? ariaSort : undefined,
      tabindex: sortable ? 0 : undefined,
      "data-column-id": id,
      "data-tbx-focus": sortable ? `sort:${id}` : undefined,
    };
    if (rowSpan > 1) {
      thAttrs.rowspan = rowSpan;
    }

    const thClasses = ["tbx-th"];
    if (sortable) thClasses.push("tbx-th--sortable");
    if (isGroupChild) thClasses.push("tbx-th--grouped-child");

    const thStyle: Record<string, string | undefined> = {};
    if (effectiveWidth !== undefined) {
      thStyle.width = `${effectiveWidth}px`;
    }
    if (meta.minWidth !== undefined) {
      thStyle.minWidth = `${meta.minWidth}px`;
    }

    const pinned = isPinned(column);
    if (pinned === "left" && leftOffsets.has(id)) {
      thClasses.push("tbx-th--pinned-left");
      thStyle.left = `${leftOffsets.get(id)}px`;
      if (lastLeftPinnedId === id) thClasses.push("tbx-pinned-border-left");
    } else if (pinned === "right" && rightOffsets.has(id)) {
      thClasses.push("tbx-th--pinned-right");
      thStyle.right = `${rightOffsets.get(id)}px`;
      if (firstRightPinnedId === id) thClasses.push("tbx-pinned-border-right");
    }

    const th = el("th", { class: thClasses.join(" "), style: thStyle, attrs: thAttrs }, [inner]);

    if (this.options.enableColumnReorder !== false && !isGroupChild) {
      th.draggable = true;
      th.classList.add("tbx-th--draggable");
      th.addEventListener("dragstart", (e: DragEvent) => {
        this.draggedColumnId = id;
        th.classList.add("tbx-th--dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", id);
        }
      });
      th.addEventListener("dragover", (e: DragEvent) => {
        e.preventDefault();
        if (this.draggedColumnId && this.draggedColumnId !== id) {
          th.classList.add("tbx-th--drag-over-left");
        }
      });
      th.addEventListener("dragleave", () => {
        th.classList.remove("tbx-th--drag-over-left");
      });
      th.addEventListener("drop", (e: DragEvent) => {
        e.preventDefault();
        th.classList.remove("tbx-th--drag-over-left");
        if (!this.draggedColumnId || this.draggedColumnId === id) return;

        const fromIdx = this.columns.findIndex((c) => getColumnId(c) === this.draggedColumnId);
        const toIdx = this.columns.findIndex((c) => getColumnId(c) === id);
        if (fromIdx >= 0 && toIdx >= 0) {
          const nextCols = [...this.columns];
          const moved = nextCols[fromIdx];
          if (!moved) return;
          nextCols.splice(fromIdx, 1);
          nextCols.splice(toIdx, 0, moved);
          this.columns = nextCols;
          this.options.onColumnOrderChange?.(nextCols.map(getColumnId));
          this.saveState();
          this.render();
        }
      });
      th.addEventListener("dragend", () => {
        this.draggedColumnId = null;
        th.classList.remove("tbx-th--dragging");
        th.classList.remove("tbx-th--drag-over-left");
      });
    }

    if (sortable) {
      th.addEventListener("click", (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
          return;
        }
        const next = event.shiftKey
          ? withToggledMultiSort(this.query, id)
          : withToggledSort(this.query, id);
        this.applyQuery(next);
      });
      th.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target as HTMLElement | null;
        if (target?.closest(".tbx-col-filter-wrap")) return;
        event.preventDefault();
        const next = event.shiftKey
          ? withToggledMultiSort(this.query, id)
          : withToggledSort(this.query, id);
        this.applyQuery(next);
      });
    }

    if (this.options.enableColumnResize !== false) {
      const handle = el("div", { class: "tbx-resize-handle" });
      handle.addEventListener("pointerdown", (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = th.getBoundingClientRect ? th.getBoundingClientRect().width : (customWidth ?? meta.width ?? 120);
        const onMove = (e: PointerEvent) => {
          const nextWidth = Math.max(meta.minWidth ?? 60, Math.round(startWidth + (e.clientX - startX)));
          this.columnWidths[id] = nextWidth;
          th.style.width = `${nextWidth}px`;
        };
        const onUp = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.body?.classList.remove("tbx-resizing");
          this.saveState();
          this.render();
        };
        document.body?.classList.add("tbx-resizing");
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      });
      handle.addEventListener("dblclick", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.autoFitColumn(id);
      });
      th.appendChild(handle);
    }

    return th;
  }

  private buildHeaderLabel(column: TableXVanillaColumn<TData>): HTMLSpanElement {
    const span = el("span");
    const header = column.header;
    if (typeof header === "function") {
      const rendered = header({});
      if (typeof rendered === "string") span.textContent = rendered;
      else span.appendChild(rendered);
    } else {
      span.textContent = header ?? getColumnId(column);
    }
    return span;
  }

  // ---- Table body ----------------------------------------------------------

  private renderBody(): void {
    const cols = this.visibleCols();
    const colSpan =
      cols.length +
      (this.options.renderExpandedRow ? 1 : 0) +
      (this.showSerial() ? 1 : 0) +
      (this.selectionEnabled() ? 1 : 0);

    if (this.isLoading) {
      const dottedLoader = el("div", { class: "tbx-dotted-loader", attrs: { "aria-hidden": "true" } }, [
        el("span", { class: "tbx-dot" }),
        el("span", { class: "tbx-dot" }),
        el("span", { class: "tbx-dot" }),
        el("span", { class: "tbx-dot" }),
      ]);
      replaceChildren(this.tbody, [
        el("tr", {}, [
          el("td", { class: "tbx-state", attrs: { colspan: String(colSpan) } }, [
            dottedLoader,
            el("div", { class: "tbx-loading-text", text: this.locale.loadingText }),
          ]),
        ]),
      ]);
      return;
    }

    if (this.data.length === 0) {
      replaceChildren(this.tbody, [
        el("tr", {}, [
          el("td", {
            class: "tbx-state",
            attrs: { colspan: String(colSpan) },
            text: this.locale.emptyText,
          }),
        ]),
      ]);
      return;
    }

    const rows: HTMLElement[] = [];
    for (let index = 0; index < this.data.length; index++) {
      const row = this.data[index];
      if (row === undefined) continue;
      const built = this.buildRow(row, index, cols, colSpan);
      if (Array.isArray(built)) {
        rows.push(...built);
      } else {
        rows.push(built);
      }
    }
    replaceChildren(this.tbody, rows);
  }

  private buildRow(
    row: TData,
    index: number,
    cols: readonly TableXVanillaColumn<TData>[],
    colSpan: number,
  ): HTMLTableRowElement | HTMLTableRowElement[] {
    const id = this.rowId(row);
    const selected = this.selected.has(id);
    const isExpanded = this.expandedRows.has(id);
    const clickable = this.options.onRowClick !== undefined;
    const { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId } =
      this.getPinnedOffsets(cols);

    const classes = ["tbx-row"];
    if (selected) classes.push("tbx-row--selected");
    if (clickable) classes.push("tbx-row--clickable");
    if (isExpanded) classes.push("tbx-row--expanded");

    const cells: ElementChild[] = [];

    // Row expansion chevron
    if (this.options.renderExpandedRow) {
      const expandBtn = el(
        "button",
        {
          class: isExpanded ? "tbx-expand-btn tbx-expand-btn--open" : "tbx-expand-btn",
          attrs: { type: "button", "aria-label": isExpanded ? "Collapse row" : "Expand row" },
        },
        [chevronRightIcon("tbx-icon")],
      );
      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.expandedRows.has(id)) {
          this.expandedRows.delete(id);
        } else {
          this.expandedRows.add(id);
        }
        this.render();
      });

      const tdClasses = ["tbx-td", "tbx-td--expand"];
      const tdStyle: Record<string, string | undefined> = { width: "40px" };
      if (leftOffsets.has("__expand")) {
        tdClasses.push("tbx-td--pinned-left");
        tdStyle.left = `${leftOffsets.get("__expand")}px`;
        if (lastLeftPinnedId === "__expand") tdClasses.push("tbx-pinned-border-left");
      }
      cells.push(el("td", { class: tdClasses.join(" "), style: tdStyle }, [expandBtn]));
    }

    if (this.selectionEnabled()) {
      const tdClasses = ["tbx-td", "tbx-td--select"];
      const tdStyle: Record<string, string | undefined> = {};
      if (leftOffsets.has("__select")) {
        tdClasses.push("tbx-td--pinned-left");
        tdStyle.left = `${leftOffsets.get("__select")}px`;
        if (lastLeftPinnedId === "__select") tdClasses.push("tbx-pinned-border-left");
      }
      cells.push(
        el("td", { class: tdClasses.join(" "), style: tdStyle }, [
          this.buildRowCheckbox(id, selected, `row-select:${id}`),
        ]),
      );
    }

    if (this.showSerial()) {
      const tdClasses = ["tbx-td", "tbx-td--serial"];
      const tdStyle: Record<string, string | undefined> = {};
      if (leftOffsets.has("__serial")) {
        tdClasses.push("tbx-td--pinned-left");
        tdStyle.left = `${leftOffsets.get("__serial")}px`;
        if (lastLeftPinnedId === "__serial") tdClasses.push("tbx-pinned-border-left");
      }
      cells.push(
        el("td", {
          class: tdClasses.join(" "),
          style: tdStyle,
          text: String(serialNumber(this.currentPage(), this.query.pageSize, index)),
        }),
      );
    }

    for (const column of cols) {
      const colId = getColumnId(column);
      const meta = column.meta ?? {};
      const tdClasses = ["tbx-td"];
      const tdStyle: Record<string, string | undefined> = { textAlign: meta.align ?? "left" };

      if (leftOffsets.has(colId)) {
        tdClasses.push("tbx-td--pinned-left");
        tdStyle.left = `${leftOffsets.get(colId)}px`;
        if (lastLeftPinnedId === colId) tdClasses.push("tbx-pinned-border-left");
      } else if (rightOffsets.has(colId)) {
        tdClasses.push("tbx-td--pinned-right");
        tdStyle.right = `${rightOffsets.get(colId)}px`;
        if (firstRightPinnedId === colId) tdClasses.push("tbx-pinned-border-right");
      }

      if (isEditable(column)) {
        tdClasses.push("tbx-cell--editable");
      }

      const td = el("td", { class: tdClasses.join(" "), style: tdStyle });
      this.renderCellInto(td, column, row, id);
      cells.push(td);
    }

    const tr = el("tr", { class: classes.join(" ") }, cells);
    if (clickable) {
      tr.addEventListener("click", () => this.options.onRowClick?.(row));
    }

    if (isExpanded && this.options.renderExpandedRow) {
      const detail = this.options.renderExpandedRow(row);
      const detailCell = el("td", {
        class: "tbx-expanded-cell",
        attrs: { colspan: String(colSpan) },
      });
      const panel = el("div", { class: "tbx-detail-panel" });
      if (typeof detail === "string") panel.textContent = detail;
      else if (detail) panel.appendChild(detail);
      detailCell.appendChild(panel);
      const expandedTr = el("tr", { class: "tbx-expanded-row" }, [detailCell]);
      return [tr, expandedTr];
    }

    return tr;
  }

  // ---- Summary / Aggregation Footer Row ------------------------------------

  private renderSummary(): void {
    const visibleCols = this.visibleCols();
    const hasAgg =
      this.options.enableSummaryRow === true ||
      visibleCols.some((col) => col.meta?.aggregation !== undefined);

    if (!hasAgg || this.data.length === 0) {
      replaceChildren(this.tfoot, []);
      return;
    }

    const cells: HTMLElement[] = [];
    const { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId } =
      this.getPinnedOffsets(visibleCols);

    if (this.options.renderExpandedRow) {
      const td = el("td", { class: "tbx-summary-cell" });
      if (leftOffsets.has("__expand")) {
        td.classList.add("tbx-td--pinned-left");
        td.style.left = `${leftOffsets.get("__expand")}px`;
        if (lastLeftPinnedId === "__expand") td.classList.add("tbx-pinned-border-left");
      }
      cells.push(td);
    }

    if (this.selectionEnabled()) {
      const td = el("td", { class: "tbx-summary-cell tbx-summary-cell--select", text: "" });
      if (leftOffsets.has("__select")) {
        td.classList.add("tbx-td--pinned-left");
        td.style.left = `${leftOffsets.get("__select")}px`;
        if (lastLeftPinnedId === "__select") td.classList.add("tbx-pinned-border-left");
      }
      cells.push(td);
    }

    if (this.showSerial()) {
      const td = el("td", { class: "tbx-summary-cell tbx-summary-cell--serial", text: "" });
      if (leftOffsets.has("__serial")) {
        td.classList.add("tbx-td--pinned-left");
        td.style.left = `${leftOffsets.get("__serial")}px`;
        if (lastLeftPinnedId === "__serial") td.classList.add("tbx-pinned-border-left");
      }
      cells.push(td);
    }

    for (let i = 0; i < visibleCols.length; i++) {
      const col = visibleCols[i];
      if (!col) continue;
      const id = getColumnId(col);
      const aggVal = computeAggregation(col, this.data);
      const label = col.meta?.aggregationLabel || (col.meta?.aggregation ? `${col.meta.aggregation}:` : "");

      const td = el("td", { class: "tbx-summary-cell" });
      if (col.meta?.align === "center") td.style.textAlign = "center";
      else if (col.meta?.align === "right") td.style.textAlign = "right";

      if (leftOffsets.has(id)) {
        td.classList.add("tbx-td--pinned-left");
        td.style.left = `${leftOffsets.get(id)}px`;
        if (lastLeftPinnedId === id) td.classList.add("tbx-pinned-border-left");
      } else if (rightOffsets.has(id)) {
        td.classList.add("tbx-td--pinned-right");
        td.style.right = `${rightOffsets.get(id)}px`;
        if (firstRightPinnedId === id) td.classList.add("tbx-pinned-border-right");
      }

      if (aggVal !== null && aggVal !== undefined) {
        if (label) {
          td.appendChild(el("span", { class: "tbx-summary-label", text: `${label} ` }));
        }
        td.appendChild(el("strong", { text: String(aggVal) }));
      } else if (i === 0 && !label) {
        td.appendChild(el("strong", { text: "Total" }));
      }

      cells.push(td);
    }

    replaceChildren(this.tfoot, [el("tr", { class: "tbx-summary-row" }, cells)]);
  }

  // ---- Bulk Actions Bar ----------------------------------------------------

  private renderBulkBar(): void {
    if (this.selected.size === 0 || this.options.enableBulkActions === false) {
      if (this.bulkBar.parentElement) this.bulkBar.remove();
      return;
    }

    const badge = el("span", {
      class: "tbx-bulk-badge",
      text: `${this.selected.size} selected`,
    });

    const actions = el("div", { class: "tbx-bulk-actions" });

    const excelBtn = el(
      "button",
      { class: "tbx-bulk-btn", attrs: { type: "button" } },
      [fileSpreadsheetIcon("tbx-icon--excel"), el("span", { text: "Export Excel" })],
    );
    excelBtn.addEventListener("click", () => void this.runExport("excel"));
    actions.appendChild(excelBtn);

    const csvBtn = el(
      "button",
      { class: "tbx-bulk-btn", attrs: { type: "button" } },
      [fileTextIcon("tbx-icon--csv"), el("span", { text: "Export CSV" })],
    );
    csvBtn.addEventListener("click", () => void this.runExport("csv"));
    actions.appendChild(csvBtn);

    if (this.options.bulkActions) {
      const custom = this.options.bulkActions(Array.from(this.selected), () => {
        this.selected.clear();
        this.emitSelection();
        this.render();
      });
      if (typeof custom === "string") actions.appendChild(el("span", { text: custom }));
      else if (custom) actions.appendChild(custom);
    }

    const closeBtn = el(
      "button",
      {
        class: "tbx-bulk-btn tbx-bulk-btn--close",
        attrs: { type: "button", "aria-label": "Deselect all" },
      },
      [xIcon("tbx-icon")],
    );
    closeBtn.addEventListener("click", () => {
      this.selected.clear();
      this.emitSelection();
      this.render();
    });

    replaceChildren(this.bulkBar, [badge, actions, closeBtn]);
    if (!this.bulkBar.parentElement && this.root.contains(this.tableWrap)) {
      this.root.appendChild(this.bulkBar);
    }
  }

  /**
   * Column filter popover supporting text, dropdown presets, date ranges, and numeric ranges.
   */
  private buildColumnFilterPopover(
    id: string,
    column: TableXVanillaColumn<TData>,
    meta: NonNullable<TableXVanillaColumn<TData>["meta"]>,
    currentValue?: string,
  ): HTMLElement {
    const popover = el("div", { class: "tbx-filter-popover" });
    popover.addEventListener("click", (e) => e.stopPropagation());

    const title = getColumnTitle(column) || id;
    const apply = (valToApply?: string) => {
      const val = (valToApply !== undefined ? valToApply : "").trim();
      this.openFilterColumn = null;
      this.applyQuery(withFilter(this.query, id, val || undefined));
    };

    // 1. Date Range Filter
    if (meta.filterType === "date-range") {
      const parts = (currentValue || "").split("..");
      const fromVal = parts[0] || "";
      const toVal = parts[1] || "";

      const rangeInputs = el("div", { class: "tbx-range-inputs" });
      const fromInput = el("input", {
        class: "tbx-range-input",
        attrs: { type: "date", value: fromVal, "aria-label": "From date" },
      }) as HTMLInputElement;
      const sep = el("span", { class: "tbx-range-sep", text: "to" });
      const toInput = el("input", {
        class: "tbx-range-input",
        attrs: { type: "date", value: toVal, "aria-label": "To date" },
      }) as HTMLInputElement;

      rangeInputs.appendChild(fromInput);
      rangeInputs.appendChild(sep);
      rangeInputs.appendChild(toInput);
      popover.appendChild(rangeInputs);

      const actionsWrap = el("div", { class: "tbx-filter-popover-actions" });
      const clearBtn = el("button", {
        class: "tbx-filter-popover-btn",
        attrs: { type: "button" },
      }, [rotateCcwIcon(), el("span", { text: this.locale.clearFilter })]);
      clearBtn.addEventListener("click", () => apply(""));

      const applyBtn = el("button", {
        class: "tbx-filter-popover-btn tbx-filter-popover-btn--primary",
        attrs: { type: "button" },
      }, [checkIcon(), el("span", { text: this.locale.applyFilter })]);
      applyBtn.addEventListener("click", () => {
        const from = fromInput.value.trim();
        const to = toInput.value.trim();
        if (!from && !to) apply("");
        else apply(`${from}..${to}`);
      });

      actionsWrap.appendChild(clearBtn);
      actionsWrap.appendChild(applyBtn);
      popover.appendChild(actionsWrap);
      return popover;
    }

    // 2. Numeric Range Filter
    if (meta.filterType === "number-range") {
      const parts = (currentValue || "").split("..");
      const minVal = parts[0] || "";
      const maxVal = parts[1] || "";

      const rangeInputs = el("div", { class: "tbx-range-inputs" });
      const minInput = el("input", {
        class: "tbx-range-input",
        attrs: { type: "number", placeholder: "Min", value: minVal, "aria-label": "Minimum" },
      }) as HTMLInputElement;
      const sep = el("span", { class: "tbx-range-sep", text: "to" });
      const maxInput = el("input", {
        class: "tbx-range-input",
        attrs: { type: "number", placeholder: "Max", value: maxVal, "aria-label": "Maximum" },
      }) as HTMLInputElement;

      rangeInputs.appendChild(minInput);
      rangeInputs.appendChild(sep);
      rangeInputs.appendChild(maxInput);
      popover.appendChild(rangeInputs);

      const actionsWrap = el("div", { class: "tbx-filter-popover-actions" });
      const clearBtn = el("button", {
        class: "tbx-filter-popover-btn",
        attrs: { type: "button" },
      }, [rotateCcwIcon(), el("span", { text: this.locale.clearFilter })]);
      clearBtn.addEventListener("click", () => apply(""));

      const applyBtn = el("button", {
        class: "tbx-filter-popover-btn tbx-filter-popover-btn--primary",
        attrs: { type: "button" },
      }, [checkIcon(), el("span", { text: this.locale.applyFilter })]);
      applyBtn.addEventListener("click", () => {
        const min = minInput.value.trim();
        const max = maxInput.value.trim();
        if (!min && !max) apply("");
        else apply(`${min}..${max}`);
      });

      actionsWrap.appendChild(clearBtn);
      actionsWrap.appendChild(applyBtn);
      popover.appendChild(actionsWrap);
      return popover;
    }

    // 3. Text / Dropdown filter
    const placeholder = meta.filterPlaceholder || formatMessage(this.locale.filterColumnPlaceholder, { column: title });

    const input = el("input", {
      class: "tbx-filter-popover-input",
      attrs: {
        type: meta.filterType === "date" ? "date" : meta.filterType === "number" ? "number" : "text",
        placeholder: placeholder,
        value: currentValue ?? "",
        "aria-label": `Filter ${title}`,
      },
    }) as HTMLInputElement;

    setTimeout(() => {
      input.focus?.();
      input.select?.();
    }, 10);

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply(input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.openFilterColumn = null;
        this.render();
      }
    });

    popover.appendChild(input);

    if (meta.filterOptions && meta.filterOptions.length > 0) {
      const optionsWrap = el("div", { class: "tbx-filter-popover-options" });

      const renderOptions = (filterTerm: string) => {
        replaceChildren(optionsWrap, []);
        const term = filterTerm.trim().toLowerCase();

        const allOption = el("div", {
          class: !currentValue ? "tbx-filter-option tbx-filter-option--selected" : "tbx-filter-option",
          text: this.locale.filterAll,
        });
        allOption.addEventListener("click", () => {
          apply("");
        });
        optionsWrap.appendChild(allOption);

        const filtered = meta.filterOptions!.filter((opt) =>
          !term || opt.toLowerCase().includes(term)
        );

        for (const opt of filtered) {
          const isSelected = currentValue === opt;
          const optEl = el("div", {
            class: isSelected ? "tbx-filter-option tbx-filter-option--selected" : "tbx-filter-option",
            text: opt,
          });
          optEl.addEventListener("click", () => {
            apply(opt);
          });
          optionsWrap.appendChild(optEl);
        }
      };

      renderOptions(input.value);
      input.addEventListener("input", () => {
        renderOptions(input.value);
      });

      popover.appendChild(optionsWrap);
    }

    const actions = el("div", { class: "tbx-filter-popover-actions" });
    const clearBtn = el(
      "button",
      {
        class: "tbx-filter-popover-btn",
        attrs: { type: "button" },
      },
      [rotateCcwIcon(), el("span", { text: this.locale.clearFilter })],
    );
    clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      input.value = "";
      apply("");
    });
    actions.appendChild(clearBtn);

    const applyBtn = el(
      "button",
      {
        class: "tbx-filter-popover-btn tbx-filter-popover-btn--primary",
        attrs: { type: "button" },
      },
      [checkIcon(), el("span", { text: this.locale.applyFilter })],
    );
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      apply(input.value);
    });
    actions.appendChild(applyBtn);

    popover.appendChild(actions);

    return popover;
  }

  private buildRowCheckbox(id: string, selected: boolean, focusKey: string): HTMLInputElement {
    const isSingle = this.isSingleSelection();
    const checkbox = el("input", {
      class: "tbx-checkbox",
      attrs: {
        type: isSingle ? "radio" : "checkbox",
        name: isSingle ? `${this.uid}-row-select` : undefined,
        "aria-label": formatMessage(this.locale.selectRowLabel, { id }),
        "data-tbx-focus": focusKey,
      },
    });
    checkbox.checked = selected;
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => this.toggleSelectRow(id));
    return checkbox;
  }

  /**
   * Write one cell's content with inline editing support.
   */
  private renderCellInto(
    host: HTMLElement,
    column: TableXVanillaColumn<TData>,
    row: TData,
    rowId?: string,
  ): void {
    const colId = getColumnId(column);
    const value = getCellValue(column, row);
    const isCurrentlyEditing =
      rowId !== undefined &&
      this.editingCell?.rowId === rowId &&
      this.editingCell?.columnId === colId;

    if (isCurrentlyEditing) {
      const editWrap = el("div", { class: "tbx-cell-edit-wrap" });
      editWrap.addEventListener("click", (e) => e.stopPropagation());

      const editType = column.meta?.editType || "text";
      let editInput: HTMLInputElement | HTMLSelectElement;

      if (editType === "select" && column.meta?.editOptions) {
        const select = el("select", { class: "tbx-cell-edit-select tbx-cell-edit-input" }) as HTMLSelectElement;
        for (const opt of column.meta.editOptions) {
          const optEl = el("option", { attrs: { value: opt }, text: opt }) as HTMLOptionElement;
          if (String(value) === opt) optEl.selected = true;
          select.appendChild(optEl);
        }
        editInput = select;
      } else {
        editInput = el("input", {
          class: "tbx-cell-edit-input",
          attrs: {
            type: editType === "number" ? "number" : "text",
            value: value !== null && value !== undefined ? String(value) : "",
          },
        }) as HTMLInputElement;
      }

      const save = () => {
        const nextVal = editType === "number" ? Number(editInput.value) : editInput.value;
        this.editingCell = null;
        if (rowId !== undefined) {
          (row as Record<string, unknown>)[colId] = nextVal;
          this.options.onCellEdit?.({
            row,
            columnId: colId,
            oldValue: value,
            newValue: nextVal,
          });
        }
        this.render();
      };

      const cancel = () => {
        this.editingCell = null;
        this.render();
      };

      editInput.addEventListener("keydown", ((e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }) as EventListener);

      const actions = el("div", { class: "tbx-cell-edit-actions" });
      const saveBtn = el(
        "button",
        {
          class: "tbx-cell-edit-btn tbx-cell-edit-btn--save",
          attrs: { type: "button", "aria-label": "Save" },
        },
        [checkIcon("tbx-icon")],
      );
      saveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        save();
      });

      const cancelBtn = el(
        "button",
        {
          class: "tbx-cell-edit-btn tbx-cell-edit-btn--cancel",
          attrs: { type: "button", "aria-label": "Cancel" },
        },
        [xIcon("tbx-icon")],
      );
      cancelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        cancel();
      });

      actions.appendChild(saveBtn);
      actions.appendChild(cancelBtn);

      editWrap.appendChild(editInput);
      editWrap.appendChild(actions);
      replaceChildren(host, [editWrap]);

      setTimeout(() => editInput.focus?.(), 10);
      return;
    }

    if (isEditable(column) && rowId !== undefined) {
      host.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this.editingCell = { rowId, columnId: colId };
        this.render();
      });
    }

    const custom = column.cell;
    if (custom) {
      const rendered: TableXNode | null | undefined = custom({
        row: { original: row },
        getValue: () => value,
      });
      if (rendered === null || rendered === undefined) return;
      if (typeof rendered === "string") host.textContent = rendered;
      else host.appendChild(rendered);
      return;
    }

    host.textContent = getCellText(value, {
      yes: this.locale.booleanYes,
      no: this.locale.booleanNo,
    });
  }

  // ---- Mobile cards --------------------------------------------------------

  private renderCards(): void {
    if (this.isLoading) {
      const dottedLoader = el("div", { class: "tbx-dotted-loader", attrs: { "aria-hidden": "true" } }, [
        el("span", { class: "tbx-dot" }),
        el("span", { class: "tbx-dot" }),
        el("span", { class: "tbx-dot" }),
        el("span", { class: "tbx-dot" }),
      ]);
      replaceChildren(this.cards, [
        el("div", { class: "tbx-card" }, [
          el("div", { class: "tbx-state" }, [
            dottedLoader,
            el("div", { class: "tbx-loading-text", text: this.locale.loadingText }),
          ]),
        ]),
      ]);
      return;
    }

    if (this.data.length === 0) {
      replaceChildren(this.cards, [
        el("div", { class: "tbx-card" }, [
          el("div", { class: "tbx-state", text: this.locale.emptyText }),
        ]),
      ]);
      return;
    }

    const cols = this.visibleCols();
    replaceChildren(
      this.cards,
      this.data.map((row, index) => this.buildCard(row, index, cols)),
    );
  }

  private buildCard(
    row: TData,
    index: number,
    cols: readonly TableXVanillaColumn<TData>[],
  ): HTMLDivElement {
    const id = this.rowId(row);
    const selected = this.selected.has(id);
    const clickable = this.options.onRowClick !== undefined;

    const classes = ["tbx-card"];
    if (selected) classes.push("tbx-card--selected");
    if (clickable) classes.push("tbx-card--clickable");

    const children: ElementChild[] = [];

    if (this.showSerial() || this.selectionEnabled()) {
      const head = el("div", { class: "tbx-card-head" });
      if (this.showSerial()) {
        head.appendChild(
          el("span", {
            class: "tbx-card-serial",
            text: `#${serialNumber(this.currentPage(), this.query.pageSize, index)}`,
          }),
        );
      }
      if (this.selectionEnabled()) {
        head.appendChild(
          el("span", { class: "tbx-card-select" }, [
            this.buildRowCheckbox(id, selected, `card-select:${id}`),
          ]),
        );
      }
      children.push(head);
    }

    const list = el("dl", { class: "tbx-card-rows" });
    for (const column of cols) {
      const dd = el("dd");
      this.renderCellInto(dd, column, row);
      list.appendChild(
        el("div", { class: "tbx-card-row" }, [
          el("dt", { text: getColumnTitle(column) || getColumnId(column) }),
          dd,
        ]),
      );
    }
    children.push(list);

    const card = el("div", { class: classes.join(" ") }, children);
    if (clickable) card.addEventListener("click", () => this.options.onRowClick?.(row));
    return card;
  }

  // ---- Footer --------------------------------------------------------------

  private renderFooter(): void {
    const page = this.currentPage();
    const totalPages = this.totalPages();
    const record = getRecordRange(page, this.query.pageSize, this.total);

    // The locale string is a sentence with three placeholders and the DOM
    // contract wraps each value in its own <strong>, so the template is split
    // on the placeholders rather than formatted into a single string.
    const sentence = el("span");
    for (const part of this.locale.showingRange.split(/(\{start\}|\{end\}|\{total\})/g)) {
      if (part === "") continue;
      if (part === "{start}") sentence.appendChild(el("strong", { text: String(record.start) }));
      else if (part === "{end}") sentence.appendChild(el("strong", { text: String(record.end) }));
      else if (part === "{total}")
        sentence.appendChild(
          el("strong", { class: "tbx-range-total", text: record.total.toLocaleString() }),
        );
      else sentence.appendChild(document.createTextNode(part));
    }

    const rangeChildren: ElementChild[] = [sentence];
    if (this.selected.size > 0) {
      rangeChildren.push(
        el("span", {
          class: "tbx-selected-badge",
          text: formatMessage(this.locale.selectedBadge, { count: this.selected.size }),
        }),
      );
    }
    replaceChildren(this.range, rangeChildren);

    if (this.rowsSelect) {
      this.rowsSelect.value = String(this.query.pageSize);
    }
    if (this.jumpInput) {
      this.jumpInput.max = String(totalPages);
      if (document.activeElement !== this.jumpInput) this.jumpInput.value = String(page);
    }

    replaceChildren(this.pager, this.buildPagerButtons(page, totalPages));
  }

  private buildPagerButtons(page: number, totalPages: number): ElementChild[] {
    const buttons: ElementChild[] = [];

    const nav = (
      direction: "prev" | "next",
      glyph: SVGSVGElement,
      label: string,
      disabled: boolean,
      target: number,
    ): HTMLButtonElement => {
      const button = el(
        "button",
        {
          class: "tbx-page-nav",
          attrs: {
            type: "button",
            "aria-label": label,
            "data-tbx-focus": `page-${direction}`,
            disabled,
          },
        },
        [glyph, el("span", { class: "tbx-sr-only", text: label })],
      );
      button.addEventListener("click", () =>
        this.applyQuery(withPage(this.query, target, totalPages)),
      );
      return button;
    };

    buttons.push(
      nav("prev", chevronLeftIcon(), this.locale.previousPage, page <= 1, page - 1),
    );

    for (const item of getPageNumbers(page, totalPages)) {
      if (item === "...") {
        buttons.push(el("span", { class: "tbx-page-ellipsis", text: "…" }));
        continue;
      }
      const isCurrent = item === page;
      const button = el("button", {
        class: isCurrent ? "tbx-page-btn tbx-page-btn--current" : "tbx-page-btn",
        attrs: {
          type: "button",
          "aria-label": formatMessage(this.locale.pageLabel, { page: item }),
          "aria-current": isCurrent ? "page" : undefined,
          "data-tbx-focus": `page:${item}`,
        },
        text: String(item),
      });
      button.addEventListener("click", () =>
        this.applyQuery(withPage(this.query, item, totalPages)),
      );
      buttons.push(button);
    }

    buttons.push(
      nav("next", chevronRightIcon(), this.locale.nextPage, page >= totalPages, page + 1),
    );

    return buttons;
  }
}

/**
 * Mount a NexGrid into `container` and return a handle for driving it.
 *
 * Two modes, chosen by the options you pass:
 *
 * - **Controlled** — supply `data`, `total`, `query` and `onQueryChange`. The
 *   grid renders exactly what you gave it and emits intent; you fetch and call
 *   `handle.update({ data, total, query })`.
 * - **Endpoint** — supply `endpoint`. The grid fetches
 *   `buildQueryUrl(endpoint, query)` itself, expects a `PagedResponse` JSON
 *   body, and manages loading and error states on its own. `onQueryChange`
 *   still fires, so the host can mirror the query into the address bar.
 *
 * @example
 * ```ts
 * const grid = createNexGrid<Student>(document.getElementById("grid")!, {
 *   caption: "Students",
 *   endpoint: "/api/students",
 *   columns: [{ accessorKey: "name", header: "Name" }],
 * });
 * ```
 */
export function createTableX<TData>(
  container: HTMLElement,
  options: TableXOptions<TData>,
): TableXHandle<TData> {
  return new NexGridController<TData>(container, options);
}

export const createNexGrid = createTableX;
