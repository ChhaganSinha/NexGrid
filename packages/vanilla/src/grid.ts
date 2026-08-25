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
  isHideable,
  isPageSize,
  isSortable,
  isFilterable,
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
  withToggledSort,
  withToggledMultiSort,
  copyToClipboard,
  type Density,
  type TableXLocale,
  type PagedResponse,
  type QueryState,
} from "@tablex/core";

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
  private readonly columns: TableXVanillaColumn<TData>[];
  private data: TData[];
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
  private readonly densityLabel: HTMLSpanElement;
  private readonly exportLabel: HTMLSpanElement;
  private readonly tableWrap: HTMLDivElement;
  private readonly thead: HTMLTableSectionElement;
  private readonly tbody: HTMLTableSectionElement;
  private readonly cards: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private readonly range: HTMLDivElement;
  private readonly pager: HTMLDivElement;
  private readonly rowsSelect: HTMLSelectElement;
  private readonly jumpInput: HTMLInputElement;

  constructor(container: HTMLElement, options: TableXOptions<TData>) {
    this.options = options;
    this.locale = resolveLocale(options.locale);
    this.caption = options.caption;
    this.rowId = options.getRowId ?? defaultGetRowId;
    this.uid = `tbx-${++instanceCounter}`;

    this.columns = options.columns;
    this.data = options.data ?? [];
    this.total = options.total ?? 0;
    this.query = options.query ?? defaultQuery();
    this.density = options.density ?? "default";
    this.hidden = initialHiddenColumns(this.columns);
    this.isLoading = options.isLoading ?? false;
    this.isError = options.error ?? false;

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

    const columnsButton = this.createMenuButton("columns", columnsIcon(), this.locale.columnsButton);
    endGroup.appendChild(this.wrapMenu("columns", columnsButton));

    this.densityLabel = el("span", { class: "tbx-capitalize" });
    const densityButton = this.createMenuButton("density", densityIcon(), this.densityLabel);
    endGroup.appendChild(this.wrapMenu("density", densityButton));

    this.exportLabel = el("span", { text: this.locale.exportButton });
    const exportButton = this.createMenuButton("export", null, this.exportLabel, chevronDownIcon());
    exportButton.classList.add("tbx-btn--export");
    if (options.enableExport !== false) {
      endGroup.appendChild(this.wrapMenu("export", exportButton));
    }

    if (options.toolbarActions !== undefined) {
      append(endGroup, [options.toolbarActions]);
    }

    // ---- Table ------------------------------------------------------------
    this.thead = el("thead");
    this.tbody = el("tbody");
    const table = el("table", { class: "tbx-table", attrs: { "aria-label": this.caption } }, [
      this.thead,
      this.tbody,
    ]);
    this.tableWrap = el("div", { class: "tbx-table-wrap" }, [table]);

    // ---- Cards ------------------------------------------------------------
    this.cards = el("div", { class: "tbx-cards" });

    // ---- Footer -----------------------------------------------------------
    this.range = el("div", { class: "tbx-range" });
    this.pager = el("div", { class: "tbx-pager" });

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
      this.applyQuery(withPageSize(this.query, Number.parseInt(this.rowsSelect.value, 10)));
    });
    const rowsPerPage = el("div", { class: "tbx-rows-per-page" }, [rowsLabel, this.rowsSelect]);

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
    const jumpForm = el("form", { class: "tbx-jump" }, [
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

    const pagination = el("div", { class: "tbx-pagination" }, [rowsPerPage, this.pager, jumpForm]);
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
    if (patch.data !== undefined) this.data = patch.data;
    if (patch.total !== undefined) this.total = patch.total;
    if (patch.query !== undefined) {
      queryChanged = !queryEquals(patch.query, this.query);
      this.query = patch.query;
    }
    if (patch.isLoading !== undefined) this.isLoading = patch.isLoading;
    if (patch.error !== undefined) this.isError = patch.error;

    if (queryChanged && this.options.endpoint !== undefined) {
      void this.fetchFromEndpoint();
      return;
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

  private visibleCols(): TableXVanillaColumn<TData>[] {
    return visibleColumns(this.columns, this.hidden);
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
    this.renderHead();
    this.renderBody();
    this.renderCards();
    this.renderFooter();

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
      replaceChildren(this.root, [this.toolbar, this.tableWrap, this.cards, this.footer]);
    }
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

    this.densityLabel.textContent = formatMessage(this.locale.densityButton, {
      density: this.density,
    });
    this.exportLabel.textContent = this.isExporting
      ? this.locale.exportingButton
      : this.locale.exportButton;

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

    for (const column of this.columns) {
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
            this.render();
          },
          visible,
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

  // ---- Table head ----------------------------------------------------------

  private renderHead(): void {
    const cells: ElementChild[] = [];

    if (this.selectionEnabled()) {
      if (this.isSingleSelection()) {
        cells.push(el("th", { class: "tbx-th tbx-th--select" }));
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
        cells.push(el("th", { class: "tbx-th tbx-th--select" }, [checkbox]));
      }
    }

    if (this.showSerial()) {
      cells.push(el("th", { class: "tbx-th tbx-th--serial", text: this.locale.serialHeader }));
    }

    const sorts = this.query.sort;

    for (const column of this.visibleCols()) {
      const id = getColumnId(column);
      const sortable = isSortable(column);
      const filterable = isFilterable(column, this.options.enableColumnFilters === true);
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
          ? `${customWidth}px`
          : meta.width === undefined
            ? undefined
            : `${meta.width}px`;

      const th = el(
        "th",
        {
          class: sortable ? "tbx-th tbx-th--sortable" : "tbx-th",
          attrs: {
            scope: "col",
            "aria-sort": sortable ? ariaSort : undefined,
            tabindex: sortable ? "0" : undefined,
            "data-tbx-focus": sortable ? `sort:${id}` : undefined,
          },
          style: {
            width: effectiveWidth,
            minWidth: meta.width === undefined ? `${meta.minWidth ?? 120}px` : undefined,
            textAlign: align,
          },
        },
        [inner],
      );

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
            this.render();
          };
          document.body?.classList.add("tbx-resizing");
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
        });
        th.appendChild(handle);
      }

      cells.push(th);
    }

    replaceChildren(this.thead, [el("tr", {}, cells)]);
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
      cols.length + (this.showSerial() ? 1 : 0) + (this.selectionEnabled() ? 1 : 0);

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

    const rows = this.data.map((row, index) => this.buildRow(row, index, cols));
    replaceChildren(this.tbody, rows);
  }

  private buildRow(
    row: TData,
    index: number,
    cols: readonly TableXVanillaColumn<TData>[],
  ): HTMLTableRowElement {
    const id = this.rowId(row);
    const selected = this.selected.has(id);
    const clickable = this.options.onRowClick !== undefined;

    const classes = ["tbx-row"];
    if (selected) classes.push("tbx-row--selected");
    if (clickable) classes.push("tbx-row--clickable");

    const cells: ElementChild[] = [];

    if (this.selectionEnabled()) {
      cells.push(
        el("td", { class: "tbx-td tbx-td--select" }, [
          this.buildRowCheckbox(id, selected, `row-select:${id}`),
        ]),
      );
    }

    if (this.showSerial()) {
      cells.push(
        el("td", {
          class: "tbx-td tbx-td--serial",
          text: String(serialNumber(this.currentPage(), this.query.pageSize, index)),
        }),
      );
    }

    for (const column of cols) {
      const meta = column.meta ?? {};
      const td = el("td", { class: "tbx-td", style: { textAlign: meta.align ?? "left" } });
      this.renderCellInto(td, column, row);
      cells.push(td);
    }

    const tr = el("tr", { class: classes.join(" ") }, cells);
    if (clickable) {
      tr.addEventListener("click", () => this.options.onRowClick?.(row));
    }
    return tr;
  }

  /**
   * A checkbox plus the click guard that keeps selection from firing row click.
   * The guard lives on the checkbox itself rather than the cell so it behaves
   * the same in the table and in the mobile card, where there is no cell.
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
    const placeholder = meta.filterPlaceholder || formatMessage(this.locale.filterColumnPlaceholder, { column: title });

    const input = el("input", {
      class: "tbx-filter-popover-input",
      attrs: {
        type: "text",
        placeholder: placeholder,
        value: currentValue ?? "",
        "aria-label": `Filter ${title}`,
      },
    }) as HTMLInputElement;

    setTimeout(() => {
      input.focus?.();
      input.select?.();
    }, 10);

    const apply = (valToApply?: string) => {
      const val = (valToApply !== undefined ? valToApply : input.value).trim();
      this.openFilterColumn = null;
      this.applyQuery(withFilter(this.query, id, val || undefined));
    };

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply();
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
      apply();
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
   * Write one cell's content.
   *
   * Values go in through `textContent`; the only way an element reaches a cell
   * is a custom `cell` renderer returning a Node the consumer built. That is
   * the whole XSS story for this package — there is no HTML-parsing path for
   * row data to travel down.
   */
  private renderCellInto(host: HTMLElement, column: TableXVanillaColumn<TData>, row: TData): void {
    const value = getCellValue(column, row);
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

    this.rowsSelect.value = String(this.query.pageSize);
    this.jumpInput.max = String(totalPages);
    if (document.activeElement !== this.jumpInput) this.jumpInput.value = String(page);

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
