// The public surface of @nexgrid/vanilla.
//
// These options mirror the React adapter's props one-for-one (adapter spec
// §4.3) with callbacks in place of props, so a team moving a grid between the
// two adapters is renaming things, not rethinking them. The one addition is
// `endpoint`: with no framework around it, a plain-DOM grid that cannot fetch
// its own data would need a hand-written data layer before it renders a single
// row, which is exactly the boilerplate `NexGrid.AspNetCore` exists to remove.

import type {
  Density,
  ExcelBadgeRule,
  NexGridColumn,
  NexGridLocale,
  QueryState,
} from "@nexgrid/core";

/**
 * What a vanilla `header` / `cell` renderer may return.
 *
 * A `string` is written with `textContent` and can never be interpreted as
 * markup. Returning a `Node` is the ONLY way to put elements into a cell, and
 * it is deliberate: the consumer built that node, so they own its contents.
 */
export type NexGridNode = string | Node;

/** A column definition bound to the vanilla render type. */
export type NexGridVanillaColumn<TData> = NexGridColumn<TData, NexGridNode>;

/** Severity of a grid notification. */
export type NexGridNoticeType = "info" | "success" | "error";

/** A message the grid wants surfaced. The grid never renders toasts itself. */
export interface NexGridNotice {
  type: NexGridNoticeType;
  message: string;
}

/** Colour scheme applied to the grid root. */
export type NexGridTheme = "light" | "dark" | "auto";

/** Configuration for {@link createNexGrid}. */
export interface NexGridOptions<TData> {
  /** Column definitions, in display order. */
  columns: NexGridVanillaColumn<TData>[];
  /** Accessible name for the table; also the default export file prefix. */
  caption: string;

  // ---- Controlled mode -----------------------------------------------------

  /** The CURRENT page of rows only — never the full dataset. Default `[]`. */
  data?: TData[];
  /** Total filtered row count; drives pagination. Default `0`. */
  total?: number;
  /** Initial query state. Defaults to `defaultQuery()`. */
  query?: QueryState;
  /**
   * Emitted whenever the user changes page, size, sort, search or a filter.
   *
   * In controlled mode the grid does NOT move on its own: fetch the new page
   * and call `handle.update({ data, total, query })`. In endpoint mode the
   * grid has already applied the query and this is purely informational (use
   * it to mirror the query into the URL, for example).
   */
  onQueryChange?: (next: QueryState) => void;

  // ---- Endpoint mode -------------------------------------------------------

  /**
   * Turns on endpoint mode: the grid fetches `buildQueryUrl(endpoint, query)`
   * itself, expects a `PagedResponse<TData>` JSON body, and manages its own
   * loading and error states.
   */
  endpoint?: string;
  /**
   * Extra `fetch` init for endpoint mode and for export's fetch-all pass
   * (headers, `credentials`, ...). `signal` is always supplied by the grid so
   * a superseded request can be aborted, and is ignored if set here.
   */
  fetchOptions?: RequestInit;

  // ---- Presentation --------------------------------------------------------

  /** Initial row density. Default `"default"`. */
  density?: Density;
  /** Show the loading state (controlled mode only). */
  isLoading?: boolean;
  /** Replace the whole grid with the error card (controlled mode only). */
  error?: boolean;
  /** Retry handler; rendering a retry button on the error card. */
  onRetry?: () => void;
  /** Extra class names appended to `.nxg-root`. */
  className?: string;
  /** Colour scheme. Default `"light"`. */
  theme?: NexGridTheme;

  // ---- Features ------------------------------------------------------------

  /** Show the automatic `S.No.` column. Default `true`. */
  showSerialNumber?: boolean;
  /** Show the global search field. Default `true`. */
  enableSearch?: boolean;
  /** Overrides `locale.searchPlaceholder`. */
  searchPlaceholder?: string;
  /** Show row selection checkboxes. Default `false`. */
  enableSelection?: boolean;
  /**
   * Called with the running selection whenever it changes.
   * `allAcrossSelected` is always `false` today — the argument is reserved for
   * a future "select every matching row across all pages" affordance.
   */
  onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void;
  /** Called when a row (or its mobile card) is clicked. Adds a pointer cursor. */
  onRowClick?: (row: TData) => void;
  /** Stable row identity. Defaults to `row.id`, falling back to `String(row)`. */
  getRowId?: (row: TData) => string;
  /** Rendered at the end of the toolbar. */
  toolbarActions?: Node | string;

  // ---- Export --------------------------------------------------------------

  /** Show the export menu. Default `true`. */
  enableExport?: boolean;
  /** File prefix; defaults to `filePrefixFromCaption(caption)`. */
  exportFileName?: string;
  /** Replaces the built-in export entirely when set. */
  onExportAll?: () => void | Promise<void>;
  /**
   * Endpoint used to collect the FULL filtered dataset for export when the
   * current page is only part of it. Defaults to {@link NexGridOptions.endpoint}.
   */
  fetchEndpoint?: string;
  /** Value-based Excel badge styling. Defaults to `DEFAULT_BADGE_RULES`. */
  badgeRules?: readonly ExcelBadgeRule[];

  // ---- Localisation & messaging -------------------------------------------

  /** Overrides for any user-facing string. */
  locale?: Partial<NexGridLocale>;
  /** Receives notices (export progress, failures). Default: no-op. */
  onNotify?: (notice: NexGridNotice) => void;
}

/** The state {@link NexGridHandle.update} can patch. */
export interface NexGridUpdate<TData> {
  /** The current page of rows. */
  data: TData[];
  /** Total filtered row count. */
  total: number;
  /** Query state to display. In endpoint mode this triggers a refetch. */
  query: QueryState;
  /** Loading flag. */
  isLoading: boolean;
  /** Error flag; replaces the grid with the error card. */
  error: boolean;
}

/** The controller returned by {@link createNexGrid}. */
export interface NexGridHandle<TData> {
  /** Patch grid state. Omitted keys are left untouched. */
  update(patch: Partial<NexGridUpdate<TData>>): void;
  /** Endpoint mode: refetch the current query. Otherwise: re-render. */
  refresh(): void;
  /** The query currently displayed. */
  getQuery(): QueryState;
  /** Ids of the currently selected rows, in selection order. */
  getSelection(): string[];
  /** Tear down: detach the grid and remove every listener it registered. */
  destroy(): void;
}
