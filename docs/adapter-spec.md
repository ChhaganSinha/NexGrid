# NexGrid Adapter Specification

This document is the **normative contract** every NexGrid adapter (React,
Angular, vanilla/ASP.NET) must implement. If an adapter and this spec
disagree, the adapter is wrong.

The engine — types, query reducers, pagination math, export, locale, theme
CSS — lives in `@nexgrid/core` and MUST be imported, never reimplemented.

---

## 1. Data model (server-driven, always)

- The grid **never** holds the full dataset and **never** sorts / filters /
  paginates client-side.
- All user intent is a `QueryState`; the host fetches and hands back one page
  (`data` + `total`), or the grid self-fetches (vanilla `endpoint` mode) a
  `PagedResponse<T>` from `buildQueryUrl(endpoint, query)`.
- Every query mutation MUST go through the core reducers:
  `withToggledSort`, `withSearch`, `withPage`, `withPageSize`, `withFilter`.
  These enforce: sort cycles `asc → desc → cleared`; search / page-size / sort
  changes reset to page 1; page numbers clamp to `[1, totalPages]`.

## 2. Common feature set (all adapters)

| # | Feature | Behavior |
|---|---------|----------|
| 1 | Global search | Text input, debounced **350 ms**, then `withSearch`. Clear button when non-empty. External `query.q` changes sync into the input. |
| 2 | Columns menu | Toggle visibility of every `isHideable` column (structural `select`/`actions` and `hideable: false` columns excluded). Initial state from `initialHiddenColumns`. |
| 3 | Density menu | `compact` / `default` / `comfortable`; sets `data-density` on the root element. Labels from locale. |
| 4 | Sorting | Click a sortable header → `withToggledSort`. Icons: idle = up-down arrows at 40% opacity; active = up (asc) or down (desc) in primary color. `isSortable` from core decides. |
| 5 | Selection | Optional (`enableSelection`). Header checkbox = select/unselect all rows **on the current page** (adds to / removes from the running set). Row checkbox toggles one row. Emits `(selectedIds: string[], allAcrossSelected: boolean)` — `allAcrossSelected` is `false` today (API reserved). Selected rows get highlighted styling and a "N selected" badge in the footer. Checkbox clicks must NOT trigger row click. |
| 6 | Serial numbers | Automatic first column `S.No.` = `serialNumber(page, pageSize, indexOnPage)` from core. On by default; `showSerialNumber: false` hides it. |
| 7 | Export | Dropdown with two options: **Formatted Excel (.xls)** (`downloadExcel`, `DEFAULT_BADGE_RULES` unless overridden) and **Raw CSV (.csv)** (`downloadCsv`). See §5 for the flow. |
| 8 | Pagination footer | "Showing X to Y of Z entries" from `getRecordRange`; rows-per-page select over `PAGE_SIZES`; numbered buttons from `getPageNumbers` with ellipsis; prev/next; "Go to" page-jump input (submit on Enter or blur; invalid input resets to the current page). |
| 9 | States | `isLoading` → spinner + locale `loadingText` (replaces rows only). Empty → locale `emptyText`. `error` → the WHOLE grid is replaced by an error card with locale `errorText` and a retry button when `onRetry` is provided. |
| 10 | Row click | Optional `onRowClick(row)`; adds pointer cursor. |
| 11 | Responsive | Table at ≥ 768 px; a card list below (one card per record, label/value per visible column, same custom cell renderers, same selection & row click). Handled by the shared CSS (`.nxg-table-wrap` / `.nxg-cards`) — adapters render BOTH structures. |
| 12 | Toolbar actions | A slot rendered at the end of the toolbar (children / template / node). |
| 13 | Locale | Every user-facing string from `resolveLocale(partial)`; format with `formatMessage`. |
| 14 | Notifications | The grid never renders toasts. It calls `onNotify({ type: "info" \| "success" \| "error", message })` (adapter-idiomatic: prop / EventEmitter / option). Default: no-op. |
| 15 | A11y | `aria-label={caption}` on the table; accessible names on every icon-only control (from locale); `aria-sort` on sorted headers; visually-hidden text via `.nxg-sr-only`. |

## 3. Column definitions

Core's `NexGridColumn<TData, TRender>` — structurally TanStack-compatible:

```ts
{
  id?: string;             // or accessorKey (TanStack alias)
  accessorKey?: string;
  header?: string | (ctx) => TRender;
  cell?: (ctx: { row: { original: TData }, getValue(): unknown }) => TRender;
  enableSorting?: boolean; // default true
  meta?: { width?, minWidth?, flex?, align?, hidden?, hideable?, exportable?, ... }
}
```

