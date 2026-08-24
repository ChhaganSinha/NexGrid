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
  isHideable,
  isPageSize,
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
  type Density,
  type PagedResponse,
} from "@nexgrid/core";

import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FilterIcon,
  SearchIcon,
  SlidersIcon,
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
import type { NexGridNoticeType, NexGridProps } from "./types.js";

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
 * exception being {@link NexGridProps.fetchEndpoint}, used to page in the rest
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
export function NexGrid<TData>(props: NexGridProps<TData>): React.JSX.Element {
  const {
    columns,
    data,
    total,
    query,
    onQueryChange,
    caption,
    density: initialDensity = "default",
    isLoading = false,
    error = false,
    onRetry,
    enableSelection = false,
    selectionMode = "multi",
    enableColumnResize = true,
    onSelectionChange,
    enableSearch = true,
    searchPlaceholder,
    toolbarActions,
    onRowClick,
    getRowId = defaultRowId,
    className,
    showSerialNumber = true,
    enableExport = true,
    exportFileName,
    onExportAll,
    fetchEndpoint,
    badgeRules,
    locale: localeOverrides,
    onNotify,
    theme = "light",
  } = props;
  const locale = resolveLocale(localeOverrides);
  const boolLabels = { yes: locale.booleanYes, no: locale.booleanNo };

  const [density, setDensity] = React.useState<Density>(initialDensity);
  const [hiddenCols, setHiddenCols] = React.useState<Record<string, boolean>>(() =>
    initialHiddenColumns(columns),
  );
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [isExporting, setIsExporting] = React.useState(false);
  const [openFilterCol, setOpenFilterCol] = React.useState<string | null>(null);
  const [colWidths, setColWidths] = React.useState<Record<string, number>>({});

  const columnsMenu = useDropdown();
  const densityMenu = useDropdown();
  const exportMenu = useDropdown();

  const instanceId = React.useId();
  const columnsButtonId = `${instanceId}-columns`;
  const densityButtonId = `${instanceId}-density`;
  const exportButtonId = `${instanceId}-export`;
  const jumpInputId = `${instanceId}-jump`;

  const notify = (type: NexGridNoticeType, message: string): void => {
    onNotify?.({ type, message });
  };

  // ---- Derived query state -------------------------------------------------

  const currentPage = Math.max(1, query.page);
  const pageSize = query.pageSize;
  const totalPages = totalPagesFor(total, pageSize);
  const range = getRecordRange(currentPage, pageSize, total);
  const sort = primarySort(query);

  const visible = React.useMemo(
    () => visibleColumns(columns, hiddenCols),
    [columns, hiddenCols],
  );
  const hideable = React.useMemo(() => columns.filter(isHideable), [columns]);
  const pageItems = React.useMemo(
    () => getPageNumbers(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const pageRowIds = React.useMemo(() => data.map((row) => getRowId(row)), [data, getRowId]);

  const columnCount =
    visible.length + (showSerialNumber ? 1 : 0) + (enableSelection ? 1 : 0);

  // ---- Search --------------------------------------------------------------

  const [searchText, setSearchText] = useDebouncedSearch(query.q ?? "", (text) => {
    onQueryChange(withSearch(query, text));
  });

  // ---- Page jump -----------------------------------------------------------
  // Kept as a string so the field can hold a half-typed number; an unusable
  // value snaps back to the page actually being shown rather than navigating
  // somewhere the user did not ask for.

  const [jumpText, setJumpText] = React.useState(() => String(currentPage));
  React.useEffect(() => setJumpText(String(currentPage)), [currentPage]);

  const submitJump = (event?: React.FormEvent): void => {
    event?.preventDefault();
    const parsed = Number.parseInt(jumpText, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= totalPages) {
      setJumpText(String(parsed));
      if (parsed !== currentPage) onQueryChange(withPage(query, parsed, totalPages));
      return;
    }
    setJumpText(String(currentPage));
  };

  // ---- Sorting -------------------------------------------------------------

  const toggleSort = (columnId: string, isMulti = false): void => {
    onQueryChange(
      isMulti ? withToggledMultiSort(query, columnId) : withToggledSort(query, columnId),
    );
  };

  // ---- Selection -----------------------------------------------------------

  const selectedOnPage = pageRowIds.filter((id) => selectedIds.has(id)).length;
  const allPageSelected = pageRowIds.length > 0 && selectedOnPage === pageRowIds.length;
  const somePageSelected = selectedOnPage > 0 && !allPageSelected;

  const isSingleSelect = selectionMode === "single";

  const commitSelection = (next: Set<string>): void => {
    setSelectedIds(next);
    onSelectionChange?.(Array.from(next), false);
  };

  const toggleSelectAll = (): void => {
    if (isSingleSelect) return;
    const next = new Set(selectedIds);
    for (const id of pageRowIds) {
      if (allPageSelected) next.delete(id);
      else next.add(id);
    }
    commitSelection(next);
  };

  const toggleSelectRow = (id: string): void => {
    if (isSingleSelect) {
      if (selectedIds.has(id)) commitSelection(new Set());
      else commitSelection(new Set([id]));
    } else {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commitSelection(next);
    }
  };

  // ---- Columns / density ---------------------------------------------------

  const toggleColumn = (columnId: string): void => {
    setHiddenCols((prev) => ({ ...prev, [columnId]: prev[columnId] !== true }));
  };

  // ---- Export --------------------------------------------------------------

  /**
   * The rows an export should contain: the current page, unless the grid was
   * given an endpoint it can page through — an export of "the filtered data"
   * that silently contains 10 of 4,000 rows is worse than no export at all.
   * The current `q` / `sort` / `filter` ride along so the file matches what the
   * screen is showing.
   */
  const collectExportRows = async (): Promise<TData[]> => {
    if (data.length >= total || !fetchEndpoint) return data;

    notify("info", formatMessage(locale.exportFetchingAll, { total: total.toLocaleString() }));
    try {
      const result = await fetchAllPages<TData>(async (page, size) => {
        const url = buildQueryUrl(fetchEndpoint, {
          ...query,
          page,
          pageSize: isPageSize(size) ? size : query.pageSize,
        });
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PagedResponse<TData>;
      });
      return result.items;
    } catch {
      notify("error", locale.exportFetchFailed);
      return data;
    }
  };

  const handleExport = async (format: "excel" | "csv" | "clipboard"): Promise<void> => {
    exportMenu.close();

    if (onExportAll && format !== "clipboard") {
      void onExportAll();
      return;
    }

    setIsExporting(true);
    try {
      const rows = await collectExportRows();
      if (rows.length === 0) {
        notify("error", locale.exportNoData);
        return;
      }

      const exportColumns = toExportColumns(visible, boolLabels);
      const prefix = exportFileName ?? filePrefixFromCaption(caption);

      if (format === "clipboard") {
        const ok = await copyToClipboard(rows, exportColumns);
        if (ok) {
          notify(
            "success",
            formatMessage(locale.exportClipboardSuccess, { count: rows.length.toLocaleString() }),
          );
        } else {
          notify("error", "Failed to copy to clipboard");
        }
        return;
      }

      if (format === "excel") {
        const count = downloadExcel({
          filename: prefix,
          caption,
          rows,
          columns: exportColumns,
          badgeRules,
          serialHeader: locale.serialHeader,
        });
        notify(
          "success",
          formatMessage(locale.exportExcelSuccess, { count: count.toLocaleString() }),
        );
      } else {
        const count = downloadCsv(timestampedFilename(prefix), rows, exportColumns);
        notify(
          "success",
          formatMessage(locale.exportCsvSuccess, { count: count.toLocaleString() }),
        );
      }
    } finally {
      setIsExporting(false);
    }
  };

  // ---- Root ----------------------------------------------------------------

  const rootClassName = [
    "nxg-root",
    theme === "dark" ? "nxg-dark" : theme === "auto" ? "nxg-auto" : undefined,
    className,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  // The error state replaces the entire grid: a toolbar over an empty table
  // invites the user to sort and paginate data that was never loaded.
  if (error) {
    return (
      <div className={rootClassName} data-density={density}>
        <div className="nxg-state-card">
          <p className="nxg-state-text">{locale.errorText}</p>
          {onRetry ? (
            <button type="button" className="nxg-btn" onClick={onRetry}>
              {locale.retryButton}
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

  return (
    <div className={rootClassName} data-density={density}>
      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="nxg-toolbar">
        <div className="nxg-toolbar-group">
          {enableSearch ? (
            <div className="nxg-search">
              <SearchIcon className="nxg-search-icon" />
              <input
                type="search"
                className="nxg-search-input"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={searchPlaceholder ?? locale.searchPlaceholder}
                aria-label={`Search ${caption}`}
              />
              {searchText ? (
                <button
                  type="button"
                  className="nxg-search-clear"
                  onClick={() => setSearchText("")}
                  aria-label={locale.clearSearch}
                >
                  <XIcon className="nxg-icon" />
                  <span className="nxg-sr-only">{locale.clearSearch}</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Column visibility */}
          <div className="nxg-menu-wrap" ref={columnsMenu.containerRef}>
            <button
              type="button"
              id={columnsButtonId}
              className="nxg-btn"
              ref={columnsMenu.triggerRef}
              aria-haspopup="menu"
              aria-expanded={columnsMenu.isOpen}
              onClick={columnsMenu.toggle}
            >
              <SlidersIcon className="nxg-icon" />
              <span>{locale.columnsButton}</span>
            </button>
            {columnsMenu.isOpen ? (
              <div className="nxg-menu" role="menu" aria-labelledby={columnsButtonId}>
                <div className="nxg-menu-label">{locale.toggleColumnsLabel}</div>
                <div className="nxg-menu-separator" />
                {hideable.map((col) => {
                  const id = getColumnId(col);
                  const checked = hiddenCols[id] !== true;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="nxg-menu-item"
                      role="menuitemcheckbox"
                      aria-checked={checked}
                      onClick={() => toggleColumn(id)}
                    >
                      <CheckIcon className="nxg-check" />
                      <span>{getColumnTitle(col) || id}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Density */}
          <div className="nxg-menu-wrap" ref={densityMenu.containerRef}>
            <button
              type="button"
              id={densityButtonId}
              className="nxg-btn nxg-capitalize"
              ref={densityMenu.triggerRef}
              aria-haspopup="menu"
              aria-expanded={densityMenu.isOpen}
              onClick={densityMenu.toggle}
            >
              <FilterIcon className="nxg-icon" />
              <span>{formatMessage(locale.densityButton, { density })}</span>
            </button>
            {densityMenu.isOpen ? (
              <div className="nxg-menu" role="menu" aria-labelledby={densityButtonId}>
                {DENSITIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="nxg-menu-item"
                    role="menuitemcheckbox"
                    aria-checked={density === option}
                    onClick={() => {
                      setDensity(option);
                      densityMenu.close();
                    }}
                  >
                    <CheckIcon className="nxg-check" />
                    <span>{locale[DENSITY_LABEL_KEY[option]]}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="nxg-toolbar-group nxg-toolbar-group--end">
          {enableExport ? (
            <div className="nxg-menu-wrap" ref={exportMenu.containerRef}>
              <button
                type="button"
                id={exportButtonId}
                className="nxg-btn nxg-btn--export"
                ref={exportMenu.triggerRef}
                disabled={isExporting}
                aria-haspopup="menu"
                aria-expanded={exportMenu.isOpen}
                onClick={exportMenu.toggle}
              >
                <DownloadIcon className="nxg-icon" />
                <span>{isExporting ? locale.exportingButton : locale.exportButton}</span>
              </button>
              {exportMenu.isOpen ? (
                <div
                  className="nxg-menu nxg-menu--end"
                  role="menu"
                  aria-labelledby={exportButtonId}
                >
                  <button
                    type="button"
                    className="nxg-menu-item"
                    role="menuitem"
                    onClick={() => void handleExport("excel")}
                  >
                    <FileSpreadsheetIcon className="nxg-icon--excel" />
                    <div className="nxg-menu-item-title">
                      <strong>{locale.exportExcelTitle}</strong>
                      <small>{locale.exportExcelSubtitle}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="nxg-menu-item"
                    role="menuitem"
                    onClick={() => void handleExport("csv")}
                  >
                    <FileTextIcon className="nxg-icon--csv" />
                    <div className="nxg-menu-item-title">
                      <strong>{locale.exportCsvTitle}</strong>
                      <small>{locale.exportCsvSubtitle}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="nxg-menu-item"
                    role="menuitem"
                    onClick={() => void handleExport("clipboard")}
                  >
                    <FileTextIcon className="nxg-icon--csv" />
                    <div className="nxg-menu-item-title">
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

      {/* ── TABLE (>= 768px) ─────────────────────────────────────────────── */}
      <div className="nxg-table-wrap">
        <table className="nxg-table" aria-label={caption}>
          <thead>
            <tr>
              {showSerialNumber ? (
                <th className="nxg-th nxg-th--serial" scope="col">
                  {locale.serialHeader}
                </th>
              ) : null}

              {enableSelection ? (
                <th className="nxg-th nxg-th--select" scope="col">
                  {!isSingleSelect ? (
                    <input
                      type="checkbox"
                      className="nxg-checkbox"
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

              {visible.map((col, index) => {
                const id = getColumnId(col);
                const sortable = isSortable(col);
                const sortIndex = query.sort.findIndex((s) => s.field === id);
                const sortItem = sortIndex >= 0 ? query.sort[sortIndex] : undefined;
                const sorted = sortable && sortItem !== undefined;
                const title = getColumnTitle(col) || id;
                const meta = col.meta;
                const activeFilter = query.filter?.[id];
                const isFilterActive = activeFilter !== undefined && activeFilter !== "";

                const customWidth = colWidths[id];
                const baseStyle = headerCellStyle(col);
                const thStyle: React.CSSProperties = customWidth !== undefined
                  ? { ...baseStyle, width: `${customWidth}px` }
                  : baseStyle;

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
                    document.body?.classList.remove("nxg-resizing");
                  };
                  document.body?.classList.add("nxg-resizing");
                  document.addEventListener("pointermove", onMove);
                  document.addEventListener("pointerup", onUp);
                };

                return (
                  <th
                    key={id || `col-${index}`}
                    scope="col"
                    className={sortable ? "nxg-th nxg-th--sortable" : "nxg-th"}
                    style={thStyle}
                    aria-sort={
                      sorted
                        ? sortItem?.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : sortable
                          ? "none"
                          : undefined
                    }
                    aria-label={title || undefined}
                    tabIndex={sortable ? 0 : undefined}
                    onClick={sortable ? (event) => {
                      const t = event.target as HTMLElement | null;
                      if (t?.closest(".nxg-col-filter-wrap") || t?.closest(".nxg-resize-handle")) return;
                      toggleSort(id, event.shiftKey);
                    } : undefined}
                    onKeyDown={
                      sortable
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            const t = event.target as HTMLElement | null;
                            if (t?.closest(".nxg-col-filter-wrap")) return;
                            event.preventDefault();
                            toggleSort(id, event.shiftKey);
                          }
                        : undefined
                    }
                  >
                    <div className={headerInnerClass(col)}>
                      <span>{renderColumnHeader(col)}</span>
                      {sortable ? (
                        <span className="nxg-sort-icon-wrap">
                          {sorted ? (
                            sortItem?.dir === "asc" ? (
                              <ArrowUpIcon className="nxg-sort-icon" />
                            ) : (
                              <ArrowDownIcon className="nxg-sort-icon" />
                            )
                          ) : (
                            <ArrowUpDownIcon className="nxg-sort-icon nxg-sort-icon--idle" />
                          )}
                          {query.sort.length > 1 && sortIndex >= 0 ? (
                            <span className="nxg-sort-order">{sortIndex + 1}</span>
                          ) : null}
                        </span>
                      ) : null}

                      {meta?.serverFilterable ? (
                        <div className="nxg-col-filter-wrap">
                          <button
                            type="button"
                            className={
                              isFilterActive
                                ? "nxg-col-filter-btn nxg-col-filter-btn--active"
                                : "nxg-col-filter-btn"
                            }
                            aria-label={`Filter ${title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenFilterCol(openFilterCol === id ? null : id);
                            }}
                          >
                            <FilterIcon className="nxg-icon" />
                          </button>

                          {openFilterCol === id ? (
                            <div
                              className="nxg-filter-popover"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {meta.filterOptions && meta.filterOptions.length > 0 ? (
                                <div className="nxg-filter-popover-options">
                                  <div
                                    className={
                                      !activeFilter
                                        ? "nxg-filter-option nxg-filter-option--selected"
                                        : "nxg-filter-option"
                                    }
                                    onClick={() => {
                                      setOpenFilterCol(null);
                                      onQueryChange(withFilter(query, id, undefined));
                                    }}
                                  >
                                    {locale.filterAll}
                                  </div>
                                  {meta.filterOptions.map((opt) => (
                                    <div
                                      key={opt}
                                      className={
                                        activeFilter === opt
                                          ? "nxg-filter-option nxg-filter-option--selected"
                                          : "nxg-filter-option"
                                      }
                                      onClick={() => {
                                        setOpenFilterCol(null);
                                        onQueryChange(withFilter(query, id, opt));
                                      }}
                                    >
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div>
                                  <input
                                    type="text"
                                    className="nxg-filter-popover-input"
                                    defaultValue={activeFilter ?? ""}
                                    placeholder={formatMessage(locale.filterColumnPlaceholder, { column: title })}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const val = (e.currentTarget as HTMLInputElement).value.trim();
                                        setOpenFilterCol(null);
                                        onQueryChange(withFilter(query, id, val || undefined));
                                      }
                                    }}
                                  />
                                  <div className="nxg-filter-popover-actions">
                                    {activeFilter ? (
                                      <button
                                        type="button"
                                        className="nxg-filter-popover-btn"
                                        onClick={() => {
                                          setOpenFilterCol(null);
                                          onQueryChange(withFilter(query, id, undefined));
                                        }}
                                      >
                                        {locale.clearFilter}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="nxg-filter-popover-btn nxg-filter-popover-btn--primary"
                                      onClick={(e) => {
                                        const parent = (e.currentTarget as HTMLElement).closest(".nxg-filter-popover");
                                        const inputEl = parent?.querySelector("input") as HTMLInputElement | null;
                                        const val = inputEl?.value.trim();
                                        setOpenFilterCol(null);
                                        onQueryChange(withFilter(query, id, val || undefined));
                                      }}
                                    >
                                      {locale.applyFilter}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {enableColumnResize ? (
                      <div className="nxg-resize-handle" onPointerDown={startResize} />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td className="nxg-state" colSpan={Math.max(1, columnCount)}>
                  <span className="nxg-spinner" aria-hidden="true" />
                  <div aria-live="polite">{locale.loadingText}</div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td className="nxg-state" colSpan={Math.max(1, columnCount)}>
                  {locale.emptyText}
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const id = pageRowIds[index] ?? String(index);
                const isSelected = selectedIds.has(id);

                return (
                  <tr
                    key={id || index}
                    className={[
                      "nxg-row",
                      isSelected ? "nxg-row--selected" : undefined,
                      rowIsClickable ? "nxg-row--clickable" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={rowIsClickable ? activateRow(row) : undefined}
                    onKeyDown={rowIsClickable ? rowKeyDown(row) : undefined}
                    tabIndex={rowIsClickable ? 0 : undefined}
                  >
                    {showSerialNumber ? (
                      <td className="nxg-td nxg-td--serial">
                        {serialNumber(currentPage, pageSize, index)}
                      </td>
                    ) : null}

                    {enableSelection ? (
                      <td
                        className="nxg-td nxg-td--select"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type={isSingleSelect ? "radio" : "checkbox"}
                          name={isSingleSelect ? `${instanceId}-select` : undefined}
                          className="nxg-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={formatMessage(locale.selectRowLabel, { id })}
                        />
                      </td>
                    ) : null}

                    {visible.map((col, colIndex) => (
                      <td
                        key={getColumnId(col) || `col-${colIndex}`}
                        className="nxg-td"
                        style={bodyCellStyle(col)}
                      >
                        {renderCellContent(col, row, boolLabels)}
                      </td>
                    ))}
                  </tr>
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
      <div className="nxg-cards">
        {isLoading ? (
          <div className="nxg-card">
            <div className="nxg-state">
              <span className="nxg-spinner" aria-hidden="true" />
              <div aria-live="polite">{locale.loadingText}</div>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="nxg-card">
            <div className="nxg-state">{locale.emptyText}</div>
          </div>
        ) : (
          data.map((row, index) => {
            const id = pageRowIds[index] ?? String(index);
            const isSelected = selectedIds.has(id);

            return (
              <div
                key={id || index}
                className={[
                  "nxg-card",
                  isSelected ? "nxg-card--selected" : undefined,
                  rowIsClickable ? "nxg-card--clickable" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={rowIsClickable ? activateRow(row) : undefined}
                onKeyDown={rowIsClickable ? rowKeyDown(row) : undefined}
                tabIndex={rowIsClickable ? 0 : undefined}
              >
                {showSerialNumber || enableSelection ? (
                  <div className="nxg-card-head">
                    {showSerialNumber ? (
                      <span className="nxg-card-serial">
                        #{serialNumber(currentPage, pageSize, index)}
                      </span>
                    ) : null}
                    {enableSelection ? (
                      <span
                        className="nxg-card-select"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="nxg-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(id)}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={formatMessage(locale.selectRowLabel, { id })}
                        />
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <dl className="nxg-card-rows">
                  {visible.map((col, colIndex) => {
                    const colId = getColumnId(col);
                    return (
                      <div key={colId || `col-${colIndex}`} className="nxg-card-row">
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
      <div className="nxg-footer">
        <div className="nxg-range">
          <span>
            {renderTemplate(locale.showingRange, {
              start: <strong>{range.start}</strong>,
              end: <strong>{range.end}</strong>,
              total: <strong className="nxg-range-total">{total.toLocaleString()}</strong>,
            })}
          </span>
          {selectedIds.size > 0 ? (
            <span className="nxg-selected-badge">
              {formatMessage(locale.selectedBadge, { count: selectedIds.size })}
            </span>
          ) : null}
        </div>

        <div className="nxg-pagination">
          <div className="nxg-rows-per-page">
            <span>{locale.rowsPerPage}</span>
            <select
              className="nxg-rows-select"
              value={String(pageSize)}
              onChange={(event) => {
                onQueryChange(withPageSize(query, Number.parseInt(event.target.value, 10)));
              }}
              aria-label={locale.rowsPerPage}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="nxg-pager">
            <button
              type="button"
              className="nxg-page-nav"
              disabled={currentPage <= 1}
              onClick={() => onQueryChange(withPage(query, currentPage - 1, totalPages))}
              aria-label={locale.previousPage}
            >
              <ChevronLeftIcon size={16} />
              <span className="nxg-sr-only">{locale.previousPage}</span>
            </button>

            {pageItems.map((item, index) =>
              item === "..." ? (
                <span key={`gap-${index}`} className="nxg-page-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={`page-${item}`}
                  type="button"
                  className={
                    item === currentPage ? "nxg-page-btn nxg-page-btn--current" : "nxg-page-btn"
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
              className="nxg-page-nav"
              disabled={currentPage >= totalPages}
              onClick={() => onQueryChange(withPage(query, currentPage + 1, totalPages))}
              aria-label={locale.nextPage}
            >
              <ChevronRightIcon size={16} />
              <span className="nxg-sr-only">{locale.nextPage}</span>
            </button>
          </div>

          <form className="nxg-jump" onSubmit={submitJump}>
            <label className="nxg-jump-label" htmlFor={jumpInputId}>
              {locale.goToPage}
            </label>
            <input
              id={jumpInputId}
              type="number"
              className="nxg-jump-input"
              min={1}
              max={totalPages}
              value={jumpText}
              onChange={(event) => setJumpText(event.target.value)}
              onBlur={() => submitJump()}
              aria-label={locale.goToPageOf}
            />
          </form>
        </div>
      </div>
    </div>
  );
}
