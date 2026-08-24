// @nexgrid/angular — the public surface of the Angular adapter.
//
// The engine lives in @nexgrid/core. The handful of core symbols re-exported
// below are the ones a host touches on day one (building the initial query and
// the fetch URL); everything else — reducers, export helpers, locale — is
// imported from `@nexgrid/core` directly.

// The three symbols are exported individually rather than bundled into a
// convenience array: a `const` array crossing a library boundary reaches the
// consumer as a bare `.d.ts` declaration with no initializer, and their
// compiler cannot see through it (`NG1010: 'imports' must be an array of
// components, directives, pipes, or NgModules`). Import what you use.
export { NexGridComponent } from "./lib/nex-grid.component";
export { NexGridCellDirective } from "./lib/nex-grid-cell.directive";
export { NexGridToolbarDirective } from "./lib/nex-grid-toolbar.directive";

export type {
  NexGridAngularColumn,
  NexGridCellTemplateContext,
  NexGridNotice,
  NexGridSelectionChange,
  NexGridTheme,
} from "./lib/types";

export type {
  NexGridCellView,
  NexGridColumnToggle,
  NexGridDensityOption,
  NexGridHeaderView,
  NexGridPagerItem,
  NexGridRangePart,
  NexGridRowView,
} from "./lib/view-model";

// Re-exported from the engine for convenience.
export {
  PAGE_SIZES,
  buildQueryUrl,
  defaultQuery,
  parseQuery,
  queryClientData,
  serializeQuery,
} from "@nexgrid/core";
export type {
  ClientQueryOptions,
  Density,
  ExcelBadgeRule,
  NexGridColumn,
  NexGridColumnMeta,
  NexGridLocale,
  PageSize,
  PagedResponse,
  QueryState,
  SortDir,
  SortSpec,
} from "@nexgrid/core";