- React binds `TRender = React.ReactNode`; vanilla binds `string | Node`;
  Angular uses `header`/`cell` when they return strings and additionally
  supports `TemplateRef` cell templates via the `*nexGridCell` directive.
- Default cell rendering (no `cell`): `getCellText(getCellValue(col, row), {yes, no})`.
- Width handling: `meta.width` → fixed px; else `minWidth ?? 120` and natural
  layout. `meta.align` sets `text-align` on `th`/`td` (and the
  `.nxg-th-inner--center/right` class on the header inner wrapper).

## 4. Adapter APIs

### 4.1 `@nexgrid/react` — `<NexGrid />`

```ts
export interface NexGridProps<TData> {
  columns: NexGridColumn<TData, React.ReactNode>[];
  data: TData[];                 // CURRENT page only
  total: number;                 // full filtered count
  query: QueryState;
  onQueryChange: (next: QueryState) => void;
  caption: string;               // required, accessible name

  density?: Density;             // initial; default "default"
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  enableSelection?: boolean;     // default false
  onSelectionChange?: (ids: string[], allAcrossSelected: boolean) => void;
  enableSearch?: boolean;        // default true
  searchPlaceholder?: string;    // overrides locale.searchPlaceholder
  toolbarActions?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;   // default r => String((r as any).id ?? r)
  className?: string;
  showSerialNumber?: boolean;    // default true
  enableExport?: boolean;        // default true
  exportFileName?: string;       // default filePrefixFromCaption(caption)
  onExportAll?: () => void | Promise<void>;  // replaces built-in export when set
  fetchEndpoint?: string;        // enables full-dataset export via fetchAllPages
  badgeRules?: readonly ExcelBadgeRule[];
  locale?: Partial<NexGridLocale>;
  onNotify?: (notice: { type: "info" | "success" | "error"; message: string }) => void;
  theme?: "light" | "dark" | "auto";   // adds nxg-dark / nxg-auto class; default "light"
}
export function NexGrid<TData>(props: NexGridProps<TData>): JSX.Element;
```

- File starts with `"use client"` (via build banner) so it drops into Next.js
  App Router pages untouched.
- No dependency other than `@nexgrid/core`; `react` is a peer (>= 18).
- Dropdowns are self-contained (open on click, close on outside click and
  Escape, `role="menu"` / `role="menuitemcheckbox"` with `aria-checked`).

### 4.2 `@nexgrid/angular` — `<nex-grid>`

Standalone component (Angular ≥ 17), selector `nex-grid`.

- **Inputs** mirror the React props: `columns, data, total, query, caption,
  density, isLoading, error, enableSelection, enableSearch, searchPlaceholder,
  showSerialNumber, enableExport, exportFileName, fetchEndpoint, badgeRules,
  locale, getRowId, theme, rowClickable`.
- **Outputs**: `queryChange: EventEmitter<QueryState>`,
  `selectionChange: EventEmitter<{ ids: string[]; allAcrossSelected: boolean }>`,
  `rowClick: EventEmitter<TData>`, `retry: EventEmitter<void>`,
  `notify: EventEmitter<{ type; message }>`, `exportAll: EventEmitter<void>`
  (when observed, replaces built-in export).
- Custom cells: `NexGridCellDirective` (`*nexGridCell="'columnId'"`) declared
  as content children; the template receives `$implicit` = row and `value`.
  Toolbar actions via a `[nexGridToolbar]` template or content projection.

### 4.3 `@nexgrid/vanilla` — `createNexGrid`

```ts
export interface NexGridHandle<TData> {
  update(patch: Partial<NexGridUpdate<TData>>): void; // data/total/query/isLoading/error
  refresh(): void;               // endpoint mode: refetch current query
  getQuery(): QueryState;
  getSelection(): string[];
  destroy(): void;
}
export function createNexGrid<TData>(
  container: HTMLElement,
  options: NexGridOptions<TData>,
): NexGridHandle<TData>;
```

- `NexGridOptions` mirrors the React props (callbacks instead of props), with
  `cell?: (ctx) => string | Node` renderers, plus **either**:
  - controlled mode: `data`, `total`, `query`, `onQueryChange`; or
  - **endpoint mode**: `endpoint: string` — the grid fetches
    `buildQueryUrl(endpoint, query)` itself (expects `PagedResponse<T>` JSON),
    manages loading/error internally, and still emits `onQueryChange`.
