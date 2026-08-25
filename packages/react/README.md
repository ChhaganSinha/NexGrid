# @tablex/react

A server-driven data grid for React and Next.js.

TableX renders one page of rows at a time and never holds the dataset. Every
piece of user intent — page, page size, sort, search, filters — is expressed as
a single `QueryState` object that **you** own; the grid hands you the next one
and re-renders when you hand back the matching page. That is the whole contract.
There is no local sort that quietly reorders 10 rows out of 40,000, and no
client-side filter that hides records the total still counts.

Around that core it provides the things every real admin table ends up needing:
debounced global search, a sort cycle, column visibility, row density,
selection, formatted Excel and CSV export, a paginated footer with a page-jump,
loading / empty / error states, and a card layout for phones — all styled by one
stylesheet shared with the Angular and vanilla adapters, so the same grid looks
identical on every platform.

- Zero runtime dependencies beyond `@tablex/core`. React is a peer dependency.
- Written for strict TypeScript, generic over your row type.
- Ships ESM and CJS, with a `"use client"` banner so it drops straight into the
  Next.js App Router.

## Installation

```bash
npm install @tablex/react @tablex/core
```

Import the stylesheet once, anywhere in your app:

```ts
import "@tablex/react/styles.css";
```

## Quick start

The grid is fully controlled. Hold a `QueryState` in state, fetch whenever it
changes, and pass the result straight through.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TableX,
  defaultQuery,
  serializeQuery,
  type TableXReactColumn,
  type PagedResponse,
  type QueryState,
} from "@tablex/react";
import "@tablex/react/styles.css";

interface Student {
  id: number;
  name: string;
  email: string;
  status: "Active" | "Pending" | "Disabled";
  joinedAt: string;
}

const columns: TableXReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "status",
    header: "Status",
    meta: { align: "center", width: 130 },
    cell: ({ getValue }) => {
      const status = String(getValue());
      return <span className={`pill pill--${status.toLowerCase()}`}>{status}</span>;
    },
  },
  {
    accessorKey: "joinedAt",
    header: "Joined",
    cell: ({ getValue }) => new Date(String(getValue())).toLocaleDateString(),
  },
];

