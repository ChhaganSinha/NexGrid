# @nexgrid/vanilla

A professional, **server-driven** data grid for plain JavaScript — no framework, no
build step required, and zero runtime dependencies beyond [`@nexgrid/core`](../core).

The grid never holds your dataset. Every user action (search, sort, page, page
size) becomes a `QueryState`; you answer with one page of rows and a total, or
you point the grid at an endpoint and let it fetch for itself.

- Global search (350 ms debounce) · column visibility menu · density menu
- Server sorting with the `asc → desc → cleared` cycle
- Row selection, automatic `S.No.` column, row click
- Excel (`.xls`, styled) and CSV export, including whole-dataset export
- Responsive: a table at ≥ 768 px, a card list below — same renderers in both
- Fully localizable, light/dark/auto theming, keyboard and screen-reader ready
- **Safe by construction:** cell values are written as text nodes. There is no
  `innerHTML` path for row data anywhere in this package.

This is also the bundle that powers `TableX.AspNetCore`.

<p align="center">
  <img src="https://raw.githubusercontent.com/ChhaganSinha/NexGrid/master/docs/assets/tablex-preview.png" alt="TableX Vanilla JS Data Grid Preview" width="100%" />
</p>

---

## Install

### npm

```bash
npm install @nexgrid/vanilla
```

```js
import { createTableX } from "@nexgrid/vanilla";
import "@nexgrid/vanilla/styles.css";
```

### Script tag / CDN

The browser bundle inlines `@nexgrid/core` and exposes everything on a global
called `TableX`.

```html
<link rel="stylesheet" href="https://unpkg.com/@nexgrid/vanilla@0.1.0/dist/tablex.css" />
<script src="https://unpkg.com/@nexgrid/vanilla@0.1.0/dist/tablex.global.js"></script>
<script>
  const grid = TableX.createTableX(document.getElementById("grid"), {
    caption: "Students",
    endpoint: "/api/students",
    columns: [{ accessorKey: "name", header: "Name" }],
  });
</script>
```

Serving the files yourself? Copy `dist/tablex.global.js` and `dist/tablex.css`
out of the package — that pair is self-contained.

---

## Quick start

### Endpoint mode — the grid fetches its own data

Point it at any endpoint that accepts TableX's query string and answers with a
`PagedResponse`. That is the wire format `TableX.AspNetCore` binds and returns
out of the box:

```text
GET /api/students?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active

{ "items": [...], "page": 2, "pageSize": 25, "total": 137, "totalPages": 6 }
```

```js
const grid = TableX.createTableX(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns: [
    { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "status", header: "Status", meta: { align: "center" } },
    { accessorKey: "score", header: "Score", meta: { align: "right", width: 90 } },
  ],
  enableSelection: true,
  onSelectionChange: (ids) => console.log(ids),
  onNotify: ({ type, message }) => myToast[type](message),
});
```

The grid fetches on mount and on every query change, shows its own loading
spinner, renders an error card with a working retry button when a request
fails, and discards responses from requests that have already been superseded.

### Controlled mode — you own the data

Supply `data`, `total`, `query` and `onQueryChange`. The grid renders exactly
what you gave it and emits intent; **it does not move on its own** — fetch the
new page and call `handle.update()`:

```js
let query = TableX.defaultQuery();

const grid = TableX.createTableX(document.getElementById("grid"), {
  caption: "Students",
  columns,
  data: [],
  total: 0,
  query,
  onQueryChange: (next) => {
    query = next;
    load(next);
  },
});

async function load(next) {
  grid.update({ isLoading: true });
  try {
    const res = await fetch(TableX.buildQueryUrl("/api/students", next));
    const body = await res.json();
    grid.update({ data: body.items, total: body.total, query: next, isLoading: false, error: false });
  } catch {
    grid.update({ isLoading: false, error: true });
  }
}

load(query);
```

Use controlled mode when the data does not come from a single URL — a GraphQL
client, a websocket feed, an in-memory store, or a query already owned by your
app's router.

---

## Options

`createTableX(container, options)` — `container` is any element; the grid
appends one `div.tbx-root` to it.

### Required

| Option | Type | Description |
| --- | --- | --- |
| `columns` | `TableXColumn<TData, string \| Node>[]` | Column definitions, in display order. |
| `caption` | `string` | Accessible name for the table; also the default export file prefix. |

### Data source — pick one mode

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `data` | `TData[]` | `[]` | The **current page** of rows only, never the full dataset. |
| `total` | `number` | `0` | Total filtered row count. Drives the pager. |
| `query` | `QueryState` | `defaultQuery()` | Initial page / size / sort / search / filters. |
| `onQueryChange` | `(next: QueryState) => void` | — | Fires on every query change, in **both** modes. |
| `endpoint` | `string` | — | Enables endpoint mode: the grid fetches `buildQueryUrl(endpoint, query)` itself and manages loading/error. |
| `fetchOptions` | `RequestInit` | — | Extra `fetch` init (headers, `credentials`, …) for endpoint mode and for export's fetch-all pass. `signal` is always supplied by the grid. |

