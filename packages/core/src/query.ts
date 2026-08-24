// Pure "query reducers".
//
// Every adapter (React, Angular, vanilla) routes user intent through these
// functions so behavior is IDENTICAL on every platform: the sort cycle is
// always asc -> desc -> cleared, and any change that alters which rows match
// (search, page size, sort) always resets to page 1.

import {
  DEFAULT_PAGE_SIZE,
  isPageSize,
  type QueryState,
  type SortDir,
  type SortSpec,
} from "./types.js";

/** A fresh default query: page 1, default size, no sort/search/filter. */
export function defaultQuery(): QueryState {
  return { page: 1, pageSize: DEFAULT_PAGE_SIZE, sort: [] };
}

/** The primary (first) sort, if any. */
export function primarySort(query: QueryState): SortSpec | undefined {
  return query.sort[0];
}

/**
 * Advance the sort cycle for a column: none -> asc -> desc -> none.
 * Sorting a new column always starts at asc. Resets to page 1.
 */
export function withToggledSort(query: QueryState, field: string): QueryState {
  const current = primarySort(query);
  let sort: SortSpec[];

  if (current?.field !== field) {
    sort = [{ field, dir: "asc" }];
  } else if (current.dir === "asc") {
    sort = [{ field, dir: "desc" }];
  } else {
    sort = [];
  }

  return { ...query, sort, page: 1 };
}

/** Set an explicit sort. Resets to page 1. */
export function withSort(query: QueryState, field: string, dir: SortDir): QueryState {
  return { ...query, sort: [{ field, dir }], page: 1 };
}

/** Replace the global search string (empty -> removed). Resets to page 1. */
export function withSearch(query: QueryState, q: string): QueryState {
  const trimmed = q;
  return { ...query, q: trimmed ? trimmed : undefined, page: 1 };
}

/** Navigate to a 1-based page, clamped to `[1, totalPages]`. */
export function withPage(query: QueryState, page: number, totalPages: number): QueryState {
  const clamped = Math.min(Math.max(1, Math.trunc(page)), Math.max(1, totalPages));
  return { ...query, page: clamped };
}

/** Change rows-per-page (ignored unless allowlisted). Resets to page 1. */
export function withPageSize(query: QueryState, pageSize: number): QueryState {
  if (!isPageSize(pageSize)) return query;
  return { ...query, pageSize, page: 1 };
}

/** Set or clear (`value === undefined`) one server-side column filter. Resets to page 1. */
export function withFilter(
  query: QueryState,
  field: string,
  value: string | undefined,
): QueryState {
  const filter = { ...(query.filter ?? {}) };
  if (value === undefined || value === "") delete filter[field];
  else filter[field] = value;
  return {
    ...query,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    page: 1,
  };
}

/** Total pages for a result set (always >= 1 so the pager can render). */
export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}
