// `<NexGrid />` — the React adapter.
//
// The component is a VIEW over a `QueryState`. It owns only what the server
// cannot know: which menus are open, which columns the user hid, how dense the
// rows are, which rows are ticked, and the half-typed contents of the search
// box. Everything that changes which records exist — page, size, sort, search,
// filters — is handed to `onQueryChange` and comes back as props.
//
// That split is what makes the grid honest about server-driven data. There is
// no local sort that silently reorders one page out of a thousand, and no
// client filter that hides rows the total still counts. It also means the URL,
// a router, or a query cache can own the state instead of the component.
//
// Every query mutation goes through core's reducers rather than object
// spreads, so the "search resets to page 1" and "sort cycles asc → desc → off"
// rules are defined once for React, Angular and vanilla alike.

import * as React from "react";
import {
  DENSITIES,
  PAGE_SIZES,
  buildQueryUrl,
  computeAggregation,
  downloadCsv,
  downloadExcel,
  fetchAllPages,
  filePrefixFromCaption,
  formatMessage,
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
  withToggledSort,
  withToggledMultiSort,
  copyToClipboard,
  clearGridState,
  loadGridState,
  saveGridState,
  getCellValue,
  getCellText,
  queryClientData,
  defaultQuery,
  flattenColumns,
  hasHeaderGroups,
  buildHeaderRows,
  type Density,
  type PagedResponse,
  type TableXColumn,
  type QueryState,
  type SortSpec,
} from "@nexgrid/core";

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ColumnsIcon,
  DensityIcon,
  DotsVerticalIcon,
  DownloadIcon,
  DownloadTrayIcon,
  EditIcon,
  EyeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FilterIcon,
  FunnelIcon,
  MoreVerticalIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersIcon,
  TrashIcon,
  XIcon,
} from "./icons.js";
import {
  bodyCellStyle,
  headerCellStyle,
  headerInnerClass,
  renderCellContent,
  renderColumnHeader,
  renderTemplate,
} from "./render.js";
import { useDebouncedSearch } from "./use-debounced-search.js";
import { useDropdown } from "./use-dropdown.js";
import type { TableXNoticeType, TableXProps, TableXReactColumn } from "./types.js";

/** Fallback row identity: the `id` property, else the row's own string form. */
function defaultRowId<TData>(row: TData): string {
  const record = row as Record<string, unknown> | null | undefined;
  const id = record === null || record === undefined ? undefined : record["id"];
  return String(id ?? row);
}

/** Density -> the locale key holding its menu label. */
const DENSITY_LABEL_KEY = {
  compact: "densityCompact",
  default: "densityDefault",
  comfortable: "densityComfortable",
} as const satisfies Record<Density, string>;

/**
 * A server-driven data grid: search, sorting, column visibility, density,
 * selection, exports, a responsive card layout, and a paginated footer.
 *
 * `data`, `total`, `query` and `onQueryChange` are controlled by the host — the
 * grid renders the page it is given and never fetches on its own (the one
 * exception being {@link TableXProps.fetchEndpoint}, used to page in the rest
 * of the dataset for an export).
 *
 * @example
 * ```tsx
 * const [query, setQuery] = useState(defaultQuery());
 * <NexGrid
 *   caption="Students"
 *   columns={columns}
 *   data={page.items}
 *   total={page.total}
 *   query={query}
 *   onQueryChange={setQuery}
 * />
 * ```
 */
