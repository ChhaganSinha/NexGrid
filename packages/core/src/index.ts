// @tablex/core — the framework-agnostic engine behind every TableX adapter.

// Server contract
export {
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  DENSITY_ROW_HEIGHT,
  DENSITIES,
  isPageSize,
} from "./types.js";
export type {
  PageSize,
  SortDir,
  SortSpec,
  QueryState,
  PagedResponse,
  Density,
  SelectionMode,
} from "./types.js";

// Column model
export {
  STRUCTURAL_COLUMN_IDS,
  getColumnId,
  getColumnTitle,
  getCellValue,
  getCellText,
  isSortable,
  isFilterable,
  isHideable,
  isExportable,
  isStructuralColumn,
  initialHiddenColumns,
  visibleColumns,
} from "./column.js";
export type {
  TableXColumn,
  TableXColumnMeta,
  TableXCellContext,
  NexGridColumn,
  NexGridColumnMeta,
  NexGridCellContext,
} from "./column.js";

// Query reducers and client-side dataset querying
export {
  defaultQuery,
  primarySort,
  withToggledSort,
  withToggledMultiSort,
  withSort,
  withSearch,
  withPage,
  withPageSize,
  withFilter,
  totalPagesFor,
} from "./query.js";
export { queryClientData } from "./client-query.js";
export type { ClientQueryOptions } from "./client-query.js";

// Pagination presentation
export { getPageNumbers, getRecordRange, serialNumber } from "./pagination.js";
export type { PageItem, RecordRange } from "./pagination.js";

// Wire format (REST & OData v4)
export { toSearchParams, serializeQuery, parseQuery, buildQueryUrl } from "./serialize.js";
export { toODataParams, buildODataUrl, fromODataResponse } from "./odata.js";
export type { ODataQueryOptions, ODataResponse } from "./odata.js";

// Full-dataset collection
export { fetchAllPages, MAX_PAGE_SIZE, DEFAULT_ROW_CAP } from "./fetch-all-pages.js";
export type { AllPages } from "./fetch-all-pages.js";

// Export engine
export { toExportColumns } from "./export/columns.js";
export type { ExportColumn } from "./export/columns.js";
export { toCsv, downloadCsv } from "./export/csv.js";
export { toTsv, copyToClipboard } from "./export/clipboard.js";
export {
  toExcelHtml,
  downloadExcel,
  DEFAULT_BADGE_RULES,
} from "./export/excel.js";
export type { ExcelBadgeRule, ExcelExportOptions } from "./export/excel.js";
export {
  downloadBlob,
  timestampedFilename,
  filePrefixFromCaption,
} from "./export/download.js";

// Locale
export { DEFAULT_LOCALE, resolveLocale, formatMessage } from "./i18n.js";
export type { TableXLocale, NexGridLocale } from "./i18n.js";
