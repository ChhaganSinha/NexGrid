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
  DEFAULT_ROW_CAP,
  DEFAULT_VIRTUAL_HEIGHT,
  PAGE_SIZES,
  buildNestedGroupItems,
  buildQueryUrl,
  coerceEditedValue,
  collectInitialExpandedTreeIds,
  computeAggregation,
  computeRangeStats,
  computeVirtualWindow,
  copyToClipboard,
  defaultQuery,
  downloadCsv,
  downloadExcel,
  downloadPdf,
  fetchAllPages,
  filePrefixFromCaption,
  flattenTreeRows,
  formatFilterPillValue,
  formatMessage,
  formatRangeTsv,
  getCellText,
  getCellValue,
  getColumnId,
  getColumnTitle,
  getFilterField,
  getSortField,
  getPageNumbers,
  getRecordRange,
  groupRows,
  initialHiddenColumns,
  isCellInRange,
  isEditable,
  isExportable,
  isFilterable,
  isHideable,
  isMultiSelectFilter,
  isPageSize,
  isPinned,
  isSortable,
  isStructuralColumn,
  loadSavedViews,
  moveFocusCoord,
  normalizeCellRange,
  normalizeGroupBy,
  parseClipboardTsv,
  parseMultiFilterValues,
  primarySort,
  removeSavedView,
  reorderArrayItem,
  resolveLocale,
  searchableColumnIds,
  selectContiguousRowIds,
  serialNumber,
  serializeMultiFilterValues,
  timestampedFilename,
  toExportColumns,
  totalPagesFor,
  upsertSavedView,
  validateEditedCell,
  visibleColumns,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withSort,
  withToggledMultiSort,
  withToggledSort,
  clearGridState,
  loadGridState,
  saveGridState,
  queryClientData,
  flattenColumns,
  hasHeaderGroups,
  buildHeaderRows,
  type CellCoord,
  type ClientQueryOptions,
  type ContextMenuItem,
  type Density,
  type NormalizedCellRange,
  type PagedResponse,
  type QueryState,
  type SavedGridView,
  type TableXLocale,
  type TreeRowNode,
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

