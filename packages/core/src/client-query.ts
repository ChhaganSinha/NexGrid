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
  type SortDir,
} from "./types.js";
import {
  flattenColumns,
  getCellValue,
  getColumnId,
  getFilterField,
  getSortField,
  isFilterable,
  isSortable,
  readPropertyByPath,
  type TableXColumn,
  type TableXColumnMeta,
} from "./column.js";
import { totalPagesFor } from "./query.js";

/** Hints guiding how {@link matchesFilterValue} evaluates a filter value. */
export interface FilterMatchOptions {
  /** Force exact case-insensitive matching instead of substring matching. */
  exact?: boolean;
  /** Column filter input type hint. */
  filterType?: TableXColumnMeta["filterType"];
  /** Whether comma-separated values should also be treated as multi-select OR tokens. */
  multiSelect?: boolean;
  /** Allowed discrete option values for the column. */
  filterOptions?: readonly string[];
}

/** Options for client-side in-memory querying. */
export interface ClientQueryOptions<TData> {
  /**
   * Explicit list of field names to search when `query.q` is present.
   *
   * If omitted (or empty), EVERY property on the row is searched — including
   * fields no column displays, such as an `id` GUID. Adapters should pass the
   * displayed columns (see `searchableColumnIds`) so a match is always visible.
   */
  searchableFields?: readonly ((keyof TData & string) | (string & {}))[];
  /** Explicit list of field names that may be sorted. If omitted, all sortable columns/fields are allowed. */
  sortableFields?: readonly ((keyof TData & string) | (string & {}))[];
  /** Explicit list of field names that may be filtered. If omitted, all filterable columns/fields are allowed. */
  filterableFields?: readonly ((keyof TData & string) | (string & {}))[];
  /**
   * Optional column definitions. When supplied, `queryClientData` resolves
   * `accessorKey` / `accessorFn` / `serverFilterField` / `sortField` / `filterOptions`
   * and custom `sortingFn` / `filterFn` callbacks automatically.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns?: readonly TableXColumn<TData, any>[];
  /** Whether to slice items into the requested page window. Defaults to `true`. If `false`, returns all matching rows (useful for export). */
  paginate?: boolean;
}

const NUMERIC_LIKE_PATTERN = /^[+-]?[$€£₹]?\s*(?:0|[1-9]\d*(?:,\d{3})*)(?:\.\d+)?\s*%?$/;
const ISO_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function isMissingSortValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
}

function tryParseSortableNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || !NUMERIC_LIKE_PATTERN.test(trimmed)) return null;
  const cleaned = trimmed.replace(/[$€£₹,%\s]/g, "");
  if (!cleaned || cleaned === "+" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function tryParseDateTimestamp(v: unknown): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!ISO_DATETIME_PATTERN.test(trimmed)) return null;
  const normalized = trimmed.length === 10 ? `${trimmed}T00:00:00Z` : trimmed;
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? null : t;
}

/**
 * Compare two values for client-side sorting, always placing `null`,
 * `undefined`, and `NaN` last in both `"asc"` and `"desc"` order.
 */
export function compareValues(a: unknown, b: unknown, dir: SortDir = "asc"): number {
  const missingA = isMissingSortValue(a);
  const missingB = isMissingSortValue(b);
  if (missingA && missingB) return 0;
  if (missingA) return 1;
  if (missingB) return -1;
  if (a === b) return 0;

  let cmp = 0;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a < b ? -1 : a > b ? 1 : 0;
  } else if (typeof a === "boolean" && typeof b === "boolean") {
    cmp = Number(a) - Number(b);
  } else {
    const dateA = tryParseDateTimestamp(a);
    const dateB = tryParseDateTimestamp(b);
    if (dateA !== null && dateB !== null) {
      cmp = dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
    } else {
      const numA = tryParseSortableNumber(a);
      const numB = tryParseSortableNumber(b);
      if (numA !== null && numB !== null) {
        cmp = numA < numB ? -1 : numA > numB ? 1 : 0;
      } else {
        cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
      }
    }
  }

  return dir === "desc" ? -cmp : cmp;
}

function extractDayTimestamp(v: unknown, endOfDay = false): number | null {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const str = String(v).trim();
  if (!ISO_DATE_PREFIX_PATTERN.test(str)) return null;
  const datePart = str.slice(0, 10);
  const t = Date.parse(`${datePart}T${endOfDay ? "23:59:59.999Z" : "00:00:00.000Z"}`);
  return Number.isNaN(t) ? null : t;
}

function extractFilterNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v instanceof Date) return null;
  const str = String(v).trim();
  if (!str || ISO_DATE_PREFIX_PATTERN.test(str)) return null;
  const cleaned = str.replace(/[$€£₹,%\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Check if a cell value matches a column filter criteria
 * (smart text, discrete select options, numeric, date, boolean, range `min..max`, and operators `>=`, `<=`, `>`, `<`, `!=`, `=`).
 */
export function matchesFilterValue(
  val: unknown,
  filterVal: string,
  hint?: FilterMatchOptions,
): boolean {
  const wanted = filterVal.trim().toLowerCase();
  if (!wanted) return true;
  if (val === null || val === undefined) return false;

  const filterType = hint?.filterType;
  const filterOptions = hint?.filterOptions;
  const isMultiSelect = filterType === "multi-select" || hint?.multiSelect === true;

  // 0. Multi-select OR tokens: "Active|Pending" (or "Active,Pending" when multi-select is active)
  if (
    filterVal.includes("|") ||
    (isMultiSelect && filterVal.includes(",") && !filterVal.includes(".."))
  ) {
    const sep = filterVal.includes("|") ? "|" : ",";
    const tokens = filterVal
      .split(sep)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) return true;
    const singleHint: FilterMatchOptions = {
      ...hint,
      filterType: filterType === "multi-select" ? "select" : filterType,
      multiSelect: false,
    };
    return tokens.some((token) => matchesFilterValue(val, token, singleHint));
  }

  const isDiscreteSelect =
    hint?.exact === true ||
    filterType === "select" ||
    filterType === "multi-select" ||
    isMultiSelect ||
    Boolean(
      filterOptions &&
        filterOptions.length > 0 &&
        filterOptions.some((opt) => opt.trim().toLowerCase() === wanted),
    );

  // 1. Range syntax: e.g. "10..50" or "2023-01-01..2023-12-31" or "10.." or "..50"
  if (wanted.includes("..")) {
    const [minStr = "", maxStr = ""] = wanted.split("..");
    const minTrim = minStr.trim();
    const maxTrim = maxStr.trim();
    if (!minTrim && !maxTrim) return true;

    const looksLikeDateRange =
      filterType === "date-range" ||
      filterType === "date" ||
      val instanceof Date ||
      (minTrim !== "" && ISO_DATE_PREFIX_PATTERN.test(minTrim)) ||
      (maxTrim !== "" && ISO_DATE_PREFIX_PATTERN.test(maxTrim));

    if (looksLikeDateRange) {
      const valDate = extractDayTimestamp(val, false);
      if (valDate === null) return false;
      if (minTrim) {
        const minDate = extractDayTimestamp(minTrim, false);
        if (minDate !== null && valDate < minDate) return false;
      }
      if (maxTrim) {
        const maxDate = extractDayTimestamp(maxTrim, true);
        if (maxDate !== null && valDate > maxDate) return false;
      }
      return true;
    }

    const num = extractFilterNumber(val);
    if (num !== null) {
      if (minTrim) {
        const minNum = extractFilterNumber(minTrim);
        if (minNum !== null && num < minNum) return false;
      }
      if (maxTrim) {
        const maxNum = extractFilterNumber(maxTrim);
        if (maxNum !== null && num > maxNum) return false;
      }
      return true;
    }
    return false;
  }

  // 2. Comparison operators: >=, <=, !=, >, <, =
  const opMatch = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(wanted);
  if (opMatch && opMatch[1] && opMatch[2]) {
    const op = opMatch[1];
    const rhs = opMatch[2].trim();

    const leftDate = extractDayTimestamp(val, false);
    const rightDate = extractDayTimestamp(rhs, false);
    if (leftDate !== null && rightDate !== null) {
      if (op === ">=") return leftDate >= rightDate;
      if (op === "<=") return leftDate <= (extractDayTimestamp(rhs, true) ?? rightDate);
      if (op === ">") return leftDate > (extractDayTimestamp(rhs, true) ?? rightDate);
      if (op === "<") return leftDate < rightDate;
      if (op === "=") return leftDate >= rightDate && leftDate <= (extractDayTimestamp(rhs, true) ?? rightDate);
      if (op === "!=") return leftDate < rightDate || leftDate > (extractDayTimestamp(rhs, true) ?? rightDate);
    }

    const leftNum = extractFilterNumber(val);
    const rightNum = extractFilterNumber(rhs);
    if (leftNum !== null && rightNum !== null) {
      if (op === ">=") return leftNum >= rightNum;
      if (op === "<=") return leftNum <= rightNum;
      if (op === ">") return leftNum > rightNum;
      if (op === "<") return leftNum < rightNum;
      if (op === "=") return leftNum === rightNum;
      if (op === "!=") return leftNum !== rightNum;
    }

    const rawLower = (val instanceof Date ? val.toISOString().slice(0, 10) : String(val)).trim().toLowerCase();
    if (op === "=") return rawLower === rhs;
    if (op === "!=") return rawLower !== rhs;
  }

  // 3. Boolean values: avoid substring collisions like "false".includes("a") or "inactive" vs "active"
  if (typeof val === "boolean") {
    if (wanted === "true" || wanted === "yes" || wanted === "1" || wanted === "active") {
      return val === true;
    }
    if (wanted === "false" || wanted === "no" || wanted === "0" || wanted === "inactive") {
      return val === false;
    }
    if (!isDiscreteSelect) {
      const label = val ? "yes" : "no";
      const boolText = val ? "true" : "false";
      return label.startsWith(wanted) || boolText.startsWith(wanted);
    }
    return false;
  }

  const rawStr = (
    val instanceof Date
      ? Number.isNaN(val.getTime())
        ? ""
        : val.toISOString().slice(0, 10)
      : String(val)
  )
    .trim()
    .toLowerCase();

  if (!rawStr) return false;

  // 4. Discrete select / option list: exact match so "Active" never matches "Inactive" and "Male" never matches "Female"
  if (isDiscreteSelect) {
    if (rawStr === wanted) return true;
    const cleanWanted = wanted.replace(/%/g, "").trim();
    const cleanRaw = rawStr.replace(/%/g, "").trim();
    if (cleanWanted.length > 0 && cleanRaw.length > 0) {
      if (cleanRaw === cleanWanted) return true;
      const numVal = Number(cleanRaw);
      const numWanted = Number(cleanWanted);
      if (!Number.isNaN(numVal) && !Number.isNaN(numWanted) && numVal === numWanted) {
        return true;
      }
    }
    return false;
  }

  // 5. Explicit numeric filter type: exact numeric match rather than digit substring
  if (filterType === "number") {
    const numVal = extractFilterNumber(val);
    const numWanted = extractFilterNumber(wanted);
    if (numVal !== null && numWanted !== null) {
      return numVal === numWanted;
    }
    return rawStr === wanted;
  }

  if (rawStr === wanted || rawStr.includes(wanted)) return true;

  // 6. Percentage / numeric equivalence: e.g. val is 63 or 63.0, filterVal is "63%" or "63" or "63.0%"
  const cleanWanted = wanted.replace(/[$€£₹,%\s]/g, "").trim();
  const cleanRaw = rawStr.replace(/[$€£₹,%\s]/g, "").trim();
  if (cleanWanted.length > 0 && cleanRaw.length > 0) {
    if (cleanRaw === cleanWanted || cleanRaw.includes(cleanWanted)) return true;

    const numVal = Number(cleanRaw);
    const numWanted = Number(cleanWanted);
    if (!Number.isNaN(numVal) && !Number.isNaN(numWanted) && numVal === numWanted) {
      return true;
    }
  }

  // 7. Human-readable date matching (both "Apr 12, 2023" and "12 Apr 2023")
  const isoCandidate = val instanceof Date ? rawStr : typeof val === "string" ? val.trim() : "";
  if (isoCandidate && ISO_DATE_PREFIX_PATTERN.test(isoCandidate)) {
    const d = new Date(`${isoCandidate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const fullMonthNames = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ];
      const m = d.getUTCMonth();
      const day = d.getUTCDate();
      const dayPadded = String(day).padStart(2, "0");
      const yr = d.getUTCFullYear();
      const variants = [
        `${monthNames[m]} ${day}, ${yr}`,
        `${monthNames[m]} ${dayPadded}, ${yr}`,
        `${fullMonthNames[m]} ${day}, ${yr}`,
        `${day} ${monthNames[m]} ${yr}`,
        `${dayPadded} ${monthNames[m]} ${yr}`,
        `${day} ${fullMonthNames[m]} ${yr}`,
      ];
      if (variants.some((v) => v.includes(wanted))) return true;
    }
  }

  return false;
}

/**
 * Evaluates a {@link QueryState} against an in-memory client-side dataset:
 * applies global search, column filters, multi-column sorting, and windowed paging.
 *
 * @param data    The complete in-memory dataset.
 * @param query   The current query state (page, pageSize, sort, search, filters).
 * @param options Optional configuration for searchable/sortable/filterable fields and columns.
 * @returns A {@link PagedResponse} representing the requested page window and total filtered count.
 */
export function queryClientData<TData>(
  data: readonly TData[],
  query: QueryState,
  options?: ClientQueryOptions<TData>,
): PagedResponse<TData> {
  let matching = [...data];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafCols: TableXColumn<TData, any>[] = options?.columns
    ? flattenColumns(options.columns)
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findColumn = (field: string): TableXColumn<TData, any> | undefined => {
    if (leafCols.length === 0 || !field) return undefined;
    const lower = field.toLowerCase();
    return leafCols.find((c) => {
      const id = getColumnId(c);
      const accessor = c.accessorKey === undefined ? "" : String(c.accessorKey);
      const sortField = getSortField(c);
      const filterField = getFilterField(c);
      return (
        id.toLowerCase() === lower ||
        accessor.toLowerCase() === lower ||
        sortField.toLowerCase() === lower ||
        filterField.toLowerCase() === lower
      );
    });
  };

  // 1. Global search
  const term = (query.q || "").trim().toLowerCase();
  if (term) {
    const fields = options?.searchableFields;
    matching = matching.filter((row) => {
      if (fields && fields.length > 0) {
        return fields.some((field) => {
          const col = findColumn(field);
          const val = col ? getCellValue(col, row) : readPropertyByPath(row, field);
          if (val === null || val === undefined) return false;
          if (val instanceof Date) {
            return matchesFilterValue(val, term);
          }
          return String(val).toLowerCase().includes(term);
        });
      }
      if (row !== null && typeof row === "object") {
        return Object.values(row as Record<string, unknown>).some(
          (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(term),
        );
      }
      return String(row).toLowerCase().includes(term);
    });
  }

  // 2. Column filters
  const filter = query.filter;
  if (filter && Object.keys(filter).length > 0) {
    const allowedFields = options?.filterableFields;
    const allowedLower = allowedFields ? allowedFields.map((f) => f.toLowerCase()) : null;

    for (const [key, filterVal] of Object.entries(filter)) {
      if (!filterVal || !filterVal.trim()) continue;
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      if (allowedLower && !allowedLower.includes(key.toLowerCase())) continue;

      const col = findColumn(key);
      if (!allowedLower && col && !isFilterable(col, true)) continue;

      matching = matching.filter((row) => {
        if (col && typeof col.filterFn === "function") {
          return col.filterFn(row, getColumnId(col), filterVal);
        }
        const val = col ? getCellValue(col, row) : readPropertyByPath(row, key);
        return matchesFilterValue(
          val,
          filterVal,
          col?.meta
            ? {
                filterType: col.meta.filterType,
                multiSelect: col.meta.multiSelectFilter,
                filterOptions: col.meta.filterOptions,
              }
            : undefined,
        );
      });
    }
  }

  // 3. Multi-column sorting
  const sorts = query.sort || [];
  if (sorts.length > 0) {
    const allowedSorts = options?.sortableFields;
    const allowedLower = allowedSorts ? allowedSorts.map((f) => f.toLowerCase()) : null;

    const activeSorts = sorts.filter((s) => {
      if (!s.field || s.field === "__proto__" || s.field === "constructor" || s.field === "prototype") {
        return false;
      }
      if (allowedLower) {
        return allowedLower.includes(s.field.toLowerCase());
      }
      const col = findColumn(s.field);
      if (col && !isSortable(col)) return false;
      return true;
    });

    if (activeSorts.length > 0) {
      const sortCols = activeSorts.map((s) => ({
        spec: s,
        col: findColumn(s.field),
      }));

      matching.sort((left, right) => {
        for (const { spec, col } of sortCols) {
          if (col && typeof col.sortingFn === "function") {
            const custom = col.sortingFn(left, right, getColumnId(col));
            if (custom !== 0 && Number.isFinite(custom)) {
              return spec.dir === "desc" ? -custom : custom;
            }
            continue;
          }

          const leftVal = col ? getCellValue(col, left) : readPropertyByPath(left, spec.field);
          const rightVal = col ? getCellValue(col, right) : readPropertyByPath(right, spec.field);

          const result = compareValues(leftVal, rightVal, spec.dir);
          if (result !== 0) {
            return result;
          }
        }
        return 0;
      });
    }
  }

  // 4. Pagination
  const total = matching.length;
  if (options?.paginate === false) {
    return {
      items: matching,
      page: 1,
      pageSize: isPageSize(query.pageSize) ? query.pageSize : DEFAULT_PAGE_SIZE,
      total,
      totalPages: 1,
    };
  }
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

/**
 * Compute the count of matching rows for each discrete filter option in `col.meta.filterOptions`.
 */
export function computeFilterOptionCounts<TData>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  col: TableXColumn<TData, any>,
  rows: readonly TData[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  const options = col.meta?.filterOptions;
  if (!options || options.length === 0) return counts;

  for (const opt of options) {
    counts[opt] = 0;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const val = getCellValue(col, row);
    if (val === null || val === undefined) continue;
    const str = String(val).trim().toLowerCase();

    for (const opt of options) {
      if (opt.trim().toLowerCase() === str) {
        counts[opt] = (counts[opt] ?? 0) + 1;
      }
    }
  }

  return counts;
}
