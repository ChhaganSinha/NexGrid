# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-24

### Added

- **@tablex/core** — framework-agnostic engine: `QueryState`/`PagedResponse`
  server contract, grid state controller, pagination math, density model,
  RFC 4180 CSV export with spreadsheet-injection defense, formatted Excel
  (.xls) export with value-based badge styling, `fetchAllPages` full-dataset
  collector, locale text, and the shared CSS theme (light/dark, CSS custom
  properties).
- **@tablex/react** — React 18+/Next.js (App Router–safe) `<TableX />`
  component with TanStack-compatible column definitions: debounced global
  search, column visibility, density switching, server-driven sorting
  (asc → desc → clear), row selection, automatic serial numbers, Excel/CSV
  export, numbered pagination with ellipsis and page jump, loading/error/empty
  states, responsive card layout on small screens, toolbar actions slot.
- **@tablex/angular** — Angular 17+ standalone `<table-x>` component with the
  same feature set; custom cells via `*tableXCell` templates.
- **@tablex/vanilla** — zero-dependency DOM renderer (`createTableX`) with
  controlled and self-fetching (`endpoint`) modes; ESM + IIFE bundles.
- **TableX.AspNetCore** — ASP.NET Core Razor Class Library: `<table-x>` Tag
  Helper (bundles the vanilla renderer as static web assets), `TableXQuery`
  model binding, and allowlisted `IQueryable` extensions producing
  `PagedResponse<T>`.
- Documentation (`docs/`) and runnable examples for React (Vite), Next.js,
  Angular, and ASP.NET Core MVC.
