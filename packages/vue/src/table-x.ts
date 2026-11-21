import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
  type VNode,
  type VNodeChild,
} from "vue";
import {
  DENSITIES,
  DEFAULT_ROW_CAP,
  DEFAULT_VIRTUAL_HEIGHT,
  PAGE_SIZES,
  buildHeaderRows,
  buildNestedGroupItems,
  buildQueryUrl,
  clearGridState,
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
  flattenColumns,
  flattenTreeRows,
  formatFilterPillValue,
  formatMessage,
  formatRangeTsv,
  getCellText,
  getCellValue,
  getColumnId,
  getColumnTitle,
  getFilterField,
  getPageNumbers,
  getRecordRange,
  getSortField,
  initialHiddenColumns,
  isCellInRange,
  isEditable,
  isFilterable,
  isHideable,
  isMultiSelectFilter,
  isPageSize,
  isPinned,
  isSortable,
  isStructuralColumn,
  loadGridState,
  loadSavedViews,
  moveFocusCoord,
  normalizeCellRange,
  normalizeGroupBy,
  parseClipboardTsv,
  parseMultiFilterValues,
  queryClientData,
  removeSavedView,
  reorderArrayItem,
  resolveLocale,
  saveGridState,
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
  type CellCoord,
  type ContextMenuItem,
  type Density,
  type EditMode,
  type ExcelBadgeRule,
  type ExportFormat,
  type NormalizedCellRange,
  type PagedResponse,
  type QueryState,
  type RowEditEvent,
  type RowOrderChangeEvent,
  type SavedGridView,
  type TableXLocale,
  type TreeRowNode,
} from "@nexgrid/core";

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
  downloadTrayIcon,
  fileSpreadsheetIcon,
  fileTextIcon,
  rotateCcwIcon,
  searchIcon,
  slidersIcon,
  xIcon,
} from "./icons.js";
import type { TableXNotice, TableXNoticeType, TableXTheme, TableXVueColumn } from "./types.js";

const SEARCH_DEBOUNCE_MS = 350;
let vueUidCounter = 0;

function defaultRowId(row: unknown): string {
  if (row !== null && typeof row === "object" && "id" in row) {
    const id = (row as { id?: unknown }).id;
    if (id !== null && id !== undefined) return String(id);
  }
  return String(row);
}

function splitRangeTemplate(template: string, values: Record<string, string>): VNodeChild[] {
  const nodes: VNodeChild[] = [];
  for (const part of template.split(/(\{start\}|\{end\}|\{total\})/g)) {
    if (!part) continue;
    if (part === "{start}") nodes.push(h("strong", values.start));
    else if (part === "{end}") nodes.push(h("strong", values.end));
    else if (part === "{total}") nodes.push(h("strong", { class: "tbx-range-total" }, values.total));
    else nodes.push(part);
  }
  return nodes;
}

