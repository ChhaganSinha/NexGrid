# `@tablex/vanilla` API reference

> The canonical option tables, with prose for every option, live in the package
> README: **[`packages/vanilla/README.md`](../../packages/vanilla/README.md)**.
> This page is the import surface, the type signatures, and the details that
> only matter once you are wiring it up.

```bash
npm install @tablex/vanilla
```

```js
import { createTableX } from "@tablex/vanilla";
import "@tablex/vanilla/styles.css";
```

Or from a script tag — the browser bundle inlines `@tablex/core` and exposes
everything on a global called `TableX`:

```html
<link rel="stylesheet" href="https://unpkg.com/@tablex/vanilla@0.1.0/dist/tablex.css" />
<script src="https://unpkg.com/@tablex/vanilla@0.1.0/dist/tablex.global.js"></script>
```

This bundle is also what `TableX.AspNetCore` embeds.

- [`createTableX`](#createtablex)
- [`TableXOptions<TData>`](#tablexoptionstdata)
- [`TableXHandle<TData>`](#tablexhandletdata)
- [Types](#types)
- [DOM helpers](#dom-helpers)
- [Icons](#icons)
- [Re-exported from `@tablex/core`](#re-exported-from-tablexcore)
- [Packaging](#packaging)

## `createTableX`

```ts
export function createTableX<TData>(
  container: HTMLElement,
  options: TableXOptions<TData>,
): TableXHandle<TData>;
```

`container` is any element; the grid appends one `div.tbx-root` to it. Call
`destroy()` when the containing view goes away.

## `TableXOptions<TData>`

Full descriptions and defaults:
[README › Options](../../packages/vanilla/README.md#options).

```ts
export interface TableXOptions<TData> {
  // Required
  columns: TableXVanillaColumn<TData>[];
  caption: string;

  // Controlled mode
  data?: TData[];                                // default []
  total?: number;                                // default 0
  query?: QueryState;                            // default defaultQuery()
  onQueryChange?: (next: QueryState) => void;    // fires in BOTH modes

  // Endpoint mode
  endpoint?: string;
  fetchOptions?: RequestInit;                    // `signal` is always supplied by the grid

  // Presentation
  density?: Density;                             // default "default"
  isLoading?: boolean;                           // controlled mode only
  error?: boolean;                               // controlled mode only
  onRetry?: () => void;
  className?: string;
  theme?: TableXTheme;                          // default "light"

  // Features & Visibility Toggles
  showToolbar?: boolean;                         // default true
  showFooter?: boolean;                          // default true
  showSerialNumber?: boolean;                    // default true
  enableSearch?: boolean;                        // default true
  searchPlaceholder?: string;
  enableColumns?: boolean;                       // default true
  enableDensity?: boolean;                       // default true
  enableExport?: boolean;                        // default true
  enableSorting?: boolean;                       // default true
  enablePagination?: boolean;                    // default true
  enableRowsPerPage?: boolean;                   // default true
  enableJumpToPage?: boolean;                    // default true
  enableColumnFilters?: boolean;                 // default true
  enableColumnResize?: boolean;                  // default true
  enableSelection?: boolean;                     // default false
  selectionMode?: "multi" | "single";            // default "multi"
  onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;             // default: row.id, else String(row)
  toolbarActions?: Node | string;

  // Enterprise Extensions
  renderExpandedRow?: (row: TData) => TableXNode; // Accordion master-detail rows
  enableBulkActions?: boolean;                   // default true (floating pill bar)
  bulkActions?: (selectedIds: string[], deselectAll: () => void) => TableXNode;
  enableSummaryRow?: boolean;                    // default auto (true if column defines aggregation)
  enableColumnReorder?: boolean;                 // default false (drag & drop reordering)
  onColumnOrderChange?: (newOrder: string[]) => void;
  onCellEdit?: (edit: { row: TData; columnId: string; oldValue: unknown; newValue: unknown }) => void;

  // Export
  exportFileName?: string;                       // default filePrefixFromCaption(caption)
  onExportAll?: () => void | Promise<void>;      // replaces the built-in export
  fetchEndpoint?: string;                        // defaults to `endpoint`
  badgeRules?: readonly ExcelBadgeRule[];

  // Localisation & messaging
  locale?: Partial<TableXLocale>;
  onNotify?: (notice: TableXNotice) => void;    // default: no-op
}
```

### The two modes

| | Controlled | Endpoint |
| --- | --- | --- |
| You supply | `data`, `total`, `query`, `onQueryChange` | `endpoint` |
| Who fetches | you, then `handle.update(...)` | the grid |
| `isLoading` / `error` | you set them | the grid manages them |
| Retry button | rendered when `onRetry` is set | **always** rendered; refetches |
| `onQueryChange` | fires | fires (informational — the query is already applied) |
| `fetchEndpoint` | must be set for whole-dataset export | defaults to `endpoint` |

Endpoint mode fetches on mount and on every query change, and discards responses
from requests that have already been superseded.

`fetchOptions` (headers, `credentials`, …) applies to endpoint-mode fetches and
to the export's fetch-all pass. `signal` is always supplied by the grid so a
superseded request can be aborted, and any `signal` you pass is ignored.

## `TableXHandle<TData>`

```ts
export interface TableXUpdate<TData> {
  data: TData[];
  total: number;
  query: QueryState;
  isLoading: boolean;
  error: boolean;
}

export interface TableXHandle<TData> {
  update(patch: Partial<TableXUpdate<TData>>): void;
  refresh(): void;
  getQuery(): QueryState;
  getSelection(): string[];
  destroy(): void;
}
```

| Method | Behaviour |
| --- | --- |
| `update(patch)` | Patches any subset of the five fields; omitted keys are untouched. In endpoint mode a changed `query` triggers a refetch. |
| `refresh()` | Endpoint mode: refetch the current query. Controlled mode: re-render. |
| `getQuery()` | The query currently displayed. |
| `getSelection()` | Ids of the selected rows, in selection order. |
| `destroy()` | Detaches the grid, aborts any in-flight request, clears the search timer, removes every `document` listener it registered (outside-click, Escape). **Safe to call twice.** |

```js
import { createTableX, buildQueryUrl, defaultQuery } from "@tablex/vanilla";
import "@tablex/vanilla/styles.css";

let query = defaultQuery();

const grid = createTableX(document.getElementById("grid"), {
  caption: "Students",
  columns: [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "email", header: "Email" },
  ],
  data: [],
  total: 0,
  query,
  onQueryChange: (next) => {
    query = next;
    void load(next);
  },
});

async function load(next) {
  grid.update({ isLoading: true });
  try {
    const response = await fetch(buildQueryUrl("/api/students", next));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    grid.update({
      data: body.items,
      total: body.total,
      query: next,
      isLoading: false,
      error: false,
    });
  } catch {
    grid.update({ isLoading: false, error: true });
  }
}

void load(query);
window.addEventListener("beforeunload", () => grid.destroy());
```

## Types

```ts
/** What a vanilla header / cell renderer may return. */
export type TableXNode = string | Node;

export type TableXVanillaColumn<TData> = TableXColumn<TData, TableXNode>;

export type TableXNoticeType = "info" | "success" | "error";

export interface TableXNotice {
  type: TableXNoticeType;
  message: string;
}

export type TableXTheme = "light" | "dark" | "auto";
```

A `string` is written with `textContent` and can never be interpreted as markup.
Returning a `Node` is the **only** way to put elements into a cell, and it is
deliberate: the consumer built that node, so they own its contents.

Two rules for cell renderers:

- **Return a new node on every call.** The renderer runs once for the table row
  and once for the mobile card; handing back the same node would move it out of
  one and into the other.
- **Never build the node from an HTML string.** Use the DOM helpers below.

## DOM helpers

Exported so custom cell renderers in plain JS can build nodes without
hand-rolling `createElement` — and without reaching for `innerHTML`, which is
the failure mode this package is built to avoid.

```ts
export type ElementChild = string | number | Node | null | undefined | false;

export interface ElementProps {
  class?: string;
  text?: string;      // assigned via textContent — never parsed as HTML
  attrs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  style?: Readonly<Record<string, string | undefined>>;   // camelCase keys
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props?: ElementProps, children?: readonly ElementChild[],
): HTMLElementTagNameMap[K];

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K, props?: ElementProps, children?: readonly ElementChild[],
): SVGElementTagNameMap[K];

export function append(parent: Node, children: readonly ElementChild[]): void;
export function replaceChildren(parent: Element, children: readonly ElementChild[]): void;
```

| Detail | Behaviour |
| --- | --- |
| `props.attrs` | `undefined` / `null` / `false` values are skipped; `true` renders as an empty attribute — which is what boolean ARIA and HTML attributes want. |
| `props.style` | Keys are camelCase and converted (`minWidth` → `min-width`). Applied only to `HTMLElement`. |
| `children` | Primitives become text nodes; `null` / `undefined` / `false` are dropped, so `cond && node` works. |
| `svgEl` | Uses `createElementNS`. An `<svg>` built with `createElement` lands in the HTML namespace and renders as nothing. |

```js
import { createTableX, el } from "@tablex/vanilla";
import "@tablex/vanilla/styles.css";

const grid = createTableX(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns: [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "status",
      header: "Status",
      meta: { align: "center", width: 130 },
      cell: ({ row, getValue }) =>
        el(
          "span",
          {
            class: "badge",
            attrs: { "data-status": row.original.status, title: row.original.name },
            style: { minWidth: "72px" },
          },
          [String(getValue())],
        ),
    },
  ],
});
```

## Icons

The grid's own icon set, so toolbar actions and custom cells can match its look.
Each is a factory returning a fresh `SVGSVGElement`, taking one optional class
name — `(className?: string) => SVGSVGElement`:

```js
import {
  arrowDownIcon, arrowUpDownIcon, arrowUpIcon, checkIcon,
  chevronLeftIcon, chevronRightIcon, downloadIcon,
  fileSpreadsheetIcon, fileTextIcon, filterIcon,
  searchIcon, slidersIcon, xIcon,
} from "@tablex/vanilla";
```

All of them use `viewBox="0 0 24 24" fill="none" stroke="currentColor"
stroke-width="2"`, are marked `aria-hidden="true"` and `focusable="false"`, and
carry no size of their own — sizing comes from the class, which defaults to the
one the grid itself uses (`tbx-icon`, `tbx-search-icon`, `tbx-check`,
`tbx-icon--excel`, `tbx-icon--csv`, `tbx-sort-icon`). The full glyph table is in
[`adapter-spec.md` §7](../adapter-spec.md).

```js
import { el, downloadIcon } from "@tablex/vanilla";

const button = el("button", { class: "tbx-btn", attrs: { type: "button" } }, [
  downloadIcon(),
  el("span", { text: "Download template" }),
]);
```

## Re-exported from `@tablex/core`

The browser bundle has no module system to reach the engine through, so a
curated slice of core is re-exported here. Under the script tag these are
`TableX.defaultQuery`, `TableX.parseQuery`, and so on.

**Values**

```ts
import {
  DEFAULT_BADGE_RULES, DEFAULT_LOCALE, DEFAULT_PAGE_SIZE, DENSITIES, PAGE_SIZES,
  buildQueryUrl, defaultQuery, downloadCsv, downloadExcel, fetchAllPages,
  filePrefixFromCaption, formatMessage, getCellText, getCellValue, getColumnId,
  getColumnTitle, getPageNumbers, getRecordRange, isPageSize, parseQuery,
  primarySort, resolveLocale, serialNumber, serializeQuery, timestampedFilename,
  toSearchParams, totalPagesFor, withFilter, withPage, withPageSize, withSearch,
  withSort, withToggledSort,
} from "@tablex/vanilla";
```

**Types**

```ts
import type {
  Density, ExcelBadgeRule, TableXCellContext, TableXColumn, TableXColumnMeta,
  TableXLocale, PageItem, PageSize, PagedResponse, QueryState, RecordRange,
  SortDir, SortSpec,
} from "@tablex/vanilla";
```

Mirroring the grid into the address bar is therefore three lines:

```js
import { createTableX, parseQuery, serializeQuery } from "@tablex/vanilla";
import "@tablex/vanilla/styles.css";

const grid = createTableX(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns: [{ accessorKey: "name", header: "Name" }],
  query: parseQuery(location.search),
  onQueryChange: (next) => history.replaceState(null, "", `?${serializeQuery(next)}`),
});
```

## Packaging

| | |
| --- | --- |
| Entry points | `.` (ESM + CJS + types), `./styles.css`, `./global`, `./package.json` |
| Browser bundle | `dist/tablex.global.js` — IIFE, global `TableX`, core inlined, minified |
| Stylesheet | `dist/tablex.css` — a copy of the core sheet |
| `unpkg` / `jsdelivr` | `dist/tablex.global.js` |
| Runtime dependencies | `@tablex/core` only (inlined in the browser bundle) |
| Node | `>= 18` |
| License | MIT |

`dist/tablex.global.js` and `dist/tablex.css` are self-contained — copy that
pair to serve them yourself. They are also the two files `TableX.AspNetCore`
ships as static web assets.

## Related

- [Package README](../../packages/vanilla/README.md) — the canonical option tables
- [`TableX.AspNetCore` API](aspnet.md) — the Razor front end over this bundle
- [`@tablex/core` API](core.md) · [Columns](../columns.md) · [Theming](../theming.md)
