// @nexgrid/react — public surface.
//
// The engine lives in `@nexgrid/core`. The handful of core exports re-exported
// below are the ones a HOST needs in order to drive a controlled grid — build a
// starting query, read it out of a URL, move a page — so an app can integrate
// TableX without a second install and without learning the package split. The
// rest of core (export writers, column helpers, locale internals) stays where
// it is; import `@nexgrid/core` directly if you need it.

export { TableX, NexGrid } from "./table-x.js";

export type {
  TableXProps,
  TableXReactColumn,
  TableXNotice,
  TableXNoticeType,
  TableXTheme,
  NexGridProps,
  NexGridReactColumn,
  NexGridNotice,
  NexGridNoticeType,
  NexGridTheme,
} from "./types.js";

/** Column definitions render `React.ReactNode`; see {@link TableXReactColumn}. */
export type {
  TableXColumn,
  TableXColumnMeta,
  TableXCellContext,
  TableXLocale,
  NexGridColumn,
  NexGridColumnMeta,
  NexGridCellContext,
  NexGridLocale,
  QueryState,
  SortSpec,
  SortDir,
  PageSize,
  PagedResponse,
  Density,
  ExcelBadgeRule,
  // Named so a host can type its own `onExportAll` handler.
  ExportFormat,
  NexGridExportFormat,
} from "@nexgrid/core";

export { useClientTableX, useClientNexGrid } from "./use-client-table-x.js";
export type { UseClientTableXOptions, UseClientNexGridOptions } from "./use-client-table-x.js";

export {
  // In-memory client-side data querying
  queryClientData,
  groupRows,
  matchesFilterValue,
  compareValues,
  getSortField,
  getFilterField,
  isMultiSelectFilter,
  parseMultiFilterValues,
  serializeMultiFilterValues,
  formatFilterPillValue,
  // Building and reading a query (REST & OData v4)
  defaultQuery,
  parseQuery,
  serializeQuery,
  buildQueryUrl,
  toODataParams,
  buildODataUrl,
  fromODataResponse,
  primarySort,

  // Query reducers — the only supported way to mutate a QueryState
  withToggledSort,
  withToggledMultiSort,
  withSort,
  withSearch,
  withPage,
  withPageSize,
  withFilter,
  // Pagination math
  totalPagesFor,
  isPageSize,
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  computeVirtualWindow,
  DEFAULT_VIRTUAL_HEIGHT,
  DEFAULT_VIRTUAL_OVERSCAN,
  // Localization
  DEFAULT_LOCALE,
  resolveLocale,
  // Native .xlsx & .pdf export
  toXlsxBytes,
  downloadXlsx,
  toPdfBytes,
  downloadPdf,
  // Tree data, nested grouping, saved views, range selection & validation
  flattenTreeRows,
  collectInitialExpandedTreeIds,
  normalizeGroupBy,
  buildNestedGroupItems,
  loadSavedViews,
  writeSavedViews,
  upsertSavedView,
  removeSavedView,
  normalizeCellRange,
  isCellInRange,
  computeRangeStats,
  formatRangeTsv,
  parseClipboardTsv,
  moveFocusCoord,
  selectContiguousRowIds,
  reorderArrayItem,
  coerceEditedValue,
  validateEditedCell,
} from "@nexgrid/core";
export type {
  ClientQueryOptions,
  FilterMatchOptions,
  RowGroup,
  RowGroupEntry,
  RowGroupSummary,
  NestedGroupRenderItem,
  TreeRowNode,
  FlattenTreeOptions,
  SavedGridView,
  CellCoord,
  NormalizedCellRange,
  RangeAggregationStats,
  EditMode,
  ContextMenuItem,
  RowEditEvent,
  RowOrderChangeEvent,
  VirtualWindow,
  VirtualWindowInput,
} from "@nexgrid/core";
