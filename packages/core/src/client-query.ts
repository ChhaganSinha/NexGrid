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

/** Check if a cell value matches a column filter criteria (smart text, numeric, date, boolean). */
function matchesFilterValue(val: unknown, filterVal: string): boolean {
  if (val === null || val === undefined) return false;
  const rawStr = String(val).trim().toLowerCase();
  const wanted = filterVal.trim().toLowerCase();
  if (rawStr === wanted) return true;
  if (rawStr.includes(wanted)) return true;

  // Percentage / numeric matching: e.g. val is 63 or 63.0, filterVal is "63%" or "63" or "63.0%"
  const cleanWanted = wanted.replace(/%/g, "").trim();
  const cleanRaw = rawStr.replace(/%/g, "").trim();
  if (cleanRaw === cleanWanted || cleanRaw.includes(cleanWanted)) return true;

  const numVal = Number(cleanRaw);
  const numWanted = Number(cleanWanted);
  if (!Number.isNaN(numVal) && !Number.isNaN(numWanted) && numVal === numWanted) {
    return true;
  }

  // Boolean matching: "true" / "yes" vs true, "false" / "no" vs false
  if (typeof val === "boolean") {
    if (val && (wanted === "true" || wanted === "yes" || wanted === "active")) return true;
    if (!val && (wanted === "false" || wanted === "no")) return true;
  }

  // Date matching: e.g. val is "2023-04-12"
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val + "T00:00:00Z");
    if (!Number.isNaN(d.getTime())) {
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const fullMonthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const m = d.getUTCMonth();
      const formatted = `${monthNames[m]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`.toLowerCase();
      const formattedFull = `${fullMonthNames[m]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`.toLowerCase();
      if (formatted.includes(wanted) || formattedFull.includes(wanted)) return true;
    }
  }

  return false;
}

  // 2. Column filters
  const filter = query.filter;
  if (filter && Object.keys(filter).length > 0) {
    const allowedFields = options?.filterableFields;
    for (const [key, filterVal] of Object.entries(filter)) {
      if (!filterVal) continue;
      if (allowedFields && !allowedFields.includes(key as keyof TData & string)) continue;
      matching = matching.filter((row) => {
        const val = (row as Record<string, unknown>)[key];
        return matchesFilterValue(val, filterVal);
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
