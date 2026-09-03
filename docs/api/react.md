# `@nexgrid/react` API reference

> The canonical prop table, with prose for every prop, lives in the package
> README: **[`packages/react/README.md`](../../packages/react/README.md)**.
> This page is the import surface, the type signatures, and the details that
> only matter once you are wiring it up.

```bash
npm install @nexgrid/react
```

```ts
import { TableX } from "@nexgrid/react";
import "@nexgrid/react/styles.css";
```

- [Exports](#exports)
- [`TableXProps<TData>`](#tablexpropstdata)
- [Types](#types)
- [Re-exported from `@nexgrid/core`](#re-exported-from-tablexcore)
- [Next.js notes](#nextjs-notes)
- [Packaging](#packaging)

## Exports

| Export | Kind | Notes |
| --- | --- | --- |
| `TableX` | component | `function TableX<TData>(props: TableXProps<TData>): JSX.Element` |
| `TableXProps<TData>` | type | The full prop surface. |
| `TableXReactColumn<TData>` | type | `TableXColumn<TData, ReactNode>`. |
| `TableXNotice` | type | `{ type: TableXNoticeType; message: string }`. |
| `TableXNoticeType` | type | `"info" \| "success" \| "error"`. |
| `TableXTheme` | type | `"light" \| "dark" \| "auto"`. |

Plus the core types and helpers listed under
[Re-exported from `@nexgrid/core`](#re-exported-from-tablexcore).

`TableXProps` lives in its own module inside the package, so importing the prop
type does **not** pull the component (and its `"use client"` boundary) into a
server file.

## `TableXProps<TData>`

Full descriptions and defaults:
[README › Props](../../packages/react/README.md#props).

```ts
export interface TableXProps<TData> {
  // Required — the controlled contract
  columns: TableXReactColumn<TData>[];
  data: TData[];                       // the CURRENT page only
  total: number;                       // full filtered count
  query: QueryState;
  onQueryChange: (next: QueryState) => void;
  caption: string;                     // accessible name + export file/sheet name

  // States
  density?: Density;                   // INITIAL only; default "default"
  isLoading?: boolean;                 // replaces the rows
  error?: boolean;                     // replaces the WHOLE grid
  onRetry?: () => void;                // adds a retry button to the error card

  // Selection & Bulk Actions
  enableSelection?: boolean;           // default false
  selectionMode?: "multi" | "single";  // default "multi"
  onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void;
  enableBulkActions?: boolean;         // default true (floating bar when rows checked)
  bulkActions?: (selectedIds: string[], deselectAll: () => void) => ReactNode;

  // Features & Visibility Toggles
  showToolbar?: boolean;               // default true
  showFooter?: boolean;                // default true
  enableSearch?: boolean;              // default true
  searchPlaceholder?: string;          // overrides locale.searchPlaceholder
  enableColumns?: boolean;             // default true
  enableDensity?: boolean;             // default true
  enableExport?: boolean;              // default true
  enableSorting?: boolean;             // default true
  enablePagination?: boolean;          // default true
  enableRowsPerPage?: boolean;         // default true
  enableJumpToPage?: boolean;          // default true
  enableColumnFilters?: boolean;       // default true
  enableColumnResize?: boolean;        // default true
  showSerialNumber?: boolean;          // default true

  // Enterprise Extensions
  renderExpandedRow?: (row: TData) => ReactNode; // Accordion master-detail rows
  enableSummaryRow?: boolean;          // default auto (true if column defines aggregation)
  enableColumnReorder?: boolean;       // default false (drag & drop reorder)
  onColumnOrderChange?: (newOrder: string[]) => void;
  onCellEdit?: (edit: { row: TData; columnId: string; oldValue: unknown; newValue: unknown }) => void;

  // Toolbar and rows
  toolbarActions?: ReactNode;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;   // default: String(row.id ?? row)
  className?: string;

  // Export
  exportFileName?: string;             // default filePrefixFromCaption(caption)
  onExportAll?: () => void | Promise<void>;   // replaces the built-in export
  fetchEndpoint?: string;              // enables whole-dataset export
  badgeRules?: readonly ExcelBadgeRule[];

  // Messaging and theme
  locale?: Partial<TableXLocale>;
  onNotify?: (notice: TableXNotice) => void;   // default: no-op
  theme?: TableXTheme;                          // default "light"
}
```

Details the table does not spell out:

| Prop | Detail |
| --- | --- |
| `data` / `total` | `data` is one page; `total` is the server's full filtered count. Passing `data.length` as `total` collapses the pager and breaks whole-dataset export. |
| `density` | Read on first render; the Density menu owns it afterwards. Later prop changes are ignored. |
| `error` | Replaces the entire grid with `.tbx-state-card` — toolbar and footer included. `isLoading` only replaces the rows. |
| `onRetry` | Its presence is what renders the retry button. |
| `getRowId` | Used for the selection set **and** as the React key. Rows sharing an id are one identity. |
| `onExportAll` | When set, no fetch-all, no file writing, no notifications. Both menu items call it; the format is not passed. |
| `fetchEndpoint` | React has no endpoint mode — this endpoint is used **only** by the export's fetch-all pass, at `pageSize=100` up to 2,000 rows. Requests go out as `fetch(url, { cache: "no-store" })`; there is no `fetchOptions` prop. |
| `badgeRules` | **Replaces** `DEFAULT_BADGE_RULES`. Spread them in to extend. |
| `theme` | Adds `.tbx-dark` / `.tbx-auto` to the root. The stylesheet also matches those classes on any ancestor. |

## Types

```ts
export type TableXReactColumn<TData> = TableXColumn<TData, ReactNode>;

export type TableXNoticeType = "info" | "success" | "error";

export interface TableXNotice {
  type: TableXNoticeType;
  message: string;
}

export type TableXTheme = "light" | "dark" | "auto";
```

A cell renderer receives core's `TableXCellContext<TData>` and returns any
`ReactNode`:

```tsx
import type { TableXReactColumn } from "@nexgrid/react";

interface Student {
  id: number;
  name: string;
  status: "Active" | "Pending" | "Disabled";
}

export const columns: TableXReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
  {
    accessorKey: "status",
    header: "Status",
    meta: { align: "center", width: 130 },
    cell: ({ row, getValue }) => (
      <span className={`pill pill--${String(getValue()).toLowerCase()}`} title={row.original.name}>
        {String(getValue())}
      </span>
    ),
  },
];
```

The same renderer runs for the table row and for the mobile card, so it must be
side-effect free. See [Columns](../columns.md#custom-cells-per-framework).

## Re-exported from `@nexgrid/core`

So most apps never need a second import.

**Values**

```ts
import {
  defaultQuery, parseQuery, serializeQuery, buildQueryUrl, primarySort,
  withToggledSort, withSort, withSearch, withPage, withPageSize, withFilter,
  totalPagesFor, isPageSize, PAGE_SIZES, DEFAULT_PAGE_SIZE,
  DEFAULT_LOCALE, resolveLocale,
} from "@nexgrid/react";
```

**Types**

```ts
import type {
  TableXColumn, TableXColumnMeta, TableXCellContext, TableXLocale,
  QueryState, SortSpec, SortDir, PageSize, PagedResponse, Density, ExcelBadgeRule,
} from "@nexgrid/react";
```

Anything else — `fetchAllPages`, `toExportColumns`, `downloadCsv`,
`downloadExcel`, `getCellText`, `getPageNumbers`, `DENSITY_ROW_HEIGHT`,
`DEFAULT_BADGE_RULES` — comes from `@nexgrid/core` directly. It is already
installed as a dependency of this package.

Always mutate a `QueryState` through the reducers rather than spreading it by
hand: they are what guarantee that a search or page-size change resets to page
one and that the sort cycle stays `asc → desc → cleared`. See
[`@nexgrid/core` API](core.md#query-reducers).

## Next.js notes

The published bundle carries a `"use client"` banner, so `<TableX />` imports
directly into a client component with no wrapper, and a Server Component can
render that component.

- `columns` contains `cell` functions, and functions do not cross the
  server/client boundary. Define the column array in a `"use client"` file.
- Import `@nexgrid/react/styles.css` from the root layout, or from the client
  component if your setup supports component-level CSS imports.
- The list endpoint must be a route handler (a `GET`), not a Server Action, and
  should opt out of static caching — see
  [Server integration](../server-integration.md#nextjs-route-handlers).

Worked example: [Getting started › Next.js](../getting-started.md#nextjs-app-router).

## Packaging

| | |
| --- | --- |
| Entry points | `.` (ESM + CJS + types), `./styles.css`, `./package.json` |
| Runtime dependencies | `@nexgrid/core` only |
| Peer dependency | `react >= 18` |
| Node | `>= 18` |
| Side effects | none declared |
| License | MIT |

## Related

- [Package README](../../packages/react/README.md) — the canonical prop table
- [`@nexgrid/core` API](core.md) · [Columns](../columns.md) · [Theming](../theming.md) · [Localization](../localization.md)
- [Features](../README.md#features)
