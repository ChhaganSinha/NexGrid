// @nexgrid/angular — the public surface of the Angular adapter.
export { TableXComponent, NexGridComponent } from "./lib/table-x.component";
export { TableXCellDirective, NexGridCellDirective } from "./lib/table-x-cell.directive";
export { TableXToolbarDirective, NexGridToolbarDirective } from "./lib/table-x-toolbar.directive";

export type {
  TableXAngularColumn,
  TableXCellTemplateContext,
  TableXNotice,
  TableXSelectionChange,
  TableXTheme,
  NexGridAngularColumn,
  NexGridCellTemplateContext,
  NexGridNotice,
  NexGridSelectionChange,
  NexGridTheme,
} from "./lib/types";

export type {
  TableXCellView,
  TableXColumnToggle,
  TableXDensityOption,
  TableXHeaderView,
  TableXPagerItem,
  TableXRangePart,
  TableXRowView,
} from "./lib/view-model";

// Re-exported from the engine for convenience.
export {
  PAGE_SIZES,
  buildQueryUrl,
  compareValues,
  defaultQuery,
  matchesFilterValue,
  parseQuery,
  primarySort,
  queryClientData,
  serializeQuery,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withSort,
  withToggledSort,
  withToggledMultiSort,
} from "@nexgrid/core";
export type {
  ClientQueryOptions,
  FilterMatchOptions,
  Density,
  ExcelBadgeRule,
  TableXColumn,
  TableXColumnMeta,
  TableXLocale,
  NexGridColumn,
  NexGridColumnMeta,
  NexGridLocale,
  PageSize,
  PagedResponse,
  QueryState,
  SortDir,
  SortSpec,
} from "@nexgrid/core";
