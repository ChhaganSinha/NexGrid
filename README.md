<div align="center">

# NexGrid

**A professional, server-driven data grid for React, Next.js, Angular, vanilla JavaScript, and ASP.NET Core.**

One engine. One stylesheet. One server contract. Four platforms.

Free and open source, MIT licensed, forever.

</div>

---

## Why NexGrid

Most data grids assume they can hold your data. That works until the table has a
million rows — then "sort" silently sorts *the current page*, "search" filters
what happens to be in memory, and the export writes out whatever the user could
already see.

NexGrid is built the other way round. The grid **never holds your dataset**.
Every interaction — page, sort, search, filter — becomes a `QueryState` your
server answers with exactly one page of rows plus a total count. That single
decision is what makes the grid behave identically at 50 rows and at 5,000,000.

And because the engine is framework-agnostic, the React grid, the Angular grid,
the vanilla grid, and the ASP.NET grid are not four implementations that drift
apart — they are four thin renderers over the same pagination math, the same
export pipeline, the same stylesheet, and the same wire format.

## Packages

| Package | Platform | Install |
| ------- | -------- | ------- |
| [`@nexgrid/core`](packages/core) | Framework-agnostic engine | `npm i @nexgrid/core` |
| [`@nexgrid/react`](packages/react) | React 18+ / Next.js | `npm i @nexgrid/react` |
| [`@nexgrid/angular`](packages/angular) | Angular 17+ | `npm i @nexgrid/angular` |
| [`@nexgrid/vanilla`](packages/vanilla) | Any page, no framework | `npm i @nexgrid/vanilla` |
| [`NexGrid.AspNetCore`](dotnet/NexGrid.AspNetCore) | ASP.NET Core 8+ | `dotnet add package NexGrid.AspNetCore` |

## Features

Every feature below works the same way on **every** platform.

- **Server-driven everything** — paging, sorting, global search, and per-column
  filters are query state, not client-side array operations.
- **Global search** with 350 ms debounce and a clear button.
- **Sorting** with the familiar three-state cycle: ascending → descending → cleared.
- **Numbered pagination** with ellipsis, rows-per-page, a "Go to page" jump box,
  and a live "Showing 21 to 40 of 1,284 entries" range.
- **Row selection** with a select-all-on-page header checkbox and a selection count badge.
- **Column visibility** menu, per column, with columns hidden by default if you say so.
- **Density switching** — compact, standard, comfortable.
- **Automatic serial numbers** that keep counting across pages.
- **Exports** — a formatted Excel workbook with colored status badges, and an
  RFC 4180 CSV with a UTF-8 BOM. Both can pull the **whole filtered dataset**
  across pages, not just what is on screen.
- **Responsive by construction** — a table on desktop, and below 768 px a card
  per record so nobody has to scroll sideways to read one row.
- **Loading, empty, and error states**, with a retry action.
- **Custom cell renderers** in every framework's own idiom (JSX, Angular
  templates, DOM nodes).
- **Fully themeable** through CSS custom properties — no class overrides, no
  `!important`, with built-in dark mode.
- **Fully localizable** — every string in the UI is overridable.
- **Accessible** — real table semantics, accessible names on every control,
  `aria-sort`, keyboard-operable menus.

## Quick start

### React / Next.js

```bash
npm install @nexgrid/react
```

```tsx
"use client";

import { useEffect, useState } from "react";
import { NexGrid } from "@nexgrid/react";
import {
  defaultQuery,
  buildQueryUrl,
  type QueryState,
  type PagedResponse,
  type NexGridColumn,
} from "@nexgrid/core";
import "@nexgrid/react/styles.css";

interface Student {
  id: string;
  name: string;
  email: string;
  status: string;
}

const columns: NexGridColumn<Student, React.ReactNode>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => <span className="badge">{String(getValue())}</span>,
  },
];

export function StudentsGrid() {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Student>>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(buildQueryUrl("/api/students", query))
      .then((r) => r.json())
      .then(setPage)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <NexGrid
      caption="Students"
      columns={columns}
      data={page?.items ?? []}
      total={page?.total ?? 0}
      query={query}
      onQueryChange={setQuery}
      isLoading={loading}
      enableSelection
      fetchEndpoint="/api/students"
    />
  );
}
```

### ASP.NET Core

```bash
dotnet add package NexGrid.AspNetCore
```

```csharp
[HttpGet("/api/students")]
public async Task<PagedResponse<Student>> Get([FromQuery] NexGridQuery query) =>
    await db.Students.AsNoTracking().ToPagedResponseAsync(query, o => o
        .Sortable(s => s.Name, s => s.CreatedAt)
        .Searchable(s => s.Name, s => s.Email)
        .Filterable("status", s => s.Status));
```

```cshtml
<nex-grid caption="Students" endpoint="/api/students" enable-selection="true">
    <nex-grid-column field="name" header="Name" />
    <nex-grid-column field="email" header="Email" />
    <nex-grid-column field="status" header="Status" />
</nex-grid>
```

Angular and vanilla quick starts live in [the getting-started guide](docs/getting-started.md).

## The contract

Everything rests on two types. Implement them on your server and any NexGrid
adapter works against it with no glue code.

```
GET /api/students?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active
```

```jsonc
{
  "items": [ /* exactly ONE page of rows */ ],
  "page": 2,
  "pageSize": 25,
  "total": 1284,      // full FILTERED count — this drives the pager
  "totalPages": 52
}
```

## Documentation

Full documentation lives in [`docs/`](docs/README.md):

- [Getting started](docs/getting-started.md) — every platform
- [Concepts](docs/concepts.md) — the server-driven architecture
- [Columns](docs/columns.md) · [Theming](docs/theming.md) · [Localization](docs/localization.md)
- [Server integration](docs/server-integration.md) — ASP.NET Core, Node, Next.js
- [Features](docs/README.md#features) — search, sorting, pagination, selection, density, export, responsive
- [API reference](docs/api/core.md)
- [Migrating from TanStack Table](docs/migration-from-tanstack.md)

## Examples

Runnable sample apps live in [`examples/`](examples/README.md): React + Vite,
Next.js App Router, Angular, ASP.NET Core MVC, and a single-file vanilla HTML page.

## Repository layout

```
packages/core       @nexgrid/core       Engine: contract, state, export, theme CSS
packages/vanilla    @nexgrid/vanilla    Zero-dependency DOM renderer (powers ASP.NET)
packages/react      @nexgrid/react      React / Next.js component
packages/angular    @nexgrid/angular    Angular standalone component
dotnet/             NexGrid.AspNetCore  Tag Helper + IQueryable server extensions
docs/               Documentation
examples/           Runnable sample apps
```

## Building from source

```bash
npm install
npm run build
npm run typecheck
```

```bash
dotnet build dotnet/NexGrid.sln -c Release
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow and design rules, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
Security issues: please follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) — free for personal and commercial use, forever.
