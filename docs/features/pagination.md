# Pagination

The footer holds three things: a record range, a rows-per-page select, and a
pager with numbered buttons and a page-jump box. All three read from
`@nexgrid/core`, so they behave identically on every platform.

- [The footer](#the-footer)
- [Page sizes](#page-sizes)
- [Changing pages](#changing-pages)
- [The numbered pager](#the-numbered-pager)
- [The record range](#the-record-range)
- [Serial numbers](#serial-numbers)
- [What resets to page 1](#what-resets-to-page-1)
- [Server side](#server-side)

## The footer

```text
Showing 21 to 40 of 1,284 entries        Rows: [25 v]  ‹ 1 … 4 5 6 … 52 ›   Go to [ 5 ]
```

| Element | Source | Class |
| --- | --- | --- |
| "Showing X to Y of Z entries" | `getRecordRange(page, pageSize, total)` + `locale.showingRange` | `.nxg-range` |
| "N selected" badge | selection state + `locale.selectedBadge` | `.nxg-selected-badge` |
| Rows-per-page select | `PAGE_SIZES` | `.nxg-rows-select` |
| Numbered buttons and ellipses | `getPageNumbers(page, totalPages)` | `.nxg-page-btn`, `.nxg-page-ellipsis` |
| Prev / next | disabled on the first / last page | `.nxg-page-nav` |
| Page jump | submits on Enter or blur | `.nxg-jump-input` |

Total pages are always at least 1, so the pager renders even for an empty
result set:

```ts
export function totalPagesFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}
```

## Page sizes

```ts
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;
export function isPageSize(n: number): n is PageSize;
```

The allowlist is not decoration. It is what stops `?pageSize=5000000` from
turning one careless URL into a full table scan, and `PageSize` being a union
type means an out-of-range size cannot be constructed in TypeScript at all.

`withPageSize` silently ignores anything outside the set:

```ts
import { defaultQuery, withPageSize } from "@nexgrid/core";

let query = defaultQuery();        // pageSize: 10
query = withPageSize(query, 50);   // pageSize: 50, page -> 1
query = withPageSize(query, 7);    // unchanged — 7 is not allowlisted
```

`parseQuery` coerces instead: an unknown `pageSize` on the wire becomes
`DEFAULT_PAGE_SIZE`. `NexGrid.AspNetCore`'s `PageSizes.Coerce` does the same on
the server, so client and server agree about what a hand-edited URL means.

Starting at a different size:

```ts
import { defaultQuery, withPageSize, type QueryState } from "@nexgrid/core";

const initial: QueryState = withPageSize(defaultQuery(), 25);
```

```cshtml
<nex-grid caption="Students" endpoint="/api/students" page-size="25">…</nex-grid>
```

The set itself is fixed. To offer different sizes, render your own control and
hand the grid a query — the grid renders whatever `query.pageSize` says, and
`PAGE_SIZES` only governs the built-in select.

## Changing pages

```ts
export function withPage(query: QueryState, page: number, totalPages: number): QueryState {
  const clamped = Math.min(Math.max(1, Math.trunc(page)), Math.max(1, totalPages));
  return { ...query, page: clamped };
}
```

`withPage` needs `totalPages` because clamping is the point: a "go to page"
input accepts any integer, and the grid must not ask the server for page 900 of
52. Compute it with `totalPagesFor`:

```ts
import { totalPagesFor, withPage, type QueryState } from "@nexgrid/core";

function goToLastPage(query: QueryState, total: number): QueryState {
  const totalPages = totalPagesFor(total, query.pageSize);
  return withPage(query, totalPages, totalPages);
}
```

A full external pager, driving a controlled React grid:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  NexGrid,
  buildQueryUrl,
  defaultQuery,
  totalPagesFor,
  withPage,
  type NexGridReactColumn,
  type PagedResponse,
  type QueryState,
} from "@nexgrid/react";
import "@nexgrid/react/styles.css";

interface Student {
  id: number;
  name: string;
  email: string;
}

const columns: NexGridReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
];

export function StudentsGrid() {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
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

  const total = page?.total ?? 0;
  const totalPages = totalPagesFor(total, query.pageSize);

  return (
    <>
      <button
        type="button"
        disabled={query.page >= totalPages}
        onClick={() => setQuery((q) => withPage(q, q.page + 1, totalPages))}
      >
        Next page
      </button>

      <NexGrid
        caption="Students"
        columns={columns}
        data={page?.items ?? []}
        total={total}
        query={query}
        onQueryChange={setQuery}
        isLoading={isLoading}
      />
    </>
  );
}
```

## The numbered pager

```ts
export type PageItem = number | "...";
export function getPageNumbers(currentPage: number, totalPages: number): PageItem[];
```

Seven pages or fewer are shown in full. Beyond that, the first page, the last
page, and a window of one page either side of the current page are shown, with
ellipses filling the gaps:

| `currentPage` | `totalPages` | Result |
| --- | --- | --- |
| 1 | 5 | `[1, 2, 3, 4, 5]` |
| 1 | 20 | `[1, 2, "...", 20]` |
| 5 | 20 | `[1, "...", 4, 5, 6, "...", 20]` |
| 19 | 20 | `[1, "...", 18, 19, 20]` |

The current button carries `aria-current="page"`; the ellipsis is a
non-interactive `<span>`, not a disabled button.

## The record range

```ts
export interface RecordRange {
  start: number;   // 1-based index of the first visible record (0 when empty)
  end: number;     // 1-based index of the last visible record (0 when empty)
  total: number;
}

export function getRecordRange(page: number, pageSize: number, total: number): RecordRange;
```

`getRecordRange(3, 20, 1284)` → `{ start: 41, end: 60, total: 1284 }`. An empty
result set returns all zeros rather than `1 to 0 of 0`.

The sentence itself is a locale template with three placeholders, so word order
and separators stay yours:

```ts
locale={{ showingRange: "Affichage de {start} à {end} sur {total} entrées" }}
```

`total` is the **full filtered count** from the server, not `data.length`.
Passing `items.length` there is the single most common integration bug: the
pager collapses to one page and the export thinks it already has everything.

## Serial numbers

The automatic first column numbers rows across the whole result set, not within
the page:

```ts
export function serialNumber(page: number, pageSize: number, indexOnPage: number): number {
  return (page - 1) * pageSize + indexOnPage + 1;
}
```

Row 1 of page 3 at 20 per page is `41`. Turn the column off with
`showSerialNumber={false}` (React), `[showSerialNumber]="false"` (Angular),
`showSerialNumber: false` (vanilla) or `show-serial-number="false"` (Tag
Helper). The header text comes from `locale.serialHeader` (`"S.No."`), and the
same header labels the serial column in Excel exports.

## What resets to page 1

Anything that changes *which rows match*:

| Action | Reducer | Resets page |
| --- | --- | --- |
| Search | `withSearch` | Yes |
| Sort | `withToggledSort`, `withSort` | Yes |
| Page size | `withPageSize` | Yes |
| Filter | `withFilter` | Yes |
| Page | `withPage` | — (clamped instead) |

Sorting resets too, even though the matching set is unchanged: page 3 of "by
name" and page 3 of "by score" contain different rows, so keeping the number
would be arbitrary.

This is exactly why you should mutate a `QueryState` through the reducers rather
than spreading it — see [Concepts](../concepts.md#the-reducers-are-the-api).

## Server side

`page` is 1-based on the wire; the offset is yours to compute.

```csharp
// ASP.NET Core — ToPagedResponseAsync does this for you
db.Students.AsNoTracking().ToPagedResponseAsync(query, options => options
    .Sortable(s => s.Name, s => s.CreatedAt)
    .DefaultSort(s => s.CreatedAt, SortDirection.Descending), ct);
```

```ts
// Anywhere else
import { parseQuery, type PagedResponse } from "@nexgrid/core";

const query = parseQuery(new URL(request.url).searchParams);
const skip = (query.page - 1) * query.pageSize;
const total = await countMatching(query);

const body: PagedResponse<Student> = {
  items: await fetchWindow(query, skip, query.pageSize),
  page: query.page,
  pageSize: query.pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
};
```

Two rules worth repeating:

- **Count and page must share the same filters.** Counting the unfiltered table
  and paging the filtered one produces a pager that promises rows that do not
  exist.
- **Order before you page.** `OFFSET`/`FETCH` over an unordered query has no
  defined row order — pages overlap and rows disappear.

## Client side (In-Memory Datasets)

When you already have a full in-memory dataset in the browser (e.g. 500 items fetched once, or static data), use `queryClientData` or the `useClientNexGrid` hook. It executes global search, column filters, multi-column sorting, and windowed pagination completely on the client:

### React (`useClientNexGrid`)
```tsx
import { NexGrid, useClientNexGrid } from "@nexgrid/react";

export function ClientTable({ allStudents }: { allStudents: Student[] }) {
  // Handles in-memory pagination, search, sort, and filters automatically
  const grid = useClientNexGrid(allStudents);

  return (
    <NexGrid
      caption="Students"
      columns={columns}
      {...grid}
    />
  );
}
```

### Vanilla JS / Angular / Core (`queryClientData`)
```ts
import { defaultQuery, queryClientData, type QueryState } from "@nexgrid/core";

let query: QueryState = defaultQuery();

// Pure evaluator: returns exactly one page of items and total filtered count
const page = queryClientData(allStudents, query, {
  searchableFields: ["name", "email", "department"],
  sortableFields: ["name", "score", "enrolledAt"],
});

console.log(page.items);      // 10 items for page 1
console.log(page.total);      // 500 total
console.log(page.totalPages); // 50 pages
```

## Related

- [Search](search.md) · [Sorting](sorting.md) · [Selection](selection.md)
- [Server integration](../server-integration.md)
- [`@nexgrid/core` API](../api/core.md) — `queryClientData`, `getPageNumbers`, `getRecordRange`, `serialNumber`
- [`@nexgrid/react` API](../api/react.md) — `useClientNexGrid`

