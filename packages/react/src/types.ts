// The public prop surface of `<TableX />`.
//
// It lives in its own module so consumers can import the prop type without
// pulling the component (and its `"use client"` boundary) into a server file,
// and so the contract can be read on its own — this file IS the API.

import type { ReactNode } from "react";
import type {
  Density,
  ExcelBadgeRule,
  TableXColumn as TableXCoreColumn,
  TableXLocale,
  QueryState,
} from "@tablex/core";

/** A column definition bound to React's render type. */
export type TableXReactColumn<TData> = TableXCoreColumn<TData, ReactNode>;
export type TableXColumn<TData> = TableXReactColumn<TData>;
export type NexGridReactColumn<TData> = TableXReactColumn<TData>;
export type NexGridColumn<TData> = TableXColumn<TData>;

/** Severity of a {@link TableXNotice}. */
export type TableXNoticeType = "info" | "success" | "error";
export type NexGridNoticeType = TableXNoticeType;

/**
 * A message the grid wants surfaced to the user.
 *
 * The grid never renders toasts itself — a toast belongs to the host app's
 * design system, and two competing toast stacks in one page is a worse bug
 * than no toast at all. Everything it would want to say arrives here instead.
 */
export interface TableXNotice {
  type: TableXNoticeType;
  message: string;
}
export type NexGridNotice = TableXNotice;

/** Color scheme applied to the grid root. */
export type TableXTheme = "light" | "dark" | "auto";
export type NexGridTheme = TableXTheme;

/**
 * Props for {@link TableX}.
 *
 * `data` / `total` / `query` / `onQueryChange` are **controlled**: the grid
 * renders exactly the page it is handed and reports intent back through
 * `onQueryChange`. It never fetches on its own (the one exception is the
 * export-everything path, which needs rows the current page does not have).
 */
export interface TableXProps<TData> {
  /** Column definitions, in display order. */
  columns: TableXReactColumn<TData>[];
  /** The CURRENT page of rows only — never the full dataset. */
  data: TData[];
  /** Total filtered row count from the server; drives the pager. */
  total: number;
  /** The query the `data` above answers. */
  query: QueryState;
  /** Called with the next query whenever the user changes page/sort/search/size. */
  onQueryChange: (next: QueryState) => void;
  /** Accessible name for the table. Also the default export file name and sheet title. */
  caption: string;

  /** Initial row density. Later changes to this prop are ignored — the user owns it from then on. Default `"default"`. */
  density?: Density;
  /** Replace the rows with a spinner while the host is fetching. */
  isLoading?: boolean;
  /** Replace the WHOLE grid with an error card. */
  error?: boolean;
  /** When provided, the error card offers a retry button. */
  onRetry?: () => void;

  /** Render selection checkboxes. Default `false`. */
  enableSelection?: boolean;
  /** Selection mode: `"multi"` (default) or `"single"`. */
  selectionMode?: "multi" | "single";
  /** Enable column-level filter menus on column headers. Default `false` (or per-column). */
  enableColumnFilters?: boolean;
  /** Enable dragging column borders to resize columns. Default `true`. */
  enableColumnResize?: boolean;
  /**
   * Called with every selected row id after each change.
   * `allAcrossSelected` is reserved for a future "select all matching rows"
   * affordance and is always `false` today.
   */
  onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void;

  /** Show the debounced global search box. Default `true`. */
  enableSearch?: boolean;
  /** Overrides `locale.searchPlaceholder`. */
  searchPlaceholder?: string;
  /** Show the columns toggle dropdown menu button. Default `true`. */
  enableColumns?: boolean;
  /** Alias for enableColumns. */
  showColumnsButton?: boolean;
  /** Show the density dropdown menu button. Default `true`. */
  enableDensity?: boolean;
  /** Alias for enableDensity. */
  showDensityButton?: boolean;
  /** Show the export menu. Default `true`. */
  enableExport?: boolean;
  /** Alias for enableExport. */
  showExportButton?: boolean;
  /** Enable sorting across all columns. Default `true`. */
  enableSorting?: boolean;
  /** Show the footer pagination controls. Default `true`. */
  enablePagination?: boolean;
  /** Alias for enablePagination. */
  showPagination?: boolean;
  /** Show the rows-per-page dropdown in the footer. Default `true`. */
  enableRowsPerPage?: boolean;
  /** Alias for enableRowsPerPage. */
  showRowsPerPage?: boolean;
  /** Show the jump to page input in the footer. Default `true`. */
  enableJumpToPage?: boolean;
  /** Alias for enableJumpToPage. */
  showJumpToPage?: boolean;
  /** Show the entire toolbar area. Default `true`. */
  showToolbar?: boolean;
  /** Show the entire footer area. Default `true`. */
  showFooter?: boolean;
  /** Rendered at the end of the toolbar, after the export menu. */
  toolbarActions?: ReactNode;
  /** Clicking a row (or a card) invokes this. Adds a pointer cursor. */
  onRowClick?: (row: TData) => void;
  /** Stable identity for a row. Default: `String(row.id ?? row)`. */
  getRowId?: (row: TData) => string;
  /** Extra class(es) on the grid root. */
  className?: string;
  /** Show the automatic `S.No.` column. Default `true`. */
  showSerialNumber?: boolean;
  /** File name prefix, without extension. Default: the caption, lower-cased and underscored. */
  exportFileName?: string;
  /** Take over exporting entirely; when set, the grid's own export flow never runs. */
  onExportAll?: () => void | Promise<void>;
  /**
   * Endpoint used to fetch the full filtered dataset for export when the current
   * page is only part of it.
   */
  fetchEndpoint?: string;
  /** Extra fetch options (headers, etc.) forwarded when calling {@link fetchEndpoint}. */
  fetchOptions?: RequestInit;
  /** Value-based badge styling rules for Excel export. */
  badgeRules?: readonly ExcelBadgeRule[];

  /** Overrides for any user-facing string in the grid. */
  locale?: Partial<TableXLocale>;
  /** Visual theme. Default `"light"`. */
  theme?: TableXTheme;
  /** Receives notices (export progress, failures). Default: no-op. */
  onNotify?: (notice: TableXNotice) => void;
}
export type NexGridProps<TData> = TableXProps<TData>;