export function StudentsGrid() {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Student> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (next: QueryState) => {
    setIsLoading(true);
    setError(false);
    try {
      // serializeQuery produces ?page=2&pageSize=25&sort=name:asc&q=smith
      const response = await fetch(`/api/students?${serializeQuery(next)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPage((await response.json()) as PagedResponse<Student>);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  return (
    <TableX
      caption="Students"
      columns={columns}
      data={page?.items ?? []}
      total={page?.total ?? 0}
      query={query}
      onQueryChange={setQuery}
      isLoading={isLoading}
      error={error}
      onRetry={() => void load(query)}
      enableSelection
      onSelectionChange={(ids) => console.log("selected", ids)}
      // Lets an export page in the whole filtered dataset, not just this page.
      fetchEndpoint="/api/students"
      // The grid never renders toasts — forward these to your own.
      onNotify={({ type, message }) => console.info(type, message)}
    />
  );
}
```

Your endpoint must answer with a `PagedResponse<T>`:

```json
{ "items": [], "page": 1, "pageSize": 10, "total": 0, "totalPages": 1 }
```

If your API is ASP.NET Core, `TableX.AspNetCore` binds exactly the query string
`serializeQuery` produces and returns exactly this shape.

### Putting the query in the URL

`QueryState` round-trips through a query string, so making the grid shareable and
back-button-friendly is a swap of the state hook:

```tsx
const searchParams = useSearchParams();
const router = useRouter();
const query = useMemo(() => parseQuery(searchParams.toString()), [searchParams]);

<TableX
  query={query}
  onQueryChange={(next) => router.replace(`?${serializeQuery(next)}`)}
  {...rest}
/>;
```

`parseQuery` degrades safely — a bad page becomes 1, an unknown page size
becomes the default, malformed sort tokens are dropped — so a hand-edited URL can
never put the grid into an impossible state.

## Next.js App Router

The published bundle starts with `"use client"`, so `<TableX />` can be imported
directly from a Server Component without a wrapper:

```tsx
// app/students/page.tsx — a Server Component
import { StudentsGrid } from "./students-grid";

export default async function Page() {
  return <StudentsGrid />;
}
```

Two notes:

- Anything you pass through props still crosses the server/client boundary, so
  `columns` (which contains `cell` functions) must be defined in a file marked
  `"use client"`, not in the server page.
- Import `@tablex/react/styles.css` from your root layout, or from the client
  component itself if your setup supports component-level CSS imports.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `TableXReactColumn<TData>[]` | required | Column definitions, in display order. |
| `data` | `TData[]` | required | The **current page** of rows only. |
| `total` | `number` | required | Total filtered row count from the server. Drives the pager. |
| `query` | `QueryState` | required | The query the `data` above answers. |
| `onQueryChange` | `(next: QueryState) => void` | required | Called with the next query on page / size / sort / search changes. |
| `caption` | `string` | required | Accessible name for the table; also the default export file name and sheet title. |
| `density` | `"compact" \| "default" \| "comfortable"` | `"default"` | **Initial** density. The user owns it afterwards. |
| `isLoading` | `boolean` | `false` | Replaces the rows with a spinner. The toolbar and footer stay usable. |
| `error` | `boolean` | `false` | Replaces the **whole grid** with an error card. |
| `onRetry` | `() => void` | — | When set, the error card offers a retry button. |
| `enableSelection` | `boolean` | `false` | Renders selection checkboxes. |
| `onSelectionChange` | `(ids: string[], allAcrossSelected: boolean) => void` | — | Fires after each selection change. `allAcrossSelected` is reserved and always `false`. |
| `enableSearch` | `boolean` | `true` | Shows the debounced global search box. |
| `searchPlaceholder` | `string` | `locale.searchPlaceholder` | Placeholder text for the search box. |
| `toolbarActions` | `ReactNode` | — | Rendered at the end of the toolbar, after the export menu. |
| `onRowClick` | `(row: TData) => void` | — | Row / card click handler. Adds a pointer cursor and makes rows keyboard-activatable. |
| `getRowId` | `(row: TData) => string` | `String(row.id ?? row)` | Stable row identity, used for selection and React keys. |
| `className` | `string` | — | Extra class(es) on the grid root. |
| `showSerialNumber` | `boolean` | `true` | Shows the automatic `S.No.` column, numbered across the whole result set. |
| `enableExport` | `boolean` | `true` | Shows the export menu. |
| `exportFileName` | `string` | caption, lower-cased and underscored | File name prefix, without extension. |
| `onExportAll` | `() => void \| Promise<void>` | — | Takes over exporting entirely; the built-in flow never runs. |
| `fetchEndpoint` | `string` | — | List endpoint used to page in the rest of the dataset when exporting. |
| `badgeRules` | `readonly ExcelBadgeRule[]` | core's `DEFAULT_BADGE_RULES` | Value-based cell styling for the Excel export. |
| `locale` | `Partial<TableXLocale>` | English defaults | Overrides for any user-facing string. |
| `onNotify` | `(notice: TableXNotice) => void` | no-op | Receives `{ type, message }` for export progress, failures, and successes. |
| `theme` | `"light" \| "dark" \| "auto"` | `"light"` | Adds `.tbx-dark` / `.tbx-auto` to the root. |

## Column definitions

A column is a plain object, structurally compatible with TanStack Table's
`ColumnDef` — existing column sets usually work unchanged.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Column id. Falls back to `accessorKey`. |
| `accessorKey` | `string` | The row property this column reads. |
| `header` | `string \| (ctx) => ReactNode` | Header content. A string is also used for menus and export headers. |
| `cell` | `(ctx: { row: { original: TData }, getValue(): unknown }) => ReactNode` | Custom cell renderer. Without it the raw value is rendered as text. |
| `enableSorting` | `boolean` | Sorting is on by default; set `false` to opt out. |
| `meta` | `TableXColumnMeta` | Layout and behavior hints — see below. |

### `meta`

| Field | Type | Description |
|-------|------|-------------|
| `width` | `number` | Fixed pixel width. |
| `minWidth` | `number` | Minimum width in pixels. Defaults to `120` when no `width` is set. |
| `align` | `"left" \| "center" \| "right"` | Header and cell alignment. |
| `hidden` | `boolean` | Start hidden. Still listed in the Columns menu. |
| `hideable` | `boolean` | Set `false` to keep the column out of the Columns menu. |
| `exportable` | `boolean` | Set `false` to keep the column out of CSV/Excel exports. |
| `serverFilterable`, `serverFilterField`, `filterOptions` | — | Declare a column as server-filterable (`filter[field]=value`). |

Two ids are structural: `select` and `actions`. They are never sortable, never
hideable, and never exported.

### Custom cells

`cell` returns any `ReactNode`, and the same renderer is used by the table and
the mobile card list, so the two can never drift apart.

```tsx
const columns: TableXReactColumn<Student>[] = [
  // A status pill.
  {
    accessorKey: "status",
    header: "Status",
    meta: { align: "center", width: 130 },
    cell: ({ getValue }) => {
      const status = String(getValue());
      return <span className={`pill pill--${status.toLowerCase()}`}>{status}</span>;
    },
  },

  // Composed from more than one field — reach through `row.original`.
  {
    id: "student",
    header: "Student",
    cell: ({ row }) => (
      <div className="stack">
        <strong>{row.original.name}</strong>
        <small>{row.original.email}</small>
      </div>
    ),
  },

  // A row action menu. `actions` is structural: unsortable and never exported.
  {
    id: "actions",
    header: "",
    meta: { align: "right", width: 64 },
    cell: ({ row }) => (
      <button type="button" onClick={(event) => event.stopPropagation()}>
        Edit
      </button>
    ),
  },
];
```

Two things worth knowing:

- Exports read the **underlying row value**, not the rendered cell. A custom cell
  is presentation; the `status` column above exports `Active`, not the markup of
  the pill. Set `meta.exportable: false` on columns that carry no data.
- When `onRowClick` is set, call `event.stopPropagation()` in interactive cell
  content so a button click does not also open the row. Selection checkboxes
  already do this for you.

## Theming

Every color and shape in the stylesheet reads a CSS custom property, so you
re-skin the grid by overriding tokens — no class overrides, no `!important`.

```css
.tbx-root {
  --tbx-primary: #7c3aed;
  --tbx-primary-fg: #ffffff;
  --tbx-radius: 8px;
  --tbx-font: "Inter", system-ui, sans-serif;
}
```

| Token | Purpose |
|-------|---------|
| `--tbx-font`, `--tbx-font-mono` | Body font, and the serial-number font. |
| `--tbx-bg` | Input and pager background. |
| `--tbx-card`, `--tbx-card-2` | Panel background, and the table header band. |
| `--tbx-border` | Every border and divider. |
| `--tbx-fg`, `--tbx-muted-fg` | Primary and secondary text. |
| `--tbx-muted` | Hover fills and subtle chips. |
| `--tbx-primary`, `--tbx-primary-fg` | Accent: sort icons, current page, selection. |
| `--tbx-danger` | Destructive accents. |
| `--tbx-radius`, `--tbx-radius-sm` | Panel and control corner radii. |
| `--tbx-shadow`, `--tbx-focus-ring` | Elevation, and the focus ring. |

Dark mode is a class, not a media query, so it can follow whatever your app
already uses:

```tsx
<TableX theme="dark" {...props} />   {/* always dark          */}
<TableX theme="auto" {...props} />   {/* follows the OS       */}
```

`theme="dark"` puts `.tbx-dark` on the grid root. If your app already toggles a
dark class higher up the tree, add `tbx-dark` alongside it and leave `theme`
alone — the stylesheet matches `.tbx-dark .tbx-root` as well.

Responsive behavior is driven entirely by the stylesheet: the grid renders both a
table and a card list, and CSS shows the table at ≥ 768px and the cards below it.

## Exporting

The export menu offers a formatted Excel workbook (`.xls`, with colored status
badges) and a raw CSV (RFC 4180, UTF-8 BOM, with spreadsheet-formula injection
neutralized). Both write the **visible** columns, minus anything marked
`meta.exportable: false`.

By default an export contains the current page. Pass `fetchEndpoint` and the grid
will page through the rest of the filtered dataset first, preserving the active
search, sort, and filters, at 100 rows per request up to a 2,000-row safety cap.
If those requests fail it notifies you and falls back to the current page rather
than producing nothing.

```tsx
<TableX
  fetchEndpoint="/api/students"
  exportFileName="student_roster"
  badgeRules={[
    { values: ["Active"], background: "#dcfce7", color: "#15803d" },
    { values: ["Disabled"], background: "#fee2e2", color: "#b91c1c" },
  ]}
  onNotify={({ type, message }) => toast[type](message)}
  {...props}
/>
```

To export server-side instead — a real `.xlsx`, a background job, a signed
download URL — pass `onExportAll`. It replaces the built-in flow completely.

## Notifications

The grid never renders toasts. A toast belongs to your design system, and two
competing toast stacks in one page is a worse bug than no toast at all. Anything
the grid wants to say arrives at `onNotify` as `{ type, message }` where `type`
is `"info" | "success" | "error"`, ready to forward to whatever you already use.

## Localization

Every user-facing string comes from a locale object. Override any subset:

```tsx
<TableX
  locale={{
    searchPlaceholder: "Rechercher…",
    emptyText: "Aucun enregistrement ne correspond à votre recherche.",
    showingRange: "Affichage de {start} à {end} sur {total} entrées",
    rowsPerPage: "Lignes :",
  }}
  {...props}
/>
```

Templates keep their `{placeholder}` tokens so word order stays yours. Import
`DEFAULT_LOCALE` from this package to see every key.

## Accessibility

- `aria-label={caption}` on the table; every icon-only control has an accessible
  name drawn from the locale.
- Sortable headers are focusable, activate on Enter or Space, and carry
  `aria-sort` (`ascending` / `descending` / `none`).
- Menus are `role="menu"` with `role="menuitemcheckbox"` and `aria-checked`
  items; they close on outside click and on Escape, which returns focus to the
  trigger.
- The header checkbox reports the mixed state when only part of a page is
  selected.
- The current page button carries `aria-current="page"`.
- When `onRowClick` is set, rows and cards become focusable and activate on
  Enter. Keep genuinely interactive content in a cell rather than relying on the
  row handler alone.

## Re-exported from `@tablex/core`

For convenience, the pieces a host needs to drive a controlled grid are
re-exported from this package, so most apps never import `@tablex/core`
directly:

`defaultQuery`, `parseQuery`, `serializeQuery`, `buildQueryUrl`, `primarySort`,
`withToggledSort`, `withSort`, `withSearch`, `withPage`, `withPageSize`,
`withFilter`, `totalPagesFor`, `isPageSize`, `PAGE_SIZES`, `DEFAULT_PAGE_SIZE`,
`DEFAULT_LOCALE`, `resolveLocale`.

Always mutate a `QueryState` through those reducers rather than spreading it by
hand — they are what guarantee that a search or a page-size change resets to page
one and that the sort cycle stays `asc → desc → cleared` across every adapter.

## Author & Maintainer

**Chhagan Sinha**  
- 📧 Contact: [sinhachhagan@outlook.com](mailto:sinhachhagan@outlook.com)  
- 🐙 GitHub: [@ChhaganSinha](https://github.com/ChhaganSinha)

## License

[MIT](https://github.com/ChhaganSinha/TableX/blob/main/LICENSE) © 2026 Chhagan Sinha

