// Pure client-side in-memory dataset evaluator.
//
// Allows NexGrid to be used in client-side / static mode (with in-memory arrays)
// with the exact same search, sorting, filtering, and pagination semantics
// as the server-side wire contract.

import {
  DEFAULT_PAGE_SIZE,
  isPageSize,
  type PagedResponse,
  type QueryState,
} from "./types.js";
import { totalPagesFor } from "./query.js";


/** Options for client-side in-memory querying. */
export interface ClientQueryOptions<TData> {
  /** Explicit list of field names to search when `query.q` is present. If omitted, all string properties are searched. */
  searchableFields?: (keyof TData & string)[];
  /** Explicit list of field names that may be sorted. If omitted, all fields are sortable. */
  sortableFields?: (keyof TData & string)[];
  /** Explicit list of field names that may be filtered. If omitted, all fields are filterable. */
  filterableFields?: (keyof TData & string)[];
}

/** Compare two arbitrary values for client-side sorting. */
function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Evaluates a {@link QueryState} against an in-memory client-side dataset:
 * applies global search, column filters, multi-column sorting, and windowed paging.
 *
 * @param data    The complete in-memory dataset.
 * @param query   The current query state (page, pageSize, sort, search, filters).
 * @param options Optional configuration for searchable/sortable/filterable fields.
 * @returns A {@link PagedResponse} representing the requested page window and total filtered count.
 */
export function queryClientData<TData>(
  data: readonly TData[],
  query: QueryState,
  options?: ClientQueryOptions<TData>,
): PagedResponse<TData> {
  let matching = [...data];

  // 1. Global search
  const term = (query.q || "").trim().toLowerCase();
  if (term) {
    const fields = options?.searchableFields;
    matching = matching.filter((row) => {
      if (fields && fields.length > 0) {
        return fields.some((field) => {
          const val = (row as Record<string, unknown>)[field];
          return val !== null && val !== undefined && String(val).toLowerCase().includes(term);
        });
      }
      return Object.values(row as Record<string, unknown>).some(
        (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(term),
      );
    });
  }

  // 2. Column filters
  const filter = query.filter;
  if (filter && Object.keys(filter).length > 0) {
    const allowedFields = options?.filterableFields;
    for (const [key, filterVal] of Object.entries(filter)) {
      if (!filterVal) continue;
      if (allowedFields && !allowedFields.includes(key as keyof TData & string)) continue;
      const wanted = String(filterVal).toLowerCase();
      matching = matching.filter((row) => {
        const val = (row as Record<string, unknown>)[key];
        return val !== null && val !== undefined && String(val).toLowerCase() === wanted;
      });
    }
  }

  // 3. Multi-column sorting
  const sorts = query.sort || [];
  if (sorts.length > 0) {
    const allowedSorts = options?.sortableFields;
    const activeSorts = allowedSorts
      ? sorts.filter((s) => allowedSorts.includes(s.field as keyof TData & string))
      : sorts;

    if (activeSorts.length > 0) {
      matching.sort((left, right) => {
        for (const sort of activeSorts) {
          const leftVal = (left as Record<string, unknown>)[sort.field];
          const rightVal = (right as Record<string, unknown>)[sort.field];
          const result = compareValues(leftVal, rightVal);
          if (result !== 0) {
            return sort.dir === "desc" ? -result : result;
          }
        }
        return 0;
      });
    }
  }

  // 4. Pagination
  const total = matching.length;
  const pageSize = isPageSize(query.pageSize) ? query.pageSize : DEFAULT_PAGE_SIZE;
  const totalPages = totalPagesFor(total, pageSize);
  const page = Math.min(Math.max(1, query.page || 1), totalPages);
  const start = (page - 1) * pageSize;
  const items = matching.slice(start, start + pageSize);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages,
  };
}
