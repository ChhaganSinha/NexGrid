# @nexgrid/core

The framework-agnostic engine behind [NexGrid](https://github.com/ChhaganSinha/NexGrid) —
a professional, server-driven data grid for React, Angular, vanilla JS, and ASP.NET Core.

You normally install a framework adapter (`@nexgrid/react`, `@nexgrid/angular`,
`@nexgrid/vanilla`) which depends on this package. Install `@nexgrid/core`
directly when you only need the contract types, the query reducers, or the
export engine (e.g. in server code or tests).

## What lives here

| Area | Exports |
| ---- | ------- |
| **Server contract** | `QueryState`, `PagedResponse<T>`, `SortSpec`, `PAGE_SIZES`, `Density` |
| **Column model** | `NexGridColumn<T>` (TanStack-compatible shape), `getColumnId`, `getColumnTitle`, `getCellText`, visibility helpers |
| **Query reducers** | `withToggledSort`, `withSearch`, `withPage`, `withPageSize`, `withFilter` — pure functions so every adapter behaves identically |
| **Pagination math** | `getPageNumbers` (ellipsis model), `getRecordRange`, `serialNumber` |
| **Wire format** | `serializeQuery` / `parseQuery` / `buildQueryUrl` — the exact format `NexGrid.AspNetCore` binds on the server |
| **Export engine** | RFC 4180 CSV (BOM + formula-injection defense) and formatted Excel (.xls) with value-based badge styling |
| **Full-dataset collection** | `fetchAllPages` — walks a paginated endpoint at the max allowlisted page size, with a hard row cap |
| **Locale** | `NexGridLocale`, `DEFAULT_LOCALE`, `formatMessage` |
| **Theme** | `@nexgrid/core/styles.css` — the shared stylesheet, themed entirely via `--nxg-*` CSS custom properties |

## Install

```bash
npm install @nexgrid/core
```

## The server contract

```ts
import type { QueryState, PagedResponse } from "@nexgrid/core";

// Client -> server (querystring): ?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active
// Server -> client (JSON):
interface PagedResponse<T> {
  items: T[];       // ONE page of rows — never the full dataset
  page: number;
  pageSize: number;
  total: number;    // full FILTERED count; drives the pager
  totalPages: number;
}
```

## Theming

```css
/* Override tokens anywhere above the grid — no class overrides needed. */
.my-app .nxg-root {
  --nxg-primary: #7c3aed;
  --nxg-radius: 8px;
}
```

Add the `nxg-dark` class on the grid root (or an ancestor) for dark mode, or
`nxg-auto` to follow the OS preference.

## License

[MIT](https://github.com/ChhaganSinha/NexGrid/blob/main/LICENSE)
