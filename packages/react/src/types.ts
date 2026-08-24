// The public prop surface of `<NexGrid />`.
//
// It lives in its own module so consumers can import the prop type without
// pulling the component (and its `"use client"` boundary) into a server file,
// and so the contract can be read on its own — this file IS the API.

import type { ReactNode } from "react";
import type {
  Density,
  ExcelBadgeRule,
  NexGridColumn,
  NexGridLocale,
  QueryState,
} from "@nexgrid/core";

/** A column definition bound to React's render type. */
export type NexGridReactColumn<TData> = NexGridColumn<TData, ReactNode>;

/** Severity of a {@link NexGridNotice}. */
export type NexGridNoticeType = "info" | "success" | "error";

/**
 * A message the grid wants surfaced to the user.
 *
 * The grid never renders toasts itself — a toast belongs to the host app's
 * design system, and two competing toast stacks in one page is a worse bug
 * than no toast at all. Everything it would want to say arrives here instead.
 */
export interface NexGridNotice {
  type: NexGridNoticeType;
  message: string;
}

/** Color scheme applied to the grid root. */
export type NexGridTheme = "light" | "dark" | "auto";

/**
 * Props for {@link NexGrid}.
 *
 * `data` / `total` / `query` / `onQueryChange` are **controlled**: the grid
 * renders exactly the page it is handed and reports intent back through
 * `onQueryChange`. It never fetches on its own (the one exception is the
 * export-everything path, which needs rows the current page does not have).
 */
export interface NexGridProps<TData> {
  /** Column definitions, in display order. */
  columns: NexGridReactColumn<TData>[];
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

  /** Show the export menu. Default `true`. */
  enableExport?: boolean;
  /** File name prefix, without extension. Default: the caption, lower-cased and underscored. */
  exportFileName?: string;
  /** Take over exporting entirely; when set, the grid's own export flow never runs. */
  onExportAll?: () => void | Promise<void>;
  /**
   * List endpoint used to page in the rest of the dataset when exporting more
   * than the current page. Without it, exports contain the visible page only.
   */
  fetchEndpoint?: string;
  /** Value-based cell styling for the Excel export. Defaults to core's `DEFAULT_BADGE_RULES`. */
  badgeRules?: readonly ExcelBadgeRule[];

  /** Overrides for any user-facing string. */
  locale?: Partial<NexGridLocale>;
  /** Receives messages the grid would otherwise have no way to report. Default: no-op. */
  onNotify?: (notice: NexGridNotice) => void;
  /** `"dark"` and `"auto"` add `.nxg-dark` / `.nxg-auto` to the root. Default `"light"`. */
  theme?: NexGridTheme;
}