export function TableX<TData>(props: TableXProps<TData>): React.JSX.Element {
  const {
    columns,
    data,
    total: totalProp,
    query: queryProp,
    onQueryChange: onQueryChangeProp,
    clientSidePagination,
    paginationMode,
    caption,
    density: initialDensity = "default",
    isLoading = false,
    error = false,
    onRetry,
    enableSelection = false,
    selectionMode = "multi",
    enableColumnFilters = true,
    enableColumnResize = true,
    onSelectionChange,
    enableSearch = true,
    searchPlaceholder,
    enableColumns = true,
    showColumnsButton,
    enableDensity = true,
    showDensityButton,
    enableExport = true,
    showExportButton,
    enableSorting = true,
    enablePagination = true,
    showPagination,
    enableRowsPerPage = true,
    showRowsPerPage,
    enableJumpToPage = true,
    showJumpToPage,
    showToolbar = true,
    showFooter = true,
    renderExpandedRow,
    enableBulkActions = true,
    bulkActions,
    enableSummaryRow,
    enableColumnReorder = false,
    onColumnOrderChange,
    onCellEdit,
    storageKey,
    showFilterPills = true,
    toolbarActions,
    onRowClick,
    getRowId = defaultRowId,
    className,
    showSerialNumber = true,
    exportFileName,
    onExportAll,
    fetchEndpoint,
    badgeRules,
    locale: localeOverrides,
    onNotify,
    theme = "light",
  } = props;

  const isClientSide =
    clientSidePagination === true ||
    paginationMode === "client" ||
    (onQueryChangeProp === undefined && queryProp === undefined);

  const [internalQuery, setInternalQuery] = React.useState<QueryState>(() => queryProp ?? defaultQuery());
  const query = queryProp ?? internalQuery;

  const onQueryChange = React.useCallback(
    (next: QueryState) => {
      setInternalQuery(next);
      onQueryChangeProp?.(next);
    },
    [onQueryChangeProp],
  );

  const clientPaged = React.useMemo(() => {
    if (!isClientSide) return null;
    return queryClientData(data, query);
  }, [isClientSide, data, query]);

  const rows = isClientSide ? (clientPaged?.items ?? data) : data;
  const total = isClientSide ? (clientPaged?.total ?? data.length) : (totalProp ?? data.length);
  const locale = resolveLocale(localeOverrides);
  const boolLabels = { yes: locale.booleanYes, no: locale.booleanNo };

  const isColumnsVisible = enableColumns && showColumnsButton !== false;
  const isDensityVisible = enableDensity && showDensityButton !== false;
  const isExportVisible = enableExport && showExportButton !== false;
  const isPaginationVisible = enablePagination && showPagination !== false;
  const isRowsPerPageVisible = enableRowsPerPage && showRowsPerPage !== false;
  const isJumpToPageVisible = enableJumpToPage && showJumpToPage !== false;

  const [colList, setColList] = React.useState(columns);
  React.useEffect(() => {
    setColList(columns);
  }, [columns]);

  const [density, setDensity] = React.useState<Density>(initialDensity);
  const [hiddenCols, setHiddenCols] = React.useState<Record<string, boolean>>(() =>
    initialHiddenColumns(flattenColumns(columns)),
  );
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [expandedRows, setExpandedRows] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [editingCell, setEditingCell] = React.useState<{ rowId: string; columnId: string } | null>(null);
  const [draggedColId, setDraggedColId] = React.useState<string | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const [openFilterCol, setOpenFilterCol] = React.useState<string | null>(null);
  const [colWidths, setColWidths] = React.useState<Record<string, number>>({});

  // Restore persisted state on mount
  React.useEffect(() => {
    if (!storageKey) return;
    const persisted = loadGridState(storageKey);
    if (persisted) {
      if (persisted.density) setDensity(persisted.density);
      if (persisted.columnWidths) setColWidths(persisted.columnWidths);
      if (persisted.hiddenColumns && Array.isArray(persisted.hiddenColumns)) {
        const hiddenMap: Record<string, boolean> = {};
        for (const col of columns) {
          const id = getColumnId(col);
          if (id) hiddenMap[id] = persisted.hiddenColumns.includes(id);
        }
        setHiddenCols(hiddenMap);
      }
      if (persisted.columnOrder && Array.isArray(persisted.columnOrder)) {
        const colMap = new Map<string, TableXReactColumn<TData>>(columns.map((c) => [getColumnId(c), c]));
        const reordered: TableXReactColumn<TData>[] = [];
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
        if (reordered.length === columns.length) {
          setColList(reordered);
        }
      }
    }
  }, [storageKey, columns]);

  // Persist state changes
  React.useEffect(() => {
    if (!storageKey) return;
    const hiddenList = Object.entries(hiddenCols)
      .filter(([_, isHidden]) => isHidden)
      .map(([id]) => id);
    saveGridState(storageKey, {
      density,
      columnWidths: colWidths,
      columnOrder: colList.map(getColumnId).filter(Boolean) as string[],
      hiddenColumns: hiddenList,
    });
  }, [storageKey, density, hiddenCols, colList, colWidths]);

  const columnsMenu = useDropdown();
  const densityMenu = useDropdown();
  const exportMenu = useDropdown();

  const handleResetView = React.useCallback(() => {
    if (storageKey) {
      clearGridState(storageKey);
    }
    setDensity(initialDensity);
    setColWidths({});
    setColList(columns);
    setHiddenCols(initialHiddenColumns(flattenColumns(columns)));
    columnsMenu.close();
  }, [storageKey, initialDensity, columns, columnsMenu]);

  const leafCols = React.useMemo(() => flattenColumns(colList), [colList]);

  const autoFitColumn = React.useCallback((id: string) => {
    const col = leafCols.find((c) => getColumnId(c) === id);
    if (!col) return;
    const meta = col.meta ?? {};
    let maxContentWidth = 0;
    const headerTitle = getColumnTitle(col) || id;
    maxContentWidth = Math.max(maxContentWidth, headerTitle.length * 8.5 + 50);

    for (const row of rows) {
      const rawVal = getCellValue(col, row);
      const val = getCellText(rawVal);
      if (val) {
        maxContentWidth = Math.max(maxContentWidth, String(val).length * 8 + 26);
      }
    }

    const minW = meta.minWidth ?? 60;
    const maxW = 550;
    const finalWidth = Math.min(maxW, Math.max(minW, Math.round(maxContentWidth)));

    setColWidths((prev) => ({ ...prev, [id]: finalWidth }));
  }, [leafCols, rows]);

  const instanceId = React.useId();
  const columnsButtonId = `${instanceId}-columns`;
  const densityButtonId = `${instanceId}-density`;
  const exportButtonId = `${instanceId}-export`;
  const jumpInputId = `${instanceId}-jump`;
  const rootRef = React.useRef<HTMLDivElement>(null);

  const notify = (type: TableXNoticeType, message: string): void => {
    onNotify?.({ type, message });
  };

  // ---- Derived query state -------------------------------------------------

  const currentPage = Math.max(1, query.page);
  const pageSize = query.pageSize;
  const totalPages = totalPagesFor(total, pageSize);
  const range = getRecordRange(currentPage, pageSize, total);
  const sort = primarySort(query);

  const headerRows = React.useMemo(
    () => buildHeaderRows(colList, hiddenCols),
    [colList, hiddenCols],
  );
  const visible = React.useMemo(
    () => visibleColumns(leafCols, hiddenCols),
    [leafCols, hiddenCols],
  );
  const hideable = React.useMemo(() => leafCols.filter(isHideable), [leafCols]);
  const pageItems = React.useMemo(
    () => getPageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const pageRowIds = React.useMemo(() => rows.map((row) => getRowId(row)), [rows, getRowId]);

  const columnCount =
    visible.length +
    (renderExpandedRow ? 1 : 0) +
    (showSerialNumber ? 1 : 0) +
    (enableSelection ? 1 : 0);

  // ---- Pinned offsets helper -----------------------------------------------

  const getPinnedOffsets = (visibleCols: readonly TableXColumn<TData, React.ReactNode>[]) => {
    const leftOffsets = new Map<string, number>();
    const rightOffsets = new Map<string, number>();
    let currentLeft = 0;
    let lastLeftPinnedId: string | null = null;

    if (renderExpandedRow) {
      leftOffsets.set("__expand", currentLeft);
      currentLeft += 40;
      lastLeftPinnedId = "__expand";
    }

    if (enableSelection) {
      leftOffsets.set("__select", currentLeft);
      currentLeft += 44;
      lastLeftPinnedId = "__select";
    }

    if (showSerialNumber) {
      leftOffsets.set("__serial", currentLeft);
      currentLeft += 56;
      lastLeftPinnedId = "__serial";
    }

    for (const col of visibleCols) {
      const id = getColumnId(col);
      const pin = col.meta?.pinned;
      const width = colWidths[id] ?? col.meta?.width ?? 140;
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
      const width = colWidths[id] ?? col.meta?.width ?? 140;
      if (pin === "right") {
        rightOffsets.set(id, currentRight);
        currentRight += width;
        firstRightPinnedId = id;
      }
    }

    return { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId };
  };

  const { leftOffsets, rightOffsets, lastLeftPinnedId, firstRightPinnedId } =
    getPinnedOffsets(visible);

  // ---- Search --------------------------------------------------------------

  const [searchText, setSearchText] = useDebouncedSearch(query.q ?? "", (text) => {
    onQueryChange(withSearch(query, text));
  });

  // ---- Page jump -----------------------------------------------------------

  const [jumpText, setJumpText] = React.useState(() => String(currentPage));
  React.useEffect(() => setJumpText(String(currentPage)), [currentPage]);

  const submitJump = (raw: string): void => {
    const page = Number.parseInt(raw, 10);
    if (Number.isNaN(page) || page < 1 || page > totalPages) {
      setJumpText(String(currentPage));
      return;
    }
    if (page !== currentPage) {
      onQueryChange(withPage(query, page, totalPages));
    }
  };

  // ---- Sorting -------------------------------------------------------------

  const toggleSort = (field: string, multiSort = false): void => {
    const next = multiSort
      ? withToggledMultiSort(query, field)
      : withToggledSort(query, field);
    onQueryChange(next);
  };

  // ---- Selection -----------------------------------------------------------

  const isSingleSelect = selectionMode === "single";
  const allPageSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id));
  const somePageSelected =
    !allPageSelected && pageRowIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = (): void => {
    if (isSingleSelect) return;
    const next = new Set(selectedIds);
    if (allPageSelected) {
      for (const id of pageRowIds) next.delete(id);
    } else {
      for (const id of pageRowIds) next.add(id);
    }
    setSelectedIds(next);
    onSelectionChange?.(Array.from(next), false);
  };

  const toggleSelectRow = (id: string): void => {
    const next = isSingleSelect
      ? selectedIds.has(id)
        ? new Set<string>()
        : new Set([id])
      : new Set(selectedIds);
    if (!isSingleSelect) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setSelectedIds(next);
    onSelectionChange?.(Array.from(next), false);
  };

  const deselectAll = (): void => {
    setSelectedIds(new Set<string>());
    onSelectionChange?.([], false);
  };

  const toggleExpandRow = (id: string): void => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- Columns / density ---------------------------------------------------

  const toggleColumn = (columnId: string): void => {
    setHiddenCols((prev) => ({ ...prev, [columnId]: prev[columnId] !== true }));
  };

  // ---- Export --------------------------------------------------------------

  const handleExport = async (format: "excel" | "csv" | "clipboard"): Promise<void> => {
    exportMenu.close();

    if (onExportAll) {
      try {
        await onExportAll();
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Export failed");
      }
      return;
    }

    setIsExporting(true);
    notify("info", "Exporting...");
    try {
      let exportRows: readonly TData[] = rows;
      if (fetchEndpoint) {
        const full = await fetchAllPages<TData>(async (page, size) => {
          const url = buildQueryUrl(fetchEndpoint, {
            ...query,
            page,
            pageSize: isPageSize(size) ? size : query.pageSize,
          });
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return (await response.json()) as PagedResponse<TData>;
        });
        exportRows = full.items;
      } else if (isClientSide) {
        const full = queryClientData(data, query, { paginate: false });
        exportRows = full.items;
      }

      const exportColumns = toExportColumns(visible, boolLabels);
      const prefix = exportFileName ?? filePrefixFromCaption(caption);

      if (format === "clipboard") {
        const ok = await copyToClipboard(exportRows, exportColumns);
        if (ok) notify("success", "Copied to clipboard");
        else notify("error", "Failed to copy to clipboard");
      } else if (format === "excel") {
        downloadExcel({
          filename: prefix,
          caption,
          rows: exportRows,
          columns: exportColumns,
          badgeRules,
          serialHeader: locale.serialHeader,
        });
        notify("success", "Excel downloaded");
      } else {
        downloadCsv(timestampedFilename(prefix), exportRows, exportColumns);
        notify("success", "CSV downloaded");
      }
    } catch {
      notify("error", "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  // ---- Root ----------------------------------------------------------------

  const rootClasses = [
    "tbx-root",
    theme === "dark" ? "tbx-dark" : theme === "auto" ? "tbx-auto" : undefined,
    className,
  ].filter(Boolean);

  if (error) {
    return (
      <div className={rootClasses.join(" ")} data-density={density}>
        <div className="tbx-state-card">
          <p className="tbx-state-text">{locale.errorText}</p>
          {onRetry ? (
            <button type="button" className="tbx-btn" onClick={onRetry}>
              <RotateCcwIcon className="tbx-icon" />
              <span>{locale.retryButton}</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const rowIsClickable = typeof onRowClick === "function";

  const activateRow = (row: TData) => (): void => {
    onRowClick?.(row);
  };

  const rowKeyDown =
    (row: TData) =>
    (event: React.KeyboardEvent): void => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onRowClick?.(row);
    };

  const hasSummary =
    enableSummaryRow === true ||
    visible.some((col) => col.meta?.aggregation !== undefined);

  const renderLeafTh = (
    col: TableXColumn<TData, React.ReactNode>,
    rowSpan = 1,
    isGroupChild = false,
  ) => {
    const id = getColumnId(col);
    const sortable = isSortable(col) && enableSorting !== false;
    const sortIndex = query.sort.findIndex((s: SortSpec) => s.field === id);
    const sortItem = sortIndex >= 0 ? query.sort[sortIndex] : undefined;
    const sorted = sortable && sortItem !== undefined;
    const title = getColumnTitle(col) || id;
    const meta = col.meta;
    const activeFilter = query.filter?.[id];
    const isFilterActive = activeFilter !== undefined && activeFilter !== "";

    const customWidth = colWidths[id];
    const baseStyle = headerCellStyle(col);
    const thStyle: React.CSSProperties = {
      ...baseStyle,
      ...(customWidth !== undefined ? { width: `${customWidth}px` } : {}),
      ...(leftOffsets.has(id) ? { left: leftOffsets.get(id) } : {}),
      ...(rightOffsets.has(id) ? { right: rightOffsets.get(id) } : {}),
    };

    const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const targetTh = (e.currentTarget.parentElement as HTMLElement) || null;
      const startWidth = targetTh ? targetTh.getBoundingClientRect().width : (customWidth ?? meta?.width ?? 120);

      const onMove = (moveEvent: PointerEvent) => {
        const nextW = Math.max(meta?.minWidth ?? 60, Math.round(startWidth + (moveEvent.clientX - startX)));
        setColWidths((prev) => ({ ...prev, [id]: nextW }));
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body?.classList.remove("tbx-resizing");
      };
      document.body?.classList.add("tbx-resizing");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };

    return (
      <th
        key={id}
        scope="col"
        rowSpan={rowSpan > 1 ? rowSpan : undefined}
        aria-sort={
          !sortable
            ? undefined
            : sorted
              ? sortItem?.dir === "asc"
                ? "ascending"
                : "descending"
              : "none"
        }
        tabIndex={sortable ? 0 : undefined}
        data-column-id={id}
        data-tbx-focus={sortable ? `sort:${id}` : undefined}
        draggable={enableColumnReorder && !isGroupChild}
        onDragStart={
          enableColumnReorder && !isGroupChild
            ? (e) => {
                setDraggedColId(id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }
            : undefined
        }
        onDragOver={
          enableColumnReorder && !isGroupChild
            ? (e) => {
                e.preventDefault();
              }
            : undefined
        }
        onDrop={
          enableColumnReorder && !isGroupChild
            ? (e) => {
                e.preventDefault();
                if (!draggedColId || draggedColId === id) return;
                const fromIdx = colList.findIndex((c) => getColumnId(c) === draggedColId);
                const toIdx = colList.findIndex((c) => getColumnId(c) === id);
                if (fromIdx >= 0 && toIdx >= 0) {
                  const nextCols = [...colList];
                  const moved = nextCols[fromIdx];
                  if (!moved) return;
                  nextCols.splice(fromIdx, 1);
                  nextCols.splice(toIdx, 0, moved);
                  setColList(nextCols);
                  onColumnOrderChange?.(nextCols.map(getColumnId));
                }
              }
            : undefined
        }
        onDragEnd={
          enableColumnReorder && !isGroupChild
            ? () => {
                setDraggedColId(null);
              }
            : undefined
        }
        className={[
          "tbx-th",
          sortable ? "tbx-th--sortable" : undefined,
          isGroupChild ? "tbx-th--grouped-child" : undefined,
          enableColumnReorder && !isGroupChild ? "tbx-th--draggable" : undefined,
          draggedColId === id ? "tbx-th--dragging" : undefined,
          isPinned(col) === "left" ? "tbx-th--pinned-left" : undefined,
          isPinned(col) === "right" ? "tbx-th--pinned-right" : undefined,
          lastLeftPinnedId === id ? "tbx-pinned-border-left" : undefined,
          firstRightPinnedId === id ? "tbx-pinned-border-right" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
        style={thStyle}
        onClick={
          sortable
            ? (event) => {
                const t = event.target as HTMLElement | null;
                if (t?.closest(".tbx-col-filter-wrap") || t?.closest(".tbx-resize-handle")) return;
                toggleSort(id, event.shiftKey);
              }
            : undefined
        }
        onKeyDown={
          sortable
            ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                const t = event.target as HTMLElement | null;
                if (t?.closest(".tbx-col-filter-wrap")) return;
                event.preventDefault();
                toggleSort(id, event.shiftKey);
              }
            : undefined
        }
      >
        <div className={headerInnerClass(col)}>
          <span>{renderColumnHeader(col)}</span>
          {sortable ? (
            <span className="tbx-sort-icon-wrap">
              {sorted ? (
                sortItem?.dir === "asc" ? (
                  <ArrowUpIcon className="tbx-sort-icon" />
                ) : (
                  <ArrowDownIcon className="tbx-sort-icon" />
                )
              ) : (
                <ArrowUpDownIcon className="tbx-sort-icon tbx-sort-icon--idle" />
              )}
              {query.sort.length > 1 && sortIndex >= 0 ? (
                <span className="tbx-sort-order">{sortIndex + 1}</span>
              ) : null}
            </span>
          ) : null}

          {isFilterable(col, enableColumnFilters) ? (
            <div className="tbx-col-filter-wrap">
              <button
                type="button"
                className={
                  isFilterActive
                    ? "tbx-col-filter-btn tbx-col-filter-btn--active"
                    : "tbx-col-filter-btn"
                }
                aria-label={`Filter ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenFilterCol(openFilterCol === id ? null : id);
                }}
              >
                <DotsVerticalIcon className="tbx-icon" />
              </button>

              {openFilterCol === id ? (
                <div
                  className="tbx-filter-popover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    type="text"
                    className="tbx-filter-popover-input"
                    defaultValue={activeFilter ?? ""}
                    placeholder={`Filter by ${title}...`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.currentTarget as HTMLInputElement).value.trim();
                        setOpenFilterCol(null);
                        onQueryChange(withFilter(query, id, val || undefined));
                      } else if (e.key === "Escape") {
                        setOpenFilterCol(null);
                      }
                    }}
                  />
                  <div className="tbx-filter-popover-actions">
                    <button
                      type="button"
                      className="tbx-filter-popover-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenFilterCol(null);
                        onQueryChange(withFilter(query, id, undefined));
                      }}
                    >
                      <RotateCcwIcon className="tbx-icon" />
                      <span>{locale.clearFilter}</span>
                    </button>
                    <button
                      type="button"
                      className="tbx-filter-popover-btn tbx-filter-popover-btn--primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        const parent = (e.currentTarget as HTMLElement).closest(".tbx-filter-popover");
                        const inputEl = parent?.querySelector("input") as HTMLInputElement | null;
                        const val = inputEl?.value.trim();
                        setOpenFilterCol(null);
                        onQueryChange(withFilter(query, id, val || undefined));
                      }}
                    >
                      <CheckIcon className="tbx-icon" />
                      <span>{locale.applyFilter}</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {enableColumnResize ? (
          <div
            className="tbx-resize-handle"
            onPointerDown={startResize}
            onDoubleClick={() => autoFitColumn(id)}
          />
        ) : null}
      </th>
    );
  };

  return (
    <div className={rootClasses.join(" ")} data-density={density} ref={rootRef}>
      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      {showToolbar ? (
        <div className="tbx-toolbar">
        <div className="tbx-toolbar-group">
          {enableSearch ? (
            <div className="tbx-search">
              <SearchIcon className="tbx-search-icon" />
              <input
                type="search"
                className="tbx-search-input"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={searchPlaceholder ?? locale.searchPlaceholder}
                aria-label={`Search ${caption}`}
              />
              {searchText ? (
                <button
                  type="button"
                  className="tbx-search-clear"
                  onClick={() => setSearchText("")}
                  aria-label={locale.clearSearch}
                >
                  <XIcon className="tbx-icon" />
                  <span className="tbx-sr-only">{locale.clearSearch}</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="tbx-toolbar-group tbx-toolbar-group--end">
          {isColumnsVisible ? (
            <div className="tbx-menu-wrap" ref={columnsMenu.containerRef}>
              <button
                type="button"
                id={columnsButtonId}
                className="tbx-btn"
                ref={columnsMenu.triggerRef}
                aria-haspopup="menu"
                aria-expanded={columnsMenu.isOpen}
                onClick={columnsMenu.toggle}
              >
                <ColumnsIcon className="tbx-icon" />
                <span>{locale.columnsButton}</span>
              </button>
            {columnsMenu.isOpen ? (
              <div className="tbx-menu" role="menu" aria-labelledby={columnsButtonId}>
                <div className="tbx-menu-label">{locale.toggleColumnsLabel}</div>
                <div className="tbx-menu-separator" />
                {hideable.map((col) => {
                  const id = getColumnId(col);
                  const checked = hiddenCols[id] !== true;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="tbx-menu-item"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      onClick={() => toggleColumn(id)}
                    >
                      <CheckIcon className="tbx-check" />
                      <span>{getColumnTitle(col) || id}</span>
                    </button>
                  );
                })}
                {storageKey ? (
                  <>
                    <div className="tbx-menu-separator" />
                    <button
                      type="button"
                      className="tbx-menu-item tbx-menu-item--reset"
                      role="menuitem"
                      onClick={handleResetView}
                    >
                      <span>Reset to default view</span>
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          ) : null}

          {isDensityVisible ? (
            <div className="tbx-menu-wrap" ref={densityMenu.containerRef}>
              <button
                type="button"
                id={densityButtonId}
                className="tbx-btn tbx-capitalize"
                ref={densityMenu.triggerRef}
                aria-haspopup="menu"
                aria-expanded={densityMenu.isOpen}
                onClick={densityMenu.toggle}
              >
                <DensityIcon className="tbx-icon" />
                <span>{formatMessage(locale.densityButton, { density })}</span>
              </button>
            {densityMenu.isOpen ? (
              <div className="tbx-menu" role="menu" aria-labelledby={densityButtonId}>
                {DENSITIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="tbx-menu-item"
                    role="menuitemcheckbox"
                    aria-checked={density === option}
                    onClick={() => {
                      setDensity(option);
                      densityMenu.close();
                    }}
                  >
                    <CheckIcon className="tbx-check" />
                    <span>{locale[DENSITY_LABEL_KEY[option]]}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          ) : null}

          {isExportVisible ? (
            <div className="tbx-menu-wrap" ref={exportMenu.containerRef}>
              <button
                type="button"
                id={exportButtonId}
                className="tbx-btn tbx-btn--export"
                ref={exportMenu.triggerRef}
                disabled={isExporting}
                aria-haspopup="menu"
                aria-expanded={exportMenu.isOpen}
                onClick={exportMenu.toggle}
              >
                <DownloadTrayIcon className="tbx-icon" />
                <span>{isExporting ? locale.exportingButton : locale.exportButton}</span>
                <ChevronDownIcon className="tbx-icon tbx-chevron" />
              </button>
              {exportMenu.isOpen ? (
                <div
                  className="tbx-menu tbx-menu--end"
                  role="menu"
                  aria-labelledby={exportButtonId}
                >
                  <button
                    type="button"
                    className="tbx-menu-item"
                    role="menuitem"
                    onClick={() => void handleExport("excel")}
                  >
                    <FileSpreadsheetIcon className="tbx-icon--excel" />
                    <div className="tbx-menu-item-title">
                      <strong>{locale.exportExcelTitle}</strong>
                      <small>{locale.exportExcelSubtitle}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="tbx-menu-item"
                    role="menuitem"
                    onClick={() => void handleExport("csv")}
                  >
                    <FileTextIcon className="tbx-icon--csv" />
                    <div className="tbx-menu-item-title">
                      <strong>{locale.exportCsvTitle}</strong>
                      <small>{locale.exportCsvSubtitle}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="tbx-menu-item"
                    role="menuitem"
                    onClick={() => void handleExport("clipboard")}
                  >
                    <FileTextIcon className="tbx-icon--csv" />
                    <div className="tbx-menu-item-title">
                      <strong>{locale.exportClipboardTitle}</strong>
                      <small>{locale.exportClipboardSubtitle}</small>
                    </div>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {toolbarActions}
        </div>
      </div>
      ) : null}

      {/* ── ACTIVE FILTER PILLS BAR ────────────────────────────────────────── */}
      {showFilterPills !== false && (Boolean(query.q?.trim()) || Object.keys(query.filter ?? {}).some((k) => query.filter?.[k])) ? (
        <div className="tbx-filter-pills-bar">
          <span className="tbx-filter-pills-title">Active filters:</span>
          {query.q?.trim() ? (
            <div className="tbx-filter-pill">
              <span className="tbx-filter-pill-label">
                {searchPlaceholder || locale.searchPlaceholder || "Search"}:
              </span>
              <span className="tbx-filter-pill-val">"{query.q}"</span>
              <button
                type="button"
                className="tbx-filter-pill-remove"
                title="Clear search"
                aria-label="Clear search"
                onClick={() => onQueryChange(withSearch(query, ""))}
              >
                ✕
              </button>
            </div>
          ) : null}
          {Object.entries(query.filter ?? {}).map(([key, val]) => {
            if (val === undefined || val === "") return null;
            const col = leafCols.find((c) => getColumnId(c) === key);
            const title = col ? getColumnTitle(col) || key : key;
            return (
              <div key={key} className="tbx-filter-pill">
                <span className="tbx-filter-pill-label">{title}:</span>
                <span className="tbx-filter-pill-val">{String(val)}</span>
                <button
                  type="button"
                  className="tbx-filter-pill-remove"
                  title={`Remove ${title} filter`}
                  aria-label={`Remove filter for ${title}`}
                  onClick={() => onQueryChange(withFilter(query, key, undefined))}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="tbx-filter-pill-clear-all"
            onClick={() => onQueryChange({ ...query, page: 1, q: undefined, filter: {} })}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* ── TABLE (>= 768px) ─────────────────────────────────────────────── */}
      <div className="tbx-table-wrap">
        <table className="tbx-table" aria-label={caption}>
          <thead>
            <tr>
              {renderExpandedRow ? (
                <th
                  rowSpan={headerRows.hasGroups ? 2 : undefined}
                  className={[
                    "tbx-th tbx-th--expand",
                    leftOffsets.has("__expand") ? "tbx-th--pinned-left" : undefined,
                    lastLeftPinnedId === "__expand" ? "tbx-pinned-border-left" : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    width: "40px",
                    left: leftOffsets.get("__expand"),
                  }}
                  scope="col"
                />
              ) : null}

              {enableSelection ? (
                <th
                  rowSpan={headerRows.hasGroups ? 2 : undefined}
                  className={[
                    "tbx-th tbx-th--select",
                    leftOffsets.has("__select") ? "tbx-th--pinned-left" : undefined,
                    lastLeftPinnedId === "__select" ? "tbx-pinned-border-left" : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: leftOffsets.get("__select"),
                  }}
                  scope="col"
                >
                  {!isSingleSelect ? (
                    <input
                      type="checkbox"
                      className="tbx-checkbox"
                      checked={allPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = somePageSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label={locale.selectAllLabel}
                    />
                  ) : null}
                </th>
              ) : null}

              {showSerialNumber ? (
                <th
                  rowSpan={headerRows.hasGroups ? 2 : undefined}
                  className={[
                    "tbx-th tbx-th--serial",
                    leftOffsets.has("__serial") ? "tbx-th--pinned-left" : undefined,
                    lastLeftPinnedId === "__serial" ? "tbx-pinned-border-left" : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: leftOffsets.get("__serial"),
                  }}
                  scope="col"
                >
                  {locale.serialHeader}
                </th>
              ) : null}

              {!headerRows.hasGroups
                ? visible.map((col) => renderLeafTh(col, 1, false))
                : headerRows.topRow.map((cell, idx) => {
                    if (cell.isGroup) {
                      return (
                        <th
                          key={`grp-${cell.id}-${idx}`}
                          colSpan={cell.colSpan}
                          className="tbx-th tbx-th--group"
                          scope="colgroup"
                        >
                          <span className="tbx-th-group-title">{cell.title}</span>
                        </th>
                      );
                    }
                    if (cell.leafColumn) {
                      return renderLeafTh(cell.leafColumn, cell.rowSpan, false);
                    }
                    return null;
                  })}
            </tr>
            {headerRows.hasGroups ? (
              <tr>
                {headerRows.bottomRow.map((cell) => {
                  if (cell.leafColumn) {
                    return renderLeafTh(cell.leafColumn, 1, true);
                  }
                  return null;
                })}
              </tr>
            ) : null}
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td className="tbx-state" colSpan={Math.max(1, columnCount)}>
                  <div className="tbx-dotted-loader" aria-hidden="true">
                    <span className="tbx-dot" />
                    <span className="tbx-dot" />
                    <span className="tbx-dot" />
                    <span className="tbx-dot" />
                  </div>
                  <div className="tbx-loading-text" aria-live="polite">{locale.loadingText}</div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="tbx-state" colSpan={Math.max(1, columnCount)}>
                  {locale.emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const id = pageRowIds[index] ?? String(index);
                const isSelected = selectedIds.has(id);
                const isExpanded = expandedRows.has(id);

                return (
                  <React.Fragment key={id || index}>
                    <tr
                      className={[
                        "tbx-row",
                        isSelected ? "tbx-row--selected" : undefined,
                        isExpanded ? "tbx-row--expanded" : undefined,
                        rowIsClickable ? "tbx-row--clickable" : undefined,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={rowIsClickable ? activateRow(row) : undefined}
                      onKeyDown={rowIsClickable ? rowKeyDown(row) : undefined}
                      tabIndex={rowIsClickable ? 0 : undefined}
                    >
                      {renderExpandedRow ? (
                        <td
                          className={[
                            "tbx-td tbx-td--expand",
                            leftOffsets.has("__expand") ? "tbx-td--pinned-left" : undefined,
                            lastLeftPinnedId === "__expand" ? "tbx-pinned-border-left" : undefined,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            width: "40px",
                            left: leftOffsets.get("__expand"),
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={isExpanded ? "tbx-expand-btn tbx-expand-btn--open" : "tbx-expand-btn"}
                            aria-label={isExpanded ? "Collapse row" : "Expand row"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpandRow(id);
                            }}
                          >
                            <ChevronRightIcon className="tbx-icon" />
                          </button>
                        </td>
                      ) : null}

                      {enableSelection ? (
                        <td
                          className={[
                            "tbx-td tbx-td--select",
                            leftOffsets.has("__select") ? "tbx-td--pinned-left" : undefined,
                            lastLeftPinnedId === "__select" ? "tbx-pinned-border-left" : undefined,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            left: leftOffsets.get("__select"),
                          }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type={isSingleSelect ? "radio" : "checkbox"}
                            name={isSingleSelect ? `${instanceId}-select` : undefined}
                            className="tbx-checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(id)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={formatMessage(locale.selectRowLabel, { id })}
                          />
                        </td>
                      ) : null}

                      {showSerialNumber ? (
                        <td
                          className={[
                            "tbx-td tbx-td--serial",
                            leftOffsets.has("__serial") ? "tbx-td--pinned-left" : undefined,
                            lastLeftPinnedId === "__serial" ? "tbx-pinned-border-left" : undefined,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            left: leftOffsets.get("__serial"),
                          }}
                        >
                          {serialNumber(currentPage, pageSize, index)}
                        </td>
                      ) : null}

                      {visible.map((col, colIndex) => {
                        const colId = getColumnId(col);
                        const isPinnedLeft = leftOffsets.has(colId);
                        const isPinnedRight = rightOffsets.has(colId);
                        const isLastLeft = lastLeftPinnedId === colId;
                        const isFirstRight = firstRightPinnedId === colId;
                        const isCellEditable = isEditable(col);
                        const isCurrentlyEditing =
                          editingCell?.rowId === id && editingCell?.columnId === colId;

                        const tdStyle: React.CSSProperties = {
                          ...bodyCellStyle(col),
                          ...(isPinnedLeft ? { left: leftOffsets.get(colId) } : {}),
                          ...(isPinnedRight ? { right: rightOffsets.get(colId) } : {}),
                        };

                        return (
                          <td
                            key={colId || `col-${colIndex}`}
                            className={[
                              "tbx-td",
                              isCellEditable ? "tbx-cell--editable" : undefined,
                              isPinnedLeft ? "tbx-td--pinned-left" : undefined,
                              isPinnedRight ? "tbx-td--pinned-right" : undefined,
                              isLastLeft ? "tbx-pinned-border-left" : undefined,
                              isFirstRight ? "tbx-pinned-border-right" : undefined,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={tdStyle}
                            onDoubleClick={
                              isCellEditable
                                ? (e) => {
                                    e.stopPropagation();
                                    setEditingCell({ rowId: id, columnId: colId });
                                  }
                                : undefined
                            }
                          >
                            {isCurrentlyEditing ? (
                              <div
                                className="tbx-cell-edit-wrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {col.meta?.editType === "select" && col.meta.editOptions ? (
                                  <select
                                    autoFocus
                                    className="tbx-cell-edit-select tbx-cell-edit-input"
                                    defaultValue={String((row as Record<string, unknown>)[colId] ?? "")}
                                    id={`${instanceId}-edit-${id}-${colId}`}
                                  >
                                    {col.meta.editOptions.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    autoFocus
                                    type={col.meta?.editType === "number" ? "number" : "text"}
                                    className="tbx-cell-edit-input"
                                    defaultValue={String((row as Record<string, unknown>)[colId] ?? "")}
                                    id={`${instanceId}-edit-${id}-${colId}`}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const el = e.currentTarget;
                                        const val = col.meta?.editType === "number" ? Number(el.value) : el.value;
                                        const oldVal = (row as Record<string, unknown>)[colId];
                                        (row as Record<string, unknown>)[colId] = val;
                                        onCellEdit?.({ row, columnId: colId, oldValue: oldVal, newValue: val });
                                        setEditingCell(null);
                                      } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        setEditingCell(null);
                                      }
                                    }}
                                  />
                                )}
                                <div className="tbx-cell-edit-actions">
                                  <button
                                    type="button"
                                    className="tbx-cell-edit-btn tbx-cell-edit-btn--save"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const el = document.getElementById(`${instanceId}-edit-${id}-${colId}`) as HTMLInputElement | HTMLSelectElement | null;
                                      if (el) {
                                        const val = col.meta?.editType === "number" ? Number(el.value) : el.value;
                                        const oldVal = (row as Record<string, unknown>)[colId];
                                        (row as Record<string, unknown>)[colId] = val;
                                        onCellEdit?.({ row, columnId: colId, oldValue: oldVal, newValue: val });
                                      }
                                      setEditingCell(null);
                                    }}
                                  >
                                    <CheckIcon className="tbx-icon" />
                                  </button>
                                  <button
                                    type="button"
                                    className="tbx-cell-edit-btn tbx-cell-edit-btn--cancel"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCell(null);
                                    }}
                                  >
                                    <XIcon className="tbx-icon" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              renderCellContent(col, row, boolLabels)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && renderExpandedRow ? (
                      <tr className="tbx-expanded-row">
                        <td className="tbx-expanded-cell" colSpan={columnCount}>
                          <div className="tbx-detail-panel">
                            {renderExpandedRow(row)}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── CARD LIST (< 768px) ──────────────────────────────────────────────
          Not a cosmetic alternative: table cells are `white-space: nowrap`, so
          on a phone a reader would scroll sideways through columns to assemble
          a single record. Cards put the record back together vertically, and
          render through the SAME helpers as the table so a column with a custom
          cell cannot look different in the two layouts. */}
      <div className="tbx-cards">
        {isLoading ? (
          <div className="tbx-card">
            <div className="tbx-state">
              <div className="tbx-dotted-loader" aria-hidden="true">
                <span className="tbx-dot" />
                <span className="tbx-dot" />
                <span className="tbx-dot" />
                <span className="tbx-dot" />
              </div>
              <div className="tbx-loading-text" aria-live="polite">{locale.loadingText}</div>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="tbx-card">
            <div className="tbx-state">{locale.emptyText}</div>
          </div>
        ) : (
          rows.map((row, index) => {
            const id = pageRowIds[index] ?? String(index);
            const isSelected = selectedIds.has(id);

            return (
              <div
                key={id || index}
                className={[
                  "tbx-card",
                  isSelected ? "tbx-card--selected" : undefined,
                  rowIsClickable ? "tbx-card--clickable" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={rowIsClickable ? activateRow(row) : undefined}
                onKeyDown={rowIsClickable ? rowKeyDown(row) : undefined}
                tabIndex={rowIsClickable ? 0 : undefined}
              >
                {showSerialNumber || enableSelection ? (
                  <div className="tbx-card-head">
                    {showSerialNumber ? (
                      <span className="tbx-card-serial">
                        #{serialNumber(currentPage, pageSize, index)}
                      </span>
                    ) : null}
                    {enableSelection ? (
                      <span
                        className="tbx-card-select"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="tbx-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={formatMessage(locale.selectRowLabel, { id })}
                        />
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <dl className="tbx-card-rows">
                  {visible.map((col, colIndex) => {
                    const colId = getColumnId(col);
                    return (
                      <div key={colId || `col-${colIndex}`} className="tbx-card-row">
                        <dt>{getColumnTitle(col) || colId}</dt>
                        <dd>{renderCellContent(col, row, boolLabels)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            );
          })
        )}
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      {showFooter ? (
        <div className="tbx-footer">
          <div className="tbx-range">
            <span>
              {renderTemplate(locale.showingRange, {
                start: <strong>{range.start}</strong>,
                end: <strong>{range.end}</strong>,
                total: <strong className="tbx-range-total">{total.toLocaleString()}</strong>,
              })}
            </span>
            {selectedIds.size > 0 ? (
              <span className="tbx-selected-badge">
                {formatMessage(locale.selectedBadge, { count: selectedIds.size })}
              </span>
            ) : null}
          </div>

          <div className="tbx-pagination">
            {isRowsPerPageVisible ? (
              <div className="tbx-rows-per-page">
                <span>{locale.rowsPerPage}</span>
                <select
                  className="tbx-rows-select"
                  value={String(pageSize)}
                  onChange={(event) => {
                    onQueryChange(withPageSize(query, Number.parseInt(event.target.value, 10)));
                  }}
                  aria-label={locale.rowsPerPage}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} rows
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {isPaginationVisible ? (
              <div className="tbx-pager">
                <button
                  type="button"
                  className="tbx-page-nav"
                  disabled={currentPage <= 1}
                  onClick={() => onQueryChange(withPage(query, currentPage - 1, totalPages))}
                  aria-label={locale.previousPage}
                >
                  <ChevronLeftIcon size={16} />
                  <span className="tbx-sr-only">{locale.previousPage}</span>
                </button>

                {pageItems.map((item, index) =>
                  item === "..." ? (
                    <span key={`gap-${index}`} className="tbx-page-ellipsis">
                      …
                    </span>
                  ) : (
                    <button
                      key={`page-${item}`}
                      type="button"
                      className={
                        item === currentPage ? "tbx-page-btn tbx-page-btn--current" : "tbx-page-btn"
                      }
                      onClick={() => onQueryChange(withPage(query, item, totalPages))}
                      aria-label={formatMessage(locale.pageLabel, { page: item })}
                      aria-current={item === currentPage ? "page" : undefined}
                    >
                      {item}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  className="tbx-page-nav"
                  disabled={currentPage >= totalPages}
                  onClick={() => onQueryChange(withPage(query, currentPage + 1, totalPages))}
                  aria-label={locale.nextPage}
                >
                  <ChevronRightIcon size={16} />
                  <span className="tbx-sr-only">{locale.nextPage}</span>
                </button>
              </div>
            ) : null}

            {isJumpToPageVisible ? (
              <form
                className="tbx-jump"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitJump(jumpText);
                }}
              >
                <label className="tbx-jump-label" htmlFor={jumpInputId}>
                  {locale.goToPage}
                </label>
                <input
                  id={jumpInputId}
                  type="number"
                  className="tbx-jump-input"
                  min={1}
                  max={totalPages}
                  value={jumpText}
                  onChange={(event) => setJumpText(event.target.value)}
                  onBlur={() => submitJump(jumpText)}
                  aria-label={locale.goToPageOf}
                />
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const NexGrid = TableX;
