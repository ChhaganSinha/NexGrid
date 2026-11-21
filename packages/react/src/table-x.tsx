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
  downloadCsv,
  downloadExcel,
  downloadPdf,
  fetchAllPages,
  filePrefixFromCaption,
  flattenTreeRows,
  formatFilterPillValue,
  formatMessage,
  formatRangeTsv,
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
  withToggledSort,
  withToggledMultiSort,
  copyToClipboard,
  clearGridState,
  loadGridState,
  saveGridState,
  getCellValue,
  getCellText,
  queryClientData,
  searchableColumnIds,
  defaultQuery,
  flattenColumns,
  hasHeaderGroups,
  buildHeaderRows,
  type CellCoord,
  type ContextMenuItem,
  type Density,
  type ExportFormat,
  type NormalizedCellRange,
  type PagedResponse,
  type SavedGridView,
  type TableXColumn,
  type TableXLocale,
  type TreeRowNode,
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
interface ReactColumnFilterPopoverProps<TData, TRender> {
  id: string;
  col: TableXColumn<TData, TRender>;
  meta: NonNullable<TableXColumn<TData, TRender>["meta"]>;
  title: string;
  activeFilter?: string;
  filterable: boolean;
  enableColumnMenu: boolean;
  sortable: boolean;
  activeSortDir: "asc" | "desc" | null;
  currentPin: "left" | "right" | false;
  isGroupedByThis: boolean;
  hasActiveGrouping: boolean;
  canHide: boolean;
  locale: Required<TableXLocale>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  tableWrapRef: React.RefObject<HTMLDivElement | null>;
  onApply: (val: string | undefined) => void;
  onSortDir: (dir: "asc" | "desc" | null) => void;
  onPin: (side: "left" | "right" | "none") => void;
  onGroupBy: (columnId: string | undefined) => void;
  onAddGroupBy: (columnId: string) => void;
  onHide: () => void;
  onClose: () => void;
}