- Values render as **text nodes** — never `innerHTML` — unless a custom
  renderer returns a Node.
- Ships ESM/CJS (core external) **and** a browser IIFE bundle
  (`dist/nexgrid.global.js`, global `NexGrid`, core inlined, minified) plus a
  copy of the core stylesheet at `dist/nexgrid.css` — these two files are what
  `NexGrid.AspNetCore` embeds as static web assets.

### 4.4 `NexGrid.AspNetCore`

Razor Class Library, `net8.0`, `<FrameworkReference Include="Microsoft.AspNetCore.App" />`.

- **`NexGridQuery`** — binds `page`, `pageSize`, `sort` (repeatable
  `field:dir`), `q`, `filter[field]` from the query string (exactly core's
  wire format). Invalid values degrade the same way `parseQuery` does.
- **`PagedResponse<T>`** — `Items, Page, PageSize, Total, TotalPages`
  (serializes camelCase by default under System.Text.Json).
- **`IQueryable` extensions** with explicit allowlists (never reflect raw
  query-string values into expressions):

```csharp
var result = await db.Students.AsNoTracking()
    .ToPagedResponseAsync(query, options => options
        .Sortable(s => s.Name, s => s.CreatedAt)
        .Searchable(s => s.Name, s => s.Email)
        .Filterable("status", s => s.Status));
// sync variant ToPagedResponse for non-EF providers; both apply
// search -> filters -> sort -> count -> page in that order.
```

- **Tag Helpers**: `<nex-grid caption="Students" endpoint="/api/students" ...>`
  with `<nex-grid-column field="name" header="Name" sortable="true" align="Left"
  width="..." />` children. Renders a container `div` + JSON config `<script
  type="application/json">` + an init call into `NexGrid.createNexGrid` from
  the bundled IIFE. Assets served from the RCL's static web assets
  (`_content/NexGrid.AspNetCore/nexgrid.global.js` and `nexgrid.css`).
- The `.csproj` copies `packages/vanilla/dist/nexgrid.global.js` and
  `dist/nexgrid.css` into `wwwroot/` before build **when they exist**
  (`Condition="Exists(...)"`), so the .NET project still compiles in isolation.

## 5. Export flow (identical everywhere)

1. If the host supplied `onExportAll` (React/vanilla) / observes `exportAll`
   (Angular): invoke it and STOP — the host owns the export.
2. Collect rows: if `data.length >= total` or no `fetchEndpoint` → current
   page rows. Else notify `info` `exportFetchingAll`, then
   `fetchAllPages(page => fetch(buildQueryUrl(endpoint, { ...query, page, pageSize })))`
   — preserving the current `q`/`sort`/`filter`. On fetch failure: notify
   `error` `exportFetchFailed` and fall back to current page rows. An
   `isExporting` flag disables the export button (label → `exportingButton`).
3. No rows → notify `error` `exportNoData`, stop.
4. Build columns via `toExportColumns(visibleColumns, {yes, no})` (visible +
   exportable only). Excel → `downloadExcel({ filename, caption, rows,
   columns, badgeRules, serialHeader })`; CSV →
   `downloadCsv(timestampedFilename(prefix), rows, columns)`.
5. Notify `success` with `exportExcelSuccess` / `exportCsvSuccess`.

## 6. DOM contract

All adapters emit this structure (identical classes ⇒ identical rendering by
the shared stylesheet). Structural order matters.

