# 📖 NexGrid Documentation

Welcome to the official documentation for **NexGrid** — the server-driven data grid for React, Next.js, Angular, Vanilla JavaScript, and ASP.NET Core.

---

## 🧭 Navigation Guide

```
docs/
├── concepts.md                 # Server-driven architecture & data flow
├── getting-started.md          # Step-by-step guides for all 4 frameworks
├── columns.md                  # Column definitions, widths, alignment, custom cells
├── theming.md                  # CSS custom properties, dark mode, color presets
├── localization.md             # Custom strings, translations, RTL support
├── server-integration.md       # Implementing endpoints in ASP.NET Core, Node, Next.js
├── migration-from-tanstack.md  # Migrating from TanStack Table v8
├── faq.md                      # Common questions and troubleshooting
├── adapter-spec.md             # Normative DOM & behavior contract for adapters
├── features/                   # Deep dives into grid capabilities
│   ├── search.md               # Debounced search & highlight
│   ├── sorting.md              # 3-state sorting & multi-sort
│   ├── pagination.md           # Numbered pager, range calculation, jump box
│   ├── selection.md            # Checkboxes, select-all, action badges
│   ├── density.md              # Compact, default, comfortable presets
│   ├── export.md               # Excel (.xls) & CSV full-dataset exports
│   └── responsive.md           # Desktop table to mobile card layout
└── api/                        # API & Prop References
    ├── core.md                 # @nexgrid/core
    ├── react.md                # @nexgrid/react
    ├── angular.md              # @nexgrid/angular
    ├── vanilla.md              # @nexgrid/vanilla
    └── aspnet.md               # NexGrid.AspNetCore
```

---

## 📚 Core Guides

| Guide | Description |
| :--- | :--- |
| 🚀 [**Getting Started**](getting-started.md) | Installation and first working grid in React, Next.js, Angular, ASP.NET Core, and Vanilla HTML. |
| 💡 [**Core Concepts**](concepts.md) | Why NexGrid never holds your dataset, the `QueryState` / `PagedResponse` contract, and data flow. |
| 📐 [**Columns & Custom Cells**](columns.md) | Header names, accessor keys, custom cell templates (JSX, Angular templates, DOM nodes), alignment, and width. |
| 🎨 [**Theming & Styling**](theming.md) | CSS custom properties (`--nxg-*`), Dark mode, high-contrast themes, and customization. |
| 🌍 [**Localization**](localization.md) | Complete `NexGridLocale` interface, translating buttons, placeholders, and range text. |
| 🖥️ [**Server Integration**](server-integration.md) | Wire format specifications with sample backends (ASP.NET Core EF Core, Node.js/Express, Next.js API Routes). |
| 🔀 [**Migrating from TanStack Table**](migration-from-tanstack.md) | Step-by-step migration guide for projects using `@tanstack/react-table`. |
| ❓ [**Frequently Asked Questions (FAQ)**](faq.md) | Answers to architectural, export, security, and performance questions. |

---

## ⚡ Feature Deep Dives

Every feature in NexGrid behaves with 100% parity across all 4 platforms:

| Feature | Topics Covered |
| :--- | :--- |
| 🔍 [**Global Search**](features/search.md) | 350ms debouncing, clear button, custom search fields, and server translation. |
| 🔄 [**Sorting**](features/sorting.md) | Three-state sort cycle (`asc → desc → clear`), multi-column sort tokens, and server allowlists. |
| 📄 [**Pagination**](features/pagination.md) | Page size allowlists, smart ellipsis calculations, "Go to page" jump input, live record count. |
| ☑️ [**Row Selection**](features/selection.md) | Row identity keys, select-all-on-page header checkbox, selection badge, and bulk actions. |
| 📏 [**Row Density**](features/density.md) | `compact` (36px), `default` (44px), and `comfortable` (52px) row height modes. |
| 📊 [**Excel & CSV Exports**](features/export.md) | Formatted Excel (.xls) with badges, RFC 4180 CSV with UTF-8 BOM, full-dataset collector, and OWASP formula defense. |
| 📱 [**Responsive Card View**](features/responsive.md) | Seamless transformation from table (desktop) to cards (screens < 768px). |

---

## 📜 Package API References

| Package | Documentation |
| :--- | :--- |
| [`@nexgrid/core`](api/core.md) | Engine: types, query reducers, pagination math, URL query serializer, export engine. |
| [`@nexgrid/react`](api/react.md) | `<NexGrid />` props, hooks, and types. |
| [`@nexgrid/angular`](api/angular.md) | `<nex-grid>` inputs, outputs, `*nexGridCell`, and `*nexGridToolbar` directives. |
| [`@nexgrid/vanilla`](api/vanilla.md) | `createNexGrid()` options, event handlers, and handle methods. |
| [`NexGrid.AspNetCore`](api/aspnet.md) | `<nex-grid>` Tag Helpers, `NexGridQuery` model binder, and EF Core `IQueryable` extensions. |

---

## 🤝 Specification & Compliance

Building a custom renderer or extending NexGrid? Review [`adapter-spec.md`](adapter-spec.md) for the normative DOM, accessibility, and behavioral specifications required of any NexGrid adapter.