function ReactColumnFilterPopover<TData, TRender>({
  id,
  col,
  meta,
  title,
  activeFilter,
  filterable,
  enableColumnMenu,
  sortable,
  activeSortDir,
  currentPin,
  isGroupedByThis,
  hasActiveGrouping,
  canHide,
  locale,
  rootRef,
  tableWrapRef,
  onApply,
  onSortDir,
  onPin,
  onGroupBy,
  onAddGroupBy,
  onHide,
  onClose,
}: ReactColumnFilterPopoverProps<TData, TRender>): React.JSX.Element {
  const isMultiSelect = isMultiSelectFilter(col) && Boolean(meta.filterOptions && meta.filterOptions.length > 0);
  const [selectedVal, setSelectedVal] = React.useState<string>(activeFilter ?? "");
  const [searchTerm, setSearchTerm] = React.useState<string>(() =>
    isMultiSelect ? "" : (activeFilter ?? ""),
  );
  const [selectedMulti, setSelectedMulti] = React.useState<ReadonlySet<string>>(() => {
    if (!isMultiSelect || !meta.filterOptions) return new Set<string>();
    const tokens = parseMultiFilterValues(activeFilter, true).map((t) => t.toLowerCase());
    return new Set(
      meta.filterOptions.filter((opt) => tokens.includes(opt.trim().toLowerCase())),
    );
  });
  const [hasTyped, setHasTyped] = React.useState<boolean>(false);
  const [fromVal, setFromVal] = React.useState<string>(() => {
    if (meta.filterType === "date-range" && activeFilter) {
      return activeFilter.split("..")[0] || "";
    }
    return "";
  });
  const [toVal, setToVal] = React.useState<string>(() => {
    if (meta.filterType === "date-range" && activeFilter) {
      return activeFilter.split("..")[1] || "";
    }
    return "";
  });
  const [minVal, setMinVal] = React.useState<string>(() => {
    if (meta.filterType === "number-range" && activeFilter) {
      return activeFilter.split("..")[0] || "";
    }
    return "";
  });
  const [maxVal, setMaxVal] = React.useState<string>(() => {
    if (meta.filterType === "number-range" && activeFilter) {
      return activeFilter.split("..")[1] || "";
    }
    return "";
  });

  const popoverRef = React.useRef<HTMLDivElement>(null);
  const primaryInputRef = React.useRef<HTMLInputElement>(null);
  const [popoverStyle, setPopoverStyle] = React.useState<React.CSSProperties>({
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 1000,
    visibility: "hidden",
  });

  const updatePosition = React.useCallback(() => {
    const el = popoverRef.current;
    const rootEl = rootRef.current;
    if (!el || !rootEl || typeof window === "undefined") return;

    const buttons = rootEl.querySelectorAll<HTMLElement>(".tbx-col-filter-btn");
    let btn: HTMLElement | null = null;
    for (const candidate of Array.from(buttons)) {
      if (candidate.getAttribute("data-filter-col") === id) {
        btn = candidate;
        break;
      }
    }
    if (!btn || typeof btn.getBoundingClientRect !== "function") return;

    const btnRect = btn.getBoundingClientRect();
    const rootRect = rootEl.getBoundingClientRect();
    if (btnRect.width === 0 && btnRect.height === 0 && btnRect.top === 0) {
      setPopoverStyle({ position: "absolute", top: 0, left: 0, zIndex: 1000 });
      return;
    }

    const wrapEl = tableWrapRef.current;
    if (wrapEl && typeof wrapEl.getBoundingClientRect === "function") {
      const wrapRect = wrapEl.getBoundingClientRect();
      if (wrapRect.width > 0 && (btnRect.right < wrapRect.left + 4 || btnRect.left > wrapRect.right - 4)) {
        onClose();
        return;
      }
    }

    const popoverRect = el.getBoundingClientRect();
    const margin = 6;
    const popoverHeight = popoverRect.height || 220;
    const popoverWidth = popoverRect.width || 240;

    let viewportTop = btnRect.bottom + margin;
    if (
      viewportTop + popoverHeight > window.innerHeight - 12 &&
      btnRect.top - popoverHeight - margin > 12
    ) {
      viewportTop = btnRect.top - popoverHeight - margin;
    }

    let viewportLeft = btnRect.right - popoverWidth;
    if (viewportLeft < 12) {
      viewportLeft = Math.max(12, btnRect.left);
    }
    if (viewportLeft + popoverWidth > window.innerWidth - 12) {
      viewportLeft = Math.max(12, window.innerWidth - popoverWidth - 12);
    }

    setPopoverStyle({
      position: "absolute",
      top: `${Math.round(viewportTop - rootRect.top)}px`,
      left: `${Math.round(viewportLeft - rootRect.left)}px`,
      zIndex: 1000,
    });
  }, [id, rootRef, tableWrapRef, onClose]);

  React.useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  React.useEffect(() => {
    const input = primaryInputRef.current;
    if (input && typeof input.focus === "function") {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    }
    const wrapEl = tableWrapRef.current;
    const onReposition = () => updatePosition();
    wrapEl?.addEventListener("scroll", onReposition, { passive: true });
    window.addEventListener("resize", onReposition);
    return () => {
      wrapEl?.removeEventListener("scroll", onReposition);
      window.removeEventListener("resize", onReposition);
    };
  }, [tableWrapRef, updatePosition]);

  const isPinCapable = !isStructuralColumn(col) && id !== "";
  const hasQuickActions = enableColumnMenu && (sortable || isPinCapable || canHide);
  const quickActionsNode = hasQuickActions ? (
    <>
      <div className="tbx-col-menu-actions">
        {sortable ? (
          <>
            <button
              type="button"
              data-col-action="sort-asc"
              className={`tbx-col-menu-btn ${activeSortDir === "asc" ? "tbx-col-menu-btn--active" : ""}`}
              onClick={() => {
                onSortDir(activeSortDir === "asc" ? null : "asc");
                onClose();
              }}
            >
              <ArrowUpIcon className="tbx-icon" />
              <span>{locale.sortAscending}</span>
            </button>
            <button
              type="button"
              data-col-action="sort-desc"
              className={`tbx-col-menu-btn ${activeSortDir === "desc" ? "tbx-col-menu-btn--active" : ""}`}
              onClick={() => {
                onSortDir(activeSortDir === "desc" ? null : "desc");
                onClose();
              }}
            >
              <ArrowDownIcon className="tbx-icon" />
              <span>{locale.sortDescending}</span>
            </button>
          </>
        ) : null}
        {isPinCapable && currentPin !== "left" ? (
          <button
            type="button"
            data-col-action="pin-left"
            className="tbx-col-menu-btn"
            onClick={() => {
              onPin("left");
              onClose();
            }}
          >
            <span>{locale.pinLeft}</span>
          </button>
        ) : null}
        {isPinCapable && currentPin !== "right" ? (
          <button
            type="button"
            data-col-action="pin-right"
            className="tbx-col-menu-btn"
            onClick={() => {
              onPin("right");
              onClose();
            }}
          >
            <span>{locale.pinRight}</span>
          </button>
        ) : null}
        {isPinCapable && (currentPin === "left" || currentPin === "right") ? (
          <button
            type="button"
            data-col-action="unpin"
            className="tbx-col-menu-btn tbx-col-menu-btn--active"
            onClick={() => {
              onPin("none");
              onClose();
            }}
          >
            <span>{locale.unpinColumn}</span>
          </button>
        ) : null}
        {isPinCapable ? (
          isGroupedByThis ? (
            <button
              type="button"
              data-col-action="ungroup"
              className="tbx-col-menu-btn tbx-col-menu-btn--active"
              onClick={() => {
                onGroupBy(undefined);
                onClose();
              }}
            >
              <span>{locale.ungroupColumn}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                data-col-action="group-by"
                className="tbx-col-menu-btn"
                onClick={() => {
                  onGroupBy(id);
                  onClose();
                }}
              >
                <span>{locale.groupByColumn}</span>
              </button>
              {hasActiveGrouping ? (
                <button
                  type="button"
                  data-col-action="add-group-by"
                  className="tbx-col-menu-btn"
                  onClick={() => {
                    onAddGroupBy(id);
                    onClose();
                  }}
                >
                  <span>{locale.addGroupByColumn}</span>
                </button>
              ) : null}
            </>
          )
        ) : null}
        {canHide ? (
          <button
            type="button"
            data-col-action="hide"
            className="tbx-col-menu-btn"
            onClick={() => {
              onHide();
              onClose();
            }}
          >
            <span>{locale.hideColumn}</span>
          </button>
        ) : null}
      </div>
      {filterable ? <div className="tbx-col-menu-sep" /> : null}
    </>
  ) : null;

  if (!filterable) {
    return (
      <div
        ref={popoverRef}
        style={popoverStyle}
        className="tbx-filter-popover"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {quickActionsNode}
      </div>
    );
  }

  if (meta.filterType === "date-range") {
    const applyDateRange = () => {
      const f = fromVal.trim();
      const t = toVal.trim();
      onApply(!f && !t ? undefined : `${f}..${t}`);
      onClose();
    };
    const handleRangeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyDateRange();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    return (
      <div
        ref={popoverRef}
        style={popoverStyle}
        className="tbx-filter-popover"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {quickActionsNode}
        <div className="tbx-range-inputs">
          <input
            ref={primaryInputRef}
            type="date"
            className="tbx-range-input"
            value={fromVal}
            aria-label="From date"
            onChange={(e) => setFromVal(e.target.value)}
            onKeyDown={handleRangeKey}
          />
          <span className="tbx-range-sep">to</span>
          <input
            type="date"
            className="tbx-range-input"
            value={toVal}
            aria-label="To date"
            onChange={(e) => setToVal(e.target.value)}
            onKeyDown={handleRangeKey}
          />
        </div>
        <div className="tbx-filter-popover-actions">
          <button
            type="button"
            className="tbx-filter-popover-btn"
            onClick={() => {
              onApply(undefined);
              onClose();
            }}
          >
            <RotateCcwIcon className="tbx-icon" />
            <span>{locale.clearFilter}</span>
          </button>
          <button
            type="button"
            className="tbx-filter-popover-btn tbx-filter-popover-btn--primary"
            onClick={applyDateRange}
          >
            <CheckIcon className="tbx-icon" />
            <span>{locale.applyFilter}</span>
          </button>
        </div>
      </div>
    );
  }

  if (meta.filterType === "number-range") {
    const applyNumberRange = () => {
      const mi = minVal.trim();
      const ma = maxVal.trim();
      onApply(!mi && !ma ? undefined : `${mi}..${ma}`);
      onClose();
    };
    const handleRangeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyNumberRange();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    return (
      <div
        ref={popoverRef}
        style={popoverStyle}
        className="tbx-filter-popover"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {quickActionsNode}
        <div className="tbx-range-inputs">
          <input
            ref={primaryInputRef}
            type="number"
            className="tbx-range-input"
            placeholder="Min"
            value={minVal}
            aria-label="Minimum"
            onChange={(e) => setMinVal(e.target.value)}
            onKeyDown={handleRangeKey}
          />
          <span className="tbx-range-sep">to</span>
          <input
            type="number"
            className="tbx-range-input"
            placeholder="Max"
            value={maxVal}
            aria-label="Maximum"
            onChange={(e) => setMaxVal(e.target.value)}
            onKeyDown={handleRangeKey}
          />
        </div>
        <div className="tbx-filter-popover-actions">
          <button
            type="button"
            className="tbx-filter-popover-btn"
            onClick={() => {
              onApply(undefined);
              onClose();
            }}
          >
            <RotateCcwIcon className="tbx-icon" />
            <span>{locale.clearFilter}</span>
          </button>
          <button
            type="button"
            className="tbx-filter-popover-btn tbx-filter-popover-btn--primary"
            onClick={applyNumberRange}
          >
            <CheckIcon className="tbx-icon" />
            <span>{locale.applyFilter}</span>
          </button>
        </div>
      </div>
    );
  }

  if (isMultiSelect && meta.filterOptions && meta.filterOptions.length > 0) {
    const placeholder =
      meta.filterPlaceholder ||
      formatMessage(locale.filterColumnPlaceholder, { column: title });
    const term = searchTerm.trim().toLowerCase();
    const filteredMulti = meta.filterOptions.filter(
      (opt) => !term || opt.toLowerCase().includes(term),
    );
    const submitMulti = () => {
      const ordered = meta.filterOptions!.filter((opt) => selectedMulti.has(opt));
      onApply(serializeMultiFilterValues(ordered));
      onClose();
    };
    const toggleOpt = (opt: string) => {
      setSelectedMulti((prev) => {
        const next = new Set(prev);
        if (next.has(opt)) next.delete(opt);
        else next.add(opt);
        return next;
      });
    };

    return (
      <div
        ref={popoverRef}
        style={popoverStyle}
        className="tbx-filter-popover"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {quickActionsNode}
        <input
          ref={primaryInputRef}
          type="text"
          className="tbx-filter-popover-input"
          value={searchTerm}
          placeholder={placeholder}
          aria-label={`Filter ${title}`}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitMulti();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="tbx-filter-popover-options" role="listbox" aria-multiselectable="true">
          <div
            className={`tbx-filter-option ${selectedMulti.size === 0 ? "tbx-filter-option--selected" : ""}`}
            onClick={() => setSelectedMulti(new Set())}
          >
            {locale.filterAll}
          </div>
          {filteredMulti.length === 0 ? (
            <div className="tbx-filter-empty">No matching options</div>
          ) : (
            filteredMulti.map((opt) => {
              const checked = selectedMulti.has(opt);
              return (
                <div
                  key={opt}
                  role="option"
                  aria-selected={checked}
                  className={`tbx-filter-option ${checked ? "tbx-filter-option--selected" : ""}`}
                  onClick={() => toggleOpt(opt)}
                >
                  <input
                    type="checkbox"
                    className="tbx-filter-option-check"
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleOpt(opt)}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  <span>{opt}</span>
                </div>
              );
            })
          )}
        </div>
        <div className="tbx-filter-popover-actions">
          <button
            type="button"
            className="tbx-filter-popover-btn"
            onClick={() => {
              setSelectedMulti(new Set());
              onApply(undefined);
              onClose();
            }}
          >
            <RotateCcwIcon className="tbx-icon" />
            <span>{locale.clearFilter}</span>
          </button>
          <button
            type="button"
            className="tbx-filter-popover-btn tbx-filter-popover-btn--primary"
            onClick={submitMulti}
          >
            <CheckIcon className="tbx-icon" />
            <span>{locale.applyFilter}</span>
          </button>
        </div>
      </div>
    );
  }

  const placeholder =
    meta.filterPlaceholder ||
    formatMessage(locale.filterColumnPlaceholder, { column: title });

  const filterOptions = meta.filterOptions;
  const filteredOpts = filterOptions
    ? hasTyped
      ? filterOptions.filter(
        (opt) =>
          !searchTerm.trim() || opt.toLowerCase().includes(searchTerm.toLowerCase().trim()),
      )
      : filterOptions
    : [];

  return (
    <div
      ref={popoverRef}
      style={popoverStyle}
      className="tbx-filter-popover"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {quickActionsNode}
      <input
        ref={primaryInputRef}
        type={meta.filterType === "date" ? "date" : meta.filterType === "number" ? "number" : "text"}
        className="tbx-filter-popover-input"
        value={searchTerm}
        placeholder={placeholder}
        aria-label={`Filter ${title}`}
        onChange={(e) => {
          setHasTyped(true);
          setSearchTerm(e.target.value);
          setSelectedVal(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const val = (selectedVal || searchTerm).trim();
            onApply(val || undefined);
            onClose();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      />
      {filterOptions && filterOptions.length > 0 ? (
        <div className="tbx-filter-popover-options">
          <div
            className={`tbx-filter-option ${!selectedVal ? "tbx-filter-option--selected" : ""}`}
            onClick={() => {
              setSelectedVal("");
              setSearchTerm("");
              setHasTyped(false);
              onApply(undefined);
              onClose();
            }}
          >
            {locale.filterAll}
          </div>
          {filteredOpts.length === 0 ? (
            <div className="tbx-filter-empty">No matching options</div>
          ) : (
            filteredOpts.map((opt) => {
              const isSelected = selectedVal.trim().toLowerCase() === opt.trim().toLowerCase();
              return (
                <div
                  key={opt}
                  className={`tbx-filter-option ${isSelected ? "tbx-filter-option--selected" : ""}`}
                  onClick={() => {
                    setSelectedVal(opt);
                    setSearchTerm(opt);
                    setHasTyped(false);
                    onApply(opt);
                    onClose();
                  }}
                >
                  {opt}
                </div>
              );
            })
          )}
        </div>
      ) : null}
      <div className="tbx-filter-popover-actions">
        <button
          type="button"
          className="tbx-filter-popover-btn"
          onClick={() => {
            setSelectedVal("");
            setSearchTerm("");
            setHasTyped(false);
            onApply(undefined);
            onClose();
          }}
        >
          <RotateCcwIcon className="tbx-icon" />
          <span>{locale.clearFilter}</span>
        </button>
        <button
          type="button"
          className="tbx-filter-popover-btn tbx-filter-popover-btn--primary"
          onClick={() => {
            const val = (selectedVal || searchTerm).trim();
            onApply(val || undefined);
            onClose();
          }}
        >
          <CheckIcon className="tbx-icon" />
          <span>{locale.applyFilter}</span>
        </button>
      </div>
    </div>
  );
}

export function TableX<TData>(props: TableXProps<TData>): React.JSX.Element {
  const {
    columns,
    data,
    total: totalProp,
    query: queryProp,
    onQueryChange: onQueryChangeProp,
    clientSidePagination,
    paginationMode,
    searchableFields,
    caption,
    density: initialDensity = "default",
    isLoading = false,
    error = false,
    onRetry,
    enableSelection = false,
    selectionMode = "multi",
    enableColumnFilters = true,
    enableColumnMenu,
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
    enableVirtualization = false,
    virtualHeight = DEFAULT_VIRTUAL_HEIGHT,
    virtualOverscan,
    groupBy: groupByProp,
    onGroupByChange,
    enableKeyboardNavigation = true,
    enableContextMenu = true,
    contextMenuItems,
    enableTreeData = false,
    childrenKey,
    getSubRows,
    defaultExpandedDepth = 0,
    pinnedTopRows,
    pinnedBottomRows,
    editMode = "cell",
    onRowEdit,
    enableSavedViews = false,
    savedViews: savedViewsProp,
    onSavedViewsChange,
    enableRowReorder = false,
    onRowOrderChange,
    enableInfiniteScroll = false,
    hasMore = false,
    isLoadingMore = false,
    nextCursor = null,
    onLoadMore,
    enableRangeSelection = false,
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
    allData,
    fetchAllData,
    fetchPage,
    maxExportRows,
    exportMode = "menu",
    quickExport,
    onExportAll,
    fetchEndpoint,
    fetchOptions,
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

  const locale = resolveLocale(localeOverrides);
  const boolLabels = { yes: locale.booleanYes, no: locale.booleanNo };

  const isColumnsVisible = enableColumns && showColumnsButton !== false;
  const isDensityVisible = enableDensity && showDensityButton !== false;
  const isExportVisible = enableExport && showExportButton !== false;
  const resolvedExportMode = quickExport
    ? (typeof quickExport === "string" ? quickExport : "excel")
    : (exportMode ?? "menu");
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
  const [editingRowId, setEditingRowId] = React.useState<string | null>(null);
  const [rowEditDraft, setRowEditDraft] = React.useState<Record<string, unknown>>({});
  const [cellValidationError, setCellValidationError] = React.useState<string | null>(null);
  const [dirtyCells, setDirtyCells] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [draggedColId, setDraggedColId] = React.useState<string | null>(null);
  const [activeGroupBy, setActiveGroupBy] = React.useState<string[]>(() =>
    normalizeGroupBy(groupByProp),
  );
  const [collapsedGroups, setCollapsedGroups] = React.useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  React.useEffect(() => {
    setActiveGroupBy(normalizeGroupBy(groupByProp));
    setCollapsedGroups(new Set());
  }, [groupByProp]);

  const isTreeEnabled = enableTreeData === true || typeof getSubRows === "function";
  const isInfiniteMode = enableInfiniteScroll === true || paginationMode === "infinite";
  const [treeExpandedIds, setTreeExpandedIds] = React.useState<ReadonlySet<string>>(() =>
    isTreeEnabled && defaultExpandedDepth !== 0
      ? collectInitialExpandedTreeIds(data, defaultExpandedDepth, {
          childrenKey,
          getSubRows,
          getRowId,
        })
      : new Set<string>(),
  );

  const [savedViewsList, setSavedViewsList] = React.useState<SavedGridView[]>(() =>
    savedViewsProp ? [...savedViewsProp] : loadSavedViews(storageKey),
  );
  React.useEffect(() => {
    if (savedViewsProp !== undefined) {
      setSavedViewsList([...savedViewsProp]);
    }
  }, [savedViewsProp]);
  const [newViewName, setNewViewName] = React.useState("");

  const [reorderedRows, setReorderedRows] = React.useState<TData[] | null>(null);
  React.useEffect(() => {
    setReorderedRows(null);
  }, [data, query]);
  const draggedRowIdxRef = React.useRef<number | null>(null);

  const [focusedCell, setFocusedCell] = React.useState<CellCoord | null>(null);
  const [rangeAnchor, setRangeAnchor] = React.useState<CellCoord | null>(null);
  const [cellRange, setCellRange] = React.useState<NormalizedCellRange | null>(null);
  const isDraggingRangeRef = React.useRef(false);
  const isFillingRangeRef = React.useRef(false);
  const lastSelectedRowIdxRef = React.useRef<number | null>(null);
  const shiftClickRowRef = React.useRef(false);
  const [contextMenu, setContextMenu] = React.useState<{
    x: number;
    y: number;
    row: TData;
    col: TableXColumn<TData, React.ReactNode>;
    colId: string;
  } | null>(null);

  React.useEffect(() => {
    const onPointerUp = () => {
      isDraggingRangeRef.current = false;
      isFillingRangeRef.current = false;
    };
    document.addEventListener("pointerup", onPointerUp);
    return () => document.removeEventListener("pointerup", onPointerUp);
  }, []);

  React.useEffect(() => {
    if (!contextMenu) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(".tbx-context-menu")) setContextMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);
  const headerPointerRef = React.useRef<{
    colId: string;
    sortField: string;
    x: number;
    y: number;
    shiftKey: boolean;
    dropped: boolean;
  } | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const [openFilterCol, setOpenFilterCol] = React.useState<string | null>(null);
  const [colWidths, setColWidths] = React.useState<Record<string, number>>({});
  const [pinnedCols, setPinnedCols] = React.useState<Record<string, "left" | "right" | "none">>({});
  const resizeCleanupRef = React.useRef<(() => void) | null>(null);
  const editInputRef = React.useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  React.useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!openFilterCol) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".tbx-col-filter-wrap") && !target?.closest(".tbx-filter-popover")) {
        setOpenFilterCol(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenFilterCol(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openFilterCol]);

  // ---- Client-side dataset ------------------------------------------------
  //
  // Declared after the column state because the search has to know which
  // columns are on screen: without a field list the engine matches every
  // property on the row, so a row's `id` GUID or a `tenantId` the grid never
  // renders makes "5" or "ab" match almost everything, with nothing on screen
  // to explain the hit. A host that really does want to search unrendered
  // fields says so with `searchableFields`.
  const clientSearchFields = React.useMemo<(keyof TData & string)[]>(
    // `searchableColumnIds` returns row properties (a column's `accessorKey`,
    // falling back to its id), which the column type cannot state for the
    // compiler — hence the narrowing cast.
    () => searchableFields ?? (searchableColumnIds(colList, hiddenCols) as (keyof TData & string)[]),
    [searchableFields, colList, hiddenCols],
  );

  const unpaginatedVirtual = enableVirtualization && !isPaginationVisible;

  const clientQueryOptions = React.useMemo(
    // An empty list means "search everything" to the engine, so only pass one
    // when it has entries — with no visible column there is nothing to narrow
    // to anyway, and the old behaviour is the safer fallback.
    () => ({
      columns: colList,
      ...(clientSearchFields.length > 0 ? { searchableFields: clientSearchFields } : {}),
      ...(unpaginatedVirtual ? { paginate: false } : {}),
    }),
    [colList, clientSearchFields, unpaginatedVirtual],
  );

  const clientPaged = React.useMemo(() => {
    if (!isClientSide) return null;
    return queryClientData(data, query, clientQueryOptions);
  }, [isClientSide, data, query, clientQueryOptions]);

  const baseRows = reorderedRows ?? (isClientSide ? (clientPaged?.items ?? data) : data);
  const treeNodes = React.useMemo(
    () =>
      isTreeEnabled
        ? flattenTreeRows(baseRows, {
            childrenKey,
            getSubRows,
            getRowId,
            expandedIds: treeExpandedIds,
          })
        : null,
    [isTreeEnabled, baseRows, childrenKey, getSubRows, getRowId, treeExpandedIds],
  );
  const rows = React.useMemo(
    () => (treeNodes ? treeNodes.map((n) => n.row) : baseRows),
    [treeNodes, baseRows],
  );
  const total = isClientSide ? (clientPaged?.total ?? data.length) : (totalProp ?? data.length);

  /**
   * Which `storageKey` has been read back into state.
   *
   * Persistence is a load-then-save cycle, and the two halves must not land in
   * the same commit. The restore effect applies its values through `setState`,
   * so a save effect running in that same commit still closes over the INITIAL
   * density and columns and writes them straight back over the snapshot it just
   * read. StrictMode double-invokes effects, which makes it fire on every mount,
   * so a page reload always converged on the initial state and the user's choice
   * looked as though it had never been saved.
   *
   * This is state and not a ref on purpose: a ref flips synchronously, and the
   * save effect running later in the SAME commit would still see stale values.
   * A state flag defers the first save to the next render, by which point the
   * restored values are live.
   *
   * It holds the key rather than a boolean so a grid whose `storageKey` changes
   * re-arms — otherwise the outgoing grid's state is written under the incoming
   * key before that key has been read.
   */
  const [hydratedKey, setHydratedKey] = React.useState<string | null>(null);

  // Restore persisted state on mount
  React.useEffect(() => {
    if (!storageKey) return;
    const persisted = loadGridState(storageKey);
    if (persisted) {
      if (persisted.density) setDensity(persisted.density);
      if (persisted.columnWidths) setColWidths(persisted.columnWidths);
      if (persisted.pinnedColumns && typeof persisted.pinnedColumns === "object") {
        setPinnedCols(persisted.pinnedColumns);
      }
      if (persisted.groupBy !== undefined) {
        setActiveGroupBy(normalizeGroupBy(persisted.groupBy));
      }
      if (persisted.hiddenColumns && Array.isArray(persisted.hiddenColumns)) {
        const hiddenMap: Record<string, boolean> = {};
        for (const col of flattenColumns(columns)) {
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
    // Arms the save effect — see `hydratedKey`. Set even when nothing was
    // stored: a first-time grid has still been "read", and its state should
    // start being persisted from here on.
    setHydratedKey(storageKey);
  }, [storageKey, columns]);

  // Persist state changes
  React.useEffect(() => {
    if (!storageKey) return;
    // Not yet read back, or read under a different key. Saving now would
    // overwrite the stored snapshot with whatever this grid happens to be
    // showing before the restore has been applied.
    if (hydratedKey !== storageKey) return;
    const hiddenList = Object.entries(hiddenCols)
      .filter(([_, isHidden]) => isHidden)
      .map(([id]) => id);
    saveGridState(storageKey, {
      density,
      columnWidths: colWidths,
      columnOrder: colList.map(getColumnId).filter(Boolean) as string[],
      hiddenColumns: hiddenList,
      pinnedColumns: pinnedCols,
      groupBy: [...activeGroupBy],
    });
  }, [storageKey, hydratedKey, density, hiddenCols, colList, colWidths, pinnedCols, activeGroupBy]);

  const viewsMenu = useDropdown();
  const columnsMenu = useDropdown();
  const densityMenu = useDropdown();
  const exportMenu = useDropdown();

  const handleResetView = React.useCallback(() => {
    if (storageKey) {
      clearGridState(storageKey);
    }
    setDensity(initialDensity);
    setColWidths({});
    setPinnedCols({});
    setActiveGroupBy(normalizeGroupBy(groupByProp));
    setCollapsedGroups(new Set());
    setColList(columns);
    setHiddenCols(initialHiddenColumns(flattenColumns(columns)));
    columnsMenu.close();
  }, [storageKey, initialDensity, groupByProp, columns, columnsMenu]);

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
  const viewsButtonId = `${instanceId}-views`;
  const columnsButtonId = `${instanceId}-columns`;
  const densityButtonId = `${instanceId}-density`;
  const exportButtonId = `${instanceId}-export`;
  const jumpInputId = `${instanceId}-jump`;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const tableWrapRef = React.useRef<HTMLDivElement>(null);
  const prevHeightRef = React.useRef<number>(0);
  const [virtualScrollTop, setVirtualScrollTop] = React.useState(0);

  React.useEffect(() => {
    if (!enableVirtualization) return;
    setVirtualScrollTop(0);
    if (tableWrapRef.current) {
      tableWrapRef.current.scrollTop = 0;
    }
  }, [enableVirtualization, query]);

  React.useLayoutEffect(() => {
    if (typeof window === "undefined" || !tableWrapRef.current) return;
    if (isLoading) {
      if (prevHeightRef.current > 0) {
        tableWrapRef.current.style.minHeight = `${prevHeightRef.current}px`;
      }
    } else {
      const h = tableWrapRef.current.getBoundingClientRect().height;
      if (h > 0) {
        prevHeightRef.current = h;
      }
      tableWrapRef.current.style.minHeight = "";
    }
  }, [isLoading, rows.length]);

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
    (enableRowReorder ? 1 : 0) +
    (renderExpandedRow ? 1 : 0) +
    (showSerialNumber ? 1 : 0) +
    (enableSelection ? 1 : 0);

  const nestedGroupItems = React.useMemo(
    () =>
      !isTreeEnabled && activeGroupBy.length > 0
        ? buildNestedGroupItems(rows, activeGroupBy, colList, collapsedGroups, {
            yes: locale.booleanYes,
            no: locale.booleanNo,
          })
        : null,
    [isTreeEnabled, activeGroupBy, rows, colList, collapsedGroups, locale.booleanYes, locale.booleanNo],
  );
  const toggleGroupCollapse = (groupKey: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };
  const toggleTreeExpand = (nodeId: string): void => {
    setTreeExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const virtualWin = React.useMemo(
    () =>
      enableVirtualization && !isTreeEnabled && activeGroupBy.length === 0
        ? computeVirtualWindow({
          totalRows: rows.length,
          scrollTop: virtualScrollTop,
          viewportHeight: virtualHeight,
          density,
          overscan: virtualOverscan,
        })
        : null,
    [enableVirtualization, isTreeEnabled, activeGroupBy.length, rows.length, virtualScrollTop, virtualHeight, density, virtualOverscan],
  );
  const renderedRows = React.useMemo(
    () => (virtualWin ? rows.slice(virtualWin.startIndex, virtualWin.endIndex) : rows),
    [rows, virtualWin],
  );
  const virtualStartOffset = virtualWin ? virtualWin.startIndex : 0;

  const rangeStats = React.useMemo(
    () => (enableRangeSelection && cellRange ? computeRangeStats(rows, visible, cellRange) : null),
    [enableRangeSelection, cellRange, rows, visible],
  );

  // ---- Pinned offsets helper -----------------------------------------------

  const getPinnedOffsets = (visibleCols: readonly TableXColumn<TData, React.ReactNode>[]) => {
    const leftOffsets = new Map<string, number>();
    const rightOffsets = new Map<string, number>();
    let currentLeft = 0;
    let lastLeftPinnedId: string | null = null;
    const hasLeftPinned = visibleCols.some((c) => isPinned(c, pinnedCols) === "left");

    if (hasLeftPinned) {
      if (enableRowReorder) {
        leftOffsets.set("__row_drag", currentLeft);
        currentLeft += 36;
        lastLeftPinnedId = "__row_drag";
      }

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
        const pin = isPinned(col, pinnedCols);
        const width = colWidths[id] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
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
      const pin = isPinned(col, pinnedCols);
      const width = colWidths[id] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
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

  const [allAcrossSelected, setAllAcrossSelected] = React.useState(false);
  const filterSignature = React.useMemo(
    () => JSON.stringify([query.q ?? "", query.filter ?? {}]),
    [query.q, query.filter],
  );
  const prevFilterSigRef = React.useRef(filterSignature);
  React.useEffect(() => {
    if (prevFilterSigRef.current !== filterSignature) {
      prevFilterSigRef.current = filterSignature;
      if (allAcrossSelected) {
        setAllAcrossSelected(false);
        onSelectionChange?.(Array.from(selectedIds), false);
      }
    }
  }, [filterSignature, allAcrossSelected, selectedIds, onSelectionChange]);

  const isSingleSelect = selectionMode === "single";
  const allPageSelected =
    allAcrossSelected || (pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id)));
  const somePageSelected =
    !allPageSelected && pageRowIds.some((id) => selectedIds.has(id));
  const effectiveSelectedCount = allAcrossSelected
    ? Math.max(total, selectedIds.size)
    : selectedIds.size;

  const deselectAll = (): void => {
    setSelectedIds(new Set<string>());
    setAllAcrossSelected(false);
    onSelectionChange?.([], false);
  };

  const selectAllAcrossPages = (): void => {
    if (isSingleSelect) return;
    const next = new Set(selectedIds);
    const clientFullData = allData ?? (isClientSide ? data : undefined);
    if (clientFullData && clientFullData.length > 0) {
      const full = queryClientData(clientFullData, query, {
        ...clientQueryOptions,
        paginate: false,
      });
      for (const row of full.items) {
        next.add(getRowId(row));
      }
    } else {
      for (const id of pageRowIds) next.add(id);
    }
    setSelectedIds(next);
    setAllAcrossSelected(true);
    onSelectionChange?.(Array.from(next), true);
  };

  const toggleSelectAll = (): void => {
    if (isSingleSelect) return;
    if (allAcrossSelected) {
      deselectAll();
      return;
    }
    const next = new Set(selectedIds);
    if (allPageSelected) {
      for (const id of pageRowIds) next.delete(id);
    } else {
      for (const id of pageRowIds) next.add(id);
    }
    setSelectedIds(next);
    setAllAcrossSelected(false);
    onSelectionChange?.(Array.from(next), false);
  };

  const toggleSelectRow = (id: string, rowIdx?: number, checkedAfterChange?: boolean): void => {
    const shiftHeld = shiftClickRowRef.current;
    shiftClickRowRef.current = false;

    if (isSingleSelect) {
      const next = selectedIds.has(id) ? new Set<string>() : new Set([id]);
      setSelectedIds(next);
      setAllAcrossSelected(false);
      onSelectionChange?.(Array.from(next), false);
      return;
    }

    if (shiftHeld && rowIdx !== undefined && lastSelectedRowIdxRef.current !== null) {
      const shouldSelect = checkedAfterChange ?? !selectedIds.has(id);
      const next = selectContiguousRowIds(
        pageRowIds,
        lastSelectedRowIdxRef.current,
        rowIdx,
        selectedIds,
        shouldSelect,
      );
      lastSelectedRowIdxRef.current = rowIdx;
      setSelectedIds(next);
      setAllAcrossSelected(false);
      onSelectionChange?.(Array.from(next), false);
      return;
    }

    if (rowIdx !== undefined) {
      lastSelectedRowIdxRef.current = rowIdx;
    }
    const next = new Set(selectedIds);
    if (allAcrossSelected) {
      for (const pageId of pageRowIds) next.add(pageId);
      next.delete(id);
      setSelectedIds(next);
      setAllAcrossSelected(false);
      onSelectionChange?.(Array.from(next), false);
      return;
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    onSelectionChange?.(Array.from(next), false);
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

  const executeExportWithRows = async (
    format: ExportFormat,
    exportRows: readonly TData[],
  ): Promise<void> => {
    if (exportRows.length === 0) {
      notify("error", locale.exportNoData);
      return;
    }

    const exportColumns = toExportColumns(visible, boolLabels);
    const prefix = exportFileName ?? filePrefixFromCaption(caption);

    if (format === "clipboard") {
      const ok = await copyToClipboard(exportRows, exportColumns);
      if (ok) {
        notify(
          "success",
          formatMessage(locale.exportClipboardSuccess, { count: exportRows.length.toLocaleString() }),
        );
      } else {
        notify("error", "Failed to copy to clipboard");
      }
    } else if (format === "pdf") {
      const count = downloadPdf({
        filename: timestampedFilename(prefix),
        caption,
        rows: exportRows,
        columns: exportColumns,
        badgeRules,
        serialHeader: locale.serialHeader,
      });
      notify(
        "success",
        formatMessage(locale.exportPdfSuccess, { count: count.toLocaleString() }),
      );
    } else if (format === "excel") {
      const count = downloadExcel({
        filename: timestampedFilename(prefix),
        caption,
        rows: exportRows,
        columns: exportColumns,
        badgeRules,
        serialHeader: locale.serialHeader,
      });
      notify(
        "success",
        formatMessage(locale.exportExcelSuccess, { count: count.toLocaleString() }),
      );
    } else {
      const count = downloadCsv(timestampedFilename(prefix), exportRows, exportColumns);
      notify(
        "success",
        formatMessage(locale.exportCsvSuccess, { count: count.toLocaleString() }),
      );
    }
  };

  const collectExportRows = async (): Promise<readonly TData[]> => {
    if (fetchAllData) {
      const result = await fetchAllData(query);
      return Array.isArray(result) ? result : rows;
    }

    const clientFullData = allData ?? (isClientSide ? data : undefined);
    if (clientFullData && clientFullData.length > 0) {
      const full = queryClientData(clientFullData, query, { ...clientQueryOptions, paginate: false });
      return full.items;
    }

    if (fetchPage) {
      const cap = maxExportRows ?? DEFAULT_ROW_CAP;
      const full = await fetchAllPages<TData>(
        (page, size) => fetchPage(page, size, query),
        cap,
      );
      return cap > 0 && full.items.length > cap ? full.items.slice(0, cap) : full.items;
    }

    if (fetchEndpoint) {
      const cap = maxExportRows ?? DEFAULT_ROW_CAP;
      const full = await fetchAllPages<TData>(async (page, size) => {
        const url = buildQueryUrl(fetchEndpoint, {
          ...query,
          page,
          pageSize: isPageSize(size) ? size : query.pageSize,
        });
        const response = await fetch(url, { cache: "no-store", ...fetchOptions });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PagedResponse<TData>;
      }, cap);
      return cap > 0 && full.items.length > cap ? full.items.slice(0, cap) : full.items;
    }

    return rows;
  };

  const handleBulkExport = async (format: ExportFormat): Promise<void> => {
    if (allAcrossSelected) {
      await handleExport(format);
      return;
    }
    const pool = allData ?? (isClientSide ? data : rows);
    const selectedRows = pool.filter((r) => selectedIds.has(getRowId(r)));
    if (selectedRows.length > 0) {
      await executeExportWithRows(format, selectedRows);
      return;
    }
    await handleExport(format);
  };

  const handleExport = async (format: ExportFormat): Promise<void> => {
    exportMenu.close();

    if (onExportAll) {
      try {
        const customRows = await onExportAll(format);
        if (Array.isArray(customRows)) {
          return executeExportWithRows(format, customRows);
        }
        return;
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Export failed");
        return;
      }
    }

    setIsExporting(true);
    notify(
      "info",
      formatMessage(locale.exportFetchingAll, { total: total.toLocaleString() }),
    );
    try {
      const exportRows = await collectExportRows();
      await executeExportWithRows(format, exportRows);
    } catch {
      notify("error", locale.exportFetchFailed);
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

  const getColumnActiveFilter = (col: TableXColumn<TData, React.ReactNode>): string | undefined => {
    const id = getColumnId(col);
    const filterField = getFilterField(col);
    const filterObj = query.filter;
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
  };

  const renderLeafTh = (
    col: TableXColumn<TData, React.ReactNode>,
    rowSpan = 1,
    isGroupChild = false,
  ) => {
    const id = getColumnId(col);
    const sortField = getSortField(col);
    const sortable = isSortable(col) && enableSorting !== false;
    const lowerSortField = sortField.toLowerCase();
    const lowerId = id.toLowerCase();
    const sortIndex = query.sort.findIndex(
      (s: SortSpec) =>
        s.field === sortField ||
        s.field === id ||
        s.field.toLowerCase() === lowerSortField ||
        s.field.toLowerCase() === lowerId,
    );
    const sortItem = sortIndex >= 0 ? query.sort[sortIndex] : undefined;
    const sorted = sortable && sortItem !== undefined;
    const title = getColumnTitle(col) || id;
    const meta = col.meta;
    const activeFilter = getColumnActiveFilter(col);
    const isFilterActive = activeFilter !== undefined && activeFilter.trim() !== "";
    const isFilterOpen = openFilterCol === id;

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
      resizeCleanupRef.current?.();
      const startX = e.clientX;
      const targetTh =
        (e.currentTarget.closest?.("th") as HTMLElement | null) ||
        (e.currentTarget.parentElement as HTMLElement | null);
      const startWidth = targetTh ? targetTh.getBoundingClientRect().width : (customWidth ?? meta?.width ?? 120);

      const onMove = (moveEvent: PointerEvent) => {
        const nextW = Math.max(meta?.minWidth ?? 60, Math.round(startWidth + (moveEvent.clientX - startX)));
        setColWidths((prev) => ({ ...prev, [id]: nextW }));
      };
      const cleanup = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", cleanup);
        document.body?.classList.remove("tbx-resizing");
        resizeCleanupRef.current = null;
      };
      resizeCleanupRef.current = cleanup;
      document.body?.classList.add("tbx-resizing");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", cleanup);
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
        onPointerDown={
          enableColumnReorder && !isGroupChild
            ? (e) => {
              const t = e.target as HTMLElement | null;
              if (t?.closest(".tbx-col-filter-wrap") || t?.closest(".tbx-resize-handle")) {
                headerPointerRef.current = null;
                return;
              }
              headerPointerRef.current = {
                colId: id,
                sortField,
                x: e.clientX,
                y: e.clientY,
                shiftKey: e.shiftKey,
                dropped: false,
              };
            }
            : undefined
        }
        onDragStart={
          enableColumnReorder && !isGroupChild
            ? (e) => {
              const t = e.target as HTMLElement | null;
              if (t?.closest(".tbx-col-filter-wrap") || t?.closest(".tbx-resize-handle")) {
                e.preventDefault();
                return;
              }
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
              if (headerPointerRef.current) {
                headerPointerRef.current.dropped = true;
              }
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
            ? (e) => {
              const ptr = headerPointerRef.current;
              headerPointerRef.current = null;
              setDraggedColId(null);
              if (
                sortable &&
                ptr &&
                ptr.colId === id &&
                !ptr.dropped &&
                e.clientX > 0 &&
                Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) < 6
              ) {
                toggleSort(ptr.sortField, ptr.shiftKey);
              }
            }
            : undefined
        }
        className={[
          "tbx-th",
          sortable ? "tbx-th--sortable" : undefined,
          isGroupChild ? "tbx-th--grouped-child" : undefined,
          enableColumnReorder && !isGroupChild ? "tbx-th--draggable" : undefined,
          draggedColId === id ? "tbx-th--dragging" : undefined,
          isPinned(col, pinnedCols) === "left" ? "tbx-th--pinned-left" : undefined,
          isPinned(col, pinnedCols) === "right" ? "tbx-th--pinned-right" : undefined,
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
              headerPointerRef.current = null;
              toggleSort(sortField, event.shiftKey);
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
              toggleSort(sortField, event.shiftKey);
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
              {/* The rank badge is hidden from AT on purpose. It is a bare
                  digit sitting inside the header cell, so it would otherwise be
                  read as part of the column name ("Name 2"). The sort state
                  itself is already exposed properly, via `aria-sort` on the th. */}
              {query.sort.length > 1 && sortIndex >= 0 ? (
                <span className="tbx-sort-order" aria-hidden="true">
                  {sortIndex + 1}
                </span>
              ) : null}
            </span>
          ) : null}

          {isFilterable(col, enableColumnFilters) ||
            (!isStructuralColumn(col) && id !== "" && enableColumnMenu === true) ? (
            <div
              className="tbx-col-filter-wrap"
              draggable={false}
              onDragStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <button
                type="button"
                data-filter-col={id}
                aria-expanded={isFilterOpen}
                aria-haspopup="dialog"
                className={[
                  "tbx-col-filter-btn",
                  isFilterActive ? "tbx-col-filter-btn--active" : undefined,
                  isFilterOpen ? "tbx-col-filter-btn--open" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={`Filter ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenFilterCol(openFilterCol === id ? null : id);
                }}
              >
                <DotsVerticalIcon className="tbx-icon" />
              </button>
            </div>
          ) : null}
        </div>

        {enableColumnResize ? (
          <div
            className="tbx-resize-handle"
            draggable={false}
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={startResize}
            onDoubleClick={() => autoFitColumn(id)}
          />
        ) : null}
      </th>
    );
  };

  const activeFilterPopoverCol = React.useMemo(
    () => (openFilterCol ? leafCols.find((c) => getColumnId(c) === openFilterCol) ?? null : null),
    [openFilterCol, leafCols],
  );
  const activeFilterPopoverVal = activeFilterPopoverCol
    ? getColumnActiveFilter(activeFilterPopoverCol)
    : undefined;

  const writeMutatedRowValue = (
    targetRow: TData,
    col: TableXColumn<TData, React.ReactNode>,
    colId: string,
    nextVal: unknown,
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
        (targetRow as Record<string, unknown>)[propKey] = nextVal;
      } catch {
        // Ignore read-only row mutation; host receives callback
      }
    }
  };

  const markDirtyCell = (rowId: string, colId: string): void => {
    setDirtyCells((prev) => {
      const next = new Set(prev);
      next.add(`${rowId}::${colId}`);
      return next;
    });
  };

  const startRowEdit = (row: TData, rowId: string): void => {
    setEditingCell(null);
    setCellValidationError(null);
    const draft: Record<string, unknown> = {};
    for (const col of visible) {
      if (isEditable(col)) {
        draft[getColumnId(col)] = getCellValue(col, row);
      }
    }
    setRowEditDraft(draft);
    setEditingRowId(rowId);
  };

  const commitRowEdit = (row: TData, rowId: string): void => {
    const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
    for (const col of visible) {
      if (!isEditable(col)) continue;
      const cid = getColumnId(col);
      const oldVal = getCellValue(col, row);
      const rawDraft = cid in rowEditDraft ? rowEditDraft[cid] : oldVal;
      const coerced = coerceEditedValue(rawDraft, col.meta?.editType);
      const err = validateEditedCell(col, coerced, row);
      if (err) {
        setCellValidationError(err);
        return;
      }
      changes[cid] = { oldValue: oldVal, newValue: coerced };
    }

    const updatedRow =
      row !== null && typeof row === "object"
        ? ({ ...(row as Record<string, unknown>) } as TData)
        : row;

    const nextDirty = new Set(dirtyCells);
    for (const col of visible) {
      if (!isEditable(col)) continue;
      const cid = getColumnId(col);
      const change = changes[cid];
      if (!change) continue;
      writeMutatedRowValue(row, col, cid, change.newValue);
      writeMutatedRowValue(updatedRow, col, cid, change.newValue);
      if (change.oldValue !== change.newValue) {
        nextDirty.add(`${rowId}::${cid}`);
        onCellEdit?.({
          row,
          columnId: cid,
          oldValue: change.oldValue,
          newValue: change.newValue,
        });
      }
    }

    setDirtyCells(nextDirty);
    setEditingRowId(null);
    setRowEditDraft({});
    setCellValidationError(null);
    onRowEdit?.({ row, updatedRow, changes });
  };

  const applyFillHandleToRow = (targetRowIdx: number): void => {
    if (!cellRange) return;
    const startRow = cellRange.minRow;
    const endRow = Math.max(startRow, Math.min(rows.length - 1, targetRowIdx));
    const sourceRow = rows[startRow];
    if (!sourceRow) return;

    const nextDirty = new Set(dirtyCells);
    for (let c = cellRange.minCol; c <= cellRange.maxCol; c++) {
      const col = visible[c];
      if (!col || !isEditable(col)) continue;
      const cid = getColumnId(col);
      const sourceVal = getCellValue(col, sourceRow);

      for (let r = startRow + 1; r <= endRow; r++) {
        const targetRow = rows[r];
        if (!targetRow) continue;
        const oldVal = getCellValue(col, targetRow);
        const coerced = coerceEditedValue(sourceVal, col.meta?.editType);
        if (validateEditedCell(col, coerced, targetRow) !== null) continue;
        writeMutatedRowValue(targetRow, col, cid, coerced);
        if (oldVal !== coerced) {
          nextDirty.add(`${getRowId(targetRow)}::${cid}`);
          onCellEdit?.({
            row: targetRow,
            columnId: cid,
            oldValue: oldVal,
            newValue: coerced,
          });
        }
      }
    }
    setDirtyCells(nextDirty);
    setCellRange({ ...cellRange, maxRow: endRow });
  };

  const handleRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (enableKeyboardNavigation === false) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.nodeName === "INPUT" ||
        target.nodeName === "SELECT" ||
        target.nodeName === "TEXTAREA")
    ) {
      const inputType = (target as HTMLInputElement).type;
      if (inputType !== "checkbox" && inputType !== "radio") return;
    }
    if (editingCell || editingRowId) return;
    if (rows.length === 0 || visible.length === 0) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && enableRangeSelection && cellRange) {
      const tsv = formatRangeTsv(rows, visible, cellRange, boolLabels);
      if (tsv) {
        e.preventDefault();
        void navigator.clipboard?.writeText?.(tsv);
      }
      return;
    }

    const navKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
    if (navKeys.includes(e.key)) {
      const base = focusedCell ?? { rowIndex: 0, colIndex: 0 };
      const next = moveFocusCoord(base, e.key, rows.length, visible.length);
      if (!next) return;
      e.preventDefault();
      setFocusedCell(next);
      if (enableRangeSelection) {
        if (e.shiftKey) {
          const anchor = rangeAnchor ?? base;
          setRangeAnchor(anchor);
          setCellRange(normalizeCellRange(anchor, next));
        } else {
          setRangeAnchor(next);
          setCellRange(normalizeCellRange(next, next));
        }
      }
      requestAnimationFrame(() => {
        const cellEl = rootRef.current?.querySelector<HTMLElement>(
          `[data-tbx-focus="cell:${next.rowIndex}:${next.colIndex}"]`,
        );
        cellEl?.focus?.({ preventScroll: true });
      });
      return;
    }

    if ((e.key === "Enter" || e.key === "F2") && focusedCell) {
      const row = rows[focusedCell.rowIndex];
      const col = visible[focusedCell.colIndex];
      if (row && col && isEditable(col)) {
        e.preventDefault();
        const rid = getRowId(row);
        if (editMode === "row") {
          startRowEdit(row, rid);
        } else {
          setCellValidationError(null);
          setEditingCell({ rowId: rid, columnId: getColumnId(col) });
        }
      }
      return;
    }

    if (e.key === " " && focusedCell && enableSelection) {
      if (target && (target.nodeName === "BUTTON" || target.nodeName === "INPUT")) return;
      const row = rows[focusedCell.rowIndex];
      if (row) {
        e.preventDefault();
        toggleSelectRow(getRowId(row), focusedCell.rowIndex);
      }
    }
  };

  const handleRootPaste = (e: React.ClipboardEvent<HTMLDivElement>): void => {
    if (!enableRangeSelection || !focusedCell) return;
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

    const startR = focusedCell.rowIndex;
    const startC = focusedCell.colIndex;
    let maxR = startR;
    let maxC = startC;
    const nextDirty = new Set(dirtyCells);

    for (let rOff = 0; rOff < matrix.length; rOff++) {
      const targetRow = rows[startR + rOff];
      if (!targetRow) break;
      maxR = startR + rOff;
      const cells = matrix[rOff]!;
      for (let cOff = 0; cOff < cells.length; cOff++) {
        const col = visible[startC + cOff];
        if (!col) break;
        maxC = Math.max(maxC, startC + cOff);
        if (!isEditable(col)) continue;
        const cid = getColumnId(col);
        const oldVal = getCellValue(col, targetRow);
        const coerced = coerceEditedValue(cells[cOff], col.meta?.editType);
        if (validateEditedCell(col, coerced, targetRow) !== null) continue;
        writeMutatedRowValue(targetRow, col, cid, coerced);
        if (oldVal !== coerced) {
          nextDirty.add(`${getRowId(targetRow)}::${cid}`);
          onCellEdit?.({
            row: targetRow,
            columnId: cid,
            oldValue: oldVal,
            newValue: coerced,
          });
        }
      }
    }
    setDirtyCells(nextDirty);
    setCellRange(
      normalizeCellRange(
        { rowIndex: startR, colIndex: startC },
        { rowIndex: maxR, colIndex: maxC },
      ),
    );
  };

  const saveCurrentPresetView = (): void => {
    const trimmed = newViewName.trim();
    if (!trimmed) return;
    const updated = upsertSavedView(
      savedViewsList,
      {
        name: trimmed,
        query,
        hiddenColumns: { ...hiddenCols },
        pinnedColumns: { ...pinnedCols },
        columnOrder: colList.map(getColumnId).filter(Boolean) as string[],
        groupBy: [...activeGroupBy],
        density,
      },
      storageKey,
    );
    setSavedViewsList(updated);
    onSavedViewsChange?.(updated);
    setNewViewName("");
  };

  const applySavedView = (view: SavedGridView): void => {
    if (view.density) setDensity(view.density);
    if (view.hiddenColumns) setHiddenCols({ ...view.hiddenColumns });
    if (view.pinnedColumns) setPinnedCols({ ...view.pinnedColumns });
    if (view.groupBy) setActiveGroupBy([...view.groupBy]);
    setCollapsedGroups(new Set());
    viewsMenu.close();
    onQueryChange(view.query);
  };

  const deleteSavedView = (viewId: string): void => {
    const updated = removeSavedView(savedViewsList, viewId, storageKey);
    setSavedViewsList(updated);
    onSavedViewsChange?.(updated);
  };

  const renderDataRow = (
    row: TData,
    index: number,
    rowOpts?: {
      pinnedVariant?: "top" | "bottom";
      treeNode?: TreeRowNode<TData>;
    },
  ): React.JSX.Element => {
    const pinnedVariant = rowOpts?.pinnedVariant;
    const treeNode = rowOpts?.treeNode;
    const id = treeNode ? treeNode.id : (pinnedVariant ? `${pinnedVariant}-${getRowId(row)}-${index}` : (pageRowIds[index] ?? getRowId(row)));
    const rawId = treeNode ? treeNode.id : getRowId(row);
    const isSelected = !pinnedVariant && (allAcrossSelected || selectedIds.has(rawId));
    const isExpanded = !pinnedVariant && expandedRows.has(rawId);
    const isRowEditing = !pinnedVariant && editingRowId === rawId;
    let firstEditableRendered = false;

    return (
      <React.Fragment key={id || index}>
        <tr
          draggable={enableRowReorder && !pinnedVariant}
          onDragStart={
            enableRowReorder && !pinnedVariant
              ? (ev) => {
                  draggedRowIdxRef.current = index;
                  ev.dataTransfer.effectAllowed = "move";
                  ev.dataTransfer.setData("text/plain", String(index));
                }
              : undefined
          }
          onDragOver={
            enableRowReorder && !pinnedVariant
              ? (ev) => {
                  ev.preventDefault();
                }
              : undefined
          }
          onDrop={
            enableRowReorder && !pinnedVariant
              ? (ev) => {
                  ev.preventDefault();
                  const fromIdx = draggedRowIdxRef.current;
                  draggedRowIdxRef.current = null;
                  if (fromIdx === null || fromIdx === index) return;
                  const nextList = reorderArrayItem(baseRows, fromIdx, index);
                  setReorderedRows(nextList);
                  onRowOrderChange?.({
                    fromIndex: fromIdx,
                    toIndex: index,
                    rows: nextList,
                  });
                }
              : undefined
          }
          className={[
            "tbx-row",
            isSelected ? "tbx-row--selected" : undefined,
            isExpanded ? "tbx-row--expanded" : undefined,
            isRowEditing ? "tbx-row--editing" : undefined,
            pinnedVariant === "top" ? "tbx-row--pinned-top" : undefined,
            pinnedVariant === "bottom" ? "tbx-row--pinned-bottom" : undefined,
            rowIsClickable ? "tbx-row--clickable" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={rowIsClickable ? activateRow(row) : undefined}
          onKeyDown={rowIsClickable ? rowKeyDown(row) : undefined}
          tabIndex={rowIsClickable ? 0 : undefined}
        >
          {enableRowReorder ? (
            <td
              className={[
                "tbx-td tbx-td--row-drag",
                leftOffsets.has("__row_drag") ? "tbx-td--pinned-left" : undefined,
                lastLeftPinnedId === "__row_drag" ? "tbx-pinned-border-left" : undefined,
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ width: "36px", left: leftOffsets.get("__row_drag") }}
              onClick={(ev) => ev.stopPropagation()}
            >
              {!pinnedVariant ? (
                <span className="tbx-row-drag-handle" aria-label="Drag to reorder row">
                  ⋮⋮
                </span>
              ) : null}
            </td>
          ) : null}

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
              {!pinnedVariant ? (
                <button
                  type="button"
                  className={isExpanded ? "tbx-expand-btn tbx-expand-btn--open" : "tbx-expand-btn"}
                  aria-label={isExpanded ? "Collapse row" : "Expand row"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpandRow(rawId);
                  }}
                >
                  <ChevronRightIcon className="tbx-icon" />
                </button>
              ) : null}
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
              {!pinnedVariant ? (
                <input
                  type={isSingleSelect ? "radio" : "checkbox"}
                  name={isSingleSelect ? `${instanceId}-select` : undefined}
                  className="tbx-checkbox"
                  checked={isSelected}
                  onChange={(ev) => toggleSelectRow(rawId, index, ev.currentTarget.checked)}
                  onClick={(event) => {
                    event.stopPropagation();
                    shiftClickRowRef.current = Boolean(event.shiftKey);
                  }}
                  aria-label={formatMessage(locale.selectRowLabel, { id: rawId })}
                />
              ) : null}
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
              {pinnedVariant ? "★" : serialNumber(currentPage, pageSize, index)}
            </td>
          ) : null}

          {visible.map((col, colIndex) => {
            const colId = getColumnId(col);
            const isPinnedLeft = leftOffsets.has(colId);
            const isPinnedRight = rightOffsets.has(colId);
            const isLastLeft = lastLeftPinnedId === colId;
            const isFirstRight = firstRightPinnedId === colId;
            const isCellEditable = !pinnedVariant && isEditable(col);
            const isRowEditCell = isRowEditing && isCellEditable;
            const showRowEditActions = isRowEditCell && !firstEditableRendered;
            if (showRowEditActions) firstEditableRendered = true;
            const isCurrentlyEditing =
              !isRowEditCell &&
              !pinnedVariant &&
              editingCell?.rowId === rawId &&
              editingCell?.columnId === colId;
            const isFocused =
              !pinnedVariant &&
              focusedCell?.rowIndex === index &&
              focusedCell?.colIndex === colIndex;
            const inRange =
              !pinnedVariant &&
              enableRangeSelection &&
              isCellInRange(index, colIndex, cellRange);
            const isDirty = !pinnedVariant && dirtyCells.has(`${rawId}::${colId}`);

            const tdStyle: React.CSSProperties = {
              ...bodyCellStyle(col),
              ...(isPinnedLeft ? { left: leftOffsets.get(colId) } : {}),
              ...(isPinnedRight ? { right: rightOffsets.get(colId) } : {}),
            };

            const cellBody = renderCellContent(col, row, boolLabels);
            const renderedContent =
              colIndex === 0 && treeNode ? (
                <div
                  className="tbx-tree-cell-wrap"
                  style={
                    treeNode.depth > 0
                      ? { paddingInlineStart: `${treeNode.depth * 18}px` }
                      : undefined
                  }
                >
                  {treeNode.hasChildren ? (
                    <button
                      type="button"
                      className={
                        treeNode.isExpanded
                          ? "tbx-tree-toggle tbx-tree-toggle--open"
                          : "tbx-tree-toggle"
                      }
                      aria-expanded={treeNode.isExpanded}
                      aria-label={treeNode.isExpanded ? "Collapse children" : "Expand children"}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggleTreeExpand(treeNode.id);
                      }}
                    >
                      <ChevronRightIcon className="tbx-icon" />
                    </button>
                  ) : (
                    <span className="tbx-tree-spacer" aria-hidden="true" />
                  )}
                  <span className="tbx-tree-label">{cellBody}</span>
                </div>
              ) : (
                cellBody
              );

            return (
              <td
                key={colId || `col-${colIndex}`}
                tabIndex={!pinnedVariant && enableKeyboardNavigation ? (isFocused ? 0 : -1) : undefined}
                data-tbx-focus={!pinnedVariant && enableKeyboardNavigation ? `cell:${index}:${colIndex}` : undefined}
                data-row-idx={!pinnedVariant ? index : undefined}
                data-col-idx={!pinnedVariant ? colIndex : undefined}
                className={[
                  "tbx-td",
                  isCellEditable ? "tbx-cell--editable" : undefined,
                  isDirty ? "tbx-td--dirty" : undefined,
                  isFocused ? "tbx-td--focused" : undefined,
                  inRange ? "tbx-td--in-range" : undefined,
                  isPinnedLeft ? "tbx-td--pinned-left" : undefined,
                  isPinnedRight ? "tbx-td--pinned-right" : undefined,
                  isLastLeft ? "tbx-pinned-border-left" : undefined,
                  isFirstRight ? "tbx-pinned-border-right" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={tdStyle}
                onPointerDown={
                  !pinnedVariant
                    ? (ev) => {
                        if (ev.button !== 0) return;
                        const t = ev.target as HTMLElement | null;
                        if (t?.closest("input, select, button, .tbx-fill-handle")) return;
                        const coord: CellCoord = { rowIndex: index, colIndex };
                        setFocusedCell(coord);
                        if (enableRangeSelection) {
                          if (ev.shiftKey && rangeAnchor) {
                            setCellRange(normalizeCellRange(rangeAnchor, coord));
                          } else {
                            setRangeAnchor(coord);
                            setCellRange(normalizeCellRange(coord, coord));
                            isDraggingRangeRef.current = true;
                          }
                        }
                      }
                    : undefined
                }
                onPointerEnter={
                  !pinnedVariant && enableRangeSelection
                    ? () => {
                        if (isDraggingRangeRef.current && rangeAnchor) {
                          setCellRange(normalizeCellRange(rangeAnchor, { rowIndex: index, colIndex }));
                        } else if (isFillingRangeRef.current) {
                          applyFillHandleToRow(index);
                        }
                      }
                    : undefined
                }
                onContextMenu={
                  !pinnedVariant && enableContextMenu
                    ? (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setContextMenu({
                          x: ev.clientX,
                          y: ev.clientY,
                          row,
                          col,
                          colId,
                        });
                      }
                    : undefined
                }
                onDoubleClick={
                  isCellEditable
                    ? (e) => {
                        e.stopPropagation();
                        if (editMode === "row") {
                          startRowEdit(row, rawId);
                        } else {
                          setCellValidationError(null);
                          setEditingCell({ rowId: rawId, columnId: colId });
                        }
                      }
                    : undefined
                }
              >
                {isRowEditCell ? (
                  (() => {
                    const editType = col.meta?.editType || "text";
                    const draftVal = colId in rowEditDraft ? rowEditDraft[colId] : getCellValue(col, row);
                    const onRowInputKey = (ev: React.KeyboardEvent) => {
                      if (ev.key === "Enter") {
                        ev.preventDefault();
                        commitRowEdit(row, rawId);
                      } else if (ev.key === "Escape") {
                        ev.preventDefault();
                        setEditingRowId(null);
                        setRowEditDraft({});
                        setCellValidationError(null);
                      }
                    };
                    return (
                      <div className="tbx-cell-edit-wrap" onClick={(ev) => ev.stopPropagation()}>
                        {editType === "select" && col.meta?.editOptions ? (
                          <select
                            className={`tbx-cell-edit-select tbx-cell-edit-input ${cellValidationError ? "tbx-cell-edit-input--invalid" : ""}`}
                            value={String(draftVal ?? "")}
                            onChange={(ev) =>
                              setRowEditDraft((prev) => ({ ...prev, [colId]: ev.target.value }))
                            }
                            onKeyDown={onRowInputKey}
                          >
                            {col.meta.editOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : editType === "boolean" ? (
                          <input
                            type="checkbox"
                            className="tbx-checkbox tbx-cell-edit-checkbox"
                            checked={Boolean(draftVal)}
                            onChange={(ev) =>
                              setRowEditDraft((prev) => ({ ...prev, [colId]: ev.target.checked }))
                            }
                            onKeyDown={onRowInputKey}
                          />
                        ) : (
                          <input
                            type={editType === "number" ? "number" : editType === "date" ? "date" : "text"}
                            className={`tbx-cell-edit-input ${cellValidationError ? "tbx-cell-edit-input--invalid" : ""}`}
                            value={
                              draftVal instanceof Date
                                ? draftVal.toISOString().slice(0, 10)
                                : String(draftVal ?? "")
                            }
                            onChange={(ev) =>
                              setRowEditDraft((prev) => ({ ...prev, [colId]: ev.target.value }))
                            }
                            onKeyDown={onRowInputKey}
                          />
                        )}
                        {showRowEditActions ? (
                          <>
                            <div className="tbx-cell-edit-actions">
                              <button
                                type="button"
                                className="tbx-cell-edit-btn tbx-cell-edit-btn--save"
                                aria-label={locale.saveRow}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  commitRowEdit(row, rawId);
                                }}
                              >
                                <CheckIcon className="tbx-icon" />
                              </button>
                              <button
                                type="button"
                                className="tbx-cell-edit-btn tbx-cell-edit-btn--cancel"
                                aria-label={locale.cancelRowEdit}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setEditingRowId(null);
                                  setRowEditDraft({});
                                  setCellValidationError(null);
                                }}
                              >
                                <XIcon className="tbx-icon" />
                              </button>
                            </div>
                            {cellValidationError ? (
                              <span className="tbx-cell-edit-error">{cellValidationError}</span>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    );
                  })()
                ) : isCurrentlyEditing ? (
                  (() => {
                    const currentCellVal = getCellValue(col, row);
                    const editType = col.meta?.editType || "text";
                    const defaultEditStr =
                      currentCellVal instanceof Date
                        ? currentCellVal.toISOString().slice(0, 10)
                        : currentCellVal !== null && currentCellVal !== undefined
                          ? String(currentCellVal)
                          : "";
                    const commitEdit = (rawInput: unknown) => {
                      const nextVal = coerceEditedValue(rawInput, col.meta?.editType);
                      const err = validateEditedCell(col, nextVal, row);
                      if (err) {
                        setCellValidationError(err);
                        return;
                      }
                      setCellValidationError(null);
                      writeMutatedRowValue(row, col, colId, nextVal);
                      if (currentCellVal !== nextVal) {
                        markDirtyCell(rawId, colId);
                      }
                      onCellEdit?.({
                        row,
                        columnId: colId,
                        oldValue: currentCellVal,
                        newValue: nextVal,
                      });
                      setEditingCell(null);
                    };
                    const handleEditKeyDown = (
                      e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
                    ) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const targetEl = e.currentTarget;
                        commitEdit(
                          editType === "boolean" && "checked" in targetEl
                            ? targetEl.checked
                            : targetEl.value,
                        );
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setCellValidationError(null);
                        setEditingCell(null);
                      }
                    };

                    return (
                      <div
                        className="tbx-cell-edit-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {editType === "select" && col.meta?.editOptions ? (
                          <select
                            autoFocus
                            ref={(node) => {
                              editInputRef.current = node;
                            }}
                            className={`tbx-cell-edit-select tbx-cell-edit-input ${cellValidationError ? "tbx-cell-edit-input--invalid" : ""}`}
                            defaultValue={defaultEditStr}
                            onKeyDown={handleEditKeyDown}
                          >
                            {col.meta.editOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : editType === "boolean" ? (
                          <input
                            autoFocus
                            ref={(node) => {
                              editInputRef.current = node;
                            }}
                            type="checkbox"
                            className="tbx-checkbox tbx-cell-edit-checkbox"
                            defaultChecked={Boolean(currentCellVal)}
                            onKeyDown={handleEditKeyDown}
                          />
                        ) : (
                          <input
                            autoFocus
                            ref={(node) => {
                              editInputRef.current = node;
                            }}
                            type={editType === "number" ? "number" : editType === "date" ? "date" : "text"}
                            className={`tbx-cell-edit-input ${cellValidationError ? "tbx-cell-edit-input--invalid" : ""}`}
                            defaultValue={defaultEditStr}
                            onKeyDown={handleEditKeyDown}
                          />
                        )}
                        <div className="tbx-cell-edit-actions">
                          <button
                            type="button"
                            className="tbx-cell-edit-btn tbx-cell-edit-btn--save"
                            aria-label="Save"
                            onClick={(e) => {
                              e.stopPropagation();
                              const ctrl = editInputRef.current;
                              if (ctrl) {
                                commitEdit(
                                  editType === "boolean" && "checked" in ctrl
                                    ? ctrl.checked
                                    : ctrl.value,
                                );
                              } else {
                                setEditingCell(null);
                              }
                            }}
                          >
                            <CheckIcon className="tbx-icon" />
                          </button>
                          <button
                            type="button"
                            className="tbx-cell-edit-btn tbx-cell-edit-btn--cancel"
                            aria-label="Cancel"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCellValidationError(null);
                              setEditingCell(null);
                            }}
                          >
                            <XIcon className="tbx-icon" />
                          </button>
                        </div>
                        {cellValidationError ? (
                          <span className="tbx-cell-edit-error">{cellValidationError}</span>
                        ) : null}
                      </div>
                    );
                  })()
                ) : (
                  renderedContent
                )}
                {inRange &&
                cellRange &&
                index === cellRange.maxRow &&
                colIndex === cellRange.maxCol ? (
                  <span
                    className="tbx-fill-handle"
                    aria-hidden="true"
                    onPointerDown={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      isFillingRangeRef.current = true;
                    }}
                  />
                ) : null}
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
  };

  return (
    <div
      className={rootClasses.join(" ")}
      data-density={density}
      ref={rootRef}
      onKeyDown={handleRootKeyDown}
      onPaste={handleRootPaste}
    >
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
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && searchText) {
                      event.preventDefault();
                      setSearchText("");
                    }
                  }}
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

          {/* Each trigger below carries an `aria-label` that repeats its visible
            label. That is not redundant: the label lives in a plain <span>, and
            hiding that span is the normal way to get an icon-only toolbar —
            the grid's own stylesheet does it under 640px. Without the label the
            button's accessible name would simply disappear at that breakpoint,
            leaving a screen reader with an unnamed control. The strings match
            the visible text exactly so voice control still matches on them. */}
          <div className="tbx-toolbar-group tbx-toolbar-group--end">
            {enableSavedViews ? (
              <div className="tbx-menu-wrap" ref={viewsMenu.containerRef}>
                <button
                  type="button"
                  id={viewsButtonId}
                  className="tbx-btn"
                  ref={viewsMenu.triggerRef}
                  aria-haspopup="menu"
                  aria-expanded={viewsMenu.isOpen}
                  aria-label={locale.viewsButton}
                  onClick={viewsMenu.toggle}
                >
                  <SlidersIcon className="tbx-icon" />
                  <span>{locale.viewsButton}</span>
                  <ChevronDownIcon className="tbx-icon tbx-chevron" />
                </button>
                {viewsMenu.isOpen ? (
                  <div
                    className="tbx-menu tbx-views-menu"
                    role="menu"
                    aria-labelledby={viewsButtonId}
                  >
                    <div className="tbx-views-save-row">
                      <input
                        type="text"
                        className="tbx-views-input"
                        placeholder={locale.viewNamePlaceholder}
                        aria-label={locale.viewNamePlaceholder}
                        value={newViewName}
                        onChange={(ev) => setNewViewName(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") {
                            ev.preventDefault();
                            saveCurrentPresetView();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="tbx-views-save-btn"
                        onClick={saveCurrentPresetView}
                      >
                        {locale.saveCurrentView}
                      </button>
                    </div>
                    <div className="tbx-menu-separator" />
                    {savedViewsList.length === 0 ? (
                      <div className="tbx-views-empty">{locale.noSavedViews}</div>
                    ) : (
                      savedViewsList.map((view) => (
                        <div key={view.id} className="tbx-views-item-row">
                          <button
                            type="button"
                            className="tbx-menu-item"
                            role="menuitem"
                            onClick={() => applySavedView(view)}
                          >
                            <span>{view.name}</span>
                          </button>
                          <button
                            type="button"
                            className="tbx-views-delete-btn"
                            aria-label={`Delete view ${view.name}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              deleteSavedView(view.id);
                            }}
                          >
                            <XIcon className="tbx-icon" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isColumnsVisible ? (
              <div className="tbx-menu-wrap" ref={columnsMenu.containerRef}>
                <button
                  type="button"
                  id={columnsButtonId}
                  className="tbx-btn"
                  ref={columnsMenu.triggerRef}
                  aria-haspopup="menu"
                  aria-expanded={columnsMenu.isOpen}
                  aria-label={locale.columnsButton}
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
                          <span>{locale.resetView}</span>
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
                  aria-label={formatMessage(locale.densityButton, { density })}
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
              resolvedExportMode === "excel" || resolvedExportMode === "csv" || resolvedExportMode === "pdf" ? (
                <button
                  type="button"
                  id={exportButtonId}
                  className="tbx-btn tbx-btn--export"
                  disabled={isExporting}
                  aria-label={
                    isExporting
                      ? locale.exportingButton
                      : resolvedExportMode === "excel"
                        ? (locale.exportExcelButton ?? "Export Excel")
                        : resolvedExportMode === "pdf"
                          ? (locale.exportPdfButton ?? "Export PDF")
                          : (locale.exportCsvButton ?? "Export CSV")
                  }
                  onClick={() => void handleExport(resolvedExportMode)}
                >
                  <DownloadTrayIcon className="tbx-icon" />
                  <span>
                    {isExporting
                      ? locale.exportingButton
                      : resolvedExportMode === "excel"
                        ? (locale.exportExcelButton ?? "Export Excel")
                        : resolvedExportMode === "pdf"
                          ? (locale.exportPdfButton ?? "Export PDF")
                          : (locale.exportCsvButton ?? "Export CSV")}
                  </span>
                </button>
              ) : resolvedExportMode === "split" ? (
                <div className="tbx-menu-wrap" ref={exportMenu.containerRef}>
                  <div className="tbx-split-btn">
                    <button
                      type="button"
                      id={exportButtonId}
                      className="tbx-btn tbx-btn--export"
                      disabled={isExporting}
                      aria-label={isExporting ? locale.exportingButton : (locale.exportExcelButton ?? "Export Excel")}
                      onClick={() => void handleExport("excel")}
                    >
                      <DownloadTrayIcon className="tbx-icon" />
                      <span>{isExporting ? locale.exportingButton : (locale.exportExcelButton ?? "Export Excel")}</span>
                    </button>
                    <button
                      type="button"
                      id={`${exportButtonId}-dropdown`}
                      className="tbx-btn tbx-btn--export"
                      ref={exportMenu.triggerRef}
                      disabled={isExporting}
                      aria-haspopup="menu"
                      aria-expanded={exportMenu.isOpen}
                      aria-label="More export options"
                      onClick={exportMenu.toggle}
                    >
                      <ChevronDownIcon className="tbx-icon tbx-chevron" />
                    </button>
                  </div>
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
                        onClick={() => void handleExport("pdf")}
                      >
                        <FileTextIcon className="tbx-icon--pdf" />
                        <div className="tbx-menu-item-title">
                          <strong>{locale.exportPdfTitle}</strong>
                          <small>{locale.exportPdfSubtitle}</small>
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
              ) : (
                <div className="tbx-menu-wrap" ref={exportMenu.containerRef}>
                  <button
                    type="button"
                    id={exportButtonId}
                    className="tbx-btn tbx-btn--export"
                    ref={exportMenu.triggerRef}
                    disabled={isExporting}
                    aria-haspopup="menu"
                    aria-expanded={exportMenu.isOpen}
                    aria-label={isExporting ? locale.exportingButton : locale.exportButton}
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
                        onClick={() => void handleExport("pdf")}
                      >
                        <FileTextIcon className="tbx-icon--pdf" />
                        <div className="tbx-menu-item-title">
                          <strong>{locale.exportPdfTitle}</strong>
                          <small>{locale.exportPdfSubtitle}</small>
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
              )
            ) : null}

            {toolbarActions}
          </div>
        </div>
      ) : null}

      {/* ── ACTIVE FILTER PILLS BAR ────────────────────────────────────────── */}
      {showFilterPills !== false &&
        (Boolean(query.q?.trim()) ||
          Object.keys(query.filter ?? {}).some((k) => Boolean(query.filter?.[k]?.trim()))) ? (
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
                onClick={() => {
                  setSearchText("");
                  onQueryChange(withSearch(query, ""));
                }}
              >
                ✕
              </button>
            </div>
          ) : null}
          {Object.entries(query.filter ?? {}).map(([key, val]) => {
            if (val === undefined || val.trim() === "") return null;
            const lowerKey = key.toLowerCase();
            const col = leafCols.find(
              (c) =>
                getColumnId(c).toLowerCase() === lowerKey ||
                getFilterField(c).toLowerCase() === lowerKey,
            );
            const title = col ? getColumnTitle(col) || key : key;
            return (
              <div key={key} className="tbx-filter-pill">
                <span className="tbx-filter-pill-label">{title}:</span>
                <span className="tbx-filter-pill-val">{formatFilterPillValue(String(val))}</span>
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
            onClick={() => {
              setSearchText("");
              onQueryChange({ ...query, page: 1, q: undefined, filter: undefined });
            }}
          >
            Clear all
          </button>
        </div>
      ) : null}

      {activeFilterPopoverCol ? (() => {
        const popId = getColumnId(activeFilterPopoverCol);
        const popSortField = getSortField(activeFilterPopoverCol);
        const popSortable = isSortable(activeFilterPopoverCol) && enableSorting !== false;
        const popSortDir =
          query.sort.find(
            (s) =>
              s.field.toLowerCase() === popSortField.toLowerCase() ||
              s.field.toLowerCase() === popId.toLowerCase(),
          )?.dir ?? null;
        const popFilterable = isFilterable(activeFilterPopoverCol, enableColumnFilters);
        const popPin = isPinned(activeFilterPopoverCol, pinnedCols);
        const popAccessKey =
          activeFilterPopoverCol.accessorKey !== undefined
            ? String(activeFilterPopoverCol.accessorKey)
            : "";
        const matchesPop = (g: string) =>
          g.toLowerCase() === popId.toLowerCase() ||
          (popAccessKey !== "" && g.toLowerCase() === popAccessKey.toLowerCase());
        const popIsGrouped = activeGroupBy.some(matchesPop);
        const popCanHide = isHideable(activeFilterPopoverCol) && isColumnsVisible && visible.length > 1;
        return (
          <ReactColumnFilterPopover
            key={`${popId}:${activeFilterPopoverVal ?? ""}:${activeGroupBy.join(",")}`}
            id={popId}
            col={activeFilterPopoverCol}
            meta={activeFilterPopoverCol.meta ?? {}}
            title={getColumnTitle(activeFilterPopoverCol) || popId}
            activeFilter={activeFilterPopoverVal}
            filterable={popFilterable}
            enableColumnMenu={enableColumnMenu !== false}
            sortable={popSortable}
            activeSortDir={popSortDir}
            currentPin={popPin}
            isGroupedByThis={popIsGrouped}
            hasActiveGrouping={activeGroupBy.length > 0}
            canHide={popCanHide}
            locale={locale}
            rootRef={rootRef}
            tableWrapRef={tableWrapRef}
            onApply={(val) => {
              const filterField = getFilterField(activeFilterPopoverCol);
              let nextQuery = withFilter(query, filterField, val);
              if (filterField !== popId && nextQuery.filter?.[popId] !== undefined) {
                nextQuery = withFilter(nextQuery, popId, undefined);
              }
              onQueryChange(nextQuery);
            }}
            onSortDir={(dir) => {
              if (dir === null) {
                onQueryChange({ ...query, sort: [], page: 1 });
              } else {
                onQueryChange(withSort(query, popSortField, dir));
              }
            }}
            onPin={(side) => {
              setPinnedCols((prev) => ({ ...prev, [popId]: side }));
            }}
            onGroupBy={(nextGroupCol) => {
              const nextArr = nextGroupCol === undefined ? activeGroupBy.filter((g) => !matchesPop(g)) : [nextGroupCol];
              setActiveGroupBy(nextArr);
              setCollapsedGroups(new Set());
              onGroupByChange?.(nextArr[0], nextArr);
            }}
            onAddGroupBy={(colToAdd) => {
              const nextArr = [...activeGroupBy, colToAdd];
              setActiveGroupBy(nextArr);
              setCollapsedGroups(new Set());
              onGroupByChange?.(nextArr[0], nextArr);
            }}
            onHide={() => {
              setHiddenCols((prev) => ({ ...prev, [popId]: true }));
            }}
            onClose={() => setOpenFilterCol(null)}
          />
        );
      })() : null}

      {/* ── SELECT ALL ACROSS PAGES BANNER ──────────────────────────────── */}
      {enableSelection &&
        !isSingleSelect &&
        !isLoading &&
        pageRowIds.length > 0 &&
        ((allPageSelected && total > pageRowIds.length) || allAcrossSelected) ? (
        <div className="tbx-select-all-banner" role="status" aria-live="polite">
          {allAcrossSelected ? (
            <>
              <span className="tbx-select-all-banner-text">
                {formatMessage(locale.allAcrossPagesSelected, {
                  total: total.toLocaleString(),
                })}
              </span>
              <button
                type="button"
                className="tbx-select-all-banner-btn"
                onClick={deselectAll}
              >
                {locale.clearSelection}
              </button>
            </>
          ) : (
            <>
              <span className="tbx-select-all-banner-text">
                All <strong>{pageRowIds.length.toLocaleString()}</strong> records on this page are selected.
              </span>
              <button
                type="button"
                className="tbx-select-all-banner-btn"
                onClick={selectAllAcrossPages}
              >
                {formatMessage(locale.selectAllAcrossPages, {
                  total: total.toLocaleString(),
                })}
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* ── TABLE (>= 768px) ─────────────────────────────────────────────── */}
      <div
        ref={tableWrapRef}
        className={
          enableVirtualization ? "tbx-table-wrap tbx-table-wrap--virtual" : "tbx-table-wrap"
        }
        style={enableVirtualization ? { maxHeight: `${virtualHeight}px` } : undefined}
        onScroll={(e) => {
          if (contextMenu) setContextMenu(null);
          if (enableVirtualization) {
            setVirtualScrollTop(e.currentTarget.scrollTop);
          }
          if (isInfiniteMode && hasMore && !isLoading && !isLoadingMore) {
            const el = e.currentTarget;
            const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
            if (remaining <= 120) {
              onLoadMore?.(nextCursor);
            }
          }
        }}
      >
        <table className="tbx-table" aria-label={caption}>
          <thead>
            <tr>
              {enableRowReorder ? (
                <th
                  rowSpan={headerRows.hasGroups ? 2 : undefined}
                  className={[
                    "tbx-th tbx-th--row-drag",
                    leftOffsets.has("__row_drag") ? "tbx-th--pinned-left" : undefined,
                    lastLeftPinnedId === "__row_drag" ? "tbx-pinned-border-left" : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    width: "36px",
                    left: leftOffsets.get("__row_drag"),
                  }}
                  scope="col"
                  aria-label="Row reorder"
                />
              ) : null}

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
            ) : rows.length === 0 && (pinnedTopRows?.length ?? 0) === 0 && (pinnedBottomRows?.length ?? 0) === 0 ? (
              <tr>
                <td className="tbx-state" colSpan={Math.max(1, columnCount)}>
                  {locale.emptyText}
                </td>
              </tr>
            ) : (
              <>
                {pinnedTopRows?.map((topRow, topIdx) =>
                  renderDataRow(topRow, topIdx, { pinnedVariant: "top" }),
                )}
                {virtualWin && virtualWin.topSpacerHeight > 0 ? (
                  <tr className="tbx-virtual-spacer" aria-hidden="true">
                    <td
                      colSpan={Math.max(1, columnCount)}
                      style={{ height: `${virtualWin.topSpacerHeight}px` }}
                    />
                  </tr>
                ) : null}
                {treeNodes
                  ? treeNodes.map((node, idx) => renderDataRow(node.row, idx, { treeNode: node }))
                  : nestedGroupItems
                    ? nestedGroupItems.map((item) => {
                        if (item.kind === "row") {
                          return renderDataRow(item.row, item.originalIndex);
                        }
                        const isCollapsed = item.collapsed;
                        return (
                          <tr
                            key={`grp-row-${item.key}`}
                            className="tbx-group-row"
                            data-group-key={item.key}
                            data-group-depth={item.depth}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggleGroupCollapse(item.key);
                            }}
                          >
                            <td
                              className="tbx-group-cell"
                              colSpan={Math.max(1, columnCount)}
                              style={
                                item.depth > 0
                                  ? { paddingInlineStart: `${14 + item.depth * 18}px` }
                                  : undefined
                              }
                            >
                              <div className="tbx-group-inner">
                                <button
                                  type="button"
                                  className={
                                    isCollapsed
                                      ? "tbx-group-toggle"
                                      : "tbx-group-toggle tbx-group-toggle--open"
                                  }
                                  aria-expanded={!isCollapsed}
                                  aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${item.displayValue}`}
                                >
                                  <ChevronRightIcon className="tbx-icon" />
                                </button>
                                <span className="tbx-group-label">{item.columnTitle}:</span>
                                <strong className="tbx-group-value">{item.displayValue}</strong>
                                <span className="tbx-group-count">{item.count.toLocaleString()}</span>
                                {item.summaries.length > 0 ? (
                                  <span className="tbx-group-summaries">
                                    {item.summaries.map((s) => (
                                      <span key={s.columnId} className="tbx-group-summary-chip">
                                        <span>{s.label}</span>
                                        <strong>{s.value}</strong>
                                      </span>
                                    ))}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    : renderedRows.map((row, sliceIdx) =>
                        renderDataRow(row, virtualStartOffset + sliceIdx),
                      )}
                {virtualWin && virtualWin.bottomSpacerHeight > 0 ? (
                  <tr className="tbx-virtual-spacer" aria-hidden="true">
                    <td
                      colSpan={Math.max(1, columnCount)}
                      style={{ height: `${virtualWin.bottomSpacerHeight}px` }}
                    />
                  </tr>
                ) : null}
                {pinnedBottomRows?.map((botRow, botIdx) =>
                  renderDataRow(botRow, botIdx, { pinnedVariant: "bottom" }),
                )}
              </>
            )}
          </tbody>

          {!isLoading && hasSummary && rows.length > 0 ? (
            <tfoot>
              <tr className="tbx-summary-row">
                {enableRowReorder ? (
                  <td
                    className={[
                      "tbx-summary-cell",
                      leftOffsets.has("__row_drag") ? "tbx-td--pinned-left" : undefined,
                      lastLeftPinnedId === "__row_drag" ? "tbx-pinned-border-left" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ width: "36px", left: leftOffsets.get("__row_drag") }}
                  />
                ) : null}

                {renderExpandedRow ? (
                  <td
                    className={[
                      "tbx-summary-cell",
                      leftOffsets.has("__expand") ? "tbx-td--pinned-left" : undefined,
                      lastLeftPinnedId === "__expand" ? "tbx-pinned-border-left" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      width: "40px",
                      left: leftOffsets.get("__expand"),
                    }}
                  />
                ) : null}

                {enableSelection ? (
                  <td
                    className={[
                      "tbx-summary-cell tbx-summary-cell--select",
                      leftOffsets.has("__select") ? "tbx-td--pinned-left" : undefined,
                      lastLeftPinnedId === "__select" ? "tbx-pinned-border-left" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: leftOffsets.get("__select"),
                    }}
                  />
                ) : null}

                {showSerialNumber ? (
                  <td
                    className={[
                      "tbx-summary-cell tbx-summary-cell--serial",
                      leftOffsets.has("__serial") ? "tbx-td--pinned-left" : undefined,
                      lastLeftPinnedId === "__serial" ? "tbx-pinned-border-left" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: leftOffsets.get("__serial"),
                    }}
                  />
                ) : null}

                {visible.map((col, colIndex) => {
                  const colId = getColumnId(col);
                  const aggVal = computeAggregation(col, rows);
                  const aggLabel =
                    col.meta?.aggregationLabel ||
                    (typeof col.meta?.aggregation === "string" ? `${col.meta.aggregation}:` : "");
                  return (
                    <td
                      key={`sum-${colId || colIndex}`}
                      className={[
                        "tbx-summary-cell",
                        leftOffsets.has(colId) ? "tbx-td--pinned-left" : undefined,
                        rightOffsets.has(colId) ? "tbx-td--pinned-right" : undefined,
                        lastLeftPinnedId === colId ? "tbx-pinned-border-left" : undefined,
                        firstRightPinnedId === colId ? "tbx-pinned-border-right" : undefined,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        textAlign: col.meta?.align ?? "left",
                        ...(leftOffsets.has(colId) ? { left: leftOffsets.get(colId) } : {}),
                        ...(rightOffsets.has(colId) ? { right: rightOffsets.get(colId) } : {}),
                      }}
                    >
                      {aggVal !== null && aggVal !== undefined ? (
                        <>
                          {aggLabel ? <span className="tbx-summary-label">{aggLabel} </span> : null}
                          <strong>{String(aggVal)}</strong>
                        </>
                      ) : colIndex === 0 && !aggLabel ? (
                        <strong>Total</strong>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {isInfiniteMode && (hasMore || isLoadingMore) ? (
        <div className="tbx-infinite-footer">
          <button
            type="button"
            className="tbx-load-more-btn"
            disabled={isLoadingMore}
            onClick={() => {
              if (!isLoadingMore && hasMore) {
                onLoadMore?.(nextCursor);
              }
            }}
          >
            {isLoadingMore ? locale.loadingMoreText : locale.loadMoreButton}
          </button>
        </div>
      ) : null}

      {contextMenu ? (() => {
        const ctxVal = getCellValue(contextMenu.col, contextMenu.row);
        const ctxText = getCellText(ctxVal, boolLabels);
        const customItems: readonly ContextMenuItem[] =
          contextMenuItems?.({
            row: contextMenu.row,
            columnId: contextMenu.colId,
            value: ctxVal,
          }) ?? [];
        const currentPin = isPinned(contextMenu.col, pinnedCols);
        const winW = typeof window !== "undefined" ? (window.innerWidth || 1024) : 1024;
        const winH = typeof window !== "undefined" ? (window.innerHeight || 800) : 800;
        const left = Math.min(Math.max(8, contextMenu.x), Math.max(8, winW - 210));
        const top = Math.min(Math.max(8, contextMenu.y), Math.max(8, winH - 240));

        return (
          <div
            className="tbx-context-menu"
            role="menu"
            style={{ position: "fixed", left: `${left}px`, top: `${top}px` }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <button
              type="button"
              className="tbx-context-menu-item"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard?.writeText?.(ctxText);
                setContextMenu(null);
              }}
            >
              {locale.copyCell}
            </button>
            <button
              type="button"
              className="tbx-context-menu-item"
              role="menuitem"
              onClick={() => {
                const line = visible
                  .map((c) => getCellText(getCellValue(c, contextMenu.row), boolLabels).replace(/\t|\r|\n/g, " "))
                  .join("\t");
                void navigator.clipboard?.writeText?.(line);
                setContextMenu(null);
              }}
            >
              {locale.copyRow}
            </button>
            {ctxText !== "" && isFilterable(contextMenu.col, enableColumnFilters) ? (
              <button
                type="button"
                className="tbx-context-menu-item"
                role="menuitem"
                onClick={() => {
                  onQueryChange(withFilter(query, getFilterField(contextMenu.col), ctxText));
                  setContextMenu(null);
                }}
              >
                {formatMessage(locale.filterByValue, {
                  value: ctxText.length > 24 ? `${ctxText.slice(0, 24)}…` : ctxText,
                })}
              </button>
            ) : null}
            {!isStructuralColumn(contextMenu.col) && contextMenu.colId !== "" ? (
              <>
                <div className="tbx-context-menu-sep" />
                <button
                  type="button"
                  className="tbx-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    const nextSide =
                      currentPin === "left" || currentPin === "right" ? "none" : "left";
                    setPinnedCols((prev) => ({ ...prev, [contextMenu.colId]: nextSide }));
                    setContextMenu(null);
                  }}
                >
                  {currentPin === "left" || currentPin === "right"
                    ? locale.unpinColumn
                    : locale.pinLeft}
                </button>
                {isHideable(contextMenu.col) && visible.length > 1 ? (
                  <button
                    type="button"
                    className="tbx-context-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setHiddenCols((prev) => ({ ...prev, [contextMenu.colId]: true }));
                      setContextMenu(null);
                    }}
                  >
                    {locale.hideColumn}
                  </button>
                ) : null}
              </>
            ) : null}
            {customItems.length > 0 ? (
              <>
                <div className="tbx-context-menu-sep" />
                {customItems.map((item) => (
                  <React.Fragment key={item.id}>
                    {item.separatorBefore ? <div className="tbx-context-menu-sep" /> : null}
                    <button
                      type="button"
                      className={`tbx-context-menu-item ${item.danger ? "tbx-context-menu-item--danger" : ""}`}
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        setContextMenu(null);
                        item.onSelect();
                      }}
                    >
                      {item.label}
                    </button>
                  </React.Fragment>
                ))}
              </>
            ) : null}
          </div>
        );
      })() : null}

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
          renderedRows.map((row, sliceIdx) => {
            const index = virtualStartOffset + sliceIdx;
            const id = pageRowIds[index] ?? String(index);
            const isSelected = allAcrossSelected || selectedIds.has(id);

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
                          type={isSingleSelect ? "radio" : "checkbox"}
                          name={isSingleSelect ? `${instanceId}-card-select` : undefined}
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

      {/* ── BULK ACTIONS FLOATING BAR ───────────────────────────────────── */}
      {enableSelection && enableBulkActions !== false && effectiveSelectedCount > 0 ? (
        <div className="tbx-bulk-bar" role="region" aria-label="Bulk actions">
          <span className="tbx-bulk-badge">
            {formatMessage(locale.selectedBadge, { count: effectiveSelectedCount.toLocaleString() })}
          </span>
          <div className="tbx-bulk-actions">
            {isExportVisible ? (
              <>
                <button
                  type="button"
                  className="tbx-bulk-btn"
                  disabled={isExporting}
                  onClick={() => void handleBulkExport("excel")}
                >
                  <FileSpreadsheetIcon className="tbx-icon--excel" />
                  <span>{locale.exportExcelButton ?? "Export Excel"}</span>
                </button>
                <button
                  type="button"
                  className="tbx-bulk-btn"
                  disabled={isExporting}
                  onClick={() => void handleBulkExport("csv")}
                >
                  <FileTextIcon className="tbx-icon--csv" />
                  <span>{locale.exportCsvButton ?? "Export CSV"}</span>
                </button>
                <button
                  type="button"
                  className="tbx-bulk-btn"
                  disabled={isExporting}
                  onClick={() => void handleBulkExport("pdf")}
                >
                  <FileTextIcon className="tbx-icon--pdf" />
                  <span>{locale.exportPdfButton ?? "Export PDF"}</span>
                </button>
              </>
            ) : null}
            {bulkActions ? bulkActions(Array.from(selectedIds), deselectAll) : null}
          </div>
          <button
            type="button"
            className="tbx-bulk-btn tbx-bulk-btn--close"
            aria-label="Deselect all"
            onClick={deselectAll}
          >
            <XIcon className="tbx-icon" />
          </button>
        </div>
      ) : null}

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
            {effectiveSelectedCount > 0 ? (
              <span className="tbx-selected-badge">
                {formatMessage(locale.selectedBadge, { count: effectiveSelectedCount.toLocaleString() })}
              </span>
            ) : null}
            {rangeStats && rangeStats.cellCount > 1 ? (
              <span className="tbx-range-stats-badge">
                {[
                  `Count: ${rangeStats.cellCount}`,
                  ...(rangeStats.numericCount > 0 && rangeStats.sum !== null && rangeStats.avg !== null
                    ? [
                        `Sum: ${Number(rangeStats.sum.toFixed(2)).toLocaleString()}`,
                        `Avg: ${Number(rangeStats.avg.toFixed(2)).toLocaleString()}`,
                      ]
                    : []),
                ].join(" · ")}
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onQueryChange(withPage(query, currentPage - 1, totalPages));
                  }}
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
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onQueryChange(withPage(query, item, totalPages));
                      }}
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onQueryChange(withPage(query, currentPage + 1, totalPages));
                  }}
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
