# @nexgrid/core

The framework-agnostic engine behind [TableX](https://github.com/ChhaganSinha/NexGrid) —
a professional, server-driven data grid for React, Angular, vanilla JS, and ASP.NET Core.

You normally install a framework adapter (`@nexgrid/react`, `@nexgrid/angular`,
`@nexgrid/vanilla`) which depends on this package. Install `@nexgrid/core`
directly when you only need the contract types, the query reducers, or the
export engine (e.g. in server code or tests).

## What lives here

| Area | Exports |
| ---- | ------- |
| **Server contract** | `QueryState`, `PagedResponse<T>`, `SortSpec`, `PAGE_SIZES`, `Density` |
| **Column model & Grouping** | `TableXColumn<T>` (recursive `columns` for multi-level stacked headers), `flattenColumns`, `hasHeaderGroups`, `buildHeaderRows`, `getColumnId`, `getColumnTitle`, `getCellText`, visibility helpers |
| **Client query engine** | `queryClientData` — in-memory search, sorting, filtering, and page slicing for local arrays |
| **State persistence** | `saveGridState`, `loadGridState`, `clearGridState` — persistent column widths, ordering, visibility, and density |
| **Query reducers** | `withToggledSort`, `withToggledMultiSort`, `withSearch`, `withPage`, `withPageSize`, `withFilter` — pure functions so every adapter behaves identically |
| **Pagination math** | `getPageNumbers` (ellipsis model), `getRecordRange`, `serialNumber`, `totalPagesFor` |
| **Wire format & OData** | `serializeQuery` / `parseQuery` / `buildQueryUrl`, plus OData v4 helpers (`toODataParams`, `buildODataUrl`, `fromODataResponse`) |
| **Export engine** | RFC 4180 CSV (BOM + formula-injection defense) and formatted Excel (.xls) with value-based badge styling |
| **Full-dataset collection** | `fetchAllPages` — walks a paginated endpoint at the max allowlisted page size, with a hard row cap |
| **Locale** | `TableXLocale`, `DEFAULT_LOCALE`, `formatMessage`, `resolveLocale` |
| **Theme** | `@nexgrid/core/styles.css` — the shared stylesheet, themed entirely via `--tbx-*` CSS custom properties |

<p align="center">
  <img src="https://raw.githubusercontent.com/ChhaganSinha/NexGrid/master/docs/assets/tablex-preview.png" alt="TableX Core Engine & Data Grid Preview" width="100%" />
</p>

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
.my-app .tbx-root {
  --tbx-primary: #7c3aed;
  --tbx-radius: 8px;
}
```

Add the `tbx-dark` class on the grid root (or an ancestor) for dark mode, or
`tbx-auto` to follow the OS preference.

## Author & Maintainer

**Chhagan Sinha**  
- 📧 Contact: [sinhachhagan@outlook.com](mailto:sinhachhagan@outlook.com)  
- 🐙 GitHub: [@ChhaganSinha](https://github.com/ChhaganSinha)

## License

[MIT](https://github.com/ChhaganSinha/NexGrid/blob/main/LICENSE) © 2026 Chhagan Sinha
