// QueryState <-> query string.
//
// This is THE wire format: `NexGrid.AspNetCore`'s model binder parses exactly
// these parameter names, so a grid pointed at an ASP.NET endpoint works with
// zero glue code. The format is also human-readable and stable for use in
// shareable URLs:
//
//   ?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active

import {
  DEFAULT_PAGE_SIZE,
  isPageSize,
  type QueryState,
  type SortSpec,
} from "./types.js";

/** Serialize a query to `URLSearchParams` (only non-default values are emitted). */
export function toSearchParams(query: QueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  for (const s of query.sort) {
    params.append("sort", `${s.field}:${s.dir}`);
  }
  if (query.q) params.set("q", query.q);
  if (query.filter) {
    for (const [field, value] of Object.entries(query.filter)) {
      params.set(`filter[${field}]`, value);
    }
  }
  return params;
}

/** Serialize a query to a query string (no leading `?`). */
export function serializeQuery(query: QueryState): string {
  return toSearchParams(query).toString();
}

/** Parse one `field:dir` sort token; invalid tokens are dropped. */
function parseSortToken(token: string): SortSpec | undefined {
  const idx = token.lastIndexOf(":");
  const field = idx === -1 ? token : token.slice(0, idx);
  const dir = idx === -1 ? "asc" : token.slice(idx + 1);
  if (!field) return undefined;
  if (dir !== "asc" && dir !== "desc") return { field, dir: "asc" };
  return { field, dir };
}

/**
 * Parse a query string (or `URLSearchParams`) back into a `QueryState`.
 * Unknown values degrade safely: bad pages become 1, bad page sizes become
 * the default, malformed sort tokens are dropped.
 */
export function parseQuery(input: string | URLSearchParams): QueryState {
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;

  const rawPage = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  const rawSize = Number.parseInt(params.get("pageSize") ?? "", 10);
  const pageSize = isPageSize(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;

  const sort: SortSpec[] = [];
  for (const token of params.getAll("sort")) {
    const spec = parseSortToken(token);
    if (spec) sort.push(spec);
  }

  const q = params.get("q") ?? undefined;

  let filter: Record<string, string> | undefined;
  for (const [key, value] of params.entries()) {
    const match = /^filter\[(.+)\]$/.exec(key);
    if (match && match[1]) {
      (filter ??= {})[match[1]] = value;
    }
  }

  return { page, pageSize, sort, ...(q ? { q } : {}), ...(filter ? { filter } : {}) };
}

/** Append a query to a base endpoint URL, preserving any existing params. */
export function buildQueryUrl(endpoint: string, query: QueryState): string {
  const qs = serializeQuery(query);
  if (!qs) return endpoint;
  return endpoint.includes("?") ? `${endpoint}&${qs}` : `${endpoint}?${qs}`;
}
