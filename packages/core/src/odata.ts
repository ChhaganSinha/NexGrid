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


const ODATA_NUMBER_LITERAL = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function formatODataComparableLiteral(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "true" || lower === "false") return lower;
  if (ODATA_NUMBER_LITERAL.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, "''")}'`;
}

function parseODataPrefixOperator(
  raw: string,
): { odataOp: "ge" | "le" | "ne" | "gt" | "lt" | "eq"; operand: string } | null {
  const table: ReadonlyArray<readonly [string, "ge" | "le" | "ne" | "gt" | "lt" | "eq"]> = [
    [">=", "ge"],
    ["<=", "le"],
    ["!=", "ne"],
    [">", "gt"],
    ["<", "lt"],
    ["=", "eq"],
  ];
  for (const [prefix, odataOp] of table) {
    if (raw.startsWith(prefix)) {
      const operand = raw.slice(prefix.length).trim();
      if (operand.length > 0) return { odataOp, operand };
    }
  }
  return null;
}

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

  const SAFE_ODATA_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_./]*$/;

  // 1. Order by ($orderby=Name asc, CreatedAt desc)
  if (query.sort && query.sort.length > 0) {
    const orderbyParts: string[] = [];
    for (const s of query.sort) {
      const field = options?.fieldMap?.[s.field] ?? s.field;
      if (!SAFE_ODATA_IDENTIFIER.test(field)) continue;
      const dir = s.dir === "desc" ? "desc" : "asc";
      orderbyParts.push(`${field} ${dir}`);
    }
    if (orderbyParts.length > 0) {
      params.$orderby = orderbyParts.join(", ");
    }
  }

  // 2. Filter & Search ($filter=...)
  const filterClauses: string[] = [];

  if (options?.customFilter) {
    filterClauses.push(`(${options.customFilter})`);
  }

  // Column filters: filter[status]=Active -> Status eq 'Active'
  // Range filters: filter[age]=18..65 -> Age ge 18 and Age le 65
  // Operator filters: filter[score]=>=80 -> score ge 80
  if (query.filter) {
    for (const [key, value] of Object.entries(query.filter)) {
      if (!value || !value.trim()) continue;
      const trimmedVal = value.trim();
      if (trimmedVal === "..") continue;
      const field = options?.fieldMap?.[key] ?? key;
      if (!SAFE_ODATA_IDENTIFIER.test(field)) continue;
      if (trimmedVal.includes("|")) {
        const orParts = trimmedVal
          .split("|")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          .map((t) => `${field} eq ${formatODataComparableLiteral(t)}`);
        if (orParts.length === 1) {
          filterClauses.push(orParts[0]!);
        } else if (orParts.length > 1) {
          filterClauses.push(`(${orParts.join(" or ")})`);
        }
      } else if (trimmedVal.includes("..")) {
        const [minStr, maxStr] = trimmedVal.split("..");
        const parts: string[] = [];
        if (minStr !== undefined && minStr.trim() !== "") {
          parts.push(`${field} ge ${formatODataComparableLiteral(minStr)}`);
        }
        if (maxStr !== undefined && maxStr.trim() !== "") {
          parts.push(`${field} le ${formatODataComparableLiteral(maxStr)}`);
        }
        if (parts.length > 0) {
          filterClauses.push(parts.join(" and "));
        }
      } else {
        const parsedOp = parseODataPrefixOperator(trimmedVal);
        if (parsedOp) {
          filterClauses.push(
            `${field} ${parsedOp.odataOp} ${formatODataComparableLiteral(parsedOp.operand)}`,
          );
        } else {
          const lower = trimmedVal.toLowerCase();
          if (lower === "true" || lower === "false") {
            filterClauses.push(`${field} eq ${lower}`);
          } else {
            const escapedVal = trimmedVal.replace(/'/g, "''");
            filterClauses.push(`${field} eq '${escapedVal}'`);
          }
        }
      }
    }
  }

  // Global search: q=smith -> contains(tolower(Name), 'smith') or contains(tolower(Email), 'smith')
  const term = (query.q || "").trim();
  if (term && options?.searchableFields && options.searchableFields.length > 0) {
    const escapedTerm = term.replace(/'/g, "''").toLowerCase();
    const searchClauses: string[] = [];
    for (const field of options.searchableFields) {
      const prop = options?.fieldMap?.[field] ?? field;
      if (!SAFE_ODATA_IDENTIFIER.test(prop)) continue;
      searchClauses.push(`contains(tolower(${prop}), '${escapedTerm}')`);
    }
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
