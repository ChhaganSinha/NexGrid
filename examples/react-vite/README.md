# TableX — React + Vite example

A Vite + React + TypeScript app with a fully controlled `<TableX />` over 200
students served by an in-memory mock API that honours the real `QueryState`
contract: global search, sorting, a column filter, and paging — with simulated
latency and a button that fails the next request so you can see the error card.

## Run it

The example links the packages straight out of this repository, so build them
first:

```bash
# from the repository root
npm install
npm run build          # produces packages/*/dist

# then, in this folder
cd examples/react-vite
npm install
npm run dev            # http://localhost:5173
```

`npm run build` here type-checks and produces a production bundle;
`npm run preview` serves it.

## How the packages are resolved

`package.json` points at the workspace with `file:` specifiers so the example
runs against your local build:

```jsonc
"dependencies": {
  "@nexgrid/core": "file:../../packages/core",
  "@nexgrid/react": "file:../../packages/react"
},
// @nexgrid/react itself depends on "@nexgrid/core": "0.1.0"; this points that
// transitive dependency at the local folder too, so nothing is fetched from
// a registry.
"overrides": {
  "@nexgrid/core": "file:../../packages/core"
}
```

In your own app both lines are simply `"0.1.0"` (or whatever version you are
installing) and the `overrides` block disappears:

```bash
npm install @nexgrid/react @nexgrid/core
```

## What is where

| File | What it shows |
| --- | --- |
| `src/mock-api.ts` | The server half of the contract: 200 deterministic rows, and a `queryStudents(query)` that applies search → filter → sort → count → page, returning a `PagedResponse<Student>`. Sorting and filtering are **allowlisted**, the same rule `TableX.AspNetCore` enforces with `.Sortable(...)`. |
| `src/columns.tsx` | Custom cell renderers: a two-line student cell, a status badge, a formatted `<time>` date, a numeric score, a boolean rendered by the locale's yes/no labels, and an `actions` column with `stopPropagation()` so buttons do not also fire the row click. |
| `src/App.tsx` | The integration: `query` in state, fetch on change, `data`/`total` back in. Also selection, a toolbar status filter built with `withFilter`, a theme toggle, a retry path, and `onNotify` wired to the page. |
| `src/index.css` | Page chrome and the classes the custom cells use. The grid itself is styled by `@nexgrid/react/styles.css`, imported once in `src/main.tsx`. |

## The parts worth copying

**The grid is controlled.** Four props carry everything:

```tsx
<TableX
  columns={columns}
  data={page?.items ?? []}   // the CURRENT page only
  total={page?.total ?? 0}   // the full filtered count — this draws the pager
  query={query}
  onQueryChange={setQuery}   // every sort, page, size and keystroke arrives here
  caption="Students"
/>
```

**Never spread a `QueryState` by hand.** Mutate it through the reducers
(`withFilter`, `withSearch`, `withPage`, `withToggledSort`, `withPageSize`) —
they are what guarantee that a filter or a page-size change resets to page 1 and
that the sort cycle stays `asc → desc → cleared` on every platform.

**Discard superseded responses.** `App.tsx` tags each fetch with a ticket and
drops any answer that is no longer the newest. Without that, three fast
keystrokes can end with the first response painting over the third.

**`total` is the filtered count**, not `items.length`. Returning the latter
silently collapses the grid to a single page.

## Swapping the mock for a real endpoint

`fetchStudents` is the only function that would change:

```ts
import { serializeQuery, type PagedResponse, type QueryState } from "@nexgrid/react";

export async function fetchStudents(query: QueryState): Promise<PagedResponse<Student>> {
  const response = await fetch(`/api/students?${serializeQuery(query)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as PagedResponse<Student>;
}
```

`serializeQuery` writes `?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active`
— exactly what `TableX.AspNetCore` binds, and exactly what
`examples/nextjs`'s route handler parses with `parseQuery`.

Add `fetchEndpoint="/api/students"` once you have a real URL and the export menu
will page in the whole filtered dataset instead of only the visible page.