```text
div.nxg-root [data-density=compact|default|comfortable] [.nxg-dark|.nxg-auto] [+ user className]
├─ div.nxg-toolbar
│  ├─ div.nxg-toolbar-group
│  │  ├─ div.nxg-search                            (when enableSearch)
│  │  │  ├─ svg.nxg-search-icon
│  │  │  ├─ input.nxg-search-input [type=search] [aria-label="Search {caption}"]
│  │  │  └─ button.nxg-search-clear > svg + span.nxg-sr-only   (when text present)
│  │  ├─ div.nxg-menu-wrap                         (Columns)
│  │  │  ├─ button.nxg-btn [aria-haspopup=menu] [aria-expanded] > svg.nxg-icon + span
│  │  │  └─ div.nxg-menu [role=menu]               (when open)
│  │  │     ├─ div.nxg-menu-label
│  │  │     ├─ div.nxg-menu-separator
│  │  │     └─ button.nxg-menu-item [role=menuitemcheckbox] [aria-checked]
│  │  │        > svg.nxg-check + span              (one per hideable column)
│  │  └─ div.nxg-menu-wrap                         (Density; same pattern, 3 items)
│  └─ div.nxg-toolbar-group.nxg-toolbar-group--end
│     ├─ div.nxg-menu-wrap                         (when enableExport)
│     │  ├─ button.nxg-btn.nxg-btn--export [disabled while exporting]
│     │  └─ div.nxg-menu.nxg-menu--end [role=menu]
│     │     ├─ button.nxg-menu-item > svg.nxg-icon--excel + div.nxg-menu-item-title > strong + small
│     │     └─ button.nxg-menu-item > svg.nxg-icon--csv  + div.nxg-menu-item-title > strong + small
│     └─ {toolbarActions}
├─ div.nxg-table-wrap
│  └─ table.nxg-table [aria-label=caption]
│     ├─ thead > tr
│     │  ├─ th.nxg-th.nxg-th--serial               (when showSerialNumber)
│     │  ├─ th.nxg-th.nxg-th--select > input.nxg-checkbox   (when enableSelection)
│     │  └─ th.nxg-th [.nxg-th--sortable] [aria-sort] [style width/minWidth/textAlign]
│     │     └─ div.nxg-th-inner [--center|--right] > span + span > svg.nxg-sort-icon [--idle]
│     └─ tbody
│        ├─ loading:  tr > td.nxg-state [colspan] > span.nxg-spinner + div
│        ├─ empty:    tr > td.nxg-state [colspan]
│        └─ rows:     tr.nxg-row [--selected] [--clickable]
│           ├─ td.nxg-td.nxg-td--serial
│           ├─ td.nxg-td.nxg-td--select > input.nxg-checkbox
│           └─ td.nxg-td [style textAlign]
├─ div.nxg-cards                                    (mobile mirror of tbody)
│  └─ div.nxg-card [--selected] [--clickable]
│     ├─ div.nxg-card-head > span.nxg-card-serial + span.nxg-card-select > input.nxg-checkbox
│     └─ dl.nxg-card-rows > div.nxg-card-row > dt + dd
└─ div.nxg-footer
   ├─ div.nxg-range > span (Showing <strong>X</strong> to <strong>Y</strong> of
   │                        <strong.nxg-range-total>Z</strong> entries)
   │                + span.nxg-selected-badge        (when selection non-empty)
   └─ div.nxg-pagination
      ├─ div.nxg-rows-per-page > span + select.nxg-rows-select (PAGE_SIZES)
      ├─ div.nxg-pager
      │  ├─ button.nxg-page-nav (prev, disabled on first) > svg + span.nxg-sr-only
      │  ├─ button.nxg-page-btn [--current] | span.nxg-page-ellipsis   (from getPageNumbers)
      │  └─ button.nxg-page-nav (next, disabled on last)
      └─ form.nxg-jump > label.nxg-jump-label + input.nxg-jump-input [type=number]

error state: the root renders ONLY
div.nxg-state-card > p.nxg-state-text + button.nxg-btn (when onRetry)
```

## 7. Icons (inline SVG, identical everywhere)

All icons: `viewBox="0 0 24 24" fill="none" stroke="currentColor"
stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`,
`aria-hidden="true"`.

| Name | Elements |
|------|----------|
| search | `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>` |
| x | `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>` |
| sliders (Columns) | `<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>` |
| filter (Density) | `<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>` |
| download | `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>` |
| file-spreadsheet | `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>` |
| file-text | `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>` |
| chevron-left | `<path d="m15 18-6-6 6-6"/>` |
| chevron-right | `<path d="m9 18 6-6-6-6"/>` |
| arrow-up | `<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>` |
| arrow-down | `<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>` |
| arrow-up-down | `<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>` |
| check | `<path d="M20 6 9 17l-5-5"/>` |

Sizing comes from the CSS classes (`.nxg-icon`, `.nxg-search-icon`,
`.nxg-sort-icon`, `.nxg-check`, `.nxg-icon--excel`, `.nxg-icon--csv`); pager
chevrons use `width:16;height:16` inline or the `.nxg-icon` class.

## 8. Parity checklist (Definition of Done per adapter)

- [ ] All 15 features in §2, behaviorally identical
- [ ] DOM matches §6; icons match §7; zero runtime deps beyond `@nexgrid/core`
- [ ] All strings via locale; all query mutations via core reducers
- [ ] Export flow per §5, including fetch-all with cap and notifications
- [ ] Compiles under strict TypeScript; package builds green
- [ ] README with install + quick start + full prop/API table
