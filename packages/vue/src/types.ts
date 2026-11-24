import type { VNodeChild } from "vue";
import type {
  ContextMenuItem,
  Density,
  EditMode,
  ExcelBadgeRule,
  ExportFormat,
  PagedResponse,
  RowEditEvent,
  RowOrderChangeEvent,
  SavedGridView,
  TableXColumn as TableXCoreColumn,
  TableXLocale,
  QueryState,
} from "@nexgrid/core";

/** A column definition bound to Vue's VNode render type. */
export type TableXVueColumn<TData> = TableXCoreColumn<TData, VNodeChild>;
export type NexGridVueColumn<TData> = TableXVueColumn<TData>;

/** Severity of a {@link TableXNotice}. */
export type TableXNoticeType = "info" | "success" | "error";
export type NexGridNoticeType = TableXNoticeType;

/** A message the grid wants surfaced to the user. */
export interface TableXNotice {
  type: TableXNoticeType;
  message: string;
}
export type NexGridNotice = TableXNotice;

/** Color scheme applied to the grid root. */
export type TableXTheme = "light" | "dark" | "auto";
export type NexGridTheme = TableXTheme;

/** Props accepted by Vue `<TableX />` / `<NexGrid />`. */
export interface TableXProps<TData> {
  columns: TableXVueColumn<TData>[];
  data: TData[];
  total?: number;
  query?: QueryState;
  onQueryChange?: (next: QueryState) => void;
  clientSidePagination?: boolean;
  paginationMode?: "client" | "server" | "infinite";
  searchableFields?: (keyof TData & string)[];
  caption: string;
  density?: Density;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  enableSelection?: boolean;
  selectionMode?: "multi" | "single";
  enableColumnFilters?: boolean;
  enableColumnMenu?: boolean;
  enableColumnResize?: boolean;
  onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void;
  enableSearch?: boolean;
  searchPlaceholder?: string;
  enableColumns?: boolean;
  showColumnsButton?: boolean;
  enableDensity?: boolean;
  showDensityButton?: boolean;
  enableExport?: boolean;
  showExportButton?: boolean;
  enableSorting?: boolean;
  enablePagination?: boolean;
  showPagination?: boolean;
  enableRowsPerPage?: boolean;
  showRowsPerPage?: boolean;
  enableJumpToPage?: boolean;
  showJumpToPage?: boolean;
  showToolbar?: boolean;
  showFooter?: boolean;
  renderExpandedRow?: (row: TData) => VNodeChild;
  enableBulkActions?: boolean;
  bulkActions?: (selectedIds: string[], deselectAll: () => void) => VNodeChild;
  enableSummaryRow?: boolean;
  enableColumnReorder?: boolean;
  enableVirtualization?: boolean;
  virtualHeight?: number;
  virtualOverscan?: number;
  enableColumnVirtualization?: boolean;
  virtualColumnOverscan?: number;
  fitContainer?: boolean;
  enableHistory?: boolean;
  groupBy?: string | readonly string[];
  onGroupByChange?: (columnId: string | undefined, allGroupBy: string[]) => void;
  enableKeyboardNavigation?: boolean;
  enableContextMenu?: boolean;
  contextMenuItems?: (ctx: { row: TData; columnId: string; value: unknown }) => readonly ContextMenuItem[];
  enableTreeData?: boolean;
  childrenKey?: string;
  getSubRows?: (row: TData) => readonly TData[] | undefined;
  defaultExpandedDepth?: number;
  loadChildren?: (row: TData) => Promise<readonly TData[] | TData[]>;
  hasChildren?: (row: TData) => boolean;
  pinnedTopRows?: readonly TData[];
  pinnedBottomRows?: readonly TData[];
  editMode?: EditMode;
  onRowEdit?: (event: RowEditEvent<TData>) => void;
  enableSavedViews?: boolean;
  savedViews?: readonly SavedGridView[];
  onSavedViewsChange?: (views: SavedGridView[]) => void;
  enableRowReorder?: boolean;
  onRowOrderChange?: (event: RowOrderChangeEvent<TData>) => void;
  enableInfiniteScroll?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  nextCursor?: string | null;
  onLoadMore?: (cursor: string | null) => void;
  enableRangeSelection?: boolean;
  onColumnOrderChange?: (newOrder: string[]) => void;
  onCellEdit?: (edit: { row: TData; columnId: string; oldValue: unknown; newValue: unknown }) => void;
  storageKey?: string;
  showFilterPills?: boolean;
  toolbarActions?: VNodeChild;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  className?: string;
  showSerialNumber?: boolean;
  exportFileName?: string;
  allData?: readonly TData[];
  fetchAllData?: (query: QueryState) => Promise<readonly TData[]> | readonly TData[];
  fetchPage?: (page: number, pageSize: number, query: QueryState) => Promise<PagedResponse<TData>>;
  maxExportRows?: number;
  exportMode?: "menu" | "split" | "excel" | "csv" | "pdf";
  quickExport?: boolean | ExportFormat;
  onExportAll?: (format: ExportFormat) => void | Promise<void> | Promise<readonly TData[]> | readonly TData[];
  fetchEndpoint?: string;
  fetchOptions?: RequestInit;
  badgeRules?: readonly ExcelBadgeRule[];
  locale?: Partial<TableXLocale>;
  theme?: TableXTheme;
  onNotify?: (notice: TableXNotice) => void;
}
export type NexGridProps<TData> = TableXProps<TData>;

/** Imperative handle exposed via template ref on Vue `<TableX />` and `<NexGrid />`. */
export interface TableXHandle<TData = unknown> {
  /** Undo the latest cell mutation or batch edit. Returns true if an action was undone. */
  undo(): boolean;
  /** Redo the latest reverted cell mutation or batch edit. Returns true if an action was redone. */
  redo(): boolean;
  /** True when mutations exist in the undo stack. */
  canUndo(): boolean;
  /** True when mutations exist in the redo stack. */
  canRedo(): boolean;
  /** Automatically resize all visible columns to fit their longest text content. */
  autoFitAllColumns(sampleRows?: number): void;
}
export type NexGridHandle<TData = unknown> = TableXHandle<TData>;