/** Toolbar dropdowns, keyed so only one can be open at a time. */
type MenuName = "columns" | "density" | "export" | "views";

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
  private allAcrossSelected = false;
  private isLoading: boolean;
  private isError: boolean;
  private isExporting = false;
  private openMenu: MenuName | null = null;
  private openFilterColumn: string | null = null;
  private mountedFilterPopoverKey: string | null = null;
  private activeFilterPopoverEl: HTMLElement | null = null;
  private headerPointerDown: {
    colId: string;
    sortField: string;
    x: number;
    y: number;
    shiftKey: boolean;
    dropped: boolean;
  } | null = null;
  private readonly columnWidths: Record<string, number> = {};
  private pinnedColumns: Record<string, "left" | "right" | "none"> = {};
  private activeGroupBy: string[] = [];
  private collapsedGroups = new Set<string>();
  private treeExpandedIds = new Set<string>();
  private savedViewsList: SavedGridView[] = [];
  private focusedCell: CellCoord | null = null;
  private rangeAnchor: CellCoord | null = null;
  private cellRange: NormalizedCellRange | null = null;
  private isDraggingRange = false;
  private isFillingRange = false;
  private lastSelectedRowIndex: number | null = null;
  private activeContextMenuEl: HTMLElement | null = null;
  private editingRowId: string | null = null;
  private rowEditDraft: Record<string, unknown> = {};
  private cellValidationError: string | null = null;
  private dirtyCells = new Set<string>();
  private draggedRowIndex: number | null = null;
  private hasMore = false;
  private isLoadingMore = false;
  private nextCursor: string | null = null;
  private focusMenuOnRender = false;
  private mounted: "grid" | "error" | null = null;
  private destroyed = false;

  // ---- Async bookkeeping ---------------------------------------------------
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;
  private inFlight: AbortController | null = null;
  private readonly globalListeners: GlobalListener[] = [];
  private activeResizeCleanup: (() => void) | null = null;

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
  private readonly selectAllBanner: HTMLDivElement;
  private readonly infiniteFooter: HTMLDivElement;
  private expandedRows = new Set<string>();
  private editingCell: { rowId: string; columnId: string } | null = null;
  private draggedColumnId: string | null = null;
  private virtualScrollTop = 0;

  constructor(container: HTMLElement, options: TableXOptions<TData>) {
    this.options = options;
    this.locale = resolveLocale(options.locale);
    this.caption = options.caption;
    this.rowId = options.getRowId ?? defaultGetRowId;
    this.uid = `tbx-${++instanceCounter}`;

    this.columns = options.columns;
    this.query = options.query ?? defaultQuery();
    this.density = options.density ?? "default";
    this.activeGroupBy = normalizeGroupBy(options.groupBy);
    this.hasMore = options.hasMore ?? false;
    this.isLoadingMore = options.isLoadingMore ?? false;
    this.nextCursor = options.nextCursor ?? null;
    this.savedViewsList = options.savedViews
      ? [...options.savedViews]
      : loadSavedViews(options.storageKey);
    this.hidden = initialHiddenColumns(flattenColumns(this.columns));
    this.isLoading = options.isLoading ?? false;
    this.isError = options.error ?? false;

    this.isClientSide =
      options.clientSidePagination === true ||
      options.paginationMode === "client" ||
      (options.endpoint === undefined && options.onQueryChange === undefined);
    this.rawClientData = options.data ? [...options.data] : [];

    if (options.storageKey) {
      const persisted = loadGridState(options.storageKey);
      if (persisted) {
        if (persisted.density) this.density = persisted.density;
        if (persisted.columnWidths) Object.assign(this.columnWidths, persisted.columnWidths);
        if (persisted.pinnedColumns && typeof persisted.pinnedColumns === "object") {
          this.pinnedColumns = { ...persisted.pinnedColumns };
        }
        if (persisted.groupBy !== undefined) {
          this.activeGroupBy = normalizeGroupBy(persisted.groupBy);
        }
        if (persisted.hiddenColumns && Array.isArray(persisted.hiddenColumns)) {
          const hiddenMap: Record<string, boolean> = {};
          for (const col of flattenColumns(this.columns)) {
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

    if (this.isClientSide && this.rawClientData.length > 0) {
      const paged = queryClientData(this.rawClientData, this.query, this.clientQueryOptions());
      this.data = paged.items;
      this.total = paged.total;
    } else {
      this.data = options.data ?? [];
      this.total = options.total ?? 0;
    }

    if (this.isTreeEnabled() && (options.defaultExpandedDepth ?? 0) !== 0) {
      this.treeExpandedIds = collectInitialExpandedTreeIds(
        this.data,
        options.defaultExpandedDepth ?? 0,
        {
          childrenKey: options.childrenKey,
          getSubRows: options.getSubRows,
          getRowId: this.rowId,
        },
      );
    }

    this.filterPillsBar = el("div", { class: "tbx-filter-pills-bar", style: { display: "none" } });
    this.selectAllBanner = el("div", {
      class: "tbx-select-all-banner",
      attrs: { role: "status", "aria-live": "polite" },
      style: { display: "none" },
    });
    this.infiniteFooter = el("div", { class: "tbx-infinite-footer", style: { display: "none" } });

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
      input.addEventListener("keydown", (event: Event) => {
        const kEvent = event as KeyboardEvent;
        if (kEvent.key === "Escape" && input.value !== "") {
          input.value = "";
          this.syncSearchClear();
          this.scheduleSearch("");
        }
      });
      this.searchInput = input;
      this.searchWrap = el("div", { class: "tbx-search" }, [searchIcon(), input]);
      startGroup.appendChild(this.searchWrap);
    }

    if (options.enableSavedViews) {
      const viewsBtn = this.createMenuButton(
        "views",
        slidersIcon(),
        this.locale.viewsButton ?? "Views",
        chevronDownIcon("tbx-icon tbx-chevron"),
      );
      endGroup.appendChild(this.wrapMenu("views", viewsBtn));
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
      const mode = options.quickExport
        ? (typeof options.quickExport === "string" ? options.quickExport : "excel")
        : (options.exportMode ?? "menu");

      if (mode === "excel" || mode === "csv" || mode === "pdf") {
        const btnLabel =
          mode === "excel"
            ? (this.locale.exportExcelButton ?? "Export Excel")
            : mode === "pdf"
              ? (this.locale.exportPdfButton ?? "Export PDF")
              : (this.locale.exportCsvButton ?? "Export CSV");
        this.exportLabel = el("span", { text: btnLabel });
        const exportButton = el(
          "button",
          {
            class: "tbx-btn tbx-btn--export",
            attrs: {
              type: "button",
              id: `${this.uid}-export-btn`,
              "aria-label": btnLabel,
            },
          },
          [downloadTrayIcon(), this.exportLabel],
        );
        exportButton.addEventListener("click", () => void this.runExport(mode));
        this.menuButtons.set("export", exportButton);
        endGroup.appendChild(exportButton);
      } else if (mode === "split") {
        const btnLabel = this.locale.exportExcelButton ?? "Export Excel";
        this.exportLabel = el("span", { text: btnLabel });
        const mainBtn = el(
          "button",
          {
            class: "tbx-btn tbx-btn--export",
            attrs: {
              type: "button",
              id: `${this.uid}-export-btn`,
              "aria-label": btnLabel,
            },
          },
          [downloadTrayIcon(), this.exportLabel],
        );
        mainBtn.addEventListener("click", () => void this.runExport("excel"));

        const chevronBtn = el(
          "button",
          {
            class: "tbx-btn tbx-btn--export",
            attrs: {
              type: "button",
              id: `${this.uid}-export-chevron-btn`,
              "aria-haspopup": "menu",
              "aria-expanded": "false",
              "aria-label": "More export options",
            },
          },
          [chevronDownIcon("tbx-icon tbx-chevron")],
        );
        chevronBtn.addEventListener("click", () => this.toggleMenu("export"));
        this.menuButtons.set("export", mainBtn);

        const splitWrap = el("div", { class: "tbx-split-btn" }, [mainBtn, chevronBtn]);
        const wrap = el("div", { class: "tbx-menu-wrap" }, [splitWrap]);
        this.menuWraps.set("export", wrap);
        endGroup.appendChild(wrap);
      } else {
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
    this.tableWrap = el(
      "div",
      {
        class: options.enableVirtualization
          ? "tbx-table-wrap tbx-table-wrap--virtual"
          : "tbx-table-wrap",
        style: options.enableVirtualization
          ? { maxHeight: `${options.virtualHeight ?? DEFAULT_VIRTUAL_HEIGHT}px` }
          : undefined,
      },
      [table],
    );

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
      this.rowsSelect.addEventListener("change", (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
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
        event.stopPropagation();
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
    this.addGlobalListener(document, "pointerup", () => {
      this.isDraggingRange = false;
      this.isFillingRange = false;
    });
    this.addGlobalListener(document, "keydown", this.handleDocumentKeyDown);
    this.root.addEventListener("keydown", (e) => this.handleGridKeyDown(e));
    this.root.addEventListener("paste", (e) => this.handleGridPaste(e));
    this.tableWrap.addEventListener("scroll", () => {
      this.closeContextMenu();
      if (this.options.enableVirtualization) {
        const nextTop = this.tableWrap.scrollTop ?? 0;
        if (Math.abs(nextTop - this.virtualScrollTop) >= 1) {
          this.virtualScrollTop = nextTop;
          this.renderBody();
        }
      }
      if (
        this.isInfiniteMode() &&
        this.hasMore &&
        !this.isLoading &&
        !this.isLoadingMore &&
        typeof this.tableWrap.scrollHeight === "number"
      ) {
        const remaining =
          this.tableWrap.scrollHeight -
          (this.tableWrap.scrollTop ?? 0) -
          (this.tableWrap.clientHeight ?? 0);
        if (remaining <= 120) {
          this.options.onLoadMore?.(this.nextCursor);
        }
      }
      if (this.openFilterColumn !== null) {
        this.repositionActiveFilterPopover();
      }
    });
    if (typeof window !== "undefined") {
      this.addGlobalListener(window, "resize", () => {
        if (this.openFilterColumn !== null) {
          this.repositionActiveFilterPopover();
        }
      });
    }

    container.appendChild(this.root);
    this.render();

    if (options.endpoint !== undefined) void this.fetchFromEndpoint();
  }

  private clientQueryOptions(extra?: Partial<ClientQueryOptions<TData>>): ClientQueryOptions<TData> {
    const searchFields =
      this.options.searchableFields ??
      (searchableColumnIds(this.columns, this.hidden) as (keyof TData & string)[]);
    const unpaginatedVirtual =
      this.options.enableVirtualization === true &&
      (this.options.enablePagination === false || this.options.showPagination === false);
    return {
      columns: this.columns,
      ...(searchFields.length > 0 ? { searchableFields: searchFields } : {}),
      ...(unpaginatedVirtual ? { paginate: false } : {}),
      ...extra,
    };
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
        const paged = queryClientData(
          this.rawClientData,
          patch.query ?? this.query,
          this.clientQueryOptions(),
        );
        this.data = paged.items;
        this.total = paged.total;
      } else {
        this.data = patch.data;
      }
    }
    if (patch.total !== undefined && !this.isClientSide) this.total = patch.total;
    if (patch.query !== undefined) {
      queryChanged = !queryEquals(patch.query, this.query);
      const filterChanged = this.filterFingerprint(patch.query) !== this.filterFingerprint(this.query);
      this.query = patch.query;
      if (filterChanged && this.allAcrossSelected) {
        this.allAcrossSelected = false;
        this.emitSelection();
      }
      if (this.isClientSide && patch.data === undefined) {
        const paged = queryClientData(this.rawClientData, this.query, this.clientQueryOptions());
        this.data = paged.items;
        this.total = paged.total;
      }
    }
    if (patch.isLoading !== undefined) this.isLoading = patch.isLoading;
    if (patch.error !== undefined) this.isError = patch.error;
    if (patch.hasMore !== undefined) this.hasMore = patch.hasMore;
    if (patch.isLoadingMore !== undefined) this.isLoadingMore = patch.isLoadingMore;
    if (patch.nextCursor !== undefined) this.nextCursor = patch.nextCursor;
    if (patch.groupBy !== undefined) {
      this.activeGroupBy = normalizeGroupBy(patch.groupBy);
      this.collapsedGroups.clear();
    }

    if (queryChanged && this.options.endpoint !== undefined) {
      void this.fetchFromEndpoint();
      return;
    }
    this.render();
  }

  setData(data: TData[]): void {
    if (this.destroyed) return;
    this.rawClientSideSync(data);
    this.render();
  }

  private rawClientSideSync(data?: TData[]): void {
    if (data !== undefined) {
      this.rawClientData = [...data];
    }
    if (this.isClientSide) {
      const paged = queryClientData(this.rawClientData, this.query, this.clientQueryOptions());
      this.data = paged.items;
      this.total = paged.total;
    } else if (data !== undefined) {
      this.data = data;
    }
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

  isAllAcrossSelected(): boolean {
    return this.allAcrossSelected;
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
    this.activeResizeCleanup?.();
    this.activeResizeCleanup = null;

    for (const listener of this.globalListeners) {
      listener.target.removeEventListener(listener.type, listener.handler);
    }
    this.globalListeners.length = 0;

    this.root.remove();
    this.closeContextMenu();
    this.mounted = null;
  }

  // =========================================================================
  // Wiring helpers
  // =========================================================================

  private addGlobalListener(target: EventTarget, type: string, handler: EventListener): void {
    if (!target || typeof (target as unknown as { addEventListener?: unknown }).addEventListener !== "function") return;
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
    if (this.activeContextMenuEl) {
      if (!(target instanceof Node && this.activeContextMenuEl.contains(target))) {
        this.closeContextMenu();
      }
    }
    if (this.openMenu !== null) {
      const wrap = this.menuWraps.get(this.openMenu);
      if (!(wrap && target instanceof Node && wrap.contains(target))) {
        this.setOpenMenu(null);
      }
    }
    if (this.openFilterColumn !== null) {
      const el = target instanceof Element ? target : (target as Node)?.parentElement;
      const isInside = el
        ? Boolean(el.closest(".tbx-col-filter-wrap") || el.closest(".tbx-filter-popover"))
        : false;
      if (!isInside) {
        this.openFilterColumn = null;
        this.render();
      }
    }
  };

  private readonly handleDocumentKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    if (this.activeContextMenuEl) {
      this.closeContextMenu();
      return;
    }
    if (this.editingRowId !== null) {
      this.editingRowId = null;
      this.rowEditDraft = {};
      this.cellValidationError = null;
      this.render();
      return;
    }
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

  private filterFingerprint(q: QueryState): string {
    return JSON.stringify([q.q ?? "", q.filter ?? {}]);
  }

  private applyQuery(next: QueryState): void {
    if (queryEquals(next, this.query)) {
      this.render();
      return;
    }
    const filterChanged = this.filterFingerprint(next) !== this.filterFingerprint(this.query);
    this.query = next;
    if (this.options.enableVirtualization) {
      this.virtualScrollTop = 0;
      if (this.tableWrap) this.tableWrap.scrollTop = 0;
    }
    if (filterChanged && this.allAcrossSelected) {
      this.allAcrossSelected = false;
      this.emitSelection();
    }
    if (this.options.endpoint !== undefined) {
      this.options.onQueryChange?.(next);
      void this.fetchFromEndpoint();
      return;
    }
    if (this.isClientSide) {
      const paged = queryClientData(this.rawClientData, this.query, this.clientQueryOptions());
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
    if (this.options.fetchAllData) {
      this.isExporting = true;
      this.render();
      this.notify(
        "info",
        formatMessage(this.locale.exportFetchingAll, { total: this.total.toLocaleString() }),
      );
      try {
        const rows = await this.options.fetchAllData(this.query);
        return Array.isArray(rows) ? (rows as TData[]) : this.data;
      } catch {
        this.notify("error", this.locale.exportFetchFailed);
        return this.data;
      } finally {
        this.isExporting = false;
        this.render();
      }
    }

    const allData =
      this.options.allData ?? (this.isClientSide ? this.rawClientData : undefined);
    if (allData && allData.length > 0) {
      const full = queryClientData(
        allData,
        this.query,
        this.clientQueryOptions({ paginate: false }),
      );
      return full.items;
    }

    if (this.options.fetchPage) {
      this.isExporting = true;
      this.render();
      this.notify(
        "info",
        formatMessage(this.locale.exportFetchingAll, { total: this.total.toLocaleString() }),
      );
      try {
        const cap = this.options.maxExportRows ?? DEFAULT_ROW_CAP;
        const collected = await fetchAllPages<TData>(
          (page, pageSize) => this.options.fetchPage!(page, pageSize, this.query),
          cap,
        );
        return cap > 0 && collected.items.length > cap ? collected.items.slice(0, cap) : collected.items;
      } catch {
        this.notify("error", this.locale.exportFetchFailed);
        return this.data;
      } finally {
        this.isExporting = false;
        this.render();
      }
    }

    const endpoint = this.options.fetchEndpoint ?? this.options.endpoint;
    if (this.data.length >= this.total || endpoint === undefined) return this.data;

    this.isExporting = true;
    this.render();
    this.notify(
      "info",
      formatMessage(this.locale.exportFetchingAll, { total: this.total.toLocaleString() }),
    );

    try {
      const cap = this.options.maxExportRows ?? DEFAULT_ROW_CAP;
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
      }, cap);
      return cap > 0 && collected.items.length > cap ? collected.items.slice(0, cap) : collected.items;
    } catch {
      this.notify("error", this.locale.exportFetchFailed);
      return this.data;
    } finally {
      this.isExporting = false;
      this.render();
    }
  }

  private async runExport(format: "excel" | "csv" | "pdf" | "clipboard"): Promise<void> {
    if (this.isExporting) return;
    this.setOpenMenu(null, { returnFocusTo: "export" });

    const { onExportAll } = this.options;
    let rows: TData[];
    if (onExportAll) {
      try {
        const customRows = await onExportAll(format);
        if (Array.isArray(customRows)) {
          rows = customRows as TData[];
        } else {
          return;
        }
      } catch {
        this.notify("error", this.locale.exportFetchFailed);
        return;
      }
    } else {
      rows = await this.collectExportRows();
    }

    if (rows.length === 0) {
      this.notify("error", this.locale.exportNoData);
      return;
    }

    await this.exportRowsWithFormat(format, rows);
  }

  private async runBulkExport(format: "excel" | "csv" | "pdf"): Promise<void> {
    if (this.isExporting) return;
    if (this.allAcrossSelected) {
      await this.runExport(format);
      return;
    }
    const pool = this.options.allData ?? (this.isClientSide ? this.rawClientData : this.data);
    const selectedRows = pool.filter((r) => this.selected.has(this.rowId(r)));
    if (selectedRows.length > 0) {
      await this.exportRowsWithFormat(format, selectedRows);
      return;
    }
    await this.runExport(format);
  }

  private async exportRowsWithFormat(
    format: "excel" | "csv" | "pdf" | "clipboard",
    rows: readonly TData[],
  ): Promise<void> {
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

    if (format === "pdf") {
      const count = downloadPdf({
        filename: timestampedFilename(prefix),
        caption: this.caption,
        rows,
        columns,
        badgeRules: this.options.badgeRules,
        serialHeader: this.locale.serialHeader,
      });
      this.notify(
        "success",
        formatMessage(
          this.locale.exportPdfSuccess ?? "Exported {count} records to PDF (.pdf)",
          { count: count.toLocaleString() },
        ),
      );
      return;
    }

    if (format === "excel") {
      const count = downloadExcel({
        filename: timestampedFilename(prefix),
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

  private isTreeEnabled(): boolean {
    return this.options.enableTreeData === true || typeof this.options.getSubRows === "function";
  }

  private isInfiniteMode(): boolean {
    return this.options.enableInfiniteScroll === true || this.options.paginationMode === "infinite";
  }

  private displayedDataList(): TData[] {
    if (this.isTreeEnabled()) {
      return flattenTreeRows(this.data, {
        childrenKey: this.options.childrenKey,
        getSubRows: this.options.getSubRows,
        getRowId: this.rowId,
        expandedIds: this.treeExpandedIds,
      }).map((n) => n.row);
    }
    return this.data;
  }

  private pageRowIds(): string[] {
    return this.displayedDataList().map((row) => this.rowId(row));
  }

  private isSingleSelection(): boolean {
    return this.options.selectionMode === "single";
  }

  private isRowSelected(id: string): boolean {
    return this.allAcrossSelected || this.selected.has(id);
  }

  private effectiveSelectedCount(): number {
    return this.allAcrossSelected ? Math.max(this.total, this.selected.size) : this.selected.size;
  }

  private selectAllAcrossPages(): void {
    if (this.isSingleSelection()) return;
    this.allAcrossSelected = true;
    const pool = this.options.allData ?? (this.isClientSide ? this.rawClientData : undefined);
    if (pool && pool.length > 0) {
      const full = queryClientData(pool, this.query, this.clientQueryOptions({ paginate: false }));
      for (const row of full.items) {
        this.selected.add(this.rowId(row));
      }
    } else {
      for (const id of this.pageRowIds()) {
        this.selected.add(id);
      }
    }
    this.emitSelection();
    this.render();
  }

  private clearAllSelection(): void {
    this.selected.clear();
    this.allAcrossSelected = false;
    this.emitSelection();
    this.render();
  }

  private toggleSelectAll(): void {
    if (this.isSingleSelection()) return;
    if (this.allAcrossSelected) {
      this.clearAllSelection();
      return;
    }
    const ids = this.pageRowIds();
    const allSelected = ids.length > 0 && ids.every((id) => this.selected.has(id));
    for (const id of ids) {
      if (allSelected) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.allAcrossSelected = false;
    this.emitSelection();
    this.render();
  }

  private toggleSelectRow(id: string): void {
    if (this.isSingleSelection()) {
      this.allAcrossSelected = false;
      if (this.selected.has(id)) this.selected.clear();
      else {
        this.selected.clear();
        this.selected.add(id);
      }
    } else if (this.allAcrossSelected) {
      for (const pageId of this.pageRowIds()) {
        this.selected.add(pageId);
      }
      this.selected.delete(id);
      this.allAcrossSelected = false;
    } else {
      if (this.selected.has(id)) this.selected.delete(id);
      else this.selected.add(id);
    }
    this.emitSelection();
    this.render();
  }

  private emitSelection(): void {
    this.options.onSelectionChange?.(Array.from(this.selected), this.allAcrossSelected);
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  private render(): void {
    if (this.destroyed) return;

    const focusKey = this.captureFocusKey();
    const docEl = typeof document !== "undefined" ? document.documentElement : null;
    const scrollY = typeof window !== "undefined" ? (window.scrollY ?? docEl?.scrollTop ?? 0) : 0;
    const scrollX = typeof window !== "undefined" ? (window.scrollX ?? docEl?.scrollLeft ?? 0) : 0;

    // Prevent table height from collapsing during loading to avoid viewport scroll clamping
    if (this.isLoading) {
      if (typeof this.tableWrap?.getBoundingClientRect === "function") {
        const rect = this.tableWrap.getBoundingClientRect();
        if (rect && rect.height > 0) {
          this.tableWrap.style.minHeight = `${rect.height}px`;
        }
      }
    } else {
      if (this.tableWrap?.style?.minHeight) {
        this.tableWrap.style.minHeight = "";
      }
    }

    this.root.dataset["density"] = this.density;

    if (this.isError) {
      this.mount("error");
      this.restoreFocus(focusKey);
      return;
    }

    this.mount("grid");
    this.renderToolbar();
    this.renderFilterPills();
    this.renderSelectAllBanner();
    this.renderHead();
    this.renderFilterPopover();
    this.renderBody();
    this.renderSummary();
    this.renderInfiniteFooter();
    this.renderCards();
    this.renderFooter();
    this.renderBulkBar();

    if (this.focusMenuOnRender) {
      this.focusMenuOnRender = false;
      const wrap = this.openMenu === null ? null : this.menuWraps.get(this.openMenu);
      const first = wrap?.querySelector<HTMLElement>('[role^="menuitem"]');
      if (first) {
        try {
          first.focus({ preventScroll: true });
        } catch {
          first.focus();
        }
        return;
      }
    }
    this.restoreFocus(focusKey);

    // If DOM replacement or focus shift caused the window scroll position to jump, restore it
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      const currentScrollY = window.scrollY ?? docEl?.scrollTop ?? 0;
      if (Math.abs(currentScrollY - scrollY) > 5) {
        try {
          window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" as ScrollBehavior });
        } catch {
          window.scrollTo(scrollX, scrollY);
        }
      }
    }
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
    this.mountedFilterPopoverKey = null;
    this.activeFilterPopoverEl = null;
    if (mode === "error") {
      replaceChildren(this.root, [this.buildErrorCard()]);
    } else {
      const children: HTMLElement[] = [];
      if (this.options.showToolbar !== false) children.push(this.toolbar);
      if (this.options.showFilterPills !== false) children.push(this.filterPillsBar);
      children.push(this.selectAllBanner, this.tableWrap, this.infiniteFooter, this.cards);
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
      pinnedColumns: { ...this.pinnedColumns },
      groupBy: [...this.activeGroupBy],
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
    this.pinnedColumns = {};
    this.activeGroupBy = normalizeGroupBy(this.options.groupBy);
    this.collapsedGroups.clear();
    this.columns = [...this.options.columns];
    this.hidden = initialHiddenColumns(this.leafCols());
    if (this.isClientSide) {
      this.rawClientSideSync();
    }
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
      if (val === undefined || val.trim() === "") continue;
      const lowerKey = key.toLowerCase();
      const col = this.leafCols().find(
        (c) =>
          getColumnId(c).toLowerCase() === lowerKey ||
          getFilterField(c).toLowerCase() === lowerKey,
      );
      const title = col ? (getColumnTitle(col) || key) : key;
      const pill = el("div", { class: "tbx-filter-pill" }, [
        el("span", { class: "tbx-filter-pill-label", text: `${title}:` }),
        el("span", { class: "tbx-filter-pill-val", text: formatFilterPillValue(String(val)) }),
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
        filter: undefined,
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
    return (
      active.dataset["tbxFocus"] ??
      active.getAttribute("data-tbx-focus") ??
      active.dataset["nxgFocus"] ??
      null
    );
  }

  private restoreFocus(key: string | null): void {
    if (key === null) return;
    const candidates = this.root.querySelectorAll<HTMLElement>("[data-tbx-focus]");
    for (const candidate of Array.from(candidates)) {
      const match =
        candidate.dataset["tbxFocus"] === key ||
        candidate.getAttribute("data-tbx-focus") === key ||
        candidate.dataset["nxgFocus"] === key;
      if (match) {
        try {
          candidate.focus({ preventScroll: true });
        } catch {
          candidate.focus();
        }
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
      const mode = this.options.quickExport
        ? (typeof this.options.quickExport === "string" ? this.options.quickExport : "excel")
        : (this.options.exportMode ?? "menu");

      let defaultLabel = this.locale.exportButton;
      if (mode === "excel" || mode === "split") {
        defaultLabel = this.locale.exportExcelButton ?? "Export Excel";
      } else if (mode === "csv") {
        defaultLabel = this.locale.exportCsvButton ?? "Export CSV";
      } else if (mode === "pdf") {
        defaultLabel = this.locale.exportPdfButton ?? "Export PDF";
      }

      this.exportLabel.textContent = this.isExporting
        ? this.locale.exportingButton
        : defaultLabel;
    }

    const exportButton = this.menuButtons.get("export");
    if (exportButton) exportButton.disabled = this.isExporting;

    this.syncMenu("views", () => this.buildViewsMenu());
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
            if (this.isClientSide) {
              this.rawClientSideSync();
            }
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
          [rotateCcwIcon(), el("span", { class: "tbx-menu-item--reset", text: this.locale.resetView || "Reset to default view" })],
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

  private buildViewsMenu(): HTMLElement {
    const input = el("input", {
      class: "tbx-views-input",
      attrs: {
        type: "text",
        placeholder: this.locale.viewNamePlaceholder ?? "View name…",
        "aria-label": this.locale.viewNamePlaceholder ?? "View name…",
      },
    }) as HTMLInputElement;

    const commitSave = () => {
      const name = input.value.trim();
      if (!name) return;
      this.savedViewsList = upsertSavedView(
        this.savedViewsList,
        {
          name,
          query: this.query,
          hiddenColumns: { ...this.hidden },
          pinnedColumns: { ...this.pinnedColumns },
          columnOrder: this.columns.map(getColumnId).filter(Boolean) as string[],
          groupBy: [...this.activeGroupBy],
          density: this.density,
        },
        this.options.storageKey,
      );
      this.options.onSavedViewsChange?.([...this.savedViewsList]);
      input.value = "";
      this.renderToolbar();
    };

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitSave();
      }
    });

    const saveBtn = el("button", {
      class: "tbx-views-save-btn",
      attrs: { type: "button" },
      text: this.locale.saveCurrentView ?? "Save view",
    });
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      commitSave();
    });

    const items: ElementChild[] = [
      el("div", { class: "tbx-views-save-row" }, [input, saveBtn]),
      el("div", { class: "tbx-menu-separator" }),
    ];

    if (this.savedViewsList.length === 0) {
      items.push(
        el("div", {
          class: "tbx-views-empty",
          text: this.locale.noSavedViews ?? "No saved views yet",
        }),
      );
    } else {
      for (const view of this.savedViewsList) {
        const selectBtn = this.menuItem(
          "menuitem",
          `menu:views:${view.id}`,
          [el("span", { text: view.name })],
          () => {
            if (view.density) this.density = view.density;
            if (view.hiddenColumns) this.hidden = { ...view.hiddenColumns };
            if (view.pinnedColumns) this.pinnedColumns = { ...view.pinnedColumns };
            if (view.groupBy) this.activeGroupBy = [...view.groupBy];
            this.collapsedGroups.clear();
            this.setOpenMenu(null, { returnFocusTo: "views" });
            this.applyQuery(view.query);
          },
        );

        const delBtn = el(
          "button",
          {
            class: "tbx-views-delete-btn",
            attrs: { type: "button", "aria-label": `Delete view ${view.name}` },
          },
          [xIcon("tbx-icon")],
        );
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.savedViewsList = removeSavedView(
            this.savedViewsList,
            view.id,
            this.options.storageKey,
          );
          this.options.onSavedViewsChange?.([...this.savedViewsList]);
          this.renderToolbar();
        });

        items.push(el("div", { class: "tbx-views-item-row" }, [selectBtn, delBtn]));
      }
    }

    return this.buildMenu("views", "tbx-views-menu", items);
  }

  private buildExportMenu(): HTMLElement {
    const option = (
      key: "excel" | "csv" | "pdf" | "clipboard",
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
        "pdf",
        fileTextIcon("tbx-icon--pdf"),
        this.locale.exportPdfTitle ?? "PDF Report (.pdf)",
        this.locale.exportPdfSubtitle ?? "Printable multi-page landscape table",
      ),
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
    const hasLeftPinned = visibleCols.some((c) => isPinned(c, this.pinnedColumns) === "left");

    if (hasLeftPinned) {
      if (this.options.enableRowReorder) {
        leftOffsets.set("__row_drag", currentLeft);
        currentLeft += 36;
        lastLeftPinnedId = "__row_drag";
      }

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
        const pin = isPinned(col, this.pinnedColumns);
        const width = this.columnWidths[id] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
        if (pin === "left") {
          leftOffsets.set(id, currentLeft);
          currentLeft += width;
          lastLeftPinnedId = id;
        }
      }
    }

    let currentRight = 0;
    let firstRightPinnedId: string | null = null;
    for (let i = visibleCols.length - 1; i >= 0; i--) {
      const col = visibleCols[i];
      if (!col) continue;
      const id = getColumnId(col);
      const pin = isPinned(col, this.pinnedColumns);
      const width = this.columnWidths[id] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
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

    if (this.options.enableRowReorder) {
      const th = el("th", {
        class: "tbx-th tbx-th--row-drag",
        style: { width: "36px" },
        attrs: rowSpan > 1 ? { rowspan: rowSpan } : {},
      });
      if (leftOffsets.has("__row_drag")) {
        th.classList.add("tbx-th--pinned-left");
        th.style.left = `${leftOffsets.get("__row_drag")}px`;
        if (lastLeftPinnedId === "__row_drag") th.classList.add("tbx-pinned-border-left");
      }
      row1Cells.push(th);
    }

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
        const allSelected =
          this.allAcrossSelected || (ids.length > 0 && ids.every((id) => this.selected.has(id)));
        const someSelected = !allSelected && ids.some((id) => this.selected.has(id));
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

  private getColumnActiveFilter(column: TableXVanillaColumn<TData>): string | undefined {
    const id = getColumnId(column);
    const filterField = getFilterField(column);
    const filterObj = this.query.filter;
    if (!filterObj) return undefined;
    if (filterObj[filterField] !== undefined) return filterObj[filterField];
    if (filterObj[id] !== undefined) return filterObj[id];
    const lowerFilter = filterField.toLowerCase();
    const lowerId = id.toLowerCase();
    for (const [k, v] of Object.entries(filterObj)) {
      const kl = k.toLowerCase();
      if (kl === lowerFilter || kl === lowerId) return v;
    }
    return undefined;
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
    const sortField = getSortField(column);
    const sortable = isSortable(column) && this.options.enableSorting !== false;
    const filterable = isFilterable(column, this.options.enableColumnFilters !== false);
    const sorts = this.query.sort;
    const lowerSortField = sortField.toLowerCase();
    const lowerId = id.toLowerCase();
    const sortIndex = sorts.findIndex(
      (s) =>
        s.field === sortField ||
        s.field === id ||
        s.field.toLowerCase() === lowerSortField ||
        s.field.toLowerCase() === lowerId,
    );
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
          el("span", { class: "tbx-sort-order", attrs: { "aria-hidden": "true" }, text: String(sortIndex + 1) }),
        );
      }
      inner.appendChild(iconWrap);
    }

    const showMenuTrigger =
      filterable ||
      (!isStructuralColumn(column) && id !== "" && this.options.enableColumnMenu === true);

    if (showMenuTrigger) {
      const activeFilter = this.getColumnActiveFilter(column);
      const isFilterActive = activeFilter !== undefined && activeFilter.trim() !== "";
      const isFilterOpen = this.openFilterColumn === id;
      const filterWrap = el("div", { class: "tbx-col-filter-wrap", attrs: { draggable: false } });
      filterWrap.addEventListener("dragstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      const btnClasses = ["tbx-col-filter-btn"];
      if (isFilterActive) btnClasses.push("tbx-col-filter-btn--active");
      if (isFilterOpen) btnClasses.push("tbx-col-filter-btn--open");
      const filterBtn = el(
        "button",
        {
          class: btnClasses.join(" "),
          attrs: {
            type: "button",
            "data-filter-col": id,
            "aria-expanded": String(isFilterOpen),
            "aria-haspopup": "dialog",
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
    } else {
      thStyle.minWidth = `${meta.minWidth ?? 120}px`;
    }
    if (meta.align !== undefined) {
      thStyle.textAlign = meta.align;
    }

    const pinned = isPinned(column, this.pinnedColumns);
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

    if (this.options.enableColumnReorder === true && !isGroupChild) {
      th.draggable = true;
      th.classList.add("tbx-th--draggable");
      th.addEventListener("pointerdown", (e: PointerEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
          this.headerPointerDown = null;
          return;
        }
        this.headerPointerDown = {
          colId: id,
          sortField,
          x: e.clientX ?? 0,
          y: e.clientY ?? 0,
          shiftKey: e.shiftKey,
          dropped: false,
        };
      });
      th.addEventListener("dragstart", (e: DragEvent) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
          e.preventDefault();
          return;
        }
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
        if (this.headerPointerDown) this.headerPointerDown.dropped = true;

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
      th.addEventListener("dragend", (e: DragEvent) => {
        const ptr = this.headerPointerDown;
        this.headerPointerDown = null;
        this.draggedColumnId = null;
        th.classList.remove("tbx-th--dragging");
        th.classList.remove("tbx-th--drag-over-left");
        if (
          sortable &&
          ptr &&
          ptr.colId === id &&
          !ptr.dropped &&
          typeof e.clientX === "number" &&
          e.clientX > 0 &&
          Math.hypot(e.clientX - ptr.x, (e.clientY ?? 0) - ptr.y) < 6
        ) {
          const next = ptr.shiftKey
            ? withToggledMultiSort(this.query, ptr.sortField)
            : withToggledSort(this.query, ptr.sortField);
          this.applyQuery(next);
        }
      });
    }

    if (sortable) {
      th.addEventListener("click", (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
          return;
        }
        this.headerPointerDown = null;
        const next = event.shiftKey
          ? withToggledMultiSort(this.query, sortField)
          : withToggledSort(this.query, sortField);
        this.applyQuery(next);
      });
      th.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const target = event.target as HTMLElement | null;
        if (target?.closest(".tbx-col-filter-wrap")) return;
        event.preventDefault();
        const next = event.shiftKey
          ? withToggledMultiSort(this.query, sortField)
          : withToggledSort(this.query, sortField);
        this.applyQuery(next);
      });
    }

    if (this.options.enableColumnResize !== false) {
      const handle = el("div", { class: "tbx-resize-handle", attrs: { draggable: false } });
      handle.addEventListener("dragstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      handle.addEventListener("pointerdown", (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        this.activeResizeCleanup?.();
        const startX = event.clientX;
        const startWidth = th.getBoundingClientRect ? th.getBoundingClientRect().width : (customWidth ?? meta.width ?? 120);
        const onMove = (e: PointerEvent) => {
          const nextWidth = Math.max(meta.minWidth ?? 60, Math.round(startWidth + (e.clientX - startX)));
          this.columnWidths[id] = nextWidth;
          th.style.width = `${nextWidth}px`;
        };
        const cleanup = () => {
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          document.body?.classList.remove("tbx-resizing");
          this.activeResizeCleanup = null;
        };
        const onUp = () => {
          cleanup();
          this.saveState();
          this.render();
        };
        this.activeResizeCleanup = cleanup;
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
      (this.options.enableRowReorder ? 1 : 0) +
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

    const pinnedTop = this.options.pinnedTopRows ?? [];
    const pinnedBottom = this.options.pinnedBottomRows ?? [];

    if (this.data.length === 0 && pinnedTop.length === 0 && pinnedBottom.length === 0) {
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
    const pushBuilt = (built: HTMLTableRowElement | HTMLTableRowElement[]) => {
      if (Array.isArray(built)) rows.push(...built);
      else rows.push(built);
    };

    for (let i = 0; i < pinnedTop.length; i++) {
      const topRow = pinnedTop[i];
      if (topRow !== undefined) {
        pushBuilt(this.buildRow(topRow, i, cols, colSpan, { pinnedVariant: "top" }));
      }
    }

    if (this.isTreeEnabled()) {
      const treeNodes = flattenTreeRows(this.data, {
        childrenKey: this.options.childrenKey,
        getSubRows: this.options.getSubRows,
        getRowId: this.rowId,
        expandedIds: this.treeExpandedIds,
      });
      for (let idx = 0; idx < treeNodes.length; idx++) {
        const node = treeNodes[idx]!;
        pushBuilt(this.buildRow(node.row, idx, cols, colSpan, { treeNode: node }));
      }
    } else if (this.activeGroupBy.length > 0) {
      const nestedItems = buildNestedGroupItems(
        this.data,
        this.activeGroupBy,
        this.columns,
        this.collapsedGroups,
        {
          yes: this.locale.booleanYes,
          no: this.locale.booleanNo,
        },
      );
      for (const item of nestedItems) {
        if (item.kind === "row") {
          pushBuilt(this.buildRow(item.row, item.originalIndex, cols, colSpan));
          continue;
        }
        const isCollapsed = item.collapsed;
        const toggleBtn = el(
          "button",
          {
            class: isCollapsed ? "tbx-group-toggle" : "tbx-group-toggle tbx-group-toggle--open",
            attrs: {
              type: "button",
              "aria-expanded": String(!isCollapsed),
              "aria-label": `${isCollapsed ? "Expand" : "Collapse"} ${item.displayValue}`,
            },
          },
          [chevronRightIcon("tbx-icon")],
        );

        const innerChildren: ElementChild[] = [
          toggleBtn,
          el("span", { class: "tbx-group-label", text: `${item.columnTitle}:` }),
          el("strong", { class: "tbx-group-value", text: item.displayValue }),
          el("span", { class: "tbx-group-count", text: item.count.toLocaleString() }),
        ];

        if (item.summaries.length > 0) {
          const sumWrap = el(
            "span",
            { class: "tbx-group-summaries" },
            item.summaries.map((s) =>
              el("span", { class: "tbx-group-summary-chip" }, [
                el("span", { text: s.label }),
                el("strong", { text: s.value }),
              ]),
            ),
          );
          innerChildren.push(sumWrap);
        }

        const grpRow = el(
          "tr",
          {
            class: "tbx-group-row",
            attrs: {
              "data-group-key": item.key,
              "data-group-depth": String(item.depth),
            },
          },
          [
            el(
              "td",
              {
                class: "tbx-group-cell",
                attrs: { colspan: String(colSpan) },
                style: item.depth > 0 ? { paddingInlineStart: `${14 + item.depth * 18}px` } : undefined,
              },
              [el("div", { class: "tbx-group-inner" }, innerChildren)],
            ),
          ],
        );
        grpRow.addEventListener("click", (e) => {
          e.stopPropagation();
          if (this.collapsedGroups.has(item.key)) {
            this.collapsedGroups.delete(item.key);
          } else {
            this.collapsedGroups.add(item.key);
          }
          this.renderBody();
        });
        rows.push(grpRow);
      }
    } else if (this.options.enableVirtualization) {
      const win = computeVirtualWindow({
        totalRows: this.data.length,
        scrollTop: this.virtualScrollTop,
        viewportHeight: this.options.virtualHeight,
        density: this.density,
        overscan: this.options.virtualOverscan,
      });
      if (win.topSpacerHeight > 0) {
        rows.push(
          el("tr", { class: "tbx-virtual-spacer", attrs: { "aria-hidden": "true" } }, [
            el("td", {
              attrs: { colspan: String(colSpan) },
              style: { height: `${win.topSpacerHeight}px` },
            }),
          ]),
        );
      }
      for (let index = win.startIndex; index < win.endIndex; index++) {
        const row = this.data[index];
        if (row !== undefined) pushBuilt(this.buildRow(row, index, cols, colSpan));
      }
      if (win.bottomSpacerHeight > 0) {
        rows.push(
          el("tr", { class: "tbx-virtual-spacer", attrs: { "aria-hidden": "true" } }, [
            el("td", {
              attrs: { colspan: String(colSpan) },
              style: { height: `${win.bottomSpacerHeight}px` },
            }),
          ]),
        );
      }
    } else {
      for (let index = 0; index < this.data.length; index++) {
        const row = this.data[index];
        if (row !== undefined) pushBuilt(this.buildRow(row, index, cols, colSpan));
      }
    }

    for (let i = 0; i < pinnedBottom.length; i++) {
      const botRow = pinnedBottom[i];
      if (botRow !== undefined) {
        pushBuilt(this.buildRow(botRow, i, cols, colSpan, { pinnedVariant: "bottom" }));
      }
    }

    replaceChildren(this.tbody, rows);
  }

  private buildRow(
    row: TData,
    index: number,
    cols: readonly TableXVanillaColumn<TData>[],
    colSpan: number,
    rowOpts?: {
      pinnedVariant?: "top" | "bottom";
      treeNode?: TreeRowNode<TData>;
    },
  ): HTMLTableRowElement | HTMLTableRowElement[] {
    const pinnedVariant = rowOpts?.pinnedVariant;
    const treeNode = rowOpts?.treeNode;
    const id = treeNode ? treeNode.id : this.rowId(row);
    const selected = pinnedVariant ? false : this.isRowSelected(id);
    const isExpanded = !pinnedVariant && this.expandedRows.has(id);
    const isRowEditing = !pinnedVariant && this.editingRowId === id;
    const clickable = this.options.onRowClick !== undefined;
    const { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId } =
      this.getPinnedOffsets(cols);

    const classes = ["tbx-row"];
    if (selected) classes.push("tbx-row--selected");
    if (clickable) classes.push("tbx-row--clickable");
    if (isExpanded) classes.push("tbx-row--expanded");
    if (isRowEditing) classes.push("tbx-row--editing");
    if (pinnedVariant === "top") classes.push("tbx-row--pinned-top");
    else if (pinnedVariant === "bottom") classes.push("tbx-row--pinned-bottom");

    const cells: ElementChild[] = [];

    if (this.options.enableRowReorder) {
      const tdClasses = ["tbx-td", "tbx-td--row-drag"];
      const tdStyle: Record<string, string | undefined> = { width: "36px" };
      if (leftOffsets.has("__row_drag")) {
        tdClasses.push("tbx-td--pinned-left");
        tdStyle.left = `${leftOffsets.get("__row_drag")}px`;
        if (lastLeftPinnedId === "__row_drag") tdClasses.push("tbx-pinned-border-left");
      }
      const grip = pinnedVariant
        ? null
        : el("span", {
            class: "tbx-row-drag-handle",
            attrs: { "aria-label": "Drag to reorder row", title: "Drag to reorder" },
            text: "⋮⋮",
          });
      cells.push(el("td", { class: tdClasses.join(" "), style: tdStyle }, grip ? [grip] : []));
    }

    // Row expansion chevron
    if (this.options.renderExpandedRow) {
      const expandBtn = pinnedVariant
        ? null
        : el(
            "button",
            {
              class: isExpanded ? "tbx-expand-btn tbx-expand-btn--open" : "tbx-expand-btn",
              attrs: { type: "button", "aria-label": isExpanded ? "Collapse row" : "Expand row" },
            },
            [chevronRightIcon("tbx-icon")],
          );
      expandBtn?.addEventListener("click", (e) => {
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
      cells.push(
        el("td", { class: tdClasses.join(" "), style: tdStyle }, expandBtn ? [expandBtn] : []),
      );
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
        el(
          "td",
          { class: tdClasses.join(" "), style: tdStyle },
          pinnedVariant ? [] : [this.buildRowCheckbox(id, selected, `row-select:${id}`, index)],
        ),
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
      const serialText = pinnedVariant
        ? "★"
        : String(serialNumber(this.currentPage(), this.query.pageSize, index));
      cells.push(
        el("td", {
          class: tdClasses.join(" "),
          style: tdStyle,
          text: serialText,
        }),
      );
    }

    let firstEditableRendered = false;
    for (let colIdx = 0; colIdx < cols.length; colIdx++) {
      const column = cols[colIdx]!;
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

      if (isEditable(column) && !pinnedVariant) {
        tdClasses.push("tbx-cell--editable");
      }
      if (!pinnedVariant && this.dirtyCells.has(`${id}::${colId}`)) {
        tdClasses.push("tbx-td--dirty");
      }

      const isFocused =
        !pinnedVariant &&
        this.focusedCell?.rowIndex === index &&
        this.focusedCell?.colIndex === colIdx;
      if (isFocused) {
        tdClasses.push("tbx-td--focused");
      }

      const inRange =
        !pinnedVariant &&
        this.options.enableRangeSelection === true &&
        isCellInRange(index, colIdx, this.cellRange);
      if (inRange) {
        tdClasses.push("tbx-td--in-range");
      }

      const tdAttrs: Record<string, string | number | boolean | null | undefined> = {};
      if (!pinnedVariant && this.options.enableKeyboardNavigation !== false) {
        tdAttrs["tabindex"] = isFocused ? 0 : -1;
        tdAttrs["data-tbx-focus"] = `cell:${index}:${colIdx}`;
        tdAttrs["data-row-idx"] = String(index);
        tdAttrs["data-col-idx"] = String(colIdx);
      }

      const td = el("td", { class: tdClasses.join(" "), style: tdStyle, attrs: tdAttrs });

      if (!pinnedVariant) {
        td.addEventListener("pointerdown", (e: PointerEvent) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (
            target?.closest("input, select, button, .tbx-fill-handle")
          ) {
            return;
          }
          const prevFocus = this.focusedCell;
          const coord: CellCoord = { rowIndex: index, colIndex: colIdx };
          this.focusedCell = coord;
          if (this.options.enableRangeSelection) {
            if (e.shiftKey && this.rangeAnchor) {
              this.cellRange = normalizeCellRange(this.rangeAnchor, coord);
            } else {
              this.rangeAnchor = coord;
              this.cellRange = normalizeCellRange(coord, coord);
              this.isDraggingRange = true;
            }
            this.renderBody();
            this.renderFooter();
          } else if (prevFocus?.rowIndex !== index || prevFocus?.colIndex !== colIdx) {
            this.root
              .querySelectorAll(".tbx-td--focused")
              .forEach((n) => n.classList.remove("tbx-td--focused"));
            td.classList.add("tbx-td--focused");
            td.setAttribute("tabindex", "0");
          }
        });

        if (this.options.enableRangeSelection) {
          td.addEventListener("pointerenter", () => {
            if (this.isDraggingRange && this.rangeAnchor) {
              this.cellRange = normalizeCellRange(this.rangeAnchor, {
                rowIndex: index,
                colIndex: colIdx,
              });
              this.renderBody();
              this.renderFooter();
            } else if (this.isFillingRange && this.rangeAnchor) {
              this.applyFillHandleToRow(index, cols);
            }
          });
        }

        if (this.options.enableContextMenu !== false) {
          td.addEventListener("contextmenu", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.openCellContextMenu(e, row, column, colId);
          });
        }
      }

      const showRowEditActions = isRowEditing && isEditable(column) && !firstEditableRendered;
      if (showRowEditActions) firstEditableRendered = true;

      this.renderCellInto(td, column, row, pinnedVariant ? undefined : id, {
        treeNode: colIdx === 0 ? treeNode : undefined,
        isRowEditing,
        showRowEditActions,
        cols,
      });

      if (
        inRange &&
        this.cellRange &&
        index === this.cellRange.maxRow &&
        colIdx === this.cellRange.maxCol
      ) {
        const handleEl = el("span", {
          class: "tbx-fill-handle",
          attrs: { "aria-hidden": "true" },
        });
        handleEl.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.isFillingRange = true;
        });
        td.appendChild(handleEl);
      }

      cells.push(td);
    }

    const trAttrs: Record<string, string | number | boolean | null | undefined> = {};
    if (this.options.enableRowReorder && !pinnedVariant) {
      trAttrs["draggable"] = "true";
      trAttrs["data-row-index"] = String(index);
    }

    const tr = el("tr", { class: classes.join(" "), attrs: trAttrs }, cells);

    if (this.options.enableRowReorder && !pinnedVariant) {
      tr.addEventListener("dragstart", (e: DragEvent) => {
        this.draggedRowIndex = index;
        tr.classList.add("tbx-row--dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
        }
      });
      tr.addEventListener("dragover", (e: DragEvent) => {
        e.preventDefault();
        if (this.draggedRowIndex !== null && this.draggedRowIndex !== index) {
          tr.classList.add("tbx-row--drag-over");
        }
      });
      tr.addEventListener("dragleave", () => {
        tr.classList.remove("tbx-row--drag-over");
      });
      tr.addEventListener("drop", (e: DragEvent) => {
        e.preventDefault();
        tr.classList.remove("tbx-row--drag-over");
        const fromIdx = this.draggedRowIndex;
        this.draggedRowIndex = null;
        if (fromIdx === null || fromIdx === index) return;
        this.data = reorderArrayItem(this.data, fromIdx, index);
        if (this.isClientSide && this.rawClientData.length === this.data.length) {
          this.rawClientData = [...this.data];
        }
        this.options.onRowOrderChange?.({
          fromIndex: fromIdx,
          toIndex: index,
          rows: [...this.data],
        });
        this.render();
      });
      tr.addEventListener("dragend", () => {
        this.draggedRowIndex = null;
        tr.classList.remove("tbx-row--dragging");
        tr.classList.remove("tbx-row--drag-over");
      });
    }

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

    if (this.options.enableRowReorder) {
      const td = el("td", { class: "tbx-summary-cell" });
      if (leftOffsets.has("__row_drag")) {
        td.classList.add("tbx-td--pinned-left");
        td.style.left = `${leftOffsets.get("__row_drag")}px`;
        if (lastLeftPinnedId === "__row_drag") td.classList.add("tbx-pinned-border-left");
      }
      cells.push(td);
    }

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

  private renderSelectAllBanner(): void {
    const ids = this.pageRowIds();
    const allPageSelected =
      this.allAcrossSelected || (ids.length > 0 && ids.every((id) => this.selected.has(id)));
    const show =
      this.selectionEnabled() &&
      !this.isSingleSelection() &&
      !this.isLoading &&
      ids.length > 0 &&
      ((allPageSelected && this.total > ids.length) || this.allAcrossSelected);

    if (!show) {
      this.selectAllBanner.style.display = "none";
      replaceChildren(this.selectAllBanner, []);
      return;
    }

    this.selectAllBanner.style.display = "flex";

    if (this.allAcrossSelected) {
      const textSpan = el("span", {
        class: "tbx-select-all-banner-text",
        text: formatMessage(
          this.locale.allAcrossPagesSelected ??
          "All {total} matching records across all pages are selected.",
          {
            total: this.total.toLocaleString(),
          },
        ),
      });
      const clearBtn = el("button", {
        class: "tbx-select-all-banner-btn",
        attrs: { type: "button" },
        text: this.locale.clearSelection ?? "Clear selection",
      });
      clearBtn.addEventListener("click", () => this.clearAllSelection());
      replaceChildren(this.selectAllBanner, [textSpan, clearBtn]);
    } else {
      const textSpan = el("span", { class: "tbx-select-all-banner-text" }, [
        "All ",
        el("strong", { text: ids.length.toLocaleString() }),
        " records on this page are selected.",
      ]);
      const selectAllBtn = el("button", {
        class: "tbx-select-all-banner-btn",
        attrs: { type: "button" },
        text: formatMessage(
          this.locale.selectAllAcrossPages ?? "Select all {total} matching records",
          {
            total: this.total.toLocaleString(),
          },
        ),
      });
      selectAllBtn.addEventListener("click", () => this.selectAllAcrossPages());
      replaceChildren(this.selectAllBanner, [textSpan, selectAllBtn]);
    }
  }

  // ---- Bulk Actions Bar ----------------------------------------------------

  private renderBulkBar(): void {
    const count = this.effectiveSelectedCount();
    if (count === 0 || this.options.enableBulkActions === false) {
      if (this.bulkBar.parentElement) this.bulkBar.remove();
      return;
    }

    const badge = el("span", {
      class: "tbx-bulk-badge",
      text: formatMessage(this.locale.selectedBadge, { count: count.toLocaleString() }),
    });

    const actions = el("div", { class: "tbx-bulk-actions" });

    if (this.options.enableExport !== false && this.options.showExportButton !== false) {
      const excelBtn = el(
        "button",
        { class: "tbx-bulk-btn", attrs: { type: "button" } },
        [
          fileSpreadsheetIcon("tbx-icon--excel"),
          el("span", { text: this.locale.exportExcelButton ?? "Export Excel" }),
        ],
      );
      excelBtn.addEventListener("click", () => void this.runBulkExport("excel"));
      actions.appendChild(excelBtn);

      const csvBtn = el(
        "button",
        { class: "tbx-bulk-btn", attrs: { type: "button" } },
        [
          fileTextIcon("tbx-icon--csv"),
          el("span", { text: this.locale.exportCsvButton ?? "Export CSV" }),
        ],
      );
      csvBtn.addEventListener("click", () => void this.runBulkExport("csv"));
      actions.appendChild(csvBtn);

      const pdfBtn = el(
        "button",
        { class: "tbx-bulk-btn", attrs: { type: "button" } },
        [
          fileTextIcon("tbx-icon--pdf"),
          el("span", { text: this.locale.exportPdfButton ?? "Export PDF" }),
        ],
      );
      pdfBtn.addEventListener("click", () => void this.runBulkExport("pdf"));
      actions.appendChild(pdfBtn);
    }

    if (this.options.bulkActions) {
      const custom = this.options.bulkActions(Array.from(this.selected), () => {
        this.clearAllSelection();
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
      this.clearAllSelection();
    });

    replaceChildren(this.bulkBar, [badge, actions, closeBtn]);
    if (!this.bulkBar.parentElement && this.root.contains(this.tableWrap)) {
      this.root.appendChild(this.bulkBar);
    }
  }

  private findFilterTriggerButton(id: string): HTMLElement | null {
    const buttons = this.root.querySelectorAll<HTMLElement>(".tbx-col-filter-btn");
    for (const btn of Array.from(buttons)) {
      if (btn.getAttribute("data-filter-col") === id) return btn;
    }
    return null;
  }

  private renderFilterPopover(): void {
    if (this.openFilterColumn === null) {
      if (this.activeFilterPopoverEl) {
        this.activeFilterPopoverEl.remove();
        this.activeFilterPopoverEl = null;
      }
      this.mountedFilterPopoverKey = null;
      return;
    }

    const col = this.leafCols().find((c) => getColumnId(c) === this.openFilterColumn);
    if (!col) {
      if (this.activeFilterPopoverEl) {
        this.activeFilterPopoverEl.remove();
        this.activeFilterPopoverEl = null;
      }
      this.mountedFilterPopoverKey = null;
      this.openFilterColumn = null;
      return;
    }

    const id = getColumnId(col);
    const activeFilter = this.getColumnActiveFilter(col);
    const sortField = getSortField(col);
    const sortDir =
      this.query.sort.find(
        (s) =>
          s.field.toLowerCase() === sortField.toLowerCase() ||
          s.field.toLowerCase() === id.toLowerCase(),
      )?.dir ?? "";
    const pinState = isPinned(col, this.pinnedColumns) || "none";
    const cacheKey = `${id}:${activeFilter ?? ""}:${sortDir}:${pinState}:${this.activeGroupBy.join(",")}`;

    if (
      this.mountedFilterPopoverKey === cacheKey &&
      this.activeFilterPopoverEl &&
      this.root.contains(this.activeFilterPopoverEl)
    ) {
      this.repositionActiveFilterPopover();
      return;
    }

    if (this.activeFilterPopoverEl) {
      this.activeFilterPopoverEl.remove();
    }

    const popover = this.buildColumnFilterPopover(id, col, col.meta ?? {}, activeFilter);
    this.activeFilterPopoverEl = popover;
    this.mountedFilterPopoverKey = cacheKey;
    this.root.appendChild(popover);
    this.repositionActiveFilterPopover();
  }

  private repositionActiveFilterPopover(): void {
    const popover = this.activeFilterPopoverEl;
    const id = this.openFilterColumn;
    if (!popover || !id) return;
    const btn = this.findFilterTriggerButton(id);
    if (!btn) {
      this.openFilterColumn = null;
      this.renderFilterPopover();
      return;
    }
    this.positionFilterPopover(popover, btn);
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
    popover.addEventListener("pointerdown", (e) => e.stopPropagation());
    popover.addEventListener("mousedown", (e) => e.stopPropagation());
    popover.addEventListener("click", (e) => e.stopPropagation());

    const title = getColumnTitle(column) || id;
    const filterField = getFilterField(column);
    const apply = (valToApply?: string) => {
      const val = (valToApply !== undefined ? valToApply : "").trim();
      this.openFilterColumn = null;
      this.mountedFilterPopoverKey = null;
      if (this.activeFilterPopoverEl) {
        this.activeFilterPopoverEl.remove();
        this.activeFilterPopoverEl = null;
      }
      let nextQuery = withFilter(this.query, filterField, val || undefined);
      if (filterField !== id && nextQuery.filter?.[id] !== undefined) {
        nextQuery = withFilter(nextQuery, id, undefined);
      }
      this.applyQuery(nextQuery);
    };

    const closePopover = () => {
      this.openFilterColumn = null;
      this.render();
    };

    const focusSafely = (inputEl: HTMLInputElement) => {
      setTimeout(() => {
        if (!this.root.contains(inputEl)) return;
        try {
          inputEl.focus?.({ preventScroll: true });
        } catch {
          inputEl.focus?.();
        }
      }, 10);
    };

    const filterable = isFilterable(column, this.options.enableColumnFilters !== false);

    // 0. Quick Column Actions (Sort Asc/Desc, Pin Left/Right/Unpin, Hide Column)
    if (this.options.enableColumnMenu !== false) {
      const quickWrap = el("div", { class: "tbx-col-menu-actions" });
      let hasQuickItems = false;

      const sortable = isSortable(column) && this.options.enableSorting !== false;
      const sortField = getSortField(column);
      const activeSortDir =
        this.query.sort.find(
          (s) =>
            s.field.toLowerCase() === sortField.toLowerCase() ||
            s.field.toLowerCase() === id.toLowerCase(),
        )?.dir ?? null;

      const makeMenuBtn = (
        actionKey: string,
        label: string,
        iconNode: SVGSVGElement | null,
        active: boolean,
        onClick: () => void,
      ) => {
        const btn = el(
          "button",
          {
            class: active ? "tbx-col-menu-btn tbx-col-menu-btn--active" : "tbx-col-menu-btn",
            attrs: { type: "button", "data-col-action": actionKey },
          },
          iconNode ? [iconNode, el("span", { text: label })] : [el("span", { text: label })],
        );
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick();
        });
        quickWrap.appendChild(btn);
        hasQuickItems = true;
      };

      if (sortable) {
        makeMenuBtn(
          "sort-asc",
          this.locale.sortAscending ?? "Sort ascending",
          arrowUpIcon("tbx-icon"),
          activeSortDir === "asc",
          () => {
            this.openFilterColumn = null;
            const next =
              activeSortDir === "asc"
                ? { ...this.query, sort: [], page: 1 }
                : withSort(this.query, sortField, "asc");
            this.applyQuery(next);
          },
        );
        makeMenuBtn(
          "sort-desc",
          this.locale.sortDescending ?? "Sort descending",
          arrowDownIcon("tbx-icon"),
          activeSortDir === "desc",
          () => {
            this.openFilterColumn = null;
            const next =
              activeSortDir === "desc"
                ? { ...this.query, sort: [], page: 1 }
                : withSort(this.query, sortField, "desc");
            this.applyQuery(next);
          },
        );
      }

      if (!isStructuralColumn(column) && id !== "") {
        const currentPin = isPinned(column, this.pinnedColumns);
        if (currentPin !== "left") {
          makeMenuBtn("pin-left", this.locale.pinLeft ?? "Pin left", null, false, () => {
            this.pinnedColumns = { ...this.pinnedColumns, [id]: "left" };
            this.openFilterColumn = null;
            this.saveState();
            this.render();
          });
        }
        if (currentPin !== "right") {
          makeMenuBtn("pin-right", this.locale.pinRight ?? "Pin right", null, false, () => {
            this.pinnedColumns = { ...this.pinnedColumns, [id]: "right" };
            this.openFilterColumn = null;
            this.saveState();
            this.render();
          });
        }
        if (currentPin === "left" || currentPin === "right") {
          makeMenuBtn("unpin", this.locale.unpinColumn ?? "Unpin column", null, true, () => {
            this.pinnedColumns = { ...this.pinnedColumns, [id]: "none" };
            this.openFilterColumn = null;
            this.saveState();
            this.render();
          });
        }

        const colAccessKey = column.accessorKey !== undefined ? String(column.accessorKey) : "";
        const matchesCol = (g: string) =>
          g.toLowerCase() === id.toLowerCase() ||
          (colAccessKey !== "" && g.toLowerCase() === colAccessKey.toLowerCase());
        const isGroupedByThis = this.activeGroupBy.some(matchesCol);
        if (isGroupedByThis) {
          makeMenuBtn("ungroup", this.locale.ungroupColumn ?? "Ungroup", null, true, () => {
            this.activeGroupBy = this.activeGroupBy.filter((g) => !matchesCol(g));
            this.collapsedGroups.clear();
            this.openFilterColumn = null;
            this.options.onGroupByChange?.(this.activeGroupBy[0], [...this.activeGroupBy]);
            this.saveState();
            this.render();
          });
        } else {
          makeMenuBtn(
            "group-by",
            this.locale.groupByColumn ?? "Group by column",
            null,
            false,
            () => {
              this.activeGroupBy = [id];
              this.collapsedGroups.clear();
              this.openFilterColumn = null;
              this.options.onGroupByChange?.(id, [id]);
              this.saveState();
              this.render();
            },
          );
          if (this.activeGroupBy.length > 0) {
            makeMenuBtn(
              "add-group-by",
              this.locale.addGroupByColumn ?? "Add to grouping",
              null,
              false,
              () => {
                this.activeGroupBy = [...this.activeGroupBy, id];
                this.collapsedGroups.clear();
                this.openFilterColumn = null;
                this.options.onGroupByChange?.(this.activeGroupBy[0], [...this.activeGroupBy]);
                this.saveState();
                this.render();
              },
            );
          }
        }
      }

      const canHide =
        isHideable(column) &&
        this.options.enableColumns !== false &&
        this.options.showColumnsButton !== false &&
        this.visibleCols().length > 1;
      if (canHide) {
        makeMenuBtn("hide", this.locale.hideColumn ?? "Hide column", null, false, () => {
          this.hidden = { ...this.hidden, [id]: true };
          this.openFilterColumn = null;
          if (this.isClientSide) {
            this.rawClientSideSync();
          }
          this.saveState();
          this.render();
        });
      }

      if (hasQuickItems) {
        popover.appendChild(quickWrap);
        if (filterable) {
          popover.appendChild(el("div", { class: "tbx-col-menu-sep" }));
        }
      }
    }

    if (!filterable) {
      return popover;
    }

    // 0b. Multi-Select Checkbox Filter
    if (isMultiSelectFilter(column) && meta.filterOptions && meta.filterOptions.length > 0) {
      const placeholder =
        meta.filterPlaceholder ||
        formatMessage(this.locale.filterColumnPlaceholder, { column: title });
      const initialTokens = parseMultiFilterValues(currentValue, true).map((t) => t.toLowerCase());
      const selectedSet = new Set<string>(
        meta.filterOptions.filter((opt) => initialTokens.includes(opt.trim().toLowerCase())),
      );

      const searchInput = el("input", {
        class: "tbx-filter-popover-input",
        attrs: {
          type: "text",
          placeholder,
          value: "",
          "aria-label": `Filter ${title}`,
        },
      }) as HTMLInputElement;
      searchInput.value = "";
      focusSafely(searchInput);

      const submitMulti = () => {
        const ordered = meta.filterOptions!.filter((opt) => selectedSet.has(opt));
        apply(serializeMultiFilterValues(ordered) ?? "");
      };

      searchInput.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitMulti();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closePopover();
        }
      });

      popover.appendChild(searchInput);

      const optionsWrap = el("div", { class: "tbx-filter-popover-options" });
      const renderMultiOptions = (termRaw: string) => {
        replaceChildren(optionsWrap, []);
        const term = termRaw.trim().toLowerCase();

        const isAllSelected = selectedSet.size === 0;
        const allOpt = el("div", {
          class: isAllSelected ? "tbx-filter-option tbx-filter-option--selected" : "tbx-filter-option",
          text: this.locale.filterAll,
        });
        allOpt.addEventListener("click", (e) => {
          e.stopPropagation();
          selectedSet.clear();
          renderMultiOptions(searchInput.value);
        });
        optionsWrap.appendChild(allOpt);

        const filtered = meta.filterOptions!.filter(
          (opt) => !term || opt.toLowerCase().includes(term),
        );
        if (filtered.length === 0) {
          optionsWrap.appendChild(
            el("div", { class: "tbx-filter-empty", text: "No matching options" }),
          );
          return;
        }

        for (const opt of filtered) {
          const isChecked = selectedSet.has(opt);
          const cb = el("input", {
            class: "tbx-filter-option-check",
            attrs: { type: "checkbox", tabindex: -1, "aria-hidden": "true" },
          }) as HTMLInputElement;
          cb.checked = isChecked;
          cb.addEventListener("click", (e) => e.stopPropagation());
          cb.addEventListener("change", (e) => {
            e.stopPropagation();
            if (cb.checked) selectedSet.add(opt);
            else selectedSet.delete(opt);
            renderMultiOptions(searchInput.value);
          });
          const optEl = el(
            "div",
            {
              class: isChecked ? "tbx-filter-option tbx-filter-option--selected" : "tbx-filter-option",
              attrs: { role: "option", "aria-selected": String(isChecked) },
            },
            [cb, el("span", { text: opt })],
          );
          optEl.addEventListener("click", (e) => {
            e.stopPropagation();
            if (selectedSet.has(opt)) selectedSet.delete(opt);
            else selectedSet.add(opt);
            renderMultiOptions(searchInput.value);
          });
          optionsWrap.appendChild(optEl);
        }
      };

      renderMultiOptions("");
      searchInput.addEventListener("input", () => {
        renderMultiOptions(searchInput.value);
      });
      popover.appendChild(optionsWrap);

      const actionsWrap = el("div", { class: "tbx-filter-popover-actions" });
      const clearBtn = el(
        "button",
        { class: "tbx-filter-popover-btn", attrs: { type: "button" } },
        [rotateCcwIcon(), el("span", { text: this.locale.clearFilter })],
      );
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        selectedSet.clear();
        apply("");
      });
      const applyBtn = el(
        "button",
        { class: "tbx-filter-popover-btn tbx-filter-popover-btn--primary", attrs: { type: "button" } },
        [checkIcon(), el("span", { text: this.locale.applyFilter })],
      );
      applyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        submitMulti();
      });
      actionsWrap.appendChild(clearBtn);
      actionsWrap.appendChild(applyBtn);
      popover.appendChild(actionsWrap);
      return popover;
    }

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
      fromInput.value = fromVal;
      const sep = el("span", { class: "tbx-range-sep", text: "to" });
      const toInput = el("input", {
        class: "tbx-range-input",
        attrs: { type: "date", value: toVal, "aria-label": "To date" },
      }) as HTMLInputElement;
      toInput.value = toVal;

      const submitDateRange = () => {
        const from = fromInput.value.trim();
        const to = toInput.value.trim();
        if (!from && !to) apply("");
        else apply(`${from}..${to}`);
      };
      const onRangeKey = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitDateRange();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closePopover();
        }
      };
      fromInput.addEventListener("keydown", onRangeKey);
      toInput.addEventListener("keydown", onRangeKey);
      focusSafely(fromInput);

      rangeInputs.appendChild(fromInput);
      rangeInputs.appendChild(sep);
      rangeInputs.appendChild(toInput);
      popover.appendChild(rangeInputs);

      const actionsWrap = el("div", { class: "tbx-filter-popover-actions" });
      const clearBtn = el("button", {
        class: "tbx-filter-popover-btn",
        attrs: { type: "button" },
      }, [rotateCcwIcon(), el("span", { text: this.locale.clearFilter })]);
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        apply("");
      });

      const applyBtn = el("button", {
        class: "tbx-filter-popover-btn tbx-filter-popover-btn--primary",
        attrs: { type: "button" },
      }, [checkIcon(), el("span", { text: this.locale.applyFilter })]);
      applyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        submitDateRange();
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
      minInput.value = minVal;
      const sep = el("span", { class: "tbx-range-sep", text: "to" });
      const maxInput = el("input", {
        class: "tbx-range-input",
        attrs: { type: "number", placeholder: "Max", value: maxVal, "aria-label": "Maximum" },
      }) as HTMLInputElement;
      maxInput.value = maxVal;

      const submitNumRange = () => {
        const min = minInput.value.trim();
        const max = maxInput.value.trim();
        if (!min && !max) apply("");
        else apply(`${min}..${max}`);
      };
      const onRangeKey = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submitNumRange();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closePopover();
        }
      };
      minInput.addEventListener("keydown", onRangeKey);
      maxInput.addEventListener("keydown", onRangeKey);
      focusSafely(minInput);

      rangeInputs.appendChild(minInput);
      rangeInputs.appendChild(sep);
      rangeInputs.appendChild(maxInput);
      popover.appendChild(rangeInputs);

      const actionsWrap = el("div", { class: "tbx-filter-popover-actions" });
      const clearBtn = el("button", {
        class: "tbx-filter-popover-btn",
        attrs: { type: "button" },
      }, [rotateCcwIcon(), el("span", { text: this.locale.clearFilter })]);
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        apply("");
      });

      const applyBtn = el("button", {
        class: "tbx-filter-popover-btn tbx-filter-popover-btn--primary",
        attrs: { type: "button" },
      }, [checkIcon(), el("span", { text: this.locale.applyFilter })]);
      applyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        submitNumRange();
      });

      actionsWrap.appendChild(clearBtn);
      actionsWrap.appendChild(applyBtn);
      popover.appendChild(actionsWrap);
      return popover;
    }

    // 3. Text / Number / Date / Dropdown filter
    const placeholder =
      meta.filterPlaceholder ||
      formatMessage(this.locale.filterColumnPlaceholder, { column: title });

    let selectedVal: string = (currentValue ?? "").trim();

    const input = el("input", {
      class: "tbx-filter-popover-input",
      attrs: {
        type: meta.filterType === "date" ? "date" : meta.filterType === "number" ? "number" : "text",
        placeholder: placeholder,
        value: selectedVal,
        "aria-label": `Filter ${title}`,
      },
    }) as HTMLInputElement;
    input.value = selectedVal;

    focusSafely(input);

    input.addEventListener("input", () => {
      selectedVal = input.value;
    });

    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply(input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePopover();
      }
    });

    popover.appendChild(input);

    if (meta.filterOptions && meta.filterOptions.length > 0) {
      const optionsWrap = el("div", { class: "tbx-filter-popover-options" });

      const renderOptions = (filterTerm: string, userHasTyped: boolean) => {
        replaceChildren(optionsWrap, []);
        const term = filterTerm.trim().toLowerCase();

        const isAllSelected = !selectedVal;
        const allOption = el("div", {
          class: isAllSelected ? "tbx-filter-option tbx-filter-option--selected" : "tbx-filter-option",
          text: this.locale.filterAll,
        });
        allOption.addEventListener("click", (e) => {
          e.stopPropagation();
          selectedVal = "";
          input.value = "";
          apply("");
        });
        optionsWrap.appendChild(allOption);

        const filtered = userHasTyped
          ? meta.filterOptions!.filter((opt) => !term || opt.toLowerCase().includes(term))
          : meta.filterOptions!;

        if (filtered.length === 0) {
          optionsWrap.appendChild(
            el("div", { class: "tbx-filter-empty", text: "No matching options" }),
          );
          return;
        }

        for (const opt of filtered) {
          const isSelected = selectedVal.trim().toLowerCase() === opt.trim().toLowerCase();
          const optEl = el("div", {
            class: isSelected ? "tbx-filter-option tbx-filter-option--selected" : "tbx-filter-option",
            text: opt,
          });
          optEl.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedVal = opt;
            input.value = opt;
            apply(opt);
          });
          optionsWrap.appendChild(optEl);
        }
      };

      renderOptions(input.value, false);
      input.addEventListener("input", () => {
        selectedVal = input.value;
        renderOptions(input.value, true);
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
      selectedVal = "";
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

  private positionFilterPopover(popover: HTMLElement, btn: HTMLElement): void {
    if (typeof window === "undefined" || typeof btn.getBoundingClientRect !== "function") return;
    const btnRect = btn.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    if (!btnRect || (btnRect.width === 0 && btnRect.height === 0 && btnRect.top === 0)) {
      return;
    }

    if (typeof this.tableWrap?.getBoundingClientRect === "function") {
      const wrapRect = this.tableWrap.getBoundingClientRect();
      if (wrapRect && wrapRect.width > 0 && (btnRect.right < wrapRect.left + 4 || btnRect.left > wrapRect.right - 4)) {
        this.openFilterColumn = null;
        this.renderFilterPopover();
        return;
      }
    }

    const popoverRect = popover.getBoundingClientRect();
    const margin = 6;
    const popoverHeight = popoverRect.height || 220;
    const popoverWidth = popoverRect.width || 240;

    let viewportTop = btnRect.bottom + margin;
    const winHeight = window.innerHeight || 800;
    const winWidth = window.innerWidth || 1024;
    if (
      viewportTop + popoverHeight > winHeight - 12 &&
      btnRect.top - popoverHeight - margin > 12
    ) {
      viewportTop = btnRect.top - popoverHeight - margin;
    }

    let viewportLeft = btnRect.right - popoverWidth;
    if (viewportLeft < 12) {
      viewportLeft = Math.max(12, btnRect.left);
    }
    if (viewportLeft + popoverWidth > winWidth - 12) {
      viewportLeft = Math.max(12, winWidth - popoverWidth - 12);
    }

    popover.style.position = "absolute";
    popover.style.top = `${Math.round(viewportTop - rootRect.top)}px`;
    popover.style.left = `${Math.round(viewportLeft - rootRect.left)}px`;
    popover.style.zIndex = "1000";
  }

  private buildRowCheckbox(
    id: string,
    selected: boolean,
    focusKey: string,
    rowIndex?: number,
  ): HTMLInputElement {
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
    let shiftOnLastClick = false;
    checkbox.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
      shiftOnLastClick = Boolean(event.shiftKey);
    });
    checkbox.addEventListener("change", (event: Event) => {
      const shiftHeld =
        shiftOnLastClick || Boolean((event as unknown as { shiftKey?: boolean }).shiftKey);
      shiftOnLastClick = false;
      if (
        shiftHeld &&
        !isSingle &&
        rowIndex !== undefined &&
        this.lastSelectedRowIndex !== null
      ) {
        const ids = this.pageRowIds();
        const nextSet = selectContiguousRowIds(
          ids,
          this.lastSelectedRowIndex,
          rowIndex,
          this.selected,
          checkbox.checked,
        );
        this.selected.clear();
        for (const rId of nextSet) {
          this.selected.add(rId);
        }
        this.lastSelectedRowIndex = rowIndex;
        this.emitSelection();
        this.render();
        return;
      }
      if (rowIndex !== undefined) {
        this.lastSelectedRowIndex = rowIndex;
      }
      this.toggleSelectRow(id);
    });
    return checkbox;
  }

  private writeMutatedRowValue(
    row: TData,
    column: TableXVanillaColumn<TData>,
    colId: string,
    nextVal: unknown,
  ): void {
    const propKey =
      column.accessorKey !== undefined && String(column.accessorKey) !== ""
        ? String(column.accessorKey)
        : colId;
    if (
      row !== null &&
      typeof row === "object" &&
      !Object.isFrozen(row) &&
      !propKey.includes(".") &&
      propKey !== "__proto__" &&
      propKey !== "constructor" &&
      propKey !== "prototype"
    ) {
      try {
        (row as Record<string, unknown>)[propKey] = nextVal;
      } catch {
        // Read-only row property; host receives newValue via callback
      }
    }
  }

  private startEditingRow(row: TData, rowId: string): void {
    this.editingCell = null;
    this.editingRowId = rowId;
    this.cellValidationError = null;
    const draft: Record<string, unknown> = {};
    for (const col of this.visibleCols()) {
      if (isEditable(col)) {
        const cid = getColumnId(col);
        draft[cid] = getCellValue(col, row);
      }
    }
    this.rowEditDraft = draft;
    this.render();
  }

  private commitRowEdit(
    row: TData,
    rowId: string,
    cols: readonly TableXVanillaColumn<TData>[],
  ): void {
    const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
    for (const col of cols) {
      if (!isEditable(col)) continue;
      const cid = getColumnId(col);
      const oldVal = getCellValue(col, row);
      const rawDraft = cid in this.rowEditDraft ? this.rowEditDraft[cid] : oldVal;
      const coerced = coerceEditedValue(rawDraft, col.meta?.editType);
      const validationErr = validateEditedCell(col, coerced, row);
      if (validationErr) {
        this.cellValidationError = validationErr;
        this.render();
        return;
      }
      changes[cid] = { oldValue: oldVal, newValue: coerced };
    }

    const updatedRow =
      row !== null && typeof row === "object"
        ? ({ ...(row as Record<string, unknown>) } as TData)
        : row;

    for (const col of cols) {
      if (!isEditable(col)) continue;
      const cid = getColumnId(col);
      const change = changes[cid];
      if (!change) continue;
      this.writeMutatedRowValue(row, col, cid, change.newValue);
      this.writeMutatedRowValue(updatedRow, col, cid, change.newValue);
      if (change.oldValue !== change.newValue) {
        this.dirtyCells.add(`${rowId}::${cid}`);
        this.options.onCellEdit?.({
          row,
          columnId: cid,
          oldValue: change.oldValue,
          newValue: change.newValue,
        });
      }
    }

    this.editingRowId = null;
    this.rowEditDraft = {};
    this.cellValidationError = null;
    this.options.onRowEdit?.({
      row,
      updatedRow,
      changes,
    });
    this.render();
  }

  private createEditorControl(
    column: TableXVanillaColumn<TData>,
    initialValue: unknown,
  ): HTMLInputElement | HTMLSelectElement {
    const editType = column.meta?.editType || "text";
    if (editType === "select" && column.meta?.editOptions) {
      const select = el("select", {
        class: "tbx-cell-edit-select tbx-cell-edit-input",
      }) as HTMLSelectElement;
      for (const opt of column.meta.editOptions) {
        const optEl = el("option", { attrs: { value: opt }, text: opt }) as HTMLOptionElement;
        if (String(initialValue) === opt) optEl.selected = true;
        select.appendChild(optEl);
      }
      select.value = initialValue !== null && initialValue !== undefined ? String(initialValue) : "";
      return select;
    }
    if (editType === "boolean") {
      const cb = el("input", {
        class: "tbx-checkbox tbx-cell-edit-checkbox",
        attrs: { type: "checkbox" },
      }) as HTMLInputElement;
      cb.checked = Boolean(initialValue);
      return cb;
    }
    const strVal =
      initialValue !== null && initialValue !== undefined
        ? editType === "date" && initialValue instanceof Date
          ? initialValue.toISOString().slice(0, 10)
          : String(initialValue)
        : "";
    const inputType =
      editType === "number" ? "number" : editType === "date" ? "date" : "text";
    const input = el("input", {
      class: "tbx-cell-edit-input",
      attrs: {
        type: inputType,
        value: strVal,
      },
    }) as HTMLInputElement;
    input.value = strVal;
    return input;
  }

  private readEditorRawValue(
    column: TableXVanillaColumn<TData>,
    control: HTMLInputElement | HTMLSelectElement,
  ): unknown {
    if (column.meta?.editType === "boolean" && "checked" in control) {
      return control.checked;
    }
    return control.value;
  }

  /**
   * Write one cell's content with inline / full-row editing and tree chevron support.
   */
  private renderCellInto(
    host: HTMLElement,
    column: TableXVanillaColumn<TData>,
    row: TData,
    rowId?: string,
    extraOpts?: {
      treeNode?: TreeRowNode<TData>;
      isRowEditing?: boolean;
      showRowEditActions?: boolean;
      cols?: readonly TableXVanillaColumn<TData>[];
    },
  ): void {
    const colId = getColumnId(column);
    const value = getCellValue(column, row);
    const isRowEditCell =
      Boolean(extraOpts?.isRowEditing) && isEditable(column) && rowId !== undefined;
    const isCurrentlyEditing =
      !isRowEditCell &&
      rowId !== undefined &&
      this.editingCell?.rowId === rowId &&
      this.editingCell?.columnId === colId;

    if (isRowEditCell && rowId !== undefined) {
      const editWrap = el("div", { class: "tbx-cell-edit-wrap" });
      editWrap.addEventListener("click", (e) => e.stopPropagation());
      const draftVal = colId in this.rowEditDraft ? this.rowEditDraft[colId] : value;
      const editInput = this.createEditorControl(column, draftVal);
      if (this.cellValidationError) {
        editInput.classList.add("tbx-cell-edit-input--invalid");
      }

      const syncDraft = () => {
        this.rowEditDraft[colId] = this.readEditorRawValue(column, editInput);
      };
      editInput.addEventListener("input", syncDraft);
      editInput.addEventListener("change", syncDraft);
      editInput.addEventListener("keydown", ((e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          syncDraft();
          this.commitRowEdit(row, rowId, extraOpts?.cols ?? this.visibleCols());
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.editingRowId = null;
          this.rowEditDraft = {};
          this.cellValidationError = null;
          this.render();
        }
      }) as EventListener);

      editWrap.appendChild(editInput);

      if (extraOpts?.showRowEditActions) {
        const actions = el("div", { class: "tbx-cell-edit-actions" });
        const saveBtn = el(
          "button",
          {
            class: "tbx-cell-edit-btn tbx-cell-edit-btn--save",
            attrs: { type: "button", "aria-label": this.locale.saveRow ?? "Save row" },
          },
          [checkIcon("tbx-icon")],
        );
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.commitRowEdit(row, rowId, extraOpts?.cols ?? this.visibleCols());
        });

        const cancelBtn = el(
          "button",
          {
            class: "tbx-cell-edit-btn tbx-cell-edit-btn--cancel",
            attrs: { type: "button", "aria-label": this.locale.cancelRowEdit ?? "Cancel" },
          },
          [xIcon("tbx-icon")],
        );
        cancelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.editingRowId = null;
          this.rowEditDraft = {};
          this.cellValidationError = null;
          this.render();
        });
        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        editWrap.appendChild(actions);

        if (this.cellValidationError) {
          editWrap.appendChild(
            el("span", { class: "tbx-cell-edit-error", text: this.cellValidationError }),
          );
        }
        setTimeout(() => editInput.focus?.(), 10);
      }

      replaceChildren(host, [editWrap]);
      return;
    }

    if (isCurrentlyEditing) {
      const editWrap = el("div", { class: "tbx-cell-edit-wrap" });
      editWrap.addEventListener("click", (e) => e.stopPropagation());

      const editInput = this.createEditorControl(column, value);
      if (this.cellValidationError) {
        editInput.classList.add("tbx-cell-edit-input--invalid");
      }

      const save = () => {
        const rawVal = this.readEditorRawValue(column, editInput);
        const nextVal = coerceEditedValue(rawVal, column.meta?.editType);
        const validationErr = validateEditedCell(column, nextVal, row);
        if (validationErr) {
          this.cellValidationError = validationErr;
          editInput.classList.add("tbx-cell-edit-input--invalid");
          let errNode = editWrap.querySelector(".tbx-cell-edit-error");
          if (!errNode) {
            errNode = el("span", { class: "tbx-cell-edit-error", text: validationErr });
            editWrap.appendChild(errNode);
          } else {
            errNode.textContent = validationErr;
          }
          return;
        }
        this.cellValidationError = null;
        this.editingCell = null;
        if (rowId !== undefined) {
          this.writeMutatedRowValue(row, column, colId, nextVal);
          if (value !== nextVal) {
            this.dirtyCells.add(`${rowId}::${colId}`);
          }
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
        this.cellValidationError = null;
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
      if (this.cellValidationError) {
        editWrap.appendChild(
          el("span", { class: "tbx-cell-edit-error", text: this.cellValidationError }),
        );
      }
      replaceChildren(host, [editWrap]);

      setTimeout(() => editInput.focus?.(), 10);
      return;
    }

    if (isEditable(column) && rowId !== undefined) {
      host.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (this.options.editMode === "row") {
          this.startEditingRow(row, rowId);
        } else {
          this.cellValidationError = null;
          this.editingCell = { rowId, columnId: colId };
          this.render();
        }
      });
    }

    const contentTarget = extraOpts?.treeNode ? el("span", { class: "tbx-tree-label" }) : host;

    const custom = column.cell;
    if (custom) {
      const rendered: TableXNode | null | undefined = custom({
        row: { original: row },
        getValue: () => value,
      });
      if (rendered !== null && rendered !== undefined) {
        if (typeof rendered === "string") contentTarget.textContent = rendered;
        else contentTarget.appendChild(rendered);
      }
    } else {
      contentTarget.textContent = getCellText(value, {
        yes: this.locale.booleanYes,
        no: this.locale.booleanNo,
      });
    }

    if (extraOpts?.treeNode) {
      const tNode = extraOpts.treeNode;
      const treeWrap = el("div", {
        class: "tbx-tree-cell-wrap",
        style: tNode.depth > 0 ? { paddingInlineStart: `${tNode.depth * 18}px` } : undefined,
      });
      if (tNode.hasChildren) {
        const toggleBtn = el(
          "button",
          {
            class: tNode.isExpanded ? "tbx-tree-toggle tbx-tree-toggle--open" : "tbx-tree-toggle",
            attrs: {
              type: "button",
              "aria-expanded": String(tNode.isExpanded),
              "aria-label": tNode.isExpanded ? "Collapse children" : "Expand children",
            },
          },
          [chevronRightIcon("tbx-icon")],
        );
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (this.treeExpandedIds.has(tNode.id)) {
            this.treeExpandedIds.delete(tNode.id);
          } else {
            this.treeExpandedIds.add(tNode.id);
          }
          this.render();
        });
        treeWrap.appendChild(toggleBtn);
      } else {
        treeWrap.appendChild(el("span", { class: "tbx-tree-spacer", attrs: { "aria-hidden": "true" } }));
      }
      treeWrap.appendChild(contentTarget);
      host.appendChild(treeWrap);
    }
  }

  // ---- Infinite Footer, Context Menu, Keyboard Nav & Range Clipboard -------

  private renderInfiniteFooter(): void {
    if (!this.isInfiniteMode() || (!this.hasMore && !this.isLoadingMore)) {
      this.infiniteFooter.style.display = "none";
      replaceChildren(this.infiniteFooter, []);
      return;
    }

    this.infiniteFooter.style.display = "flex";
    const btn = el("button", {
      class: "tbx-load-more-btn",
      attrs: {
        type: "button",
        disabled: this.isLoadingMore,
      },
      text: this.isLoadingMore
        ? (this.locale.loadingMoreText ?? "Loading more…")
        : (this.locale.loadMoreButton ?? "Load more"),
    });
    btn.addEventListener("click", () => {
      if (!this.isLoadingMore && this.hasMore) {
        this.options.onLoadMore?.(this.nextCursor);
      }
    });
    replaceChildren(this.infiniteFooter, [btn]);
  }

  private closeContextMenu(): void {
    if (this.activeContextMenuEl) {
      this.activeContextMenuEl.remove();
      this.activeContextMenuEl = null;
    }
  }

  private openCellContextMenu(
    e: MouseEvent,
    row: TData,
    column: TableXVanillaColumn<TData>,
    colId: string,
  ): void {
    this.closeContextMenu();
    const rawVal = getCellValue(column, row);
    const cellText = getCellText(rawVal, {
      yes: this.locale.booleanYes,
      no: this.locale.booleanNo,
    });

    const menu = el("div", {
      class: "tbx-context-menu",
      attrs: { role: "menu" },
    });

    const addItem = (
      label: string,
      onClick: () => void,
      opts?: { danger?: boolean; disabled?: boolean; actionKey?: string },
    ) => {
      const classes = ["tbx-context-menu-item"];
      if (opts?.danger) classes.push("tbx-context-menu-item--danger");
      const itemBtn = el("button", {
        class: classes.join(" "),
        attrs: {
          type: "button",
          role: "menuitem",
          disabled: opts?.disabled ?? false,
          "data-ctx-action": opts?.actionKey,
        },
        text: label,
      });
      itemBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.closeContextMenu();
        onClick();
      });
      menu.appendChild(itemBtn);
    };

    addItem(
      this.locale.copyCell ?? "Copy cell",
      () => {
        void navigator.clipboard?.writeText?.(cellText);
      },
      { actionKey: "copy-cell" },
    );

    addItem(
      this.locale.copyRow ?? "Copy row",
      () => {
        const line = this.visibleCols()
          .map((c) =>
            getCellText(getCellValue(c, row), {
              yes: this.locale.booleanYes,
              no: this.locale.booleanNo,
            }).replace(/\t|\r|\n/g, " "),
          )
          .join("\t");
        void navigator.clipboard?.writeText?.(line);
      },
      { actionKey: "copy-row" },
    );

    if (
      cellText !== "" &&
      isFilterable(column, this.options.enableColumnFilters !== false)
    ) {
      addItem(
        formatMessage(this.locale.filterByValue ?? 'Filter by "{value}"', {
          value: cellText.length > 24 ? `${cellText.slice(0, 24)}…` : cellText,
        }),
        () => {
          const filterField = getFilterField(column);
          this.applyQuery(withFilter(this.query, filterField, cellText));
        },
        { actionKey: "filter-by-value" },
      );
    }

    if (!isStructuralColumn(column) && colId !== "") {
      menu.appendChild(el("div", { class: "tbx-context-menu-sep" }));
      const pin = isPinned(column, this.pinnedColumns);
      if (pin === "left" || pin === "right") {
        addItem(
          this.locale.unpinColumn ?? "Unpin column",
          () => {
            this.pinnedColumns = { ...this.pinnedColumns, [colId]: "none" };
            this.saveState();
            this.render();
          },
          { actionKey: "unpin" },
        );
      } else {
        addItem(
          this.locale.pinLeft ?? "Pin left",
          () => {
            this.pinnedColumns = { ...this.pinnedColumns, [colId]: "left" };
            this.saveState();
            this.render();
          },
          { actionKey: "pin-left" },
        );
      }

      if (isHideable(column) && this.visibleCols().length > 1) {
        addItem(
          this.locale.hideColumn ?? "Hide column",
          () => {
            this.hidden = { ...this.hidden, [colId]: true };
            this.saveState();
            this.render();
          },
          { actionKey: "hide" },
        );
      }
    }

    const customItems: readonly ContextMenuItem[] =
      this.options.contextMenuItems?.({ row, columnId: colId, value: rawVal }) ?? [];
    if (customItems.length > 0) {
      menu.appendChild(el("div", { class: "tbx-context-menu-sep" }));
      for (const item of customItems) {
        if (item.separatorBefore) {
          menu.appendChild(el("div", { class: "tbx-context-menu-sep" }));
        }
        addItem(item.label, item.onSelect, {
          danger: item.danger,
          disabled: item.disabled,
          actionKey: item.id,
        });
      }
    }

    const winW = typeof window !== "undefined" ? (window.innerWidth || 1024) : 1024;
    const winH = typeof window !== "undefined" ? (window.innerHeight || 800) : 800;
    const x = Math.min(Math.max(8, e.clientX || 0), Math.max(8, winW - 210));
    const y = Math.min(Math.max(8, e.clientY || 0), Math.max(8, winH - 240));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    this.activeContextMenuEl = menu;
    document.body.appendChild(menu);
  }

  private applyFillHandleToRow(
    targetRowIdx: number,
    cols: readonly TableXVanillaColumn<TData>[],
  ): void {
    if (!this.cellRange) return;
    const rows = this.displayedDataList();
    const startRow = this.cellRange.minRow;
    const endRow = Math.max(startRow, Math.min(rows.length - 1, targetRowIdx));
    const sourceRow = rows[startRow];
    if (!sourceRow) return;

    for (let c = this.cellRange.minCol; c <= this.cellRange.maxCol; c++) {
      const col = cols[c];
      if (!col || !isEditable(col)) continue;
      const cid = getColumnId(col);
      const sourceVal = getCellValue(col, sourceRow);

      for (let r = startRow + 1; r <= endRow; r++) {
        const targetRow = rows[r];
        if (!targetRow) continue;
        const oldVal = getCellValue(col, targetRow);
        const coerced = coerceEditedValue(sourceVal, col.meta?.editType);
        if (validateEditedCell(col, coerced, targetRow) !== null) continue;
        this.writeMutatedRowValue(targetRow, col, cid, coerced);
        const rid = this.rowId(targetRow);
        if (oldVal !== coerced) {
          this.dirtyCells.add(`${rid}::${cid}`);
          this.options.onCellEdit?.({
            row: targetRow,
            columnId: cid,
            oldValue: oldVal,
            newValue: coerced,
          });
        }
      }
    }

    this.cellRange = {
      ...this.cellRange,
      maxRow: endRow,
    };
    this.renderBody();
    this.renderFooter();
  }

  private handleGridKeyDown(e: KeyboardEvent): void {
    if (this.options.enableKeyboardNavigation === false) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.nodeName === "INPUT" ||
        target.nodeName === "SELECT" ||
        target.nodeName === "TEXTAREA")
    ) {
      if ((target as HTMLInputElement).type !== "checkbox" && (target as HTMLInputElement).type !== "radio") {
        return;
      }
    }
    if (this.editingCell || this.editingRowId) return;

    const rows = this.displayedDataList();
    const cols = this.visibleCols();
    if (rows.length === 0 || cols.length === 0) return;

    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === "c" &&
      this.options.enableRangeSelection &&
      this.cellRange
    ) {
      const tsv = formatRangeTsv(rows, cols, this.cellRange, {
        yes: this.locale.booleanYes,
        no: this.locale.booleanNo,
      });
      if (tsv) {
        e.preventDefault();
        void navigator.clipboard?.writeText?.(tsv);
      }
      return;
    }

    const navKeys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ];
    if (navKeys.includes(e.key)) {
      const base = this.focusedCell ?? { rowIndex: 0, colIndex: 0 };
      const next = moveFocusCoord(base, e.key, rows.length, cols.length);
      if (!next) return;
      e.preventDefault();
      this.focusedCell = next;
      if (this.options.enableRangeSelection) {
        if (e.shiftKey) {
          const anchor = this.rangeAnchor ?? base;
          this.rangeAnchor = anchor;
          this.cellRange = normalizeCellRange(anchor, next);
        } else {
          this.rangeAnchor = next;
          this.cellRange = normalizeCellRange(next, next);
        }
      }
      this.renderBody();
      this.renderFooter();
      this.restoreFocus(`cell:${next.rowIndex}:${next.colIndex}`);
      return;
    }

    if ((e.key === "Enter" || e.key === "F2") && this.focusedCell) {
      const row = rows[this.focusedCell.rowIndex];
      const col = cols[this.focusedCell.colIndex];
      if (row && col && isEditable(col)) {
        e.preventDefault();
        const rid = this.rowId(row);
        if (this.options.editMode === "row") {
          this.startEditingRow(row, rid);
        } else {
          this.cellValidationError = null;
          this.editingCell = { rowId: rid, columnId: getColumnId(col) };
          this.render();
        }
      }
      return;
    }

    if (e.key === " " && this.focusedCell && this.selectionEnabled()) {
      if (target && (target.nodeName === "BUTTON" || target.nodeName === "INPUT")) return;
      const row = rows[this.focusedCell.rowIndex];
      if (row) {
        e.preventDefault();
        this.lastSelectedRowIndex = this.focusedCell.rowIndex;
        this.toggleSelectRow(this.rowId(row));
      }
    }
  }

  private handleGridPaste(e: ClipboardEvent): void {
    if (!this.options.enableRangeSelection || !this.focusedCell) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.nodeName === "INPUT" ||
        target.nodeName === "SELECT" ||
        target.nodeName === "TEXTAREA")
    ) {
      return;
    }
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const matrix = parseClipboardTsv(text);
    if (matrix.length === 0) return;

    e.preventDefault();
    const rows = this.displayedDataList();
    const cols = this.visibleCols();
    const startR = this.focusedCell.rowIndex;
    const startC = this.focusedCell.colIndex;

    let maxR = startR;
    let maxC = startC;
    for (let rOff = 0; rOff < matrix.length; rOff++) {
      const targetRow = rows[startR + rOff];
      if (!targetRow) break;
      maxR = startR + rOff;
      const cells = matrix[rOff]!;
      for (let cOff = 0; cOff < cells.length; cOff++) {
        const col = cols[startC + cOff];
        if (!col) break;
        maxC = Math.max(maxC, startC + cOff);
        if (!isEditable(col)) continue;
        const cid = getColumnId(col);
        const oldVal = getCellValue(col, targetRow);
        const coerced = coerceEditedValue(cells[cOff], col.meta?.editType);
        if (validateEditedCell(col, coerced, targetRow) !== null) continue;
        this.writeMutatedRowValue(targetRow, col, cid, coerced);
        const rid = this.rowId(targetRow);
        if (oldVal !== coerced) {
          this.dirtyCells.add(`${rid}::${cid}`);
          this.options.onCellEdit?.({
            row: targetRow,
            columnId: cid,
            oldValue: oldVal,
            newValue: coerced,
          });
        }
      }
    }

    this.cellRange = normalizeCellRange(
      { rowIndex: startR, colIndex: startC },
      { rowIndex: maxR, colIndex: maxC },
    );
    this.renderBody();
    this.renderFooter();
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
    if (this.options.enableVirtualization && this.data.length > 50) {
      const win = computeVirtualWindow({
        totalRows: this.data.length,
        scrollTop: this.virtualScrollTop,
        viewportHeight: this.options.virtualHeight,
        density: this.density,
        overscan: this.options.virtualOverscan,
      });
      const cardNodes: HTMLElement[] = [];
      for (let index = win.startIndex; index < win.endIndex; index++) {
        const row = this.data[index];
        if (row !== undefined) cardNodes.push(this.buildCard(row, index, cols));
      }
      replaceChildren(this.cards, cardNodes);
      return;
    }
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
    const selected = this.isRowSelected(id);
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
    const selectedTotal = this.effectiveSelectedCount();
    if (selectedTotal > 0) {
      rangeChildren.push(
        el("span", {
          class: "tbx-selected-badge",
          text: formatMessage(this.locale.selectedBadge, { count: selectedTotal.toLocaleString() }),
        }),
      );
    }
    if (this.options.enableRangeSelection && this.cellRange) {
      const stats = computeRangeStats(this.displayedDataList(), this.visibleCols(), this.cellRange);
      if (stats && stats.cellCount > 1) {
        const parts = [`Count: ${stats.cellCount}`];
        if (stats.numericCount > 0 && stats.sum !== null && stats.avg !== null) {
          parts.push(`Sum: ${Number(stats.sum.toFixed(2)).toLocaleString()}`);
          parts.push(`Avg: ${Number(stats.avg.toFixed(2)).toLocaleString()}`);
        }
        rangeChildren.push(
          el("span", {
            class: "tbx-range-stats-badge",
            text: parts.join(" · "),
          }),
        );
      }
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
      button.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyQuery(withPage(this.query, target, totalPages));
      });
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
      button.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyQuery(withPage(this.query, item, totalPages));
      });
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

