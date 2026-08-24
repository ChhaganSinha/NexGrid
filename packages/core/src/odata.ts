// OData v4 query builder and response adapter for NexGrid.
//
// Translates NexGrid's QueryState (page, pageSize, sort, q, filter) into standard
// OData v4 URL parameters ($top, $skip, $orderby, $filter, $count=true) and transforms
// OData responses back into PagedResponse<T>.

import {
  DEFAULT_PAGE_SIZE,
  isPageSize,
  type PagedResponse,
  type QueryState,
} from "./types.js";
import { totalPagesFor } from "./query.js";


/** Options for customizing OData v4 query parameter generation. */
export interface ODataQueryOptions {
  /** Map of NexGrid column IDs to OData entity property names (e.g. `{ createdAt: "CreationDate" }`). */
  fieldMap?: Record<string, string>;
  /** Searchable field names used to generate `$filter = contains(tolower(field), 'term')` when `query.q` is present. */
  searchableFields?: string[];
  /** Optional OData `$select` fields. */
  select?: string[];
  /** Optional OData `$expand` navigation properties. */
  expand?: string[];
  /** Custom base filter string appended with `and` to active column filters. */
  customFilter?: string;
}

/**
 * Converts a NexGrid {@link QueryState} into standard OData v4 URL search parameters:
 * `$top`, `$skip`, `$orderby`, `$filter`, and `$count=true`.
 *
 * @param query   The active NexGrid query state.
 * @param options Optional field mappings, search fields, select, and expand clauses.
 * @returns A record of OData query parameters.
 */
export function toODataParams(
  query: QueryState,
  options?: ODataQueryOptions,
): Record<string, string> {
  const pageSize = isPageSize(query.pageSize) ? query.pageSize : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, query.page || 1);
  const skip = (page - 1) * pageSize;

  const params: Record<string, string> = {
    $top: String(pageSize),
    $skip: String(skip),
    $count: "true",
  };

  if (options?.select && options.select.length > 0) {
    params.$select = options.select.join(",");
  }
  if (options?.expand && options.expand.length > 0) {
    params.$expand = options.expand.join(",");
  }

  // 1. Order by ($orderby=Name asc, CreatedAt desc)
  if (query.sort && query.sort.length > 0) {
    const orderbyParts = query.sort.map((s) => {
      const field = options?.fieldMap?.[s.field] ?? s.field;
      return `${field} ${s.dir}`;
    });
    params.$orderby = orderbyParts.join(", ");
  }

  // 2. Filter & Search ($filter=...)
  const filterClauses: string[] = [];

  if (options?.customFilter) {
    filterClauses.push(`(${options.customFilter})`);
  }

  // Column filters: filter[status]=Active -> Status eq 'Active'
  if (query.filter) {
    for (const [key, value] of Object.entries(query.filter)) {
      if (!value) continue;
      const field = options?.fieldMap?.[key] ?? key;
      const escapedVal = value.replace(/'/g, "''");
      filterClauses.push(`${field} eq '${escapedVal}'`);
    }
  }

  // Global search: q=smith -> contains(tolower(Name), 'smith') or contains(tolower(Email), 'smith')
  const term = (query.q || "").trim();
  if (term && options?.searchableFields && options.searchableFields.length > 0) {
    const escapedTerm = term.replace(/'/g, "''").toLowerCase();
    const searchClauses = options.searchableFields.map((field) => {
      const prop = options?.fieldMap?.[field] ?? field;
      return `contains(tolower(${prop}), '${escapedTerm}')`;
    });
    if (searchClauses.length > 0) {
      filterClauses.push(`(${searchClauses.join(" or ")})`);
    }
  }

  if (filterClauses.length > 0) {
    params.$filter = filterClauses.join(" and ");
  }

  return params;
}

/**
 * Builds a complete OData v4 URL from an endpoint and {@link QueryState}.
 *
 * @param endpoint The base OData collection endpoint (e.g. `https://api.example.com/odata/Students`).
 * @param query    The active NexGrid query state.
 * @param options  Optional field mappings and projection options.
 * @returns The parameterized OData v4 URL string.
 */
export function buildODataUrl(
  endpoint: string,
  query: QueryState,
  options?: ODataQueryOptions,
): string {
  const params = toODataParams(query, options);
  const searchParams = new URLSearchParams(params);
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${searchParams.toString()}`;
}

/** Standard raw OData v4 JSON response structure. */
export interface ODataResponse<TData> {
  value: TData[];
  "@odata.count"?: number;
  "odata.count"?: number;
  count?: number;
}

/**
 * Transforms a raw OData v4 JSON response into a standard NexGrid {@link PagedResponse}.
 *
 * @param response The JSON response received from the OData endpoint.
 * @param query    The query state that initiated the request.
 * @returns A normalized {@link PagedResponse} ready for NexGrid.
 */
export function fromODataResponse<TData>(
  response: ODataResponse<TData>,
  query: QueryState,
): PagedResponse<TData> {
  const items = response.value || [];
  const rawTotal =
    response["@odata.count"] ?? response["odata.count"] ?? response.count ?? items.length;
  const total =
    typeof rawTotal === "number" ? rawTotal : parseInt(String(rawTotal), 10) || items.length;
  const pageSize = isPageSize(query.pageSize) ? query.pageSize : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, query.page || 1);

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: totalPagesFor(total, pageSize),
  };
}
