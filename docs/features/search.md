# Search

One global search box, debounced 350 ms, applied on the server.

- [Behavior](#behavior)
- [What reaches the server](#what-reaches-the-server)
- [Turning it off and relabelling it](#turning-it-off-and-relabelling-it)
- [Driving the search from outside](#driving-the-search-from-outside)
- [Per-column filters](#per-column-filters)

## Behavior

| | |
| --- | --- |
| Debounce | 350 ms after the last keystroke |
| Reducer | `withSearch(query, value)` |
| Page reset | Yes — a new search always returns to page 1 |
| Empty input | `q` is removed from the query entirely, not sent as `q=` |
| Clear button | Rendered inside the field whenever it holds text |
| External changes | A `query.q` change from outside syncs into the input |
| Accessible name | `Search {caption}` on the input |

The debounce exists because a search is a round trip. Without it, typing
"smith" issues five queries and the user sees four discarded result sets flash
past. With it, one query is issued and `total` settles once.

The reducer is a two-liner, and it is the whole rule:

```ts
export function withSearch(query: QueryState, q: string): QueryState {
  const trimmed = q;
  return { ...query, q: trimmed ? trimmed : undefined, page: 1 };
}
```

Note it does **not** trim whitespace. A trailing space is meaningful in some
data sets, so the decision is left to the server.

## What reaches the server

```text
GET /api/students?page=1&pageSize=25&q=smith
```

The grid has no opinion about what `q` means. Matching one column or ten,
prefix or substring, case-sensitive or not, full-text index or `LIKE` — all of
that is the endpoint's decision, which is what makes the same grid work over a
SQL table and a search cluster.

On ASP.NET Core, `Searchable` declares the members and `Contains` is OR'd
across them:

```csharp
db.Students.AsNoTracking().ToPagedResponseAsync(query, options => options
    .Searchable(s => s.Name, s => s.Email)
    .Sortable(s => s.Name, s => s.CreatedAt)
    .DefaultSort(s => s.CreatedAt, SortDirection.Descending), ct);
```

Nothing is searchable unless it is registered — see
[Server integration](../server-integration.md#the-allowlist).

## Turning it off and relabelling it

```tsx
// React
<TableX enableSearch={false} {...props} />
<TableX searchPlaceholder="Find a student by name or email…" {...props} />
```

```html
<!-- Angular -->
<table-x [enableSearch]="false" …/>
<table-x searchPlaceholder="Find a student by name or email…" …/>
```

```js
// Vanilla
createTableX(container, {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  enableSearch: false,
});
```

```cshtml
<!-- ASP.NET Core -->
<table-x caption="Students" endpoint="/api/students" enable-search="false">…</table-x>
<table-x caption="Students" endpoint="/api/students"
          search-placeholder="Find a student…">…</table-x>
```

`searchPlaceholder` overrides `locale.searchPlaceholder` for one grid. To change
it for every grid in the app, override the locale instead — see
[Localization](../localization.md).

## Driving the search from outside

Because `q` lives in `QueryState`, anything that can produce a `QueryState` can
drive the search: a URL, a saved view, a dashboard drill-through.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TableX,
  buildQueryUrl,
  defaultQuery,
  withSearch,
  type TableXReactColumn,
  type PagedResponse,
  type QueryState,
} from "@nexgrid/react";
import "@nexgrid/react/styles.css";

interface Student {
  id: number;
  name: string;
  email: string;
  status: string;
}

const columns: TableXReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "status", header: "Status", meta: { align: "center" } },
];

export function StudentsGrid({ initialSearch }: { initialSearch?: string }) {
  const [query, setQuery] = useState<QueryState>(() =>
    initialSearch ? withSearch(defaultQuery(), initialSearch) : defaultQuery(),
  );
  const [page, setPage] = useState<PagedResponse<Student> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (next: QueryState) => {
    setIsLoading(true);
    try {
      const response = await fetch(buildQueryUrl("/api/students", next));
      setPage((await response.json()) as PagedResponse<Student>);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  return (
    <>
      <button type="button" onClick={() => setQuery((q) => withSearch(q, "smith"))}>
        Show the Smiths
      </button>
      <button type="button" onClick={() => setQuery((q) => withSearch(q, ""))}>
        Clear
      </button>
      <TableX
        caption="Students"
        columns={columns}
        data={page?.items ?? []}
        total={page?.total ?? 0}
        query={query}
        onQueryChange={setQuery}
        isLoading={isLoading}
      />
    </>
  );
}
```

The input tracks `query.q`, so both buttons update the visible search box as
well as the results.

Always go through `withSearch` rather than spreading `{ ...query, q }` by hand:
the reducer is what resets `page` to 1 and what turns `""` into `undefined`.

## Per-column filters

`q` is the global search. Structured, per-column filters are a separate part of
the query:

```ts
import { withFilter, type QueryState } from "@nexgrid/core";

let query: QueryState = defaultQuery();
query = withFilter(query, "status", "Active");    // filter[status]=Active
query = withFilter(query, "status", undefined);   // removed
```

```text
GET /api/students?page=1&pageSize=25&q=smith&filter[status]=Active
```

Declare the column as filterable so the intent travels with the column set:

```ts
{
  accessorKey: "status",
  header: "Status",
  meta: {
    align: "center",
    serverFilterable: true,
    filterOptions: ["Active", "Pending", "Disabled"],
  },
}
```

`serverFilterField` covers the case where the API's filter key differs from the
column id. On ASP.NET Core, register the member with `Filterable("status", s => s.Status)`
or the filter is ignored.

## Related

- [Sorting](sorting.md) · [Pagination](pagination.md)
- [Server integration](../server-integration.md) — implementing search server-side
- [Localization](../localization.md) — `searchPlaceholder`, `clearSearch`
