// @nexgrid/react — public surface.
//
// The engine lives in `@nexgrid/core`. The handful of core exports re-exported
// below are the ones a HOST needs in order to drive a controlled grid — build a
// starting query, read it out of a URL, move a page — so an app can integrate
// NexGrid without a second install and without learning the package split. The
// rest of core (export writers, column helpers, locale internals) stays where
// it is; import `@nexgrid/core` directly if you need it.

export { NexGrid } from "./nex-grid.js";

export type {
  NexGridProps,
  NexGridReactColumn,
  NexGridNotice,
  NexGridNoticeType,
  NexGridTheme,
} from "./types.js";

/** Column definitions render `React.ReactNode`; see {@link NexGridReactColumn}. */
export type {
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
} from "@nexgrid/core";

export { useClientNexGrid } from "./use-client-nex-grid.js";
export type { UseClientNexGridOptions } from "./use-client-nex-grid.js";

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
} from "@nexgrid/core";
export type { ClientQueryOptions } from "@nexgrid/core";

