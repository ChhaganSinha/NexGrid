# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-11-25

### Added

- **Undo / Redo Edit History (`enableHistory`, `GridHistoryManager`)**:
  - `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` (guarded against international Windows `AltGr` chords) and imperative `undo()`, `redo()`, `canUndo()`, `canRedo()` APIs across `@nexgrid/core`, `@nexgrid/vanilla`, `@nexgrid/react`, `@nexgrid/vue`, and `@nexgrid/angular`.
- **Horizontal Column Virtualization (`enableColumnVirtualization`, `virtualColumnOverscan`)**:
  - Windows wide unpinned column sets horizontally while keeping sticky left/right pinned columns anchored and preserving accurate body/summary column indices.
- **Async / Lazy-Loading Tree Data (`loadChildren`, `hasChildren`)**:
  - Dynamic async child fetching with `.tbx-tree-spinner` loading states across all adapters, plus automatic tree enablement and `flattenAllTreeData` / `filterTreeHierarchy` helpers.
- **Autosize Columns & Fit Container (`autoFitColumn`, `autoFitAllColumns`, `fitContainer`)**:
  - Content-based column width sizing honoring `meta.minWidth` and reactive `ResizeObserver` viewport width distribution (`distributeContainerWidth` with `reservedWidth`).
- **Filter Option Counts & Full Cross-Page Search / Filter / Export (`computeFilterOptionCounts`)**:
  - Live per-option counts inside column filter popovers across all pages (`allData` / client dataset / tree nodes).
  - Cross-page tree search & filtering (`queryClientData(..., { tree })`), multi-page server endpoint pagination in `fetchAllPages` even when endpoints cap `pageSize < MAX_PAGE_SIZE`, cross-page bulk export for selected rows, and `all-data` support in `TableX.AspNetCore`.

- **100% Cross-Framework Feature Parity (`@nexgrid/angular` & `TableX.AspNetCore`)**:
  - `@nexgrid/angular`: Added sticky left/right pinned columns, master-detail accordion row expansion (`*nexGridExpandedRow` / `renderExpandedRow`), `<tfoot>` summary/aggregation rows, double-click inline cell editing (`(cellEdit)`), drag-and-drop column reordering (`(columnOrderChange)`), floating bulk actions bar (`*nexGridBulkActions`), indeterminate Select-All checkbox, and zero-boilerplate client mode.
  - `TableX.AspNetCore` (Razor TagHelpers & Blazor): Added `<nex-grid-column-group>` / `<TableXColumnGroup>`, `<NexGrid>` / `<NexGridColumn>` / `<NexGridColumnGroup>` Blazor aliases, and full attribute parity (`pinned`, `aggregation`, `editable`, `edit-type`, `edit-options`, `selection-mode`, `export-mode`, `max-export-rows`, `storage-key`, `enable-column-reorder`, `enable-summary-row`, `enable-bulk-actions`, `client-side-pagination`, `data`).
- **Multi-Select Checkbox Column Filters & Column Header `⋮` Quick-Action Menus**:
  - `filterType: "multi-select"` / `multiSelectFilter: true` renders searchable multi-select checkbox popovers emitting pipe-delimited OR tokens (`Active|Pending`), supported across `@nexgrid/core`, OData v4 (`$filter`), and `TableX.AspNetCore` (`IQueryable<T>`).
  - Column `⋮` popovers include 1-click quick actions: **Sort Ascending**, **Sort Descending**, **Pin Left / Pin Right / Unpin** (persisted via `storageKey`), **Group by Column / Ungroup**, and **Hide Column**.
- **Select All Across All Pages Banner (`allAcrossSelected`)**:
  - Selecting all rows on a page when `total > pageSize` displays `.tbx-select-all-banner` (*"Select all {total} matching records"* / *"Clear selection"*), activates `allAcrossSelected: true`, resets automatically when search/filters change, and triggers full-dataset export from the Bulk Actions bar.
- **Zero-Dependency Native OpenXML `.xlsx` Binary Export**:
  - Added `toXlsxBytes` and `downloadXlsx` (`@nexgrid/core`), making `.xlsx` the default Excel export format with frozen header panes, auto-fitted column widths, native numeric cells, OWASP formula-injection defense, and colored ARGB status badges (retaining `format: "xls"` / `toExcelHtml` compatibility).