type HostWithHandle = HTMLElement & {
  tablex?: TableXHandle<unknown>;
  __tablexColCount?: number;
};

/**
 * Mount (or upgrade) a grid from a DOM host element/id and a JSON `<script>` config element/id.
 * Safe to call multiple times (idempotent) and CSP-friendly for Blazor / Razor JS interop.
 */
export function mountFromConfig(
  containerOrId: HTMLElement | string,
  configId?: string,
): TableXHandle<unknown> | null {
  if (typeof document === "undefined") return null;
  const host = (
    typeof containerOrId === "string" ? document.getElementById(containerOrId) : containerOrId
  ) as HostWithHandle | null;
  if (!host) return null;

  const resolvedConfigId = configId ?? host.getAttribute("data-tablex-config") ?? "";
  const dataEl = resolvedConfigId ? document.getElementById(resolvedConfigId) : null;
  if (!dataEl || !dataEl.textContent) return host.tablex ?? null;

  let parsed: TableXOptions<unknown>;
  try {
    parsed = JSON.parse(dataEl.textContent) as TableXOptions<unknown>;
  } catch {
    return host.tablex ?? null;
  }

  const nextColCount = Array.isArray(parsed.columns) ? parsed.columns.length : 0;
  if (host.tablex) {
    if ((host.__tablexColCount ?? 0) === 0 && nextColCount > 0) {
      host.tablex.destroy();
      delete host.tablex;
    } else {
      return host.tablex;
    }
  }

  const handle = createTableX(host, parsed);
  host.tablex = handle;
  host.__tablexColCount = nextColCount;
  return handle;
}

/** Destroy a grid previously attached to a host element (or element id) as `host.tablex`. */
export function destroyMounted(containerOrId: HTMLElement | string): void {
  if (typeof document === "undefined") return;
  const host = (
    typeof containerOrId === "string" ? document.getElementById(containerOrId) : containerOrId
  ) as HostWithHandle | null;
  if (!host?.tablex) return;
  host.tablex.destroy();
  delete host.tablex;
  delete host.__tablexColCount;
}
