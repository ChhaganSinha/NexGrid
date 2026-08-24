// The client <-> server paging contract shared by every NexGrid adapter.
//
// NexGrid is SERVER-DRIVEN by design: the grid never holds the full dataset.
// Every page, sort, search, and filter is expressed as a `QueryState`, sent to
// the server, and answered with a `PagedResponse<T>` containing exactly one
// page of rows plus the total filtered count.

/** Allowed page sizes. Anything else should be coerced to {@link DEFAULT_PAGE_SIZE}. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** A page size drawn from the allowed set. */
export type PageSize = (typeof PAGE_SIZES)[number];

/** Default rows-per-page when none (or an invalid value) is supplied. */
export const DEFAULT_PAGE_SIZE: PageSize = 10;

/** Type guard: is `n` a member of the allowed {@link PAGE_SIZES} set? */
export function isPageSize(n: number): n is PageSize {
  return (PAGE_SIZES as readonly number[]).includes(n);
}

/** Sort direction for a single column. */
export type SortDir = "asc" | "desc";

/** One column's sort intent, e.g. `{ field: "name", dir: "asc" }`. */
export interface SortSpec {
  field: string;
  dir: SortDir;
}

/**
 * The full client -> server query intent.
 *
 * Serialized to a query string by `serializeQuery` and parsed back by
 * `parseQuery`; `NexGrid.AspNetCore` binds the same shape on the server.
 */
export interface QueryState {
  /** 1-based page number (>= 1). */
  page: number;
  /** Rows per page, constrained to {@link PAGE_SIZES}. */
  pageSize: PageSize;
  /** Ordered list of column sorts (first = primary). */
  sort: SortSpec[];
  /** Optional global search string. */
  q?: string;
  /** Optional per-column filters (`filter[<field>]=<value>`). */
  filter?: Record<string, string>;
}

/**
 * The server -> client response contract every list endpoint must satisfy.
 * `total` is the FULL filtered count (not the current page's length) and is
 * what drives the pagination controls; `totalPages` is derived from it.
 */
export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Row height presets. */
export type Density = "compact" | "default" | "comfortable";

/** Density -> fixed row height in px (informational; the CSS theme applies it). */
export const DENSITY_ROW_HEIGHT: Record<Density, number> = {
  compact: 36,
  default: 44,
  comfortable: 52,
};

/** All density values, in menu order. */
export const DENSITIES: readonly Density[] = ["compact", "default", "comfortable"];