- **DOM Row Virtualization (`enableVirtualization`, `virtualHeight`, `virtualOverscan`)**:
  - Added `computeVirtualWindow` and native `<table>` top/bottom spacer windowing for smooth 60fps scrolling over 10,000+ rows while preserving sticky headers, summary footers, and pinned columns.
- **Collapsible Client-Side & Multi-Column Nested Row Grouping (`groupBy`)**:
  - Added `groupRows`, `normalizeGroupBy`, and `buildNestedGroupItems` across all adapters and `.NET`, supporting both single (`groupBy="dept"`) and multi-column nested (`groupBy={["region", "dept"]}` / `"Add to grouping"`) collapsible group headers with row counts and per-group summary chips.
- **Vue 3 & Nuxt Adapter (`@nexgrid/vue`)**:
  - New workspace package `packages/vue` providing SSR-ready `<TableX />` / `<NexGrid />` components, `useClientTableX` / `useClientNexGrid` reactive composables, `v-model:query` support, and scoped `#cell-[id]`, `#expanded-row`, `#bulk-actions`, and `#toolbar` slots.
- **Zero-Dependency Native Binary PDF 1.4 Export (`toPdfBytes`, `downloadPdf`)**:
  - Added `"pdf"` to `EXPORT_FORMATS`, toolbar export menus, Bulk Actions bars, and `TableXExportMode.Pdf` in `.NET`, generating multi-page landscape A4 PDF 1.4 reports with repeated headers, zebra striping, and badge pills without external dependencies.
- **Hierarchical Tree Data & Pinned Data Rows**:
  - Added `enableTreeData`, `childrenKey`, `getSubRows`, `defaultExpandedDepth`, `flattenTreeRows`, and `pinnedTopRows` / `pinnedBottomRows` across all adapters and `.NET`.
- **Full-Row Editing, `date` & `boolean` Editors, Validation & Dirty Markers**:
  - Added `editMode: "cell" | "row"`, `onRowEdit`, `editType: "date" | "boolean"`, `meta.validateCell` inline error blocking (`.tbx-cell-edit-error`), and `.tbx-td--dirty` modified cell indicators.
- **Spreadsheet Keyboard Navigation, Context Menu, Range Selection, Saved Views, Row Reorder & Infinite Scroll**:
  - Added arrow/Home/End/PageUp/PageDown cell focus (`enableKeyboardNavigation`), `Shift+Click` contiguous row range selection, right-click `.tbx-context-menu` (`enableContextMenu`, `contextMenuItems`), rectangular cell range selection (`enableRangeSelection`) with `.tbx-fill-handle`, footer `Count · Sum · Avg` stats badge, and `Ctrl+C` / `Ctrl+V` multi-cell TSV copy/paste, toolbar Saved Views (`enableSavedViews`), `⋮⋮` drag-and-drop row reordering (`enableRowReorder`, `onRowOrderChange`), and infinite scroll / `Load more` mode (`enableInfiniteScroll`, `onLoadMore`).

### Fixed

- **Column Sorting & Filtering Overhaul**:
  - Fixed multi-column `Shift+Click` sorting, `sortField` / `serverFilterField` / `accessorKey` / `accessorFn` resolution, exact `filterOptions` matching (`"Active"` no longer false-matches `"Inactive"`), comparison operators (`>=`, `<=`, `!=`, `>`, `<`), inclusive end-of-day date-range matching, negative/currency/null sorting, and viewport-clamped column filter popovers mounted on `.tbx-root`.
- **Adapter & Integration Edge Cases**:
  - Fixed Angular `*nexGridCell` template lookup when `accessorKey` differs from `id`, React summary/bulk bar visibility defaults, ASP.NET Core static web asset paths (`_content/TableX.AspNetCore/...`), Blazor SSR-to-interactive `mountFromConfig` lifecycle upgrades, and frozen-row inline cell editing.

## [0.4.0] - 2026-09-25

### Added

