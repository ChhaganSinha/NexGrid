# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
