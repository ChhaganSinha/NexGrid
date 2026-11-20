// @nexgrid/angular — the public surface of the Angular adapter.
export { TableXComponent, NexGridComponent } from "./lib/table-x.component";
export { TableXCellDirective, NexGridCellDirective } from "./lib/table-x-cell.directive";
export { TableXToolbarDirective, NexGridToolbarDirective } from "./lib/table-x-toolbar.directive";
export {
  TableXExpandedRowDirective,
  NexGridExpandedRowDirective,
} from "./lib/table-x-expanded-row.directive";
export {
  TableXBulkActionsDirective,
  NexGridBulkActionsDirective,
} from "./lib/table-x-bulk-actions.directive";

export type {
  TableXAngularColumn,
  TableXBulkActionsTemplateContext,
  TableXCellEditEvent,
  TableXCellTemplateContext,
  TableXExpandedRowTemplateContext,
  TableXNotice,
  TableXSelectionChange,
  TableXTheme,
  NexGridAngularColumn,
  NexGridBulkActionsTemplateContext,
  NexGridCellEditEvent,
  NexGridCellTemplateContext,
  NexGridExpandedRowTemplateContext,
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
  TableXSummaryCellView,
  NexGridCellView,
  NexGridColumnToggle,
  NexGridDensityOption,
  NexGridHeaderView,
  NexGridPagerItem,
  NexGridRangePart,
  NexGridRowView,
  NexGridSummaryCellView,
} from "./lib/view-model";

// Re-exported from the engine for convenience.
export {
  PAGE_SIZES,
  buildQueryUrl,
  compareValues,
  computeAggregation,
  defaultQuery,
  isEditable,
  isPinned,
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