- **Full-Dataset Export Across All Adapters (@nexgrid/react, @nexgrid/vanilla, @nexgrid/angular, TableX.AspNetCore)**:
  - `allData` prop/input: pass the full in-memory dataset to the grid. Even when viewing a single page (e.g. 10 rows on screen), exporting collects all matching rows across all pages into a single Excel (.xls), CSV (.csv), or clipboard TSV.
  - `fetchAllData` prop/input: async or sync function `(query: QueryState) => Promise<readonly TData[]> | readonly TData[]` returning all matching rows for export without requiring custom workbook formatting code.
  - `fetchPage` prop/input: async function `(page: number, pageSize: number, query: QueryState) => Promise<PagedResponse<TData>>` enabling the exporter to walk all pages for server-driven datasets without requiring a REST URL.
  - `maxExportRows` prop/input: configure or uncap (pass `0`) the maximum number of rows collected during full-dataset export pagination walks.
  - `exportMode` and `quickExport` props/inputs (`"menu" | "split" | "excel" | "csv"`):
    - `exportMode="excel"` / `quickExport={true}`: Direct 1-click "Export Excel" button on the toolbar without needing a dropdown menu.
    - `exportMode="split"`: Split button with direct 1-click primary action (Export Excel) and chevron dropdown for CSV and Clipboard.
    - `exportMode="csv"` / `quickExport="csv"`: Direct 1-click "Export CSV" button.
- **@nexgrid/core**:
  - `TableXColumnMeta.exportValue`: Optional column-level formatter `(row: unknown) => string | number | null | undefined` giving columns fine-grained control over their exported text/value in Excel and CSV.
  - `fetchAllPages`: Support `cap <= 0` or non-finite cap for uncapped/unlimited page walking.
  - `TableXLocale`: Added `exportExcelButton` ("Export Excel") and `exportCsvButton` ("Export CSV") strings to `TableXLocale`, `DEFAULT_LOCALE`, and `resolveLocale`.
  - Added `.tbx-split-btn` styles to `tablex.css`.
- **@nexgrid/react**:
  - `useClientTableX`: Exposes `allData`, `fetchAllData`, `clientSidePagination: true`, and `paginationMode: "client"`.
  - `onExportAll` signature: Handlers can now return `readonly TData[]` to use TableX's built-in Excel/CSV exporter with custom rows.

### Fixed

- **Exporting Only Current Page Data**: Resolved the bug where exports only included the on-screen visible page (e.g., 10 rows) when using in-memory datasets or custom client/controlled pagination. The grid now accurately collects all matching records from `fetchAllData`, `rawClientData` / `allData` (via `queryClientData(allData, query, { paginate: false })`), `fetchPage`, or `fetchEndpoint`.
- **`onExportAll` Custom Row Feeding**: Handlers can now return an array of rows from `onExportAll` to leverage TableX's built-in styling, column mappings, and file download without having to re-implement Excel/CSV generators.
- **Duplicate Clear "X" in Search Bar**: Disabled browser-native search cancel buttons (`::-webkit-search-cancel-button` and `::-ms-clear`) in WebKit/Blink browsers (Chrome, Edge, Safari) so only TableX's custom, accessible `.tbx-search-clear` button is shown, eliminating the duplicate "X" icons inside the search input. Added Escape key handling to clear search across React, Vanilla, and Angular adapters.
- **Examples**: Updated `examples/react-vite`, `examples/vanilla-html`, `examples/nextjs`, and `examples/angular` to demonstrate 1-click full-dataset Excel exports with split buttons.

## [0.3.1] - 2026-09-06

### Fixed

- **@nexgrid/react** — `storageKey` persistence no longer discards the state it
  had just restored. The restore effect applies its values through `setState`,
  so the save effect — running in the same commit — still closed over the
  INITIAL density and columns and wrote them straight back over the snapshot it
  had only just read. React StrictMode double-invokes effects, so in a
  development build this fired on every mount and the stored snapshot was
  overwritten with defaults before the user ever saw it.

  The visible symptom: density and hidden columns survived an in-page remount
  (a tab switch, a route change) but were silently lost on a page RELOAD, which
  is the case users actually notice — and `localStorage` was left holding the
  defaults, so it looked as though the choice had never been saved at all.

  Saving is now gated until the stored state has been read back into a rendered
  commit. The gate holds the key rather than a boolean, so a grid whose
  `storageKey` changes re-arms instead of writing the outgoing grid's state
  under the incoming key.

  No API change — `storageKey` now behaves the way it was already documented to.