### Presentation

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `density` | `"compact" \| "default" \| "comfortable"` | `"default"` | Initial row density; the user can change it from the toolbar. |
| `theme` | `"light" \| "dark" \| "auto"` | `"light"` | Adds `tbx-dark` / `tbx-auto` to the root. |
| `className` | `string` | — | Extra classes appended to `.tbx-root`. |
| `isLoading` | `boolean` | `false` | Controlled mode: show the loading state (rows only). |
| `error` | `boolean` | `false` | Controlled mode: replace the whole grid with the error card. |
| `onRetry` | `() => void` | — | Adds a retry button to the error card. In endpoint mode a retry button is shown regardless and refetches. |

### Features

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `showSerialNumber` | `boolean` | `true` | The automatic `S.No.` column, numbered across the whole result set. |
| `enableSearch` | `boolean` | `true` | Global search field, debounced 350 ms. |
| `searchPlaceholder` | `string` | `locale.searchPlaceholder` | Placeholder text override. |
| `enableSelection` | `boolean` | `false` | Row checkboxes and a header select-all for the current page. |
| `onSelectionChange` | `(ids: string[], allAcrossSelected: boolean) => void` | — | The running selection. `allAcrossSelected` is always `false` today (reserved). |
| `onRowClick` | `(row: TData) => void` | — | Row/card click. Adds a pointer cursor. Checkbox clicks never trigger it. |
| `getRowId` | `(row: TData) => string` | `row.id ?? String(row)` | Stable row identity for selection. |
| `toolbarActions` | `Node \| string` | — | Rendered at the end of the toolbar. |

