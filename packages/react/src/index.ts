// @tablex/react — public surface.
//
// The engine lives in `@tablex/core`. The handful of core exports re-exported
// below are the ones a HOST needs in order to drive a controlled grid — build a
// starting query, read it out of a URL, move a page — so an app can integrate
// TableX without a second install and without learning the package split. The
// rest of core (export writers, column helpers, locale internals) stays where
// it is; import `@tablex/core` directly if you need it.

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
} from "@tablex/core";

export { useClientTableX, useClientNexGrid } from "./use-client-table-x.js";
export type { UseClientTableXOptions, UseClientNexGridOptions } from "./use-client-table-x.js";

export {
  // In-memory client-side data querying
  queryClientData,
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
  // Localization
  DEFAULT_LOCALE,
  resolveLocale,
} from "@tablex/core";
export type { ClientQueryOptions } from "@tablex/core";
