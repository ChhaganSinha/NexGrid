# NexGrid documentation

NexGrid is a server-driven data grid for React, Next.js, Angular, vanilla
JavaScript and ASP.NET Core. One engine (`@nexgrid/core`), one stylesheet, one
wire format, four renderers.

The grid never holds your dataset. Every interaction becomes a `QueryState`;
your server answers with one page of rows and a total count. That single
decision is what makes the grid behave the same at 50 rows and at 5,000,000.

New here? Read [Concepts](concepts.md) first, then
[Getting started](getting-started.md).

## Guides

| Page | What it covers |
| --- | --- |
| [Getting started](getting-started.md) | Install and a first working grid in React, Next.js, Angular and ASP.NET Core. |
| [Concepts](concepts.md) | The server-driven architecture, the `QueryState` / `PagedResponse` contract, why there is no client-side sorting, and the data-flow diagram. |
| [Columns](columns.md) | Column definitions, `meta` options, custom cells per framework, alignment and width. |
| [Theming](theming.md) | Every `--nxg-*` token, dark mode, worked re-skins. |
| [Localization](localization.md) | `NexGridLocale`, every key, a worked non-English example. |
| [Server integration](server-integration.md) | The wire format in detail, and endpoints in ASP.NET Core, Node/Express and Next.js route handlers. |
| [Migrating from TanStack Table](migration-from-tanstack.md) | Column definitions are structurally compatible — here is the swap. |
| [FAQ](faq.md) | The questions that come up once the grid is running. |

## Features

Every feature behaves identically on every platform. The behavioral contract
that guarantees that is [`adapter-spec.md`](adapter-spec.md).

| Page | What it covers |
| --- | --- |
| [Search](features/search.md) | Debounced global search, clearing, external control. |
| [Sorting](features/sorting.md) | The `asc → desc → cleared` cycle, multi-sort, server allowlists. |
| [Pagination](features/pagination.md) | Page sizes, the numbered pager, the record range, page jump. |
| [Selection](features/selection.md) | Row identity, select-all-on-page, bulk actions. |
| [Density](features/density.md) | `compact` / `default` / `comfortable`, and styling from outside. |
| [Export](features/export.md) | CSV and Excel, fetch-all behaviour, the row cap, badge rules, security. |
| [Responsive](features/responsive.md) | Table above 768 px, one card per record below. |

## API reference

| Page | Package |
| --- | --- |
| [`@nexgrid/core`](api/core.md) | The engine: types, reducers, pagination math, wire format, export, locale. |
| [`@nexgrid/react`](api/react.md) | `<NexGrid />` props. |
| [`@nexgrid/angular`](api/angular.md) | `<nex-grid>` inputs, outputs and directives. |
| [`@nexgrid/vanilla`](api/vanilla.md) | `createNexGrid` options and the handle. |
| [`NexGrid.AspNetCore`](api/aspnet.md) | `NexGridQuery`, `ToPagedResponse*`, Tag Helpers. |

The package READMEs are the canonical prop/option tables and stay in the
packages themselves:
[`@nexgrid/react`](../packages/react/README.md) ·
[`@nexgrid/angular`](../packages/angular/README.md) ·
[`@nexgrid/vanilla`](../packages/vanilla/README.md) ·
[`NexGrid.AspNetCore`](../dotnet/NexGrid.AspNetCore/README.md).

## Contributing

Building an adapter, or changing an existing one? Start with
[`adapter-spec.md`](adapter-spec.md) — it is the normative contract, and if an
adapter and the spec disagree, the adapter is wrong. Development workflow lives
in [CONTRIBUTING.md](../CONTRIBUTING.md).

## License

MIT.