### Export

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enableExport` | `boolean` | `true` | The Excel / CSV export menu. |
| `exportFileName` | `string` | `filePrefixFromCaption(caption)` | File prefix. CSV files also get a `_export_YYYY-MM-DD` suffix. |
| `onExportAll` | `() => void \| Promise<void>` | — | Replaces the built-in export entirely. |
| `fetchEndpoint` | `string` | `options.endpoint` | Used to walk every page when exporting more than the current one. |
| `badgeRules` | `readonly ExcelBadgeRule[]` | `DEFAULT_BADGE_RULES` | Value-based colouring in the Excel export. |

### Localisation & messaging

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `locale` | `Partial<TableXLocale>` | `DEFAULT_LOCALE` | Overrides for any user-facing string. |
| `onNotify` | `(notice: { type, message }) => void` | no-op | The grid never renders toasts; it reports through this. |

#### Export flow

1. `onExportAll` set? It is called and the grid does nothing else.
2. If the current page is the whole result set, or no `fetchEndpoint`/`endpoint`
   is available, the current page is exported.
3. Otherwise you get an `info` notice, the grid walks every page (100 rows at a
   time, capped at 2 000) preserving the active search, sort and filters, and
   falls back to the current page with an `error` notice if that fails. The
   export button is disabled and reads "Exporting…" for the duration.
4. Excel gets styled headers, zebra striping, a serial column and badge colours;
   CSV is RFC 4180 with a UTF-8 BOM and formula-injection neutralisation.
5. A `success` notice reports the row count.

---

## Handle API

`createTableX` returns a handle:

| Method | Description |
| --- | --- |
| `update(patch)` | Patch `data`, `total`, `query`, `isLoading` and/or `error`. Omitted keys are untouched. In endpoint mode a changed `query` triggers a refetch. |
| `refresh()` | Endpoint mode: refetch the current query. Controlled mode: re-render. |
| `getQuery()` | The query currently displayed. |
| `getSelection()` | Ids of the selected rows. |
| `destroy()` | Detaches the grid, aborts any in-flight request, clears the search timer and removes every `document` listener it registered (outside-click, Escape). Safe to call twice. |

```js
grid.update({ data: rows, total: 137, query, isLoading: false });
const ids = grid.getSelection();
grid.destroy();
```

Call `destroy()` when the containing view goes away. Every listener the grid put
on `document` is tracked and released there.

---

## Columns

Column definitions are structurally compatible with TanStack Table's
`ColumnDef`, so column sets written for a TanStack grid work here unchanged.

```ts
{
  id?: string;              // or accessorKey
  accessorKey?: string;     // the row property this column reads
  header?: string | (() => string | Node);
  cell?: (ctx: { row: { original: TData }, getValue(): unknown }) => string | Node;
  enableSorting?: boolean;  // default true
  meta?: {
    width?: number;         // fixed px
    minWidth?: number;      // default 120 when no width is given
    align?: "left" | "center" | "right";
    hidden?: boolean;       // start hidden (still listed in the Columns menu)
    hideable?: boolean;     // default true — false pins it visible
    exportable?: boolean;   // default true
  };
}
```

Columns with the ids `select` and `actions` are treated as structural: never
sorted, never exported, never listed in the Columns menu.

### Custom cell renderers

Return a **string** for text, or a **`Node`** when you need markup:

```js
{
  accessorKey: "status",
  header: "Status",
  cell: ({ row, getValue }) => {
    const badge = TableX.el("span", { class: "badge", text: String(getValue()) });
    badge.dataset.status = row.original.status;
    return badge;
  },
}
```

Two rules:

- **Return a new node on every call.** The renderer runs once for the table row
  and once for the mobile card; handing back the same node would move it out of
  one and into the other.
- **Never build the node from an HTML string.** `el()`, `svgEl()`, `append()`
  and `replaceChildren()` are exported for exactly this reason — they only ever
  write text through `textContent`. Row values passed to `el({ text })` cannot
  be interpreted as markup, which is what keeps a name like
  `<img onerror=…>` a name.

Exports always use the underlying row value, not the rendered node: a custom
cell is presentation, not data.

---

## Theming

The stylesheet is one file of CSS custom properties. Re-skin the grid by
overriding tokens — no class overrides, no `!important`:

```css
.tbx-root {
  --tbx-primary: #7c3aed;
  --tbx-radius: 6px;
  --tbx-font: "Inter", system-ui, sans-serif;
}
```

| Token | Purpose |
| --- | --- |
| `--tbx-font`, `--tbx-font-mono` | Type stacks (mono is used for serial numbers). |
| `--tbx-bg`, `--tbx-card`, `--tbx-card-2` | Input, surface and header-row backgrounds. |
| `--tbx-border` | Every border and divider. |
| `--tbx-fg`, `--tbx-muted`, `--tbx-muted-fg` | Text, subtle fills, secondary text. |
| `--tbx-primary`, `--tbx-primary-fg` | Accent: sort icons, current page, selection tint. |
| `--tbx-danger` | Destructive accent. |
| `--tbx-radius`, `--tbx-radius-sm` | Corner rounding. |
| `--tbx-shadow`, `--tbx-focus-ring` | Elevation and the focus ring. |

Dark mode: pass `theme: "dark"` for an always-dark grid, `theme: "auto"` to
follow the OS preference, or put `.tbx-dark` / `.tbx-auto` on any ancestor to
switch several grids at once.

Density is a data attribute (`data-density="compact|default|comfortable"`) on the
root, so it can be styled or observed from outside the grid.

---

## Accessibility

- `aria-label` on the table, on the search field and on every icon-only control
- `aria-sort` on sortable headers, which are focusable and respond to Enter/Space
- `role="menu"` dropdowns with `role="menuitemcheckbox"` + `aria-checked`,
  arrow-key/Home/End roving focus, Escape to close (focus returns to the
  trigger) and outside-click to dismiss
- `aria-current="page"` on the active pager button, visually hidden labels via
  `.tbx-sr-only`, and decorative SVGs marked `aria-hidden`
- Focus survives re-renders: toolbar inputs are never rebuilt, and controls that
  are rebuilt (checkboxes, headers, pager buttons) are re-focused afterwards

---

## Also exported

Because the browser bundle has no module system to reach the engine through,
this package re-exports the parts of `@nexgrid/core` a page actually needs —
`defaultQuery`, `parseQuery`, `serializeQuery`, `buildQueryUrl`, `withPage`,
`withSearch`, `withToggledSort`, `withSort`, `withPageSize`, `withFilter`,
`getPageNumbers`, `getRecordRange`, `serialNumber`, `totalPagesFor`,
`PAGE_SIZES`, `DENSITIES`, `DEFAULT_LOCALE`, `DEFAULT_BADGE_RULES`,
`downloadCsv`, `downloadExcel`, `fetchAllPages` and the DOM/icon helpers.

Mirroring the grid into the address bar is therefore three lines:

```js
onQueryChange: (next) => {
  history.replaceState(null, "", "?" + TableX.serializeQuery(next));
}
// …and on load: query: TableX.parseQuery(location.search)
```

## Author & Maintainer

**Chhagan Sinha**  
- 📧 Contact: [sinhachhagan@outlook.com](mailto:sinhachhagan@outlook.com)  
- 🐙 GitHub: [@ChhaganSinha](https://github.com/ChhaganSinha)

---

## License

[MIT](https://github.com/ChhaganSinha/TableX/blob/main/LICENSE) © 2026 Chhagan Sinha