## [0.3.0] - 2026-09-06

### Added

- **@nexgrid/core** — `ExportFormat` (alias `NexGridExportFormat`) and the
  `EXPORT_FORMATS` constant: the export menu's three destinations
  (`"excel" | "csv" | "clipboard"`) now have a name in the public API instead
  of being re-typed inline by each adapter. Re-exported from
  **@nexgrid/react**.
- **@nexgrid/core** — `searchableColumnIds(columns, hidden?)`: the row fields a
  global search should look at, derived from the visible, non-structural leaf
  columns. Descends into header groups and drops hidden columns. It returns
  **fields, not column ids**: a column written the TanStack way, with a display
  slug over the property it reads (`{ id: "lastLogin", accessorKey:
  "lastLoginAt" }`), contributes `lastLoginAt`, so a column the user is looking
  at cannot end up matching nothing. Visibility is still keyed by column id.
- **@nexgrid/react** — `searchableFields` prop on `<TableX />`, naming the row
  fields the client-side global search reads. Defaults to the visible columns
  (see *Changed*); pass an explicit list to search fields the grid does not
  render, or to keep a field searchable while its column is hidden. Ignored in
  server mode, where the server owns its own search.
- **@nexgrid/core** — `resetView` locale key ("Reset to default view"), so the
  Columns menu's reset item can be translated. It is optional on
  `TableXLocale` — adding it as a required key would have broken any consumer
  who annotates a complete locale object — and `resolveLocale` always fills it
  in from `DEFAULT_LOCALE`.
- **Theme** — right-to-left support. The shared stylesheet now uses logical
  properties (`inset-inline-*`, `padding-inline`, `margin-inline-*`,
  `text-align: start`) wherever a rule meant "the reading-order start/end", and
  adds `[dir="rtl"]` rules to mirror the three glyphs that cannot follow
  automatically: the `<select>` chevron, the pagination prev/next chevrons, and
  the row-expansion disclosure arrow. A host gets a mirrored grid by setting
  `dir="rtl"`; nothing changes for left-to-right consumers. This reaches every
  adapter, including `NexGrid.AspNetCore`, since they all ship a copy of this
  one stylesheet.
  Four things stay deliberately physical and are commented as such in the
  sheet: the `.tbx-align-right` utility and its `meta.align: "right"` twin
  (both promise a physical edge — silently flipping them would move a
  consumer's right-aligned currency column under RTL), pinned columns (the
  adapters compute physical `left`/`right` offsets in JS, and the `pin` API is
  itself physical), `box-shadow` offsets, which have no logical form, and the
  checkbox tick and radio dot, which are direction-neutral glyphs.

### Changed

- **@nexgrid/react** — **the client-side global search now searches only the
  columns on screen.** Previously `<TableX />` in client mode passed no field
  list to the query engine, which falls back to matching *every* property on
  the row — including fields no column renders, such as an `id` GUID or an
  internal `tenantId`. Typing `5` or `ab` would light up most of the table with
  nothing visible to explain the hit. The grid now defaults the search to the
  visible, non-structural columns, so every match is one the user can see, and
  hiding a column removes its field from the search until the column is shown
  again.

  **This is a visible behaviour change: a consumer relying on the old wide
  match will get fewer results.** If you depend on searching a field the grid
  does not render, name it explicitly — `searchableFields={["id", "email"]}` —
  which restores the old reach for exactly the fields you choose. The engine's
  own default is unchanged: `queryClientData` without `searchableFields` still
  searches the whole row, and the `useClientTableX` / `useClientNexGrid` hook
  is unaffected because it never sees the column set. Server mode is
  unaffected.

  One case the default cannot cover: a column with no `accessorKey` whose
  `cell` composes its text from several fields (city + country, browser + OS)
  has no single row property behind it, so it is not searchable under the new
  default even though it is on screen. List the underlying fields —
  `searchableFields={["city", "countryName"]}` — for those grids.