export const TableX = defineComponent({
  name: "TableX",
  props: {
    columns: {
      type: Array as PropType<TableXVueColumn<unknown>[]>,
      required: true,
    },
    data: {
      type: Array as PropType<unknown[]>,
      required: true,
    },
    total: { type: Number, default: undefined },
    query: { type: Object as PropType<QueryState>, default: undefined },
    onQueryChange: { type: Function as PropType<(next: QueryState) => void>, default: undefined },
    clientSidePagination: { type: Boolean, default: undefined },
    paginationMode: {
      type: String as PropType<"client" | "server" | "infinite">,
      default: undefined,
    },
    searchableFields: { type: Array as PropType<string[]>, default: undefined },
    caption: { type: String, required: true },
    density: { type: String as PropType<Density>, default: "default" },
    isLoading: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
    onRetry: { type: Function as PropType<() => void>, default: undefined },
    enableSelection: { type: Boolean, default: false },
    selectionMode: { type: String as PropType<"multi" | "single">, default: "multi" },
    enableColumnFilters: { type: Boolean, default: true },
    enableColumnMenu: { type: Boolean, default: true },
    enableColumnResize: { type: Boolean, default: true },
    onSelectionChange: {
      type: Function as PropType<(ids: string[], allAcross: boolean) => void>,
      default: undefined,
    },
    enableSearch: { type: Boolean, default: true },
    searchPlaceholder: { type: String, default: undefined },
    enableColumns: { type: Boolean, default: true },
    showColumnsButton: { type: Boolean, default: undefined },
    enableDensity: { type: Boolean, default: true },
    showDensityButton: { type: Boolean, default: undefined },
    enableExport: { type: Boolean, default: true },
    showExportButton: { type: Boolean, default: undefined },
    enableSorting: { type: Boolean, default: true },
    enablePagination: { type: Boolean, default: true },
    showPagination: { type: Boolean, default: undefined },
    enableRowsPerPage: { type: Boolean, default: true },
    showRowsPerPage: { type: Boolean, default: undefined },
    enableJumpToPage: { type: Boolean, default: true },
    showJumpToPage: { type: Boolean, default: undefined },
    showToolbar: { type: Boolean, default: true },
    showFooter: { type: Boolean, default: true },
    renderExpandedRow: {
      type: Function as PropType<(row: unknown) => VNodeChild>,
      default: undefined,
    },
    enableBulkActions: { type: Boolean, default: true },
    bulkActions: {
      type: Function as PropType<(ids: string[], deselectAll: () => void) => VNodeChild>,
      default: undefined,
    },
    enableSummaryRow: { type: Boolean, default: undefined },
    enableColumnReorder: { type: Boolean, default: false },
    enableVirtualization: { type: Boolean, default: false },
    virtualHeight: { type: Number, default: DEFAULT_VIRTUAL_HEIGHT },
    virtualOverscan: { type: Number, default: undefined },
    groupBy: {
      type: [String, Array] as PropType<string | readonly string[]>,
      default: undefined,
    },
    onGroupByChange: {
      type: Function as PropType<(colId: string | undefined, all: string[]) => void>,
      default: undefined,
    },
    enableKeyboardNavigation: { type: Boolean, default: true },
    enableContextMenu: { type: Boolean, default: true },
    contextMenuItems: {
      type: Function as PropType<
        (ctx: { row: unknown; columnId: string; value: unknown }) => readonly ContextMenuItem[]
      >,
      default: undefined,
    },
    enableTreeData: { type: Boolean, default: false },
    childrenKey: { type: String, default: undefined },
    getSubRows: {
      type: Function as PropType<(row: unknown) => readonly unknown[] | undefined>,
      default: undefined,
    },
    defaultExpandedDepth: { type: Number, default: 0 },
    pinnedTopRows: { type: Array as PropType<readonly unknown[]>, default: undefined },
    pinnedBottomRows: { type: Array as PropType<readonly unknown[]>, default: undefined },
    editMode: { type: String as PropType<EditMode>, default: "cell" },
    onRowEdit: {
      type: Function as PropType<(ev: RowEditEvent<unknown>) => void>,
      default: undefined,
    },
    enableSavedViews: { type: Boolean, default: false },
    savedViews: { type: Array as PropType<readonly SavedGridView[]>, default: undefined },
    onSavedViewsChange: {
      type: Function as PropType<(views: SavedGridView[]) => void>,
      default: undefined,
    },
    enableRowReorder: { type: Boolean, default: false },
    onRowOrderChange: {
      type: Function as PropType<(ev: RowOrderChangeEvent<unknown>) => void>,
      default: undefined,
    },
    enableInfiniteScroll: { type: Boolean, default: false },
    hasMore: { type: Boolean, default: false },
    isLoadingMore: { type: Boolean, default: false },
    nextCursor: { type: String as PropType<string | null>, default: null },
    onLoadMore: {
      type: Function as PropType<(cursor: string | null) => void>,
      default: undefined,
    },
    enableRangeSelection: { type: Boolean, default: false },
    onColumnOrderChange: {
      type: Function as PropType<(order: string[]) => void>,
      default: undefined,
    },
    onCellEdit: {
      type: Function as PropType<
        (ev: { row: unknown; columnId: string; oldValue: unknown; newValue: unknown }) => void
      >,
      default: undefined,
    },
    storageKey: { type: String, default: undefined },
    showFilterPills: { type: Boolean, default: true },
    toolbarActions: {
      type: [Object, String, Array] as PropType<VNodeChild>,
      default: undefined,
    },
    onRowClick: { type: Function as PropType<(row: unknown) => void>, default: undefined },
    getRowId: { type: Function as PropType<(row: unknown) => string>, default: undefined },
    className: { type: String, default: undefined },
    showSerialNumber: { type: Boolean, default: true },
    exportFileName: { type: String, default: undefined },
    allData: { type: Array as PropType<readonly unknown[]>, default: undefined },
    fetchAllData: {
      type: Function as PropType<
        (q: QueryState) => Promise<readonly unknown[]> | readonly unknown[]
      >,
      default: undefined,
    },
    fetchPage: {
      type: Function as PropType<
        (page: number, pageSize: number, q: QueryState) => Promise<PagedResponse<unknown>>
      >,
      default: undefined,
    },
    maxExportRows: { type: Number, default: undefined },
    exportMode: {
      type: String as PropType<"menu" | "split" | "excel" | "csv" | "pdf">,
      default: "menu",
    },
    quickExport: {
      type: [Boolean, String] as PropType<boolean | ExportFormat>,
      default: undefined,
    },
    onExportAll: {
      type: Function as PropType<
        (fmt: ExportFormat) => void | Promise<void> | Promise<readonly unknown[]> | readonly unknown[]
      >,
      default: undefined,
    },
    fetchEndpoint: { type: String, default: undefined },
    fetchOptions: { type: Object as PropType<RequestInit>, default: undefined },
    badgeRules: { type: Array as PropType<readonly ExcelBadgeRule[]>, default: undefined },
    locale: { type: Object as PropType<Partial<TableXLocale>>, default: undefined },
    theme: { type: String as PropType<TableXTheme>, default: "light" },
    onNotify: { type: Function as PropType<(notice: TableXNotice) => void>, default: undefined },
  },
  emits: [
    "update:query",
    "queryChange",
    "selectionChange",
    "rowClick",
    "retry",
    "notify",
    "exportAll",
    "groupByChange",
    "columnOrderChange",
    "cellEdit",
    "rowEdit",
    "savedViewsChange",
    "rowOrderChange",
    "loadMore",
  ],
  setup(props, { slots, emit }) {
    const uid = `tbx-vue-${++vueUidCounter}`;
    const rootRef = ref<HTMLElement | null>(null);
    const tableWrapRef = ref<HTMLElement | null>(null);

    const locale = computed(() => resolveLocale(props.locale));
    const boolLabels = computed(() => ({
      yes: locale.value.booleanYes,
      no: locale.value.booleanNo,
    }));
    const rowIdFn = computed(() => props.getRowId ?? defaultRowId);

    const isClientSide = computed(
      () =>
        props.clientSidePagination === true ||
        props.paginationMode === "client" ||
        (props.onQueryChange === undefined && props.query === undefined),
    );
    const isTreeEnabled = computed(
      () => props.enableTreeData === true || typeof props.getSubRows === "function",
    );
    const isInfiniteMode = computed(
      () => props.enableInfiniteScroll === true || props.paginationMode === "infinite",
    );

    const internalQuery = ref<QueryState>(props.query ?? defaultQuery());
    const activeQuery = computed(() => props.query ?? internalQuery.value);

    const pushQuery = (next: QueryState): void => {
      internalQuery.value = next;
      if (props.enableVirtualization) {
        virtualScrollTop.value = 0;
        if (tableWrapRef.value) tableWrapRef.value.scrollTop = 0;
      }
      props.onQueryChange?.(next);
      emit("update:query", next);
      emit("queryChange", next);
    };

    const colList = ref<TableXVueColumn<unknown>[]>([...props.columns]);
    watch(
      () => props.columns,
      (next) => {
        colList.value = [...next];
      },
    );

    const density = ref<Density>(props.density ?? "default");
    const hiddenCols = ref<Record<string, boolean>>(
      initialHiddenColumns(flattenColumns(props.columns)),
    );
    const colWidths = ref<Record<string, number>>({});
    const pinnedCols = ref<Record<string, "left" | "right" | "none">>({});
    const activeGroupBy = ref<string[]>(normalizeGroupBy(props.groupBy));
    const collapsedGroups = ref<Set<string>>(new Set());
    watch(
      () => props.groupBy,
      (next) => {
        activeGroupBy.value = normalizeGroupBy(next);
        collapsedGroups.value = new Set();
      },
    );

    const treeExpandedIds = ref<Set<string>>(
      isTreeEnabled.value && props.defaultExpandedDepth !== 0
        ? collectInitialExpandedTreeIds(props.data, props.defaultExpandedDepth, {
            childrenKey: props.childrenKey,
            getSubRows: props.getSubRows,
            getRowId: rowIdFn.value,
          })
        : new Set(),
    );

    const savedViewsList = ref<SavedGridView[]>(
      props.savedViews ? [...props.savedViews] : loadSavedViews(props.storageKey),
    );
    watch(
      () => props.savedViews,
      (next) => {
        if (next) savedViewsList.value = [...next];
      },
    );
    const newViewName = ref("");

    const openMenu = ref<"columns" | "density" | "export" | "views" | null>(null);
    const openFilterCol = ref<string | null>(null);
    const filterSearchText = ref("");
    const filterRangeMin = ref("");
    const filterRangeMax = ref("");
    const filterMultiSet = ref<Set<string>>(new Set());

    const selectedIds = ref<Set<string>>(new Set());
    const allAcrossSelected = ref(false);
    const expandedRows = ref<Set<string>>(new Set());
    const reorderedRows = ref<unknown[] | null>(null);
    watch(
      () => [props.data, activeQuery.value],
      () => {
        reorderedRows.value = null;
      },
    );

    const editingCell = ref<{ rowId: string; columnId: string } | null>(null);
    const editingVal = ref("");
    const editingBool = ref(false);
    const editingRowId = ref<string | null>(null);
    const rowEditDraft = ref<Record<string, unknown>>({});
    const cellValidationError = ref<string | null>(null);
    const dirtyCells = ref<Set<string>>(new Set());

    const focusedCell = ref<CellCoord | null>(null);
    const rangeAnchor = ref<CellCoord | null>(null);
    const cellRange = ref<NormalizedCellRange | null>(null);
    const contextMenu = ref<{
      x: number;
      y: number;
      row: unknown;
      col: TableXVueColumn<unknown>;
      colId: string;
    } | null>(null);

    let isDraggingRange = false;
    let isFillingRange = false;
    let lastSelectedRowIdx: number | null = null;
    let shiftClickRow = false;
    let draggedRowIdx: number | null = null;
    let draggedColId: string | null = null;
    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    const searchText = ref(activeQuery.value.q ?? "");
    const jumpText = ref(String(Math.max(1, activeQuery.value.page)));
    const virtualScrollTop = ref(0);
    const isExporting = ref(false);

    watch(
      () => activeQuery.value.q,
      (q) => {
        if ((q ?? "") !== searchText.value) searchText.value = q ?? "";
      },
    );
    watch(
      () => activeQuery.value.page,
      (p) => {
        jumpText.value = String(Math.max(1, p));
      },
    );

    const savePersisted = (): void => {
      if (!props.storageKey) return;
      const hiddenList = Object.entries(hiddenCols.value)
        .filter(([_, v]) => v)
        .map(([k]) => k);
      saveGridState(props.storageKey, {
        density: density.value,
        columnWidths: { ...colWidths.value },
        columnOrder: colList.value.map(getColumnId).filter(Boolean) as string[],
        hiddenColumns: hiddenList,
        pinnedColumns: { ...pinnedCols.value },
        groupBy: [...activeGroupBy.value],
      });
    };

    const onGlobalPointerDown = (ev: Event): void => {
      const t = ev.target as HTMLElement | null;
      if (contextMenu.value && !t?.closest?.(".tbx-context-menu")) {
        contextMenu.value = null;
      }
      if (openMenu.value && !t?.closest?.(".tbx-menu-wrap")) {
        openMenu.value = null;
      }
      if (
        openFilterCol.value &&
        !t?.closest?.(".tbx-col-filter-wrap") &&
        !t?.closest?.(".tbx-filter-popover")
      ) {
        openFilterCol.value = null;
      }
    };
    const onGlobalPointerUp = (): void => {
      isDraggingRange = false;
      isFillingRange = false;
    };
    const onGlobalKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        contextMenu.value = null;
        openMenu.value = null;
        openFilterCol.value = null;
      }
    };

    onMounted(() => {
      if (props.storageKey) {
        const persisted = loadGridState(props.storageKey);
        if (persisted) {
          if (persisted.density) density.value = persisted.density;
          if (persisted.columnWidths) colWidths.value = { ...persisted.columnWidths };
          if (persisted.pinnedColumns) pinnedCols.value = { ...persisted.pinnedColumns };
          if (persisted.groupBy !== undefined) activeGroupBy.value = normalizeGroupBy(persisted.groupBy);
          if (persisted.hiddenColumns) {
            const map: Record<string, boolean> = {};
            for (const c of flattenColumns(props.columns)) {
              const cid = getColumnId(c);
              if (cid) map[cid] = persisted.hiddenColumns.includes(cid);
            }
            hiddenCols.value = map;
          }
        }
      }
      if (typeof document !== "undefined") {
        document.addEventListener("pointerdown", onGlobalPointerDown, true);
        document.addEventListener("pointerup", onGlobalPointerUp);
        document.addEventListener("keydown", onGlobalKeyDown);
      }
    });

    onBeforeUnmount(() => {
      if (searchTimer) clearTimeout(searchTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("pointerdown", onGlobalPointerDown, true);
        document.removeEventListener("pointerup", onGlobalPointerUp);
        document.removeEventListener("keydown", onGlobalKeyDown);
      }
    });

    const leafCols = computed(() => flattenColumns(colList.value));
    const visible = computed(() => visibleColumns(leafCols.value, hiddenCols.value));
    const headerRows = computed(() => buildHeaderRows(colList.value, hiddenCols.value));
    const isPaginationVisible = computed(
      () => props.enablePagination && props.showPagination !== false,
    );
    const clientQueryOpts = computed(() => {
      const fields =
        props.searchableFields ?? searchableColumnIds(colList.value, hiddenCols.value);
      return {
        columns: colList.value,
        ...(fields.length > 0 ? { searchableFields: fields } : {}),
        ...(props.enableVirtualization && !isPaginationVisible.value ? { paginate: false } : {}),
      };
    });

    const clientPaged = computed(() =>
      isClientSide.value ? queryClientData(props.data, activeQuery.value, clientQueryOpts.value) : null,
    );
    const baseRows = computed(
      () => reorderedRows.value ?? (clientPaged.value ? clientPaged.value.items : props.data),
    );
    const treeNodes = computed<TreeRowNode<unknown>[] | null>(() =>
      isTreeEnabled.value
        ? flattenTreeRows(baseRows.value, {
            childrenKey: props.childrenKey,
            getSubRows: props.getSubRows,
            getRowId: rowIdFn.value,
            expandedIds: treeExpandedIds.value,
          })
        : null,
    );
    const rows = computed(() =>
      treeNodes.value ? treeNodes.value.map((n) => n.row) : baseRows.value,
    );
    const total = computed(() =>
      clientPaged.value ? clientPaged.value.total : (props.total ?? props.data.length),
    );
    const pageRowIds = computed(() => rows.value.map((r) => rowIdFn.value(r)));

    const filterSig = computed(() =>
      JSON.stringify([activeQuery.value.q ?? "", activeQuery.value.filter ?? {}]),
    );
    watch(filterSig, () => {
      if (allAcrossSelected.value) {
        allAcrossSelected.value = false;
        emitSelection();
      }
    });

    const hasExpandCol = computed(
      () => Boolean(props.renderExpandedRow || slots["expanded-row"]),
    );
    const columnCount = computed(
      () =>
        visible.value.length +
        (props.enableRowReorder ? 1 : 0) +
        (hasExpandCol.value ? 1 : 0) +
        (props.showSerialNumber ? 1 : 0) +
        (props.enableSelection ? 1 : 0),
    );

    const pinnedMeta = computed(() => {
      const leftOffsets = new Map<string, number>();
      const rightOffsets = new Map<string, number>();
      let currentLeft = 0;
      let lastLeftPinnedId: string | null = null;
      const hasLeft = visible.value.some((c) => isPinned(c, pinnedCols.value) === "left");
      if (hasLeft) {
        if (props.enableRowReorder) {
          leftOffsets.set("__row_drag", currentLeft);
          currentLeft += 36;
          lastLeftPinnedId = "__row_drag";
        }
        if (hasExpandCol.value) {
          leftOffsets.set("__expand", currentLeft);
          currentLeft += 40;
          lastLeftPinnedId = "__expand";
        }
        if (props.enableSelection) {
          leftOffsets.set("__select", currentLeft);
          currentLeft += 44;
          lastLeftPinnedId = "__select";
        }
        if (props.showSerialNumber) {
          leftOffsets.set("__serial", currentLeft);
          currentLeft += 56;
          lastLeftPinnedId = "__serial";
        }
        for (const col of visible.value) {
          const cid = getColumnId(col);
          if (isPinned(col, pinnedCols.value) === "left") {
            const w = colWidths.value[cid] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
            leftOffsets.set(cid, currentLeft);
            currentLeft += w;
            lastLeftPinnedId = cid;
          }
        }
      }
      let currentRight = 0;
      let firstRightPinnedId: string | null = null;
      for (let i = visible.value.length - 1; i >= 0; i--) {
        const col = visible.value[i];
        if (!col) continue;
        const cid = getColumnId(col);
        if (isPinned(col, pinnedCols.value) === "right") {
          const w = colWidths.value[cid] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
          rightOffsets.set(cid, currentRight);
          currentRight += w;
          firstRightPinnedId = cid;
        }
      }
      return { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId };
    });

    const emitNotice = (type: TableXNoticeType, message: string): void => {
      props.onNotify?.({ type, message });
      emit("notify", { type, message });
    };

    const emitSelection = (): void => {
      const list = Array.from(selectedIds.value);
      props.onSelectionChange?.(list, allAcrossSelected.value);
      emit("selectionChange", { ids: list, allAcrossSelected: allAcrossSelected.value });
    };

    const deselectAll = (): void => {
      selectedIds.value = new Set();
      allAcrossSelected.value = false;
      emitSelection();
    };

    const toggleSelectRow = (id: string, rowIdx?: number, checked?: boolean): void => {
      const shiftHeld = shiftClickRow;
      shiftClickRow = false;
      if (props.selectionMode === "single") {
        selectedIds.value = selectedIds.value.has(id) ? new Set() : new Set([id]);
        allAcrossSelected.value = false;
        emitSelection();
        return;
      }
      if (shiftHeld && rowIdx !== undefined && lastSelectedRowIdx !== null) {
        const should = checked ?? !selectedIds.value.has(id);
        selectedIds.value = selectContiguousRowIds(
          pageRowIds.value,
          lastSelectedRowIdx,
          rowIdx,
          selectedIds.value,
          should,
        );
        lastSelectedRowIdx = rowIdx;
        allAcrossSelected.value = false;
        emitSelection();
        return;
      }
      if (rowIdx !== undefined) lastSelectedRowIdx = rowIdx;
      const next = new Set(selectedIds.value);
      if (allAcrossSelected.value) {
        for (const pid of pageRowIds.value) next.add(pid);
        next.delete(id);
        allAcrossSelected.value = false;
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      selectedIds.value = next;
      emitSelection();
    };

    const writeMutatedRow = (
      targetRow: unknown,
      col: TableXVueColumn<unknown>,
      colId: string,
      val: unknown,
    ): void => {
      const propKey =
        col.accessorKey !== undefined && String(col.accessorKey) !== ""
          ? String(col.accessorKey)
          : colId;
      if (
        targetRow !== null &&
        typeof targetRow === "object" &&
        !Object.isFrozen(targetRow) &&
        !propKey.includes(".") &&
        propKey !== "__proto__" &&
        propKey !== "constructor" &&
        propKey !== "prototype"
      ) {
        try {
          (targetRow as Record<string, unknown>)[propKey] = val;
        } catch {
          // Read-only row property
        }
      }
    };

    const startRowEdit = (row: unknown, rid: string): void => {
      editingCell.value = null;
      cellValidationError.value = null;
      const draft: Record<string, unknown> = {};
      for (const col of visible.value) {
        if (isEditable(col)) draft[getColumnId(col)] = getCellValue(col, row);
      }
      rowEditDraft.value = draft;
      editingRowId.value = rid;
    };

    const commitRowEdit = (row: unknown, rid: string): void => {
      const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
      for (const col of visible.value) {
        if (!isEditable(col)) continue;
        const cid = getColumnId(col);
        const oldVal = getCellValue(col, row);
        const rawDraft = cid in rowEditDraft.value ? rowEditDraft.value[cid] : oldVal;
        const coerced = coerceEditedValue(rawDraft, col.meta?.editType);
        const err = validateEditedCell(col, coerced, row);
        if (err) {
          cellValidationError.value = err;
          return;
        }
        changes[cid] = { oldValue: oldVal, newValue: coerced };
      }
      const updatedRow =
        row !== null && typeof row === "object" ? { ...(row as Record<string, unknown>) } : row;
      const nextDirty = new Set(dirtyCells.value);
      for (const col of visible.value) {
        if (!isEditable(col)) continue;
        const cid = getColumnId(col);
        const ch = changes[cid];
        if (!ch) continue;
        writeMutatedRow(row, col, cid, ch.newValue);
        writeMutatedRow(updatedRow, col, cid, ch.newValue);
        if (ch.oldValue !== ch.newValue) {
          nextDirty.add(`${rid}::${cid}`);
          const payload = { row, columnId: cid, oldValue: ch.oldValue, newValue: ch.newValue };
          props.onCellEdit?.(payload);
          emit("cellEdit", payload);
        }
      }
      dirtyCells.value = nextDirty;
      editingRowId.value = null;
      rowEditDraft.value = {};
      cellValidationError.value = null;
      const rowPayload: RowEditEvent<unknown> = { row, updatedRow, changes };
      props.onRowEdit?.(rowPayload);
      emit("rowEdit", rowPayload);
    };

    const collectExportRows = async (): Promise<readonly unknown[]> => {
      if (props.fetchAllData) {
        const res = await props.fetchAllData(activeQuery.value);
        return Array.isArray(res) ? res : rows.value;
      }
      const pool = props.allData ?? (isClientSide.value ? props.data : undefined);
      if (pool && pool.length > 0) {
        return queryClientData(pool, activeQuery.value, {
          ...clientQueryOpts.value,
          paginate: false,
        }).items;
      }
      if (props.fetchPage) {
        const cap = props.maxExportRows ?? DEFAULT_ROW_CAP;
        const full = await fetchAllPages((p, s) => props.fetchPage!(p, s, activeQuery.value), cap);
        return cap > 0 && full.items.length > cap ? full.items.slice(0, cap) : full.items;
      }
      if (props.fetchEndpoint) {
        const cap = props.maxExportRows ?? DEFAULT_ROW_CAP;
        const full = await fetchAllPages(async (p, s) => {
          const url = buildQueryUrl(props.fetchEndpoint!, {
            ...activeQuery.value,
            page: p,
            pageSize: isPageSize(s) ? s : activeQuery.value.pageSize,
          });
          const resp = await fetch(url, { cache: "no-store", ...props.fetchOptions });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return (await resp.json()) as PagedResponse<unknown>;
        }, cap);
        return cap > 0 && full.items.length > cap ? full.items.slice(0, cap) : full.items;
      }
      return rows.value;
    };

    const exportWithRows = async (fmt: ExportFormat, exportRows: readonly unknown[]): Promise<void> => {
      if (exportRows.length === 0) {
        emitNotice("error", locale.value.exportNoData);
        return;
      }
      const expCols = toExportColumns(visible.value, boolLabels.value);
      const prefix = props.exportFileName ?? filePrefixFromCaption(props.caption);
      if (fmt === "clipboard") {
        const ok = await copyToClipboard(exportRows, expCols);
        emitNotice(
          ok ? "success" : "error",
          ok
            ? formatMessage(locale.value.exportClipboardSuccess, {
                count: exportRows.length.toLocaleString(),
              })
            : "Failed to copy to clipboard",
        );
      } else if (fmt === "pdf") {
        const count = downloadPdf({
          filename: timestampedFilename(prefix),
          caption: props.caption,
          rows: exportRows,
          columns: expCols,
          badgeRules: props.badgeRules,
          serialHeader: locale.value.serialHeader,
        });
        emitNotice(
          "success",
          formatMessage(locale.value.exportPdfSuccess, { count: count.toLocaleString() }),
        );
      } else if (fmt === "excel") {
        const count = downloadExcel({
          filename: timestampedFilename(prefix),
          caption: props.caption,
          rows: exportRows,
          columns: expCols,
          badgeRules: props.badgeRules,
          serialHeader: locale.value.serialHeader,
        });
        emitNotice(
          "success",
          formatMessage(locale.value.exportExcelSuccess, { count: count.toLocaleString() }),
        );
      } else {
        const count = downloadCsv(timestampedFilename(prefix), exportRows, expCols);
        emitNotice(
          "success",
          formatMessage(locale.value.exportCsvSuccess, { count: count.toLocaleString() }),
        );
      }
    };

    const runExport = async (fmt: ExportFormat): Promise<void> => {
      openMenu.value = null;
      if (props.onExportAll) {
        const custom = await props.onExportAll(fmt);
        if (Array.isArray(custom)) await exportWithRows(fmt, custom);
        return;
      }
      isExporting.value = true;
      try {
        const collected = await collectExportRows();
        await exportWithRows(fmt, collected);
      } finally {
        isExporting.value = false;
      }
    };

    const runBulkExport = async (fmt: ExportFormat): Promise<void> => {
      if (allAcrossSelected.value) {
        await runExport(fmt);
        return;
      }
      const pool = props.allData ?? (isClientSide.value ? props.data : rows.value);
      const picked = pool.filter((r) => selectedIds.value.has(rowIdFn.value(r)));
      if (picked.length > 0) {
        await exportWithRows(fmt, picked);
        return;
      }
      await runExport(fmt);
    };

    const onRootKeydown = (ev: KeyboardEvent): void => {
      if (!props.enableKeyboardNavigation || editingCell.value || editingRowId.value) return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.nodeName === "INPUT" || target.nodeName === "SELECT" || target.nodeName === "TEXTAREA")
      ) {
        const inpType = (target as { type?: string }).type;
        if (inpType !== "checkbox" && inpType !== "radio") return;
      }
      if (rows.value.length === 0 || visible.value.length === 0) return;

      if (
        (ev.ctrlKey || ev.metaKey) &&
        ev.key.toLowerCase() === "c" &&
        props.enableRangeSelection &&
        cellRange.value
      ) {
        const tsv = formatRangeTsv(rows.value, visible.value, cellRange.value, boolLabels.value);
        if (tsv) {
          ev.preventDefault();
          void navigator.clipboard?.writeText?.(tsv);
        }
        return;
      }

      const navKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
      if (navKeys.includes(ev.key)) {
        const base = focusedCell.value ?? { rowIndex: 0, colIndex: 0 };
        const next = moveFocusCoord(base, ev.key, rows.value.length, visible.value.length);
        if (!next) return;
        ev.preventDefault();
        focusedCell.value = next;
        if (props.enableRangeSelection) {
          if (ev.shiftKey) {
            const anchor = rangeAnchor.value ?? base;
            rangeAnchor.value = anchor;
            cellRange.value = normalizeCellRange(anchor, next);
          } else {
            rangeAnchor.value = next;
            cellRange.value = normalizeCellRange(next, next);
          }
        }
        return;
      }

      if ((ev.key === "Enter" || ev.key === "F2") && focusedCell.value) {
        const row = rows.value[focusedCell.value.rowIndex];
        const col = visible.value[focusedCell.value.colIndex];
        if (row && col && isEditable(col)) {
          ev.preventDefault();
          const rid = rowIdFn.value(row);
          if (props.editMode === "row") startRowEdit(row, rid);
          else {
            const val = getCellValue(col, row);
            editingCell.value = { rowId: rid, columnId: getColumnId(col) };
            editingBool.value = Boolean(val);
            editingVal.value = val !== null && val !== undefined ? String(val) : "";
          }
        }
        return;
      }

      if (ev.key === " " && focusedCell.value && props.enableSelection) {
        const row = rows.value[focusedCell.value.rowIndex];
        if (row) {
          ev.preventDefault();
          toggleSelectRow(rowIdFn.value(row), focusedCell.value.rowIndex);
        }
      }
    };

    const onRootPaste = (ev: ClipboardEvent): void => {
      if (!props.enableRangeSelection || !focusedCell.value) return;
      const target = ev.target as HTMLElement | null;
      if (
        target &&
        (target.nodeName === "INPUT" || target.nodeName === "SELECT" || target.nodeName === "TEXTAREA")
      ) {
        return;
      }
      const matrix = parseClipboardTsv(ev.clipboardData?.getData("text/plain") ?? "");
      if (matrix.length === 0) return;
      ev.preventDefault();

      const startR = focusedCell.value.rowIndex;
      const startC = focusedCell.value.colIndex;
      let maxR = startR;
      let maxC = startC;
      const nextDirty = new Set(dirtyCells.value);

      for (let rOff = 0; rOff < matrix.length; rOff++) {
        const targetRow = rows.value[startR + rOff];
        if (!targetRow) break;
        maxR = startR + rOff;
        const cells = matrix[rOff]!;
        for (let cOff = 0; cOff < cells.length; cOff++) {
          const col = visible.value[startC + cOff];
          if (!col) break;
          maxC = Math.max(maxC, startC + cOff);
          if (!isEditable(col)) continue;
          const cid = getColumnId(col);
          const oldVal = getCellValue(col, targetRow);
          const coerced = coerceEditedValue(cells[cOff], col.meta?.editType);
          if (validateEditedCell(col, coerced, targetRow) !== null) continue;
          writeMutatedRow(targetRow, col, cid, coerced);
          if (oldVal !== coerced) {
            nextDirty.add(`${rowIdFn.value(targetRow)}::${cid}`);
            const payload = { row: targetRow, columnId: cid, oldValue: oldVal, newValue: coerced };
            props.onCellEdit?.(payload);
            emit("cellEdit", payload);
          }
        }
      }
      dirtyCells.value = nextDirty;
      cellRange.value = normalizeCellRange(
        { rowIndex: startR, colIndex: startC },
        { rowIndex: maxR, colIndex: maxC },
      );
    };

    return () => {
      const loc = locale.value;
      const q = activeQuery.value;
      const { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId } = pinnedMeta.value;
      const rootClasses = [
        "tbx-root",
        props.theme === "dark" ? "tbx-dark" : props.theme === "auto" ? "tbx-auto" : undefined,
        props.className,
      ]
        .filter(Boolean)
        .join(" ");

      if (props.error) {
        return h("div", { class: rootClasses, "data-density": density.value }, [
          h("div", { class: "tbx-state-card" }, [
            h("p", { class: "tbx-state-text" }, loc.errorText),
            props.onRetry
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "tbx-btn",
                    onClick: () => {
                      props.onRetry?.();
                      emit("retry");
                    },
                  },
                  [rotateCcwIcon(), h("span", loc.retryButton)],
                )
              : null,
          ]),
        ]);
      }

      const currentPage = Math.max(1, q.page);
      const pageSize = q.pageSize;
      const totalPages = totalPagesFor(total.value, pageSize);
      const recordRange = getRecordRange(currentPage, pageSize, total.value);
      const allPageSelected =
        allAcrossSelected.value ||
        (pageRowIds.value.length > 0 && pageRowIds.value.every((id) => selectedIds.value.has(id)));
      const effectiveSelectedCount = allAcrossSelected.value
        ? Math.max(total.value, selectedIds.value.size)
        : selectedIds.value.size;

      const resolvedExportMode = props.quickExport
        ? typeof props.quickExport === "string"
          ? props.quickExport
          : "excel"
        : (props.exportMode ?? "menu");

      const getColActiveFilter = (col: TableXVueColumn<unknown>): string | undefined => {
        const cid = getColumnId(col);
        const fField = getFilterField(col);
        return q.filter?.[fField] ?? q.filter?.[cid];
      };

      const renderCellDisplay = (
        col: TableXVueColumn<unknown>,
        row: unknown,
        rowIdx: number,
      ): VNodeChild => {
        const cid = getColumnId(col);
        const rawVal = getCellValue(col, row);
        const namedSlot = slots[`cell-${cid}`];
        if (namedSlot) {
          return namedSlot({ row, value: rawVal, column: col, rowIndex: rowIdx });
        }
        if (slots.cell) {
          return slots.cell({ row, value: rawVal, column: col, columnId: cid, rowIndex: rowIdx });
        }
        if (col.cell) {
          return col.cell({ row: { original: row }, getValue: () => rawVal });
        }
        return getCellText(rawVal, boolLabels.value);
      };

      const renderLeafTh = (
        col: TableXVueColumn<unknown>,
        rowSpan = 1,
        isGroupChild = false,
      ): VNode => {
        const cid = getColumnId(col);
        const sortField = getSortField(col);
        const sortable = isSortable(col) && props.enableSorting !== false;
        const sortIndex = q.sort.findIndex(
          (s) =>
            s.field.toLowerCase() === sortField.toLowerCase() ||
            s.field.toLowerCase() === cid.toLowerCase(),
        );
        const sortItem = sortIndex >= 0 ? q.sort[sortIndex] : undefined;
        const sorted = sortable && sortItem !== undefined;
        const title = getColumnTitle(col) || cid;
        const activeFilter = getColActiveFilter(col);
        const customW = colWidths.value[cid];
        const w = customW ?? col.meta?.width;

        return h(
          "th",
          {
            key: cid,
            scope: "col",
            rowspan: rowSpan > 1 ? rowSpan : undefined,
            "aria-sort": !sortable
              ? undefined
              : sorted
                ? sortItem?.dir === "asc"
                  ? "ascending"
                  : "descending"
                : "none",
            class: [
              "tbx-th",
              sortable ? "tbx-th--sortable" : undefined,
              isGroupChild ? "tbx-th--grouped-child" : undefined,
              isPinned(col, pinnedCols.value) === "left" ? "tbx-th--pinned-left" : undefined,
              isPinned(col, pinnedCols.value) === "right" ? "tbx-th--pinned-right" : undefined,
              lastLeftPinnedId === cid ? "tbx-pinned-border-left" : undefined,
              firstRightPinnedId === cid ? "tbx-pinned-border-right" : undefined,
            ]
              .filter(Boolean)
              .join(" "),
            style: {
              ...(w !== undefined ? { width: `${w}px` } : col.meta?.minWidth ? { minWidth: `${col.meta.minWidth}px` } : {}),
              textAlign: col.meta?.align ?? "left",
              ...(leftOffsets.has(cid) ? { left: `${leftOffsets.get(cid)}px` } : {}),
              ...(rightOffsets.has(cid) ? { right: `${rightOffsets.get(cid)}px` } : {}),
            },
            draggable: props.enableColumnReorder && !isGroupChild ? "true" : undefined,
            onDragstart: () => {
              draggedColId = cid;
            },
            onDragover: (ev: DragEvent) => ev.preventDefault(),
            onDrop: (ev: DragEvent) => {
              ev.preventDefault();
              if (!draggedColId || draggedColId === cid) return;
              const fromIdx = colList.value.findIndex((c) => getColumnId(c) === draggedColId);
              const toIdx = colList.value.findIndex((c) => getColumnId(c) === cid);
              if (fromIdx >= 0 && toIdx >= 0) {
                colList.value = reorderArrayItem(colList.value, fromIdx, toIdx);
                const order = colList.value.map(getColumnId);
                props.onColumnOrderChange?.(order);
                emit("columnOrderChange", order);
                savePersisted();
              }
            },
            onClick: sortable
              ? (ev: MouseEvent) => {
                  const t = ev.target as HTMLElement | null;
                  if (t?.closest?.(".tbx-col-filter-wrap, .tbx-resize-handle")) return;
                  pushQuery(
                    ev.shiftKey
                      ? withToggledMultiSort(q, sortField)
                      : withToggledSort(q, sortField),
                  );
                }
              : undefined,
          },
          [
            h(
              "div",
              {
                class: [
                  "tbx-th-inner",
                  col.meta?.align === "center" ? "tbx-th-inner--center" : undefined,
                  col.meta?.align === "right" ? "tbx-th-inner--right" : undefined,
                ]
                  .filter(Boolean)
                  .join(" "),
              },
              [
                h("span", null, [typeof col.header === "function" ? col.header({}) : title]),
                sortable
                  ? h("span", { class: "tbx-sort-icon-wrap" }, [
                      sorted
                        ? sortItem?.dir === "asc"
                          ? arrowUpIcon("tbx-sort-icon")
                          : arrowDownIcon("tbx-sort-icon")
                        : arrowUpDownIcon("tbx-sort-icon tbx-sort-icon--idle"),
                      q.sort.length > 1 && sortIndex >= 0
                        ? h("span", { class: "tbx-sort-order", "aria-hidden": "true" }, String(sortIndex + 1))
                        : null,
                    ])
                  : null,
                isFilterable(col, props.enableColumnFilters) ||
                (!isStructuralColumn(col) && cid !== "" && props.enableColumnMenu !== false)
                  ? h("div", { class: "tbx-col-filter-wrap" }, [
                      h(
                        "button",
                        {
                          type: "button",
                          "data-filter-col": cid,
                          class: [
                            "tbx-col-filter-btn",
                            activeFilter ? "tbx-col-filter-btn--active" : undefined,
                          ]
                            .filter(Boolean)
                            .join(" "),
                          "aria-label": `Filter ${title}`,
                          onClick: (ev: MouseEvent) => {
                            ev.stopPropagation();
                            if (openFilterCol.value === cid) {
                              openFilterCol.value = null;
                              return;
                            }
                            openFilterCol.value = cid;
                            const af = activeFilter ?? "";
                            if (col.meta?.filterType === "date-range" || col.meta?.filterType === "number-range") {
                              const [mi = "", ma = ""] = af.split("..");
                              filterRangeMin.value = mi;
                              filterRangeMax.value = ma;
                              filterSearchText.value = "";
                            } else if (isMultiSelectFilter(col) && col.meta?.filterOptions) {
                              const toks = parseMultiFilterValues(af, true).map((t) => t.toLowerCase());
                              filterMultiSet.value = new Set(
                                col.meta.filterOptions.filter((o) => toks.includes(o.trim().toLowerCase())),
                              );
                              filterSearchText.value = "";
                            } else {
                              filterSearchText.value = af;
                            }
                          },
                        },
                        [dotsVerticalIcon()],
                      ),
                    ])
                  : null,
              ],
            ),
          ],
        );
      };

      const renderRowVNodes = (
        row: unknown,
        index: number,
        opts?: { pinnedVariant?: "top" | "bottom"; treeNode?: TreeRowNode<unknown> },
      ): VNode[] => {
        const pinnedVariant = opts?.pinnedVariant;
        const tNode = opts?.treeNode;
        const rawId = tNode ? tNode.id : rowIdFn.value(row);
        const rowKey = pinnedVariant ? `${pinnedVariant}-${rawId}-${index}` : `${rawId}-${index}`;
        const isSelected = !pinnedVariant && (allAcrossSelected.value || selectedIds.value.has(rawId));
        const isExpanded = !pinnedVariant && expandedRows.value.has(rawId);
        const isRowEditing = !pinnedVariant && editingRowId.value === rawId;
        const clickable = typeof props.onRowClick === "function";
        let firstEditableDone = false;

        const cells: VNode[] = [];

        if (props.enableRowReorder) {
          cells.push(
            h(
              "td",
              {
                class: [
                  "tbx-td tbx-td--row-drag",
                  leftOffsets.has("__row_drag") ? "tbx-td--pinned-left" : undefined,
                  lastLeftPinnedId === "__row_drag" ? "tbx-pinned-border-left" : undefined,
                ]
                  .filter(Boolean)
                  .join(" "),
                style: {
                  width: "36px",
                  ...(leftOffsets.has("__row_drag") ? { left: `${leftOffsets.get("__row_drag")}px` } : {}),
                },
                onClick: (ev: MouseEvent) => ev.stopPropagation(),
              },
              !pinnedVariant ? [h("span", { class: "tbx-row-drag-handle" }, "⋮⋮")] : [],
            ),
          );
        }

        if (hasExpandCol.value) {
          cells.push(
            h(
              "td",
              {
                class: [
                  "tbx-td tbx-td--expand",
                  leftOffsets.has("__expand") ? "tbx-td--pinned-left" : undefined,
                  lastLeftPinnedId === "__expand" ? "tbx-pinned-border-left" : undefined,
                ]
                  .filter(Boolean)
                  .join(" "),
                style: {
                  width: "40px",
                  ...(leftOffsets.has("__expand") ? { left: `${leftOffsets.get("__expand")}px` } : {}),
                },
              },
              !pinnedVariant
                ? [
                    h(
                      "button",
                      {
                        type: "button",
                        class: isExpanded ? "tbx-expand-btn tbx-expand-btn--open" : "tbx-expand-btn",
                        onClick: (ev: MouseEvent) => {
                          ev.stopPropagation();
                          const next = new Set(expandedRows.value);
                          if (next.has(rawId)) next.delete(rawId);
                          else next.add(rawId);
                          expandedRows.value = next;
                        },
                      },
                      [chevronRightIcon()],
                    ),
                  ]
                : [],
            ),
          );
        }

        if (props.enableSelection) {
          cells.push(
            h(
              "td",
              {
                class: [
                  "tbx-td tbx-td--select",
                  leftOffsets.has("__select") ? "tbx-td--pinned-left" : undefined,
                  lastLeftPinnedId === "__select" ? "tbx-pinned-border-left" : undefined,
                ]
                  .filter(Boolean)
                  .join(" "),
                style: leftOffsets.has("__select") ? { left: `${leftOffsets.get("__select")}px` } : undefined,
                onClick: (ev: MouseEvent) => ev.stopPropagation(),
              },
              !pinnedVariant
                ? [
                    h("input", {
                      type: props.selectionMode === "single" ? "radio" : "checkbox",
                      name: props.selectionMode === "single" ? `${uid}-sel` : undefined,
                      class: "tbx-checkbox",
                      checked: isSelected,
                      "aria-label": formatMessage(loc.selectRowLabel, { id: rawId }),
                      onClick: (ev: MouseEvent) => {
                        ev.stopPropagation();
                        shiftClickRow = Boolean(ev.shiftKey);
                      },
                      onChange: (ev: Event) =>
                        toggleSelectRow(rawId, index, (ev.target as { checked?: boolean })?.checked),
                    }),
                  ]
                : [],
            ),
          );
        }

        if (props.showSerialNumber) {
          cells.push(
            h(
              "td",
              {
                class: [
                  "tbx-td tbx-td--serial",
                  leftOffsets.has("__serial") ? "tbx-td--pinned-left" : undefined,
                  lastLeftPinnedId === "__serial" ? "tbx-pinned-border-left" : undefined,
                ]
                  .filter(Boolean)
                  .join(" "),
                style: leftOffsets.has("__serial") ? { left: `${leftOffsets.get("__serial")}px` } : undefined,
              },
              pinnedVariant ? "★" : String(serialNumber(currentPage, pageSize, index)),
            ),
          );
        }

        visible.value.forEach((col, colIdx) => {
          const cid = getColumnId(col);
          const editable = !pinnedVariant && isEditable(col);
          const isRowEditCell = isRowEditing && editable;
          const showRowActions = isRowEditCell && !firstEditableDone;
          if (showRowActions) firstEditableDone = true;
          const isCellEditing =
            !isRowEditCell &&
            !pinnedVariant &&
            editingCell.value?.rowId === rawId &&
            editingCell.value?.columnId === cid;
          const isFocused =
            !pinnedVariant &&
            focusedCell.value?.rowIndex === index &&
            focusedCell.value?.colIndex === colIdx;
          const inRange =
            !pinnedVariant &&
            props.enableRangeSelection &&
            isCellInRange(index, colIdx, cellRange.value);
          const isDirty = !pinnedVariant && dirtyCells.value.has(`${rawId}::${cid}`);

          let cellBody: VNodeChild;
          if (isRowEditCell) {
            const editType = col.meta?.editType || "text";
            const draftVal = cid in rowEditDraft.value ? rowEditDraft.value[cid] : getCellValue(col, row);
            const editor =
              editType === "select" && col.meta?.editOptions
                ? h(
                    "select",
                    {
                      class: "tbx-cell-edit-select tbx-cell-edit-input",
                      value: String(draftVal ?? ""),
                      onChange: (ev: Event) => {
                        rowEditDraft.value = {
                          ...rowEditDraft.value,
                          [cid]: (ev.target as { value?: string })?.value ?? "",
                        };
                      },
                    },
                    col.meta.editOptions.map((o) => h("option", { value: o }, o)),
                  )
                : editType === "boolean"
                  ? h("input", {
                      type: "checkbox",
                      class: "tbx-checkbox tbx-cell-edit-checkbox",
                      checked: Boolean(draftVal),
                      onChange: (ev: Event) => {
                        rowEditDraft.value = {
                          ...rowEditDraft.value,
                          [cid]: Boolean((ev.target as { checked?: boolean })?.checked),
                        };
                      },
                    })
                  : h("input", {
                      type: editType === "number" ? "number" : editType === "date" ? "date" : "text",
                      class: "tbx-cell-edit-input",
                      value: String(draftVal ?? ""),
                      onInput: (ev: Event) => {
                        rowEditDraft.value = {
                          ...rowEditDraft.value,
                          [cid]: (ev.target as { value?: string })?.value ?? "",
                        };
                      },
                    });

            cellBody = h("div", { class: "tbx-cell-edit-wrap", onClick: (ev: MouseEvent) => ev.stopPropagation() }, [
              editor,
              showRowActions
                ? h("div", { class: "tbx-cell-edit-actions" }, [
                    h(
                      "button",
                      {
                        type: "button",
                        class: "tbx-cell-edit-btn tbx-cell-edit-btn--save",
                        onClick: () => commitRowEdit(row, rawId),
                      },
                      [checkIcon("tbx-icon")],
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        class: "tbx-cell-edit-btn tbx-cell-edit-btn--cancel",
                        onClick: () => {
                          editingRowId.value = null;
                          rowEditDraft.value = {};
                          cellValidationError.value = null;
                        },
                      },
                      [xIcon("tbx-icon")],
                    ),
                  ])
                : null,
              showRowActions && cellValidationError.value
                ? h("span", { class: "tbx-cell-edit-error" }, cellValidationError.value)
                : null,
            ]);
          } else if (isCellEditing) {
            const editType = col.meta?.editType || "text";
            const commitSingle = () => {
              const oldVal = getCellValue(col, row);
              const nextVal = coerceEditedValue(
                editType === "boolean" ? editingBool.value : editingVal.value,
                col.meta?.editType,
              );
              const err = validateEditedCell(col, nextVal, row);
              if (err) {
                cellValidationError.value = err;
                return;
              }
              cellValidationError.value = null;
              writeMutatedRow(row, col, cid, nextVal);
              if (oldVal !== nextVal) {
                const nextD = new Set(dirtyCells.value);
                nextD.add(`${rawId}::${cid}`);
                dirtyCells.value = nextD;
              }
              editingCell.value = null;
              const payload = { row, columnId: cid, oldValue: oldVal, newValue: nextVal };
              props.onCellEdit?.(payload);
              emit("cellEdit", payload);
            };
            const editor =
              editType === "select" && col.meta?.editOptions
                ? h(
                    "select",
                    {
                      class: "tbx-cell-edit-select tbx-cell-edit-input",
                      value: editingVal.value,
                      onChange: (ev: Event) => {
                        editingVal.value = (ev.target as { value?: string })?.value ?? "";
                      },
                    },
                    col.meta.editOptions.map((o) => h("option", { value: o }, o)),
                  )
                : editType === "boolean"
                  ? h("input", {
                      type: "checkbox",
                      class: "tbx-checkbox tbx-cell-edit-checkbox",
                      checked: editingBool.value,
                      onChange: (ev: Event) => {
                        editingBool.value = Boolean((ev.target as { checked?: boolean })?.checked);
                      },
                    })
                  : h("input", {
                      type: editType === "number" ? "number" : editType === "date" ? "date" : "text",
                      class: "tbx-cell-edit-input",
                      value: editingVal.value,
                      onInput: (ev: Event) => {
                        editingVal.value = (ev.target as { value?: string })?.value ?? "";
                      },
                      onKeydown: (ev: KeyboardEvent) => {
                        if (ev.key === "Enter") {
                          ev.preventDefault();
                          commitSingle();
                        } else if (ev.key === "Escape") {
                          ev.preventDefault();
                          editingCell.value = null;
                          cellValidationError.value = null;
                        }
                      },
                    });
            cellBody = h("div", { class: "tbx-cell-edit-wrap", onClick: (ev: MouseEvent) => ev.stopPropagation() }, [
              editor,
              h("div", { class: "tbx-cell-edit-actions" }, [
                h(
                  "button",
                  { type: "button", class: "tbx-cell-edit-btn tbx-cell-edit-btn--save", onClick: commitSingle },
                  [checkIcon("tbx-icon")],
                ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "tbx-cell-edit-btn tbx-cell-edit-btn--cancel",
                    onClick: () => {
                      editingCell.value = null;
                      cellValidationError.value = null;
                    },
                  },
                  [xIcon("tbx-icon")],
                ),
              ]),
              cellValidationError.value
                ? h("span", { class: "tbx-cell-edit-error" }, cellValidationError.value)
                : null,
            ]);
          } else {
            const inner = renderCellDisplay(col, row, index);
            cellBody =
              colIdx === 0 && tNode
                ? h(
                    "div",
                    {
                      class: "tbx-tree-cell-wrap",
                      style: tNode.depth > 0 ? { paddingInlineStart: `${tNode.depth * 18}px` } : undefined,
                    },
                    [
                      tNode.hasChildren
                        ? h(
                            "button",
                            {
                              type: "button",
                              class: tNode.isExpanded
                                ? "tbx-tree-toggle tbx-tree-toggle--open"
                                : "tbx-tree-toggle",
                              "aria-expanded": String(tNode.isExpanded),
                              onClick: (ev: MouseEvent) => {
                                ev.stopPropagation();
                                const next = new Set(treeExpandedIds.value);
                                if (next.has(tNode.id)) next.delete(tNode.id);
                                else next.add(tNode.id);
                                treeExpandedIds.value = next;
                              },
                            },
                            [chevronRightIcon()],
                          )
                        : h("span", { class: "tbx-tree-spacer", "aria-hidden": "true" }),
                      h("span", { class: "tbx-tree-label" }, [inner]),
                    ],
                  )
                : inner;
          }

          const showFillCorner =
            inRange &&
            cellRange.value !== null &&
            index === cellRange.value.maxRow &&
            colIdx === cellRange.value.maxCol;

          cells.push(
            h(
              "td",
              {
                key: cid || `col-${colIdx}`,
                tabindex: !pinnedVariant && props.enableKeyboardNavigation ? (isFocused ? 0 : -1) : undefined,
                class: [
                  "tbx-td",
                  editable ? "tbx-cell--editable" : undefined,
                  isDirty ? "tbx-td--dirty" : undefined,
                  isFocused ? "tbx-td--focused" : undefined,
                  inRange ? "tbx-td--in-range" : undefined,
                  leftOffsets.has(cid) ? "tbx-td--pinned-left" : undefined,
                  rightOffsets.has(cid) ? "tbx-td--pinned-right" : undefined,
                  lastLeftPinnedId === cid ? "tbx-pinned-border-left" : undefined,
                  firstRightPinnedId === cid ? "tbx-pinned-border-right" : undefined,
                ]
                  .filter(Boolean)
                  .join(" "),
                style: {
                  textAlign: col.meta?.align ?? "left",
                  ...(leftOffsets.has(cid) ? { left: `${leftOffsets.get(cid)}px` } : {}),
                  ...(rightOffsets.has(cid) ? { right: `${rightOffsets.get(cid)}px` } : {}),
                },
                onPointerdown: !pinnedVariant
                  ? (ev: PointerEvent) => {
                      if (ev.button !== 0) return;
                      const t = ev.target as HTMLElement | null;
                      if (t?.closest?.("input, select, button, .tbx-fill-handle")) return;
                      const coord: CellCoord = { rowIndex: index, colIndex: colIdx };
                      focusedCell.value = coord;
                      if (props.enableRangeSelection) {
                        if (ev.shiftKey && rangeAnchor.value) {
                          cellRange.value = normalizeCellRange(rangeAnchor.value, coord);
                        } else {
                          rangeAnchor.value = coord;
                          cellRange.value = normalizeCellRange(coord, coord);
                          isDraggingRange = true;
                        }
                      }
                    }
                  : undefined,
                onPointerenter:
                  !pinnedVariant && props.enableRangeSelection
                    ? () => {
                        if (isDraggingRange && rangeAnchor.value) {
                          cellRange.value = normalizeCellRange(rangeAnchor.value, {
                            rowIndex: index,
                            colIndex: colIdx,
                          });
                        }
                      }
                    : undefined,
                onContextmenu:
                  !pinnedVariant && props.enableContextMenu
                    ? (ev: MouseEvent) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        contextMenu.value = { x: ev.clientX, y: ev.clientY, row, col, colId: cid };
                      }
                    : undefined,
                onDblclick: editable
                  ? (ev: MouseEvent) => {
                      ev.stopPropagation();
                      cellValidationError.value = null;
                      if (props.editMode === "row") startRowEdit(row, rawId);
                      else {
                        const val = getCellValue(col, row);
                        editingCell.value = { rowId: rawId, columnId: cid };
                        editingBool.value = Boolean(val);
                        editingVal.value = val !== null && val !== undefined ? String(val) : "";
                      }
                    }
                  : undefined,
              },
              [
                cellBody,
                showFillCorner
                  ? h("span", {
                      class: "tbx-fill-handle",
                      "aria-hidden": "true",
                      onPointerdown: (ev: PointerEvent) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        isFillingRange = true;
                      },
                    })
                  : null,
              ],
            ),
          );
        });

        const trNode = h(
          "tr",
          {
            key: rowKey,
            draggable: props.enableRowReorder && !pinnedVariant ? "true" : undefined,
            class: [
              "tbx-row",
              isSelected ? "tbx-row--selected" : undefined,
              isExpanded ? "tbx-row--expanded" : undefined,
              isRowEditing ? "tbx-row--editing" : undefined,
              pinnedVariant === "top" ? "tbx-row--pinned-top" : undefined,
              pinnedVariant === "bottom" ? "tbx-row--pinned-bottom" : undefined,
              clickable ? "tbx-row--clickable" : undefined,
            ]
              .filter(Boolean)
              .join(" "),
            onDragstart:
              props.enableRowReorder && !pinnedVariant
                ? () => {
                    draggedRowIdx = index;
                  }
                : undefined,
            onDragover:
              props.enableRowReorder && !pinnedVariant ? (ev: DragEvent) => ev.preventDefault() : undefined,
            onDrop:
              props.enableRowReorder && !pinnedVariant
                ? (ev: DragEvent) => {
                    ev.preventDefault();
                    if (draggedRowIdx === null || draggedRowIdx === index) return;
                    const fromIdx = draggedRowIdx;
                    draggedRowIdx = null;
                    const nextList = reorderArrayItem(baseRows.value, fromIdx, index);
                    reorderedRows.value = nextList;
                    const payload: RowOrderChangeEvent<unknown> = {
                      fromIndex: fromIdx,
                      toIndex: index,
                      rows: nextList,
                    };
                    props.onRowOrderChange?.(payload);
                    emit("rowOrderChange", payload);
                  }
                : undefined,
            onClick: clickable
              ? () => {
                  props.onRowClick?.(row);
                  emit("rowClick", row);
                }
              : undefined,
          },
          cells,
        );

        if (isExpanded && hasExpandCol.value) {
          const detail = slots["expanded-row"]
            ? slots["expanded-row"]({ row, rowIndex: index })
            : props.renderExpandedRow?.(row);
          const expandedTr = h("tr", { key: `${rowKey}-exp`, class: "tbx-expanded-row" }, [
            h("td", { class: "tbx-expanded-cell", colspan: columnCount.value }, [
              h("div", { class: "tbx-detail-panel" }, [detail]),
            ]),
          ]);
          return [trNode, expandedTr];
        }

        return [trNode];
      };

      // Body rows assembly
      const bodyChildren: VNode[] = [];
      if (props.isLoading) {
        bodyChildren.push(
          h("tr", [
            h("td", { class: "tbx-state", colspan: Math.max(1, columnCount.value) }, [
              h("div", { class: "tbx-dotted-loader", "aria-hidden": "true" }, [
                h("span", { class: "tbx-dot" }),
                h("span", { class: "tbx-dot" }),
                h("span", { class: "tbx-dot" }),
                h("span", { class: "tbx-dot" }),
              ]),
              h("div", { class: "tbx-loading-text" }, loc.loadingText),
            ]),
          ]),
        );
      } else if (
        rows.value.length === 0 &&
        (props.pinnedTopRows?.length ?? 0) === 0 &&
        (props.pinnedBottomRows?.length ?? 0) === 0
      ) {
        bodyChildren.push(
          h("tr", [h("td", { class: "tbx-state", colspan: Math.max(1, columnCount.value) }, loc.emptyText)]),
        );
      } else {
        for (let i = 0; i < (props.pinnedTopRows?.length ?? 0); i++) {
          bodyChildren.push(...renderRowVNodes(props.pinnedTopRows![i], i, { pinnedVariant: "top" }));
        }

        if (treeNodes.value) {
          treeNodes.value.forEach((node, idx) => {
            bodyChildren.push(...renderRowVNodes(node.row, idx, { treeNode: node }));
          });
        } else if (activeGroupBy.value.length > 0) {
          const items = buildNestedGroupItems(
            rows.value,
            activeGroupBy.value,
            colList.value,
            collapsedGroups.value,
            boolLabels.value,
          );
          for (const item of items) {
            if (item.kind === "row") {
              bodyChildren.push(...renderRowVNodes(item.row, item.originalIndex));
            } else {
              bodyChildren.push(
                h(
                  "tr",
                  {
                    key: `grp-${item.key}`,
                    class: "tbx-group-row",
                    "data-group-key": item.key,
                    "data-group-depth": String(item.depth),
                    onClick: (ev: MouseEvent) => {
                      ev.stopPropagation();
                      const next = new Set(collapsedGroups.value);
                      if (next.has(item.key)) next.delete(item.key);
                      else next.add(item.key);
                      collapsedGroups.value = next;
                    },
                  },
                  [
                    h(
                      "td",
                      {
                        class: "tbx-group-cell",
                        colspan: Math.max(1, columnCount.value),
                        style: item.depth > 0 ? { paddingInlineStart: `${14 + item.depth * 18}px` } : undefined,
                      },
                      [
                        h("div", { class: "tbx-group-inner" }, [
                          h(
                            "button",
                            {
                              type: "button",
                              class: item.collapsed
                                ? "tbx-group-toggle"
                                : "tbx-group-toggle tbx-group-toggle--open",
                            },
                            [chevronRightIcon()],
                          ),
                          h("span", { class: "tbx-group-label" }, `${item.columnTitle}:`),
                          h("strong", { class: "tbx-group-value" }, item.displayValue),
                          h("span", { class: "tbx-group-count" }, item.count.toLocaleString()),
                          item.summaries.length > 0
                            ? h(
                                "span",
                                { class: "tbx-group-summaries" },
                                item.summaries.map((s) =>
                                  h("span", { key: s.columnId, class: "tbx-group-summary-chip" }, [
                                    h("span", s.label),
                                    h("strong", s.value),
                                  ]),
                                ),
                              )
                            : null,
                        ]),
                      ],
                    ),
                  ],
                ),
              );
            }
          }
        } else if (props.enableVirtualization) {
          const win = computeVirtualWindow({
            totalRows: rows.value.length,
            scrollTop: virtualScrollTop.value,
            viewportHeight: props.virtualHeight,
            density: density.value,
            overscan: props.virtualOverscan,
          });
          if (win.topSpacerHeight > 0) {
            bodyChildren.push(
              h("tr", { class: "tbx-virtual-spacer", "aria-hidden": "true" }, [
                h("td", { colspan: columnCount.value, style: { height: `${win.topSpacerHeight}px` } }),
              ]),
            );
          }
          for (let idx = win.startIndex; idx < win.endIndex; idx++) {
            const r = rows.value[idx];
            if (r !== undefined) bodyChildren.push(...renderRowVNodes(r, idx));
          }
          if (win.bottomSpacerHeight > 0) {
            bodyChildren.push(
              h("tr", { class: "tbx-virtual-spacer", "aria-hidden": "true" }, [
                h("td", { colspan: columnCount.value, style: { height: `${win.bottomSpacerHeight}px` } }),
              ]),
            );
          }
        } else {
          rows.value.forEach((r, idx) => {
            bodyChildren.push(...renderRowVNodes(r, idx));
          });
        }

        for (let i = 0; i < (props.pinnedBottomRows?.length ?? 0); i++) {
          bodyChildren.push(...renderRowVNodes(props.pinnedBottomRows![i], i, { pinnedVariant: "bottom" }));
        }
      }

      const hasSummary =
        props.enableSummaryRow === true ||
        visible.value.some((c) => c.meta?.aggregation !== undefined);

      const rangeStats =
        props.enableRangeSelection && cellRange.value
          ? computeRangeStats(rows.value, visible.value, cellRange.value)
          : null;

      return h(
        "div",
        {
          ref: rootRef,
          class: rootClasses,
          "data-density": density.value,
          onKeydown: onRootKeydown,
          onPaste: onRootPaste,
        },
        [
          // Toolbar
          props.showToolbar
            ? h("div", { class: "tbx-toolbar" }, [
                h("div", { class: "tbx-toolbar-group" }, [
                  props.enableSearch
                    ? h("div", { class: "tbx-search" }, [
                        searchIcon(),
                        h("input", {
                          type: "search",
                          class: "tbx-search-input",
                          value: searchText.value,
                          placeholder: props.searchPlaceholder ?? loc.searchPlaceholder,
                          "aria-label": `Search ${props.caption}`,
                          onInput: (ev: Event) => {
                            const val = (ev.target as { value?: string })?.value ?? "";
                            searchText.value = val;
                            if (searchTimer) clearTimeout(searchTimer);
                            searchTimer = setTimeout(() => {
                              pushQuery(withSearch(activeQuery.value, val));
                            }, SEARCH_DEBOUNCE_MS);
                          },
                          onKeydown: (ev: KeyboardEvent) => {
                            if (ev.key === "Escape" && searchText.value) {
                              searchText.value = "";
                              pushQuery(withSearch(activeQuery.value, ""));
                            }
                          },
                        }),
                        searchText.value
                          ? h(
                              "button",
                              {
                                type: "button",
                                class: "tbx-search-clear",
                                "aria-label": loc.clearSearch,
                                onClick: () => {
                                  searchText.value = "";
                                  pushQuery(withSearch(activeQuery.value, ""));
                                },
                              },
                              [xIcon()],
                            )
                          : null,
                      ])
                    : null,
                ]),
                h("div", { class: "tbx-toolbar-group tbx-toolbar-group--end" }, [
                  props.enableSavedViews
                    ? h("div", { class: "tbx-menu-wrap" }, [
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-btn",
                            "aria-haspopup": "menu",
                            "aria-expanded": String(openMenu.value === "views"),
                            onClick: () => {
                              openMenu.value = openMenu.value === "views" ? null : "views";
                            },
                          },
                          [slidersIcon(), h("span", loc.viewsButton), chevronDownIcon("tbx-icon tbx-chevron")],
                        ),
                        openMenu.value === "views"
                          ? h("div", { class: "tbx-menu tbx-views-menu", role: "menu" }, [
                              h("div", { class: "tbx-views-save-row" }, [
                                h("input", {
                                  type: "text",
                                  class: "tbx-views-input",
                                  value: newViewName.value,
                                  placeholder: loc.viewNamePlaceholder,
                                  onInput: (ev: Event) => {
                                    newViewName.value = (ev.target as { value?: string })?.value ?? "";
                                  },
                                }),
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    class: "tbx-views-save-btn",
                                    onClick: () => {
                                      const nm = newViewName.value.trim();
                                      if (!nm) return;
                                      savedViewsList.value = upsertSavedView(
                                        savedViewsList.value,
                                        {
                                          name: nm,
                                          query: activeQuery.value,
                                          hiddenColumns: { ...hiddenCols.value },
                                          pinnedColumns: { ...pinnedCols.value },
                                          columnOrder: colList.value.map(getColumnId).filter(Boolean) as string[],
                                          groupBy: [...activeGroupBy.value],
                                          density: density.value,
                                        },
                                        props.storageKey,
                                      );
                                      newViewName.value = "";
                                      props.onSavedViewsChange?.([...savedViewsList.value]);
                                      emit("savedViewsChange", [...savedViewsList.value]);
                                    },
                                  },
                                  loc.saveCurrentView,
                                ),
                              ]),
                              h("div", { class: "tbx-menu-separator" }),
                              savedViewsList.value.length === 0
                                ? h("div", { class: "tbx-views-empty" }, loc.noSavedViews)
                                : savedViewsList.value.map((v) =>
                                    h("div", { key: v.id, class: "tbx-views-item-row" }, [
                                      h(
                                        "button",
                                        {
                                          type: "button",
                                          class: "tbx-menu-item",
                                          onClick: () => {
                                            if (v.density) density.value = v.density;
                                            if (v.hiddenColumns) hiddenCols.value = { ...v.hiddenColumns };
                                            if (v.pinnedColumns) pinnedCols.value = { ...v.pinnedColumns };
                                            if (v.groupBy) activeGroupBy.value = [...v.groupBy];
                                            openMenu.value = null;
                                            pushQuery(v.query);
                                          },
                                        },
                                        [h("span", v.name)],
                                      ),
                                      h(
                                        "button",
                                        {
                                          type: "button",
                                          class: "tbx-views-delete-btn",
                                          onClick: () => {
                                            savedViewsList.value = removeSavedView(
                                              savedViewsList.value,
                                              v.id,
                                              props.storageKey,
                                            );
                                            props.onSavedViewsChange?.([...savedViewsList.value]);
                                            emit("savedViewsChange", [...savedViewsList.value]);
                                          },
                                        },
                                        "✕",
                                      ),
                                    ]),
                                  ),
                            ])
                          : null,
                      ])
                    : null,
                  props.enableColumns && props.showColumnsButton !== false
                    ? h("div", { class: "tbx-menu-wrap" }, [
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-btn",
                            "aria-haspopup": "menu",
                            "aria-expanded": String(openMenu.value === "columns"),
                            onClick: () => {
                              openMenu.value = openMenu.value === "columns" ? null : "columns";
                            },
                          },
                          [columnsIcon(), h("span", loc.columnsButton)],
                        ),
                        openMenu.value === "columns"
                          ? h("div", { class: "tbx-menu", role: "menu" }, [
                              h("div", { class: "tbx-menu-label" }, loc.toggleColumnsLabel),
                              h("div", { class: "tbx-menu-separator" }),
                              ...leafCols.value.filter(isHideable).map((col) => {
                                const cid = getColumnId(col);
                                const vis = hiddenCols.value[cid] !== true;
                                return h(
                                  "button",
                                  {
                                    key: cid,
                                    type: "button",
                                    class: "tbx-menu-item",
                                    role: "menuitemcheckbox",
                                    "aria-checked": String(vis),
                                    onClick: () => {
                                      hiddenCols.value = { ...hiddenCols.value, [cid]: vis };
                                      savePersisted();
                                    },
                                  },
                                  [checkIcon(), h("span", getColumnTitle(col) || cid)],
                                );
                              }),
                              props.storageKey
                                ? h(
                                    "button",
                                    {
                                      type: "button",
                                      class: "tbx-menu-item tbx-menu-item--reset",
                                      onClick: () => {
                                        clearGridState(props.storageKey!);
                                        density.value = props.density ?? "default";
                                        colWidths.value = {};
                                        pinnedCols.value = {};
                                        activeGroupBy.value = normalizeGroupBy(props.groupBy);
                                        colList.value = [...props.columns];
                                        hiddenCols.value = initialHiddenColumns(flattenColumns(props.columns));
                                        openMenu.value = null;
                                      },
                                    },
                                    [h("span", loc.resetView)],
                                  )
                                : null,
                            ])
                          : null,
                      ])
                    : null,
                  props.enableDensity && props.showDensityButton !== false
                    ? h("div", { class: "tbx-menu-wrap" }, [
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-btn tbx-capitalize",
                            "aria-haspopup": "menu",
                            "aria-expanded": String(openMenu.value === "density"),
                            onClick: () => {
                              openMenu.value = openMenu.value === "density" ? null : "density";
                            },
                          },
                          [
                            densityIcon(),
                            h("span", formatMessage(loc.densityButton, { density: density.value })),
                          ],
                        ),
                        openMenu.value === "density"
                          ? h(
                              "div",
                              { class: "tbx-menu", role: "menu" },
                              DENSITIES.map((d) =>
                                h(
                                  "button",
                                  {
                                    key: d,
                                    type: "button",
                                    class: "tbx-menu-item",
                                    role: "menuitemcheckbox",
                                    "aria-checked": String(density.value === d),
                                    onClick: () => {
                                      density.value = d;
                                      openMenu.value = null;
                                      savePersisted();
                                    },
                                  },
                                  [
                                    checkIcon(),
                                    h(
                                      "span",
                                      d === "compact"
                                        ? loc.densityCompact
                                        : d === "comfortable"
                                          ? loc.densityComfortable
                                          : loc.densityDefault,
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : null,
                      ])
                    : null,
                  props.enableExport && props.showExportButton !== false
                    ? resolvedExportMode === "excel" ||
                      resolvedExportMode === "csv" ||
                      resolvedExportMode === "pdf"
                      ? h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-btn tbx-btn--export",
                            disabled: isExporting.value,
                            onClick: () => void runExport(resolvedExportMode),
                          },
                          [
                            downloadTrayIcon(),
                            h(
                              "span",
                              isExporting.value
                                ? loc.exportingButton
                                : resolvedExportMode === "excel"
                                  ? loc.exportExcelButton
                                  : resolvedExportMode === "pdf"
                                    ? loc.exportPdfButton
                                    : loc.exportCsvButton,
                            ),
                          ],
                        )
                      : h("div", { class: "tbx-menu-wrap" }, [
                          h(
                            "button",
                            {
                              type: "button",
                              class: "tbx-btn tbx-btn--export",
                              disabled: isExporting.value,
                              "aria-haspopup": "menu",
                              "aria-expanded": String(openMenu.value === "export"),
                              onClick: () => {
                                openMenu.value = openMenu.value === "export" ? null : "export";
                              },
                            },
                            [
                              downloadTrayIcon(),
                              h("span", isExporting.value ? loc.exportingButton : loc.exportButton),
                              chevronDownIcon("tbx-icon tbx-chevron"),
                            ],
                          ),
                          openMenu.value === "export"
                            ? h("div", { class: "tbx-menu tbx-menu--end", role: "menu" }, [
                                h(
                                  "button",
                                  { type: "button", class: "tbx-menu-item", onClick: () => void runExport("excel") },
                                  [
                                    fileSpreadsheetIcon(),
                                    h("div", { class: "tbx-menu-item-title" }, [
                                      h("strong", loc.exportExcelTitle),
                                      h("small", loc.exportExcelSubtitle),
                                    ]),
                                  ],
                                ),
                                h(
                                  "button",
                                  { type: "button", class: "tbx-menu-item", onClick: () => void runExport("csv") },
                                  [
                                    fileTextIcon(),
                                    h("div", { class: "tbx-menu-item-title" }, [
                                      h("strong", loc.exportCsvTitle),
                                      h("small", loc.exportCsvSubtitle),
                                    ]),
                                  ],
                                ),
                                h(
                                  "button",
                                  { type: "button", class: "tbx-menu-item", onClick: () => void runExport("pdf") },
                                  [
                                    fileTextIcon("tbx-icon--pdf"),
                                    h("div", { class: "tbx-menu-item-title" }, [
                                      h("strong", loc.exportPdfTitle),
                                      h("small", loc.exportPdfSubtitle),
                                    ]),
                                  ],
                                ),
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    class: "tbx-menu-item",
                                    onClick: () => void runExport("clipboard"),
                                  },
                                  [
                                    fileTextIcon(),
                                    h("div", { class: "tbx-menu-item-title" }, [
                                      h("strong", loc.exportClipboardTitle),
                                      h("small", loc.exportClipboardSubtitle),
                                    ]),
                                  ],
                                ),
                              ])
                            : null,
                        ])
                    : null,
                  slots.toolbar ? slots.toolbar() : props.toolbarActions,
                ]),
              ])
            : null,

          // Active filter pills
          props.showFilterPills &&
          (Boolean(q.q?.trim()) ||
            Object.keys(q.filter ?? {}).some((k) => Boolean(q.filter?.[k]?.trim())))
            ? h("div", { class: "tbx-filter-pills-bar" }, [
                h("span", { class: "tbx-filter-pills-title" }, "Active filters:"),
                q.q?.trim()
                  ? h("div", { class: "tbx-filter-pill" }, [
                      h("span", { class: "tbx-filter-pill-label" }, "Search:"),
                      h("span", { class: "tbx-filter-pill-val" }, `"${q.q}"`),
                      h(
                        "button",
                        {
                          type: "button",
                          class: "tbx-filter-pill-remove",
                          onClick: () => {
                            searchText.value = "";
                            pushQuery(withSearch(q, ""));
                          },
                        },
                        "✕",
                      ),
                    ])
                  : null,
                ...Object.entries(q.filter ?? {})
                  .filter(([_, v]) => Boolean(v?.trim()))
                  .map(([k, v]) =>
                    h("div", { key: k, class: "tbx-filter-pill" }, [
                      h("span", { class: "tbx-filter-pill-label" }, `${k}:`),
                      h("span", { class: "tbx-filter-pill-val" }, formatFilterPillValue(String(v))),
                      h(
                        "button",
                        {
                          type: "button",
                          class: "tbx-filter-pill-remove",
                          onClick: () => pushQuery(withFilter(q, k, undefined)),
                        },
                        "✕",
                      ),
                    ]),
                  ),
                h(
                  "button",
                  {
                    type: "button",
                    class: "tbx-filter-pill-clear-all",
                    onClick: () => {
                      searchText.value = "";
                      pushQuery({ ...q, page: 1, q: undefined, filter: undefined });
                    },
                  },
                  "Clear all",
                ),
              ])
            : null,

          // Select-all across pages banner
          props.enableSelection &&
          props.selectionMode !== "single" &&
          !props.isLoading &&
          pageRowIds.value.length > 0 &&
          ((allPageSelected && total.value > pageRowIds.value.length) || allAcrossSelected.value)
            ? h("div", { class: "tbx-select-all-banner", role: "status" }, [
                allAcrossSelected.value
                  ? h(
                      "span",
                      { class: "tbx-select-all-banner-text" },
                      formatMessage(loc.allAcrossPagesSelected, {
                        total: total.value.toLocaleString(),
                      }),
                    )
                  : h("span", { class: "tbx-select-all-banner-text" }, [
                      "All ",
                      h("strong", pageRowIds.value.length.toLocaleString()),
                      " records on this page are selected.",
                    ]),
                h(
                  "button",
                  {
                    type: "button",
                    class: "tbx-select-all-banner-btn",
                    onClick: () => {
                      if (allAcrossSelected.value) {
                        deselectAll();
                      } else {
                        const next = new Set(selectedIds.value);
                        const pool = props.allData ?? (isClientSide.value ? props.data : undefined);
                        if (pool && pool.length > 0) {
                          for (const r of queryClientData(pool, q, {
                            ...clientQueryOpts.value,
                            paginate: false,
                          }).items) {
                            next.add(rowIdFn.value(r));
                          }
                        } else {
                          for (const id of pageRowIds.value) next.add(id);
                        }
                        selectedIds.value = next;
                        allAcrossSelected.value = true;
                        emitSelection();
                      }
                    },
                  },
                  allAcrossSelected.value
                    ? loc.clearSelection
                    : formatMessage(loc.selectAllAcrossPages, {
                        total: total.value.toLocaleString(),
                      }),
                ),
              ])
            : null,

          // Table wrapper
          h(
            "div",
            {
              ref: tableWrapRef,
              class: props.enableVirtualization
                ? "tbx-table-wrap tbx-table-wrap--virtual"
                : "tbx-table-wrap",
              style: props.enableVirtualization
                ? { maxHeight: `${props.virtualHeight}px` }
                : undefined,
              onScroll: (ev: Event) => {
                contextMenu.value = null;
                const el = ev.currentTarget as HTMLElement | null;
                if (!el) return;
                if (props.enableVirtualization) {
                  virtualScrollTop.value = el.scrollTop;
                }
                if (isInfiniteMode.value && props.hasMore && !props.isLoading && !props.isLoadingMore) {
                  if (el.scrollHeight - el.scrollTop - el.clientHeight <= 120) {
                    props.onLoadMore?.(props.nextCursor);
                    emit("loadMore", props.nextCursor);
                  }
                }
              },
            },
            [
              h("table", { class: "tbx-table", "aria-label": props.caption }, [
                h("thead", [
                  h("tr", [
                    props.enableRowReorder
                      ? h("th", {
                          rowspan: headerRows.value.hasGroups ? 2 : undefined,
                          class: "tbx-th tbx-th--row-drag",
                          style: { width: "36px" },
                          scope: "col",
                        })
                      : null,
                    hasExpandCol.value
                      ? h("th", {
                          rowspan: headerRows.value.hasGroups ? 2 : undefined,
                          class: "tbx-th tbx-th--expand",
                          style: { width: "40px" },
                          scope: "col",
                        })
                      : null,
                    props.enableSelection
                      ? h(
                          "th",
                          {
                            rowspan: headerRows.value.hasGroups ? 2 : undefined,
                            class: "tbx-th tbx-th--select",
                            scope: "col",
                          },
                          props.selectionMode !== "single"
                            ? [
                                h("input", {
                                  type: "checkbox",
                                  class: "tbx-checkbox",
                                  checked: allPageSelected,
                                  "aria-label": loc.selectAllLabel,
                                  onChange: () => {
                                    if (allAcrossSelected.value) {
                                      deselectAll();
                                      return;
                                    }
                                    const next = new Set(selectedIds.value);
                                    if (allPageSelected) {
                                      for (const id of pageRowIds.value) next.delete(id);
                                    } else {
                                      for (const id of pageRowIds.value) next.add(id);
                                    }
                                    selectedIds.value = next;
                                    emitSelection();
                                  },
                                }),
                              ]
                            : [],
                        )
                      : null,
                    props.showSerialNumber
                      ? h(
                          "th",
                          {
                            rowspan: headerRows.value.hasGroups ? 2 : undefined,
                            class: "tbx-th tbx-th--serial",
                            scope: "col",
                          },
                          loc.serialHeader,
                        )
                      : null,
                    ...(!headerRows.value.hasGroups
                      ? visible.value.map((col) => renderLeafTh(col, 1, false))
                      : headerRows.value.topRow.map((cell, idx) =>
                          cell.isGroup
                            ? h(
                                "th",
                                {
                                  key: `grp-${cell.id}-${idx}`,
                                  colspan: cell.colSpan,
                                  class: "tbx-th tbx-th--group",
                                  scope: "colgroup",
                                },
                                [h("span", { class: "tbx-th-group-title" }, cell.title)],
                              )
                            : renderLeafTh(cell.leafColumn!, cell.rowSpan, false),
                        )),
                  ]),
                  headerRows.value.hasGroups
                    ? h(
                        "tr",
                        headerRows.value.bottomRow.map((cell) =>
                          renderLeafTh(cell.leafColumn!, 1, true),
                        ),
                      )
                    : null,
                ]),
                h("tbody", bodyChildren),
                !props.isLoading && hasSummary && rows.value.length > 0
                  ? h("tfoot", [
                      h("tr", { class: "tbx-summary-row" }, [
                        props.enableRowReorder ? h("td", { class: "tbx-summary-cell" }) : null,
                        hasExpandCol.value ? h("td", { class: "tbx-summary-cell" }) : null,
                        props.enableSelection
                          ? h("td", { class: "tbx-summary-cell tbx-summary-cell--select" })
                          : null,
                        props.showSerialNumber
                          ? h("td", { class: "tbx-summary-cell tbx-summary-cell--serial" })
                          : null,
                        ...visible.value.map((col, idx) => {
                          const aggVal = computeAggregation(col, rows.value);
                          const lbl =
                            col.meta?.aggregationLabel ||
                            (typeof col.meta?.aggregation === "string"
                              ? `${col.meta.aggregation}:`
                              : "");
                          return h(
                            "td",
                            {
                              key: `sum-${getColumnId(col) || idx}`,
                              class: "tbx-summary-cell",
                              style: { textAlign: col.meta?.align ?? "left" },
                            },
                            aggVal !== null && aggVal !== undefined
                              ? [
                                  lbl ? h("span", { class: "tbx-summary-label" }, `${lbl} `) : null,
                                  h("strong", String(aggVal)),
                                ]
                              : idx === 0 && !lbl
                                ? [h("strong", "Total")]
                                : [],
                          );
                        }),
                      ]),
                    ])
                  : null,
              ]),
            ],
          ),

          // Column Filter / Quick-Action Popover
          openFilterCol.value
            ? (() => {
                const col = leafCols.value.find((c) => getColumnId(c) === openFilterCol.value);
                if (!col) return null;
                const cid = getColumnId(col);
                const fField = getFilterField(col);
                const sField = getSortField(col);
                const applyVal = (v: string | undefined) => {
                  openFilterCol.value = null;
                  pushQuery(withFilter(q, fField, v));
                };
                const isGrouped = activeGroupBy.value.some((g) => g.toLowerCase() === cid.toLowerCase());
                return h("div", { class: "tbx-filter-popover" }, [
                  props.enableColumnMenu !== false
                    ? h("div", { class: "tbx-col-menu-actions" }, [
                        isSortable(col)
                          ? h(
                              "button",
                              {
                                type: "button",
                                class: "tbx-col-menu-btn",
                                onClick: () => {
                                  openFilterCol.value = null;
                                  pushQuery(withSort(q, sField, "asc"));
                                },
                              },
                              [arrowUpIcon(), h("span", loc.sortAscending)],
                            )
                          : null,
                        isSortable(col)
                          ? h(
                              "button",
                              {
                                type: "button",
                                class: "tbx-col-menu-btn",
                                onClick: () => {
                                  openFilterCol.value = null;
                                  pushQuery(withSort(q, sField, "desc"));
                                },
                              },
                              [arrowDownIcon(), h("span", loc.sortDescending)],
                            )
                          : null,
                        isGrouped
                          ? h(
                              "button",
                              {
                                type: "button",
                                class: "tbx-col-menu-btn tbx-col-menu-btn--active",
                                onClick: () => {
                                  activeGroupBy.value = activeGroupBy.value.filter(
                                    (g) => g.toLowerCase() !== cid.toLowerCase(),
                                  );
                                  openFilterCol.value = null;
                                  props.onGroupByChange?.(activeGroupBy.value[0], [...activeGroupBy.value]);
                                  emit("groupByChange", activeGroupBy.value[0]);
                                },
                              },
                              [h("span", loc.ungroupColumn)],
                            )
                          : h(
                              "button",
                              {
                                type: "button",
                                class: "tbx-col-menu-btn",
                                onClick: () => {
                                  activeGroupBy.value = [cid];
                                  openFilterCol.value = null;
                                  props.onGroupByChange?.(cid, [cid]);
                                  emit("groupByChange", cid);
                                },
                              },
                              [h("span", loc.groupByColumn)],
                            ),
                      ])
                    : null,
                  isFilterable(col, props.enableColumnFilters)
                    ? [
                        h("input", {
                          type: "text",
                          class: "tbx-filter-popover-input",
                          value: filterSearchText.value,
                          placeholder: formatMessage(loc.filterColumnPlaceholder, {
                            column: getColumnTitle(col) || cid,
                          }),
                          onInput: (ev: Event) => {
                            filterSearchText.value = (ev.target as { value?: string })?.value ?? "";
                          },
                          onKeydown: (ev: KeyboardEvent) => {
                            if (ev.key === "Enter") {
                              ev.preventDefault();
                              applyVal(filterSearchText.value.trim() || undefined);
                            }
                          },
                        }),
                        h("div", { class: "tbx-filter-popover-actions" }, [
                          h(
                            "button",
                            { type: "button", class: "tbx-filter-popover-btn", onClick: () => applyVal(undefined) },
                            [rotateCcwIcon(), h("span", loc.clearFilter)],
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              class: "tbx-filter-popover-btn tbx-filter-popover-btn--primary",
                              onClick: () => applyVal(filterSearchText.value.trim() || undefined),
                            },
                            [checkIcon("tbx-icon"), h("span", loc.applyFilter)],
                          ),
                        ]),
                      ]
                    : null,
                ]);
              })()
            : null,

          // Infinite scroll footer
          isInfiniteMode.value && (props.hasMore || props.isLoadingMore)
            ? h("div", { class: "tbx-infinite-footer" }, [
                h(
                  "button",
                  {
                    type: "button",
                    class: "tbx-load-more-btn",
                    disabled: props.isLoadingMore,
                    onClick: () => {
                      if (!props.isLoadingMore && props.hasMore) {
                        props.onLoadMore?.(props.nextCursor);
                        emit("loadMore", props.nextCursor);
                      }
                    },
                  },
                  props.isLoadingMore ? loc.loadingMoreText : loc.loadMoreButton,
                ),
              ])
            : null,

          // Context Menu
          contextMenu.value
            ? (() => {
                const ctx = contextMenu.value!;
                const rawVal = getCellValue(ctx.col, ctx.row);
                const text = getCellText(rawVal, boolLabels.value);
                const custom =
                  props.contextMenuItems?.({ row: ctx.row, columnId: ctx.colId, value: rawVal }) ??
                  [];
                return h(
                  "div",
                  {
                    class: "tbx-context-menu",
                    role: "menu",
                    style: { position: "fixed", left: `${ctx.x}px`, top: `${ctx.y}px` },
                  },
                  [
                    h(
                      "button",
                      {
                        type: "button",
                        class: "tbx-context-menu-item",
                        onClick: () => {
                          void navigator.clipboard?.writeText?.(text);
                          contextMenu.value = null;
                        },
                      },
                      loc.copyCell,
                    ),
                    text !== "" && isFilterable(ctx.col, props.enableColumnFilters)
                      ? h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-context-menu-item",
                            onClick: () => {
                              pushQuery(withFilter(q, getFilterField(ctx.col), text));
                              contextMenu.value = null;
                            },
                          },
                          formatMessage(loc.filterByValue, { value: text }),
                        )
                      : null,
                    ...custom.map((ci) =>
                      h(
                        "button",
                        {
                          key: ci.id,
                          type: "button",
                          class: `tbx-context-menu-item ${ci.danger ? "tbx-context-menu-item--danger" : ""}`,
                          disabled: ci.disabled,
                          onClick: () => {
                            contextMenu.value = null;
                            ci.onSelect();
                          },
                        },
                        ci.label,
                      ),
                    ),
                  ],
                );
              })()
            : null,

          // Mobile Cards
          h(
            "div",
            { class: "tbx-cards" },
            rows.value.map((r, idx) =>
              h(
                "div",
                { key: `${rowIdFn.value(r)}-${idx}`, class: "tbx-card" },
                [
                  h(
                    "dl",
                    { class: "tbx-card-rows" },
                    visible.value.map((col, cIdx) =>
                      h("div", { key: getColumnId(col) || cIdx, class: "tbx-card-row" }, [
                        h("dt", getColumnTitle(col) || getColumnId(col)),
                        h("dd", [renderCellDisplay(col, r, idx)]),
                      ]),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bulk Actions Bar
          props.enableSelection && props.enableBulkActions && effectiveSelectedCount > 0
            ? h("div", { class: "tbx-bulk-bar", role: "region", "aria-label": "Bulk actions" }, [
                h(
                  "span",
                  { class: "tbx-bulk-badge" },
                  formatMessage(loc.selectedBadge, {
                    count: effectiveSelectedCount.toLocaleString(),
                  }),
                ),
                h("div", { class: "tbx-bulk-actions" }, [
                  props.enableExport && props.showExportButton !== false
                    ? [
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-bulk-btn",
                            onClick: () => void runBulkExport("excel"),
                          },
                          [fileSpreadsheetIcon(), h("span", loc.exportExcelButton)],
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-bulk-btn",
                            onClick: () => void runBulkExport("csv"),
                          },
                          [fileTextIcon(), h("span", loc.exportCsvButton)],
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-bulk-btn",
                            onClick: () => void runBulkExport("pdf"),
                          },
                          [fileTextIcon("tbx-icon--pdf"), h("span", loc.exportPdfButton)],
                        ),
                      ]
                    : null,
                  slots["bulk-actions"]
                    ? slots["bulk-actions"]({
                        selectedIds: Array.from(selectedIds.value),
                        deselectAll,
                      })
                    : props.bulkActions?.(Array.from(selectedIds.value), deselectAll),
                ]),
                h(
                  "button",
                  {
                    type: "button",
                    class: "tbx-bulk-btn tbx-bulk-btn--close",
                    "aria-label": "Deselect all",
                    onClick: deselectAll,
                  },
                  [xIcon()],
                ),
              ])
            : null,

          // Footer
          props.showFooter
            ? h("div", { class: "tbx-footer" }, [
                h("div", { class: "tbx-range" }, [
                  h(
                    "span",
                    splitRangeTemplate(loc.showingRange, {
                      start: String(recordRange.start),
                      end: String(recordRange.end),
                      total: total.value.toLocaleString(),
                    }),
                  ),
                  effectiveSelectedCount > 0
                    ? h(
                        "span",
                        { class: "tbx-selected-badge" },
                        formatMessage(loc.selectedBadge, {
                          count: effectiveSelectedCount.toLocaleString(),
                        }),
                      )
                    : null,
                  rangeStats && rangeStats.cellCount > 1
                    ? h(
                        "span",
                        { class: "tbx-range-stats-badge" },
                        [
                          `Count: ${rangeStats.cellCount}`,
                          ...(rangeStats.numericCount > 0 &&
                          rangeStats.sum !== null &&
                          rangeStats.avg !== null
                            ? [
                                `Sum: ${Number(rangeStats.sum.toFixed(2)).toLocaleString()}`,
                                `Avg: ${Number(rangeStats.avg.toFixed(2)).toLocaleString()}`,
                              ]
                            : []),
                        ].join(" · "),
                      )
                    : null,
                ]),
                h("div", { class: "tbx-pagination" }, [
                  props.enableRowsPerPage && props.showRowsPerPage !== false
                    ? h("div", { class: "tbx-rows-per-page" }, [
                        h("span", loc.rowsPerPage),
                        h(
                          "select",
                          {
                            class: "tbx-rows-select",
                            value: String(pageSize),
                            "aria-label": loc.rowsPerPage,
                            onChange: (ev: Event) => {
                              const nextSize = Number.parseInt(
                                (ev.target as { value?: string })?.value ?? "10",
                                10,
                              );
                              pushQuery(withPageSize(q, nextSize));
                            },
                          },
                          PAGE_SIZES.map((sz) => h("option", { key: sz, value: sz }, `${sz} rows`)),
                        ),
                      ])
                    : null,
                  isPaginationVisible.value
                    ? h("div", { class: "tbx-pager" }, [
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-page-nav",
                            disabled: currentPage <= 1,
                            "aria-label": loc.previousPage,
                            onClick: () => pushQuery(withPage(q, currentPage - 1, totalPages)),
                          },
                          [chevronLeftIcon()],
                        ),
                        ...getPageNumbers(currentPage, totalPages).map((item, idx) =>
                          item === "..."
                            ? h("span", { key: `gap-${idx}`, class: "tbx-page-ellipsis" }, "…")
                            : h(
                                "button",
                                {
                                  key: `p-${item}`,
                                  type: "button",
                                  class:
                                    item === currentPage
                                      ? "tbx-page-btn tbx-page-btn--current"
                                      : "tbx-page-btn",
                                  "aria-current": item === currentPage ? "page" : undefined,
                                  onClick: () => pushQuery(withPage(q, item, totalPages)),
                                },
                                String(item),
                              ),
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            class: "tbx-page-nav",
                            disabled: currentPage >= totalPages,
                            "aria-label": loc.nextPage,
                            onClick: () => pushQuery(withPage(q, currentPage + 1, totalPages)),
                          },
                          [chevronRightIcon()],
                        ),
                      ])
                    : null,
                  props.enableJumpToPage && props.showJumpToPage !== false
                    ? h(
                        "form",
                        {
                          class: "tbx-jump",
                          onSubmit: (ev: Event) => {
                            ev.preventDefault();
                            const p = Number.parseInt(jumpText.value, 10);
                            if (Number.isFinite(p) && p >= 1 && p <= totalPages) {
                              pushQuery(withPage(q, p, totalPages));
                            } else {
                              jumpText.value = String(currentPage);
                            }
                          },
                        },
                        [
                          h("label", { class: "tbx-jump-label", for: `${uid}-jump` }, loc.goToPage),
                          h("input", {
                            id: `${uid}-jump`,
                            type: "number",
                            class: "tbx-jump-input",
                            min: 1,
                            max: totalPages,
                            value: jumpText.value,
                            onInput: (ev: Event) => {
                              jumpText.value = (ev.target as { value?: string })?.value ?? "";
                            },
                          }),
                        ],
                      )
                    : null,
                ]),
              ])
            : null,
        ],
      );
    };
  },
});

export const NexGrid = TableX;
