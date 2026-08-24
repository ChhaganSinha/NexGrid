// @nexgrid/vanilla — the zero-dependency DOM renderer for NexGrid.
//
// This barrel is also the surface of the IIFE browser bundle (global
// `NexGrid`), where a consumer has no module system and therefore no other way
// to reach the engine. That is why a curated slice of `@nexgrid/core` is
// re-exported here rather than left to a second import: a `<script>`-tag or
// ASP.NET page needs `defaultQuery()`, `parseQuery()` and `PAGE_SIZES` just to
// wire the grid to its address bar, and asking it to load core separately would
// defeat the point of a single-file bundle.

export { createNexGrid } from "./grid.js";

export type {
  NexGridHandle,
  NexGridNode,
  NexGridNotice,
  NexGridNoticeType,
  NexGridOptions,
  NexGridTheme,
  NexGridUpdate,
  NexGridVanillaColumn,
} from "./types.js";

// Element helpers, exported so custom cell renderers in plain JS can build
// nodes without hand-rolling `createElement` (and without reaching for
// `innerHTML`, which is the failure mode this package is built to avoid).
export { el, svgEl, append, replaceChildren } from "./dom.js";
export type { ElementChild, ElementProps } from "./dom.js";

// The icon set, so toolbar actions and custom cells can match the grid's look.
export {
  arrowDownIcon,
  arrowUpDownIcon,
  arrowUpIcon,
  checkIcon,
  chevronLeftIcon,
  chevronRightIcon,
  downloadIcon,
  fileSpreadsheetIcon,
  fileTextIcon,
  filterIcon,
  searchIcon,
  slidersIcon,
  xIcon,
} from "./icons.js";

// ---- Re-exported engine (see the note above) ------------------------------

export {
  DEFAULT_BADGE_RULES,
  DEFAULT_LOCALE,
  DEFAULT_PAGE_SIZE,
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
  isPageSize,
  parseQuery,
  primarySort,
  resolveLocale,
  serialNumber,
  serializeQuery,
  timestampedFilename,
  toSearchParams,
  totalPagesFor,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withSort,
  withToggledSort,
} from "@nexgrid/core";

export type {
  Density,
  ExcelBadgeRule,
  NexGridCellContext,
  NexGridColumn,
  NexGridColumnMeta,
  NexGridLocale,
  PageItem,
  PageSize,
  PagedResponse,
  QueryState,
  RecordRange,
  SortDir,
  SortSpec,
} from "@nexgrid/core";