- **@nexgrid/react** — `onExportAll` now receives the format the user picked:
  `(format: ExportFormat) => void | Promise<void>`. A handler that took over
  exporting previously could not tell which of the three menu items was
  clicked, so every destination silently produced the same file. **Existing
  zero-argument handlers keep working** — `() => { ... }` stays assignable to
  the new signature in both TypeScript and JavaScript, so no consumer has to
  change anything to upgrade; a handler that wants to honour the menu simply
  reads the new parameter and branches on it. (The one source-level break is
  the unusual case of a consumer who stores a value of type
  `TableXProps<T>["onExportAll"]` and invokes it themselves with no argument —
  that call now needs a format.)
- **@nexgrid/react** — client-side "export all" applies the same searchable
  field set as the on-screen page, so an export can no longer contain rows the
  visible grid never matched, nor drop rows it did.
- **@nexgrid/core** — `DEFAULT_LOCALE` is typed `Required<TableXLocale>` and
  `resolveLocale` returns `Required<TableXLocale>`, so adapters can read
  optional keys without re-applying a fallback at the render site. Both types
  are assignable to the ones they replace; no consumer code changes.

### Fixed

- **@nexgrid/react** — toolbar buttons (Columns, Density, Export) had no
  accessible name below 640px. The stylesheet collapses them to icon-only at
  that breakpoint by hiding the label `<span>`, which took the button's
  accessible name with it and left a screen reader with an unnamed control.
  Each trigger now carries an `aria-label` matching its visible text exactly,
  so voice control still matches on the same words at every width.
- **@nexgrid/react** — the multi-sort rank badge is a bare digit inside the
  header cell, so assistive technology read it as part of the column name
  ("Name 2"). It is now `aria-hidden`; the sort state itself was already
  exposed correctly through `aria-sort` on the `<th>`.
- **@nexgrid/react** — the column filter popover input relied on its
  placeholder for an accessible name, which disappears as soon as the user
  types. It now carries an explicit `aria-label`.
- **@nexgrid/react** — the icon-only confirm and cancel buttons in inline cell
  editing had no accessible name; both now have one.
- **@nexgrid/react** — the Columns menu's reset item no longer renders
  hardcoded English; it reads `locale.resetView`. The vanilla and Angular
  adapters still hardcode this string and will move onto the locale key in a
  follow-up.

## [0.1.0] - 2026-08-24

### Added

- **@nexgrid/core** — framework-agnostic engine: `QueryState`/`PagedResponse`
  server contract, grid state controller, pagination math, density model,
  RFC 4180 CSV export with spreadsheet-injection defense, formatted Excel
  (.xls) export with value-based badge styling, `fetchAllPages` full-dataset
  collector, locale text, and the shared CSS theme (light/dark, CSS custom
  properties).
- **@nexgrid/react** — React 18+/Next.js (App Router–safe) `<TableX />`
  component with TanStack-compatible column definitions: debounced global
  search, column visibility, density switching, server-driven sorting
  (asc → desc → clear), row selection, automatic serial numbers, Excel/CSV
  export, numbered pagination with ellipsis and page jump, loading/error/empty
  states, responsive card layout on small screens, toolbar actions slot.
- **@nexgrid/angular** — Angular 17+ standalone `<table-x>` component with the
  same feature set; custom cells via `*tableXCell` templates.
- **@nexgrid/vanilla** — zero-dependency DOM renderer (`createTableX`) with
  controlled and self-fetching (`endpoint`) modes; ESM + IIFE bundles.
- **TableX.AspNetCore** — ASP.NET Core Razor Class Library: `<table-x>` Tag
  Helper (bundles the vanilla renderer as static web assets), `TableXQuery`
  model binding, and allowlisted `IQueryable` extensions producing
  `PagedResponse<T>`.
- Documentation (`docs/`) and runnable examples for React (Vite), Next.js,
  Angular, and ASP.NET Core MVC.
