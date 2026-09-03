# Getting started

A working grid on every supported platform. Each section is self-contained —
jump to yours.

- [Install](#install)
- [React (Vite, CRA, any bundler)](#react)
- [Next.js (App Router)](#nextjs-app-router)
- [Angular 17+](#angular-17)
- [ASP.NET Core 8+](#aspnet-core-8)
- [Vanilla JavaScript](#vanilla-javascript)
- [What you need on the server](#what-you-need-on-the-server)

Read [Concepts](concepts.md) first if you want to know *why* the integration
looks like this. The short version: the grid holds one page, turns every user
action into a `QueryState`, and hands it to you.

## Install

| Platform | Command | Stylesheet |
| --- | --- | --- |
| React / Next.js | `npm install @nexgrid/react` | `import "@nexgrid/react/styles.css"` |
| Angular 17+ | `npm install @nexgrid/angular` | add `node_modules/@nexgrid/angular/styles.css` to `angular.json` → `styles` |
| Vanilla (bundler) | `npm install @nexgrid/vanilla` | `import "@nexgrid/vanilla/styles.css"` |
| Vanilla (script tag) | — | `<link rel="stylesheet" href=".../dist/tablex.css">` |
| ASP.NET Core 8+ | `dotnet add package TableX.AspNetCore` | `~/_content/TableX.AspNetCore/tablex.css` |

`@nexgrid/core` arrives as a dependency of every adapter — you only install it
directly if you want to import engine helpers the adapter does not re-export.
React needs React >= 18 as a peer; Angular needs `@angular/core`,
`@angular/common` >= 17 and `rxjs` >= 7.

The stylesheet is a single global file shared by all four renderers. It must be
loaded globally — in Angular, component styles are scoped by emulated
encapsulation and will not reach the grid's markup.

## React

Two files: a column set and a component. NexGrid supports both **TypeScript** and **plain JavaScript (JSX)** out of the box.

### TypeScript (TSX)

The grid is fully controlled — hold a `QueryState`, fetch when it changes, pass the result straight through:

```tsx
// students-grid.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TableX,
  buildQueryUrl,
  defaultQuery,
  type TableXReactColumn,
  type PagedResponse,
  type QueryState,
} from "@nexgrid/react";
import "@nexgrid/react/styles.css";

export interface Student {
  id: number;
  name: string;
  email: string;
  status: "Active" | "Pending" | "Disabled";
  score: number;
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
  { accessorKey: "score", header: "Score", meta: { align: "right", width: 90 } },
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
      const response = await fetch(buildQueryUrl("/api/students", next));
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
      fetchEndpoint="/api/students"
      onNotify={({ type, message }) => console.info(type, message)}
    />
  );
}
```

Mount it anywhere:

```tsx
// app.tsx
import { StudentsGrid } from "./students-grid";

export default function App() {
  return (
    <main>
      <h1>Students</h1>
      <StudentsGrid />
    </main>
  );
}
```

### JavaScript (JSX)

If you are using plain JavaScript (without TypeScript), write standard `.jsx` files. You can optionally add JSDoc comments (`/** @type {import('@nexgrid/react').TableXColumn[]} */`) to get full IDE autocomplete:

```jsx
// students-grid.jsx
import { useCallback, useEffect, useState } from "react";
import { TableX, buildQueryUrl, defaultQuery } from "@nexgrid/react";
import "@nexgrid/react/styles.css";

// Optional JSDoc gives VS Code & WebStorm full autocomplete without TypeScript:
/** @type {import('@nexgrid/react').TableXColumn[]} */
const columns = [
  { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "status",
    header: "Status",
    meta: { align: "center", width: 130 },
    cell: ({ getValue }) => {
      const status = String(getValue() || "");
      return <span className={`pill pill--${status.toLowerCase()}`}>{status}</span>;
    },
  },
  { accessorKey: "score", header: "Score", meta: { align: "right", width: 90 } },
  {
    accessorKey: "joinedAt",
    header: "Joined",
    cell: ({ getValue }) => new Date(String(getValue())).toLocaleDateString(),
  },
];

export function StudentsGrid() {
  const [query, setQuery] = useState(defaultQuery());
  const [page, setPage] = useState({ items: [], total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (next) => {
    setIsLoading(true);
    setError(false);
    try {
      const response = await fetch(buildQueryUrl("/api/students", next));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPage(await response.json());
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(query);
  }, [load, query]);

  return (
    <TableX
      caption="Students"
      columns={columns}
      data={page.items}
      total={page.total}
      query={query}
      onQueryChange={setQuery}
      isLoading={isLoading}
      error={error}
      onRetry={() => load(query)}
      enableSelection
      onSelectionChange={(ids) => console.log("selected", ids)}
    />
  );
}
```

> 💡 **Client-Side In-Memory Data**: In JavaScript, if you already have an array of records in memory, you can simply pass `clientSidePagination={true}` and omit `query` and `onQueryChange`:
> ```jsx
> <TableX
>   caption="Students"
>   columns={columns}
>   data={studentsArray}
>   clientSidePagination={true}
> />
> ```

Full prop table: [`@nexgrid/react` API](api/react.md). For dedicated details on plain JS, see the [JavaScript Guide](javascript-guide.md).

## Next.js (App Router)

The published bundle starts with `"use client"`, so `<TableX />` imports
directly into a client component with no wrapper. Reuse `StudentsGrid` from the
[React section](#react) verbatim and render it from a Server Component:

```tsx
// app/students/page.tsx — a Server Component
import { StudentsGrid } from "./students-grid";

export default function Page() {
  return (
    <main>
      <h1>Students</h1>
      <StudentsGrid />
    </main>
  );
}
```

```tsx
// app/layout.tsx
import "@nexgrid/react/styles.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Two rules:

- `columns` contains `cell` functions, and functions do not cross the
  server/client boundary. Define the column array in a file marked
  `"use client"` — never in the server page that renders the grid.
- Import the stylesheet from the root layout (or from the client component, if
  your setup supports component-level CSS imports).

A matching route handler, so the page works end to end:

```ts
// app/api/students/route.ts
import { NextResponse } from "next/server";
import { parseQuery, type PagedResponse } from "@nexgrid/core";

import type { Student } from "../../students/students-grid";

const students: Student[] = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com", status: "Active", score: 98, joinedAt: "2024-01-12" },
  { id: 2, name: "Alan Turing", email: "alan@example.com", status: "Pending", score: 91, joinedAt: "2024-02-03" },
];

export async function GET(request: Request) {
  const query = parseQuery(new URL(request.url).searchParams);

  let rows = students;
  if (query.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter(
      (s) => s.name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle),
    );
  }

  // Only allowlisted fields may sort — never reflect a query-string value.
  const sort = query.sort[0];
  const dir = sort?.dir === "desc" ? -1 : 1;
  if (sort?.field === "name") {
    rows = [...rows].sort((a, b) => a.name.localeCompare(b.name) * dir);
  } else if (sort?.field === "score") {
    rows = [...rows].sort((a, b) => (a.score - b.score) * dir);
  }

  const total = rows.length;
  const start = (query.page - 1) * query.pageSize;

  const body: PagedResponse<Student> = {
    items: rows.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };

  return NextResponse.json(body);
}
```

That handler is deliberately naive — it exists so the page renders. A real one
pushes search, sort and paging into the database; see
[Server integration](server-integration.md).

To put the query in the URL instead of component state, swap the state hook:

```tsx
"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseQuery, serializeQuery } from "@nexgrid/react";

export function useUrlQuery() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = useMemo(() => parseQuery(searchParams.toString()), [searchParams]);
  const setQuery = (next: ReturnType<typeof parseQuery>) =>
    router.replace(`?${serializeQuery(next)}`);
  return { query, setQuery };
}
```

`parseQuery` degrades safely — a bad page becomes 1, an unknown page size becomes
the default, malformed sort tokens are dropped — so a hand-edited URL can never
put the grid into an impossible state.

## Angular 17+

Register the stylesheet in `angular.json`:

```jsonc
{
  "projects": {
    "my-app": {
      "architect": {
        "build": {
          "options": {
            "styles": [
              "node_modules/@nexgrid/angular/styles.css",
              "src/styles.css"
            ]
          }
        }
      }
    }
  }
}
```

A service that fetches one page:

```ts
// students.service.ts
import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { buildQueryUrl, type PagedResponse, type QueryState } from "@nexgrid/angular";

export interface Student {
  id: number;
  name: string;
  email: string;
  status: "Active" | "Pending" | "Disabled";
  score: number;
  joinedAt: string;
}

@Injectable({ providedIn: "root" })
export class StudentsService {
  private readonly http = inject(HttpClient);

  page(query: QueryState) {
    return this.http.get<PagedResponse<Student>>(buildQueryUrl("/api/students", query));
  }
}
```

A standalone component that renders it:

```ts
// students.component.ts
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import {
  TableXCellDirective,
  TableXComponent,
  TableXToolbarDirective,
  defaultQuery,
  type TableXAngularColumn,
  type TableXNotice,
  type QueryState,
} from "@nexgrid/angular";

import { StudentsService, type Student } from "./students.service";

@Component({
  selector: "app-students",
  standalone: true,
  imports: [TableXComponent, TableXCellDirective, TableXToolbarDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table-x
      caption="Students"
      fetchEndpoint="/api/students"
      enableSelection
      [columns]="columns"
      [data]="rows()"
      [total]="total()"
      [query]="query()"
      [isLoading]="loading()"
      [error]="failed()"
      (queryChange)="load($event)"
      (retry)="load(query())"
      (rowClick)="open($event)"
      (selectionChange)="selected.set($event.ids)"
      (notify)="toast($event)"
    >
      <ng-container *tableXCell="'status'; of: rows(); let value = value">
        <span class="pill" [class.pill--ok]="value === 'Active'">{{ value }}</span>
      </ng-container>

      <ng-template tableXToolbar>
        <button type="button" class="tbx-btn" (click)="create()">Add student</button>
      </ng-template>
    </table-x>
  `,
})
export class StudentsComponent {
  private readonly service = inject(StudentsService);

  readonly columns: TableXAngularColumn<Student>[] = [
    { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "status", header: "Status", meta: { align: "center", width: 130 } },
    { accessorKey: "score", header: "Score", meta: { align: "right", width: 90 } },
    { accessorKey: "joinedAt", header: "Joined" },
  ];

  readonly rows = signal<Student[]>([]);
  readonly total = signal(0);
  readonly query = signal<QueryState>(defaultQuery());
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly selected = signal<string[]>([]);

  constructor() {
    this.load(this.query());
  }

  load(query: QueryState): void {
    this.query.set(query);
    this.loading.set(true);
    this.failed.set(false);
    this.service.page(query).subscribe({
      next: (page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  open(student: Student): void {
    console.log("open", student.id);
  }

  create(): void {
    console.log("create");
  }

  toast(notice: TableXNotice): void {
    console.info(notice.type, notice.message);
  }
}
```

`HttpClient` needs providing once, in `main.ts`:

```ts
import { provideHttpClient } from "@angular/common/http";
import { bootstrapApplication } from "@angular/platform-browser";

import { StudentsComponent } from "./app/students.component";

void bootstrapApplication(StudentsComponent, {
  providers: [provideHttpClient()],
});
```

Full input/output table: [`@nexgrid/angular` API](api/angular.md).

## ASP.NET Core 8+

Reference the bundle once, in `_Layout.cshtml`. Both files ship inside the
package as static web assets — nothing to copy or build:

```cshtml
@* Views/Shared/_Layout.cshtml *@
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>@ViewData["Title"]</title>
    <link rel="stylesheet" href="@TableXAssets.StylesheetPath" />
</head>
<body>
    @RenderBody()
    <script src="@TableXAssets.ScriptPath"></script>
    @await RenderSectionAsync("Scripts", required: false)
</body>
</html>
```

Register the Tag Helpers once, in `Views/_ViewImports.cshtml` (or
`Pages/_ViewImports.cshtml`):

```cshtml
@using TableX.AspNetCore
@addTagHelper *, TableX.AspNetCore
```

The endpoint:

```csharp
// Controllers/StudentsController.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TableX.AspNetCore;

namespace MyApp.Controllers;

[ApiController]
[Route("api/students")]
public sealed class StudentsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public Task<PagedResponse<StudentRow>> Get(TableXQuery query, CancellationToken ct) =>
        db.Students
            .AsNoTracking()
            .Select(s => new StudentRow(s.Id, s.Name, s.Email, s.Status, s.Score, s.CreatedAt))
            .ToPagedResponseAsync(query, options => options
                .Sortable(s => s.Name, s => s.Score, s => s.CreatedAt)
                .Searchable(s => s.Name, s => s.Email)
                .Filterable("status", s => s.Status)
                .DefaultSort(s => s.CreatedAt, SortDirection.Descending), ct);
}

public sealed record StudentRow(
    int Id, string Name, string Email, string Status, int Score, DateTime CreatedAt);
```

### Razor Pages & MVC

```cshtml
@* Views/Students/Index.cshtml *@
@{
    ViewData["Title"] = "Students";
}

<h1>Students</h1>

<table-x caption="Students" endpoint="/api/students" enable-selection="true">
    <table-x-column field="name" header="Name" min-width="180" />
    <table-x-column field="email" header="Email" />
    <table-x-column field="status" header="Status" align="Center" />
    <table-x-column field="score" header="Score" align="Right" width="90" />
    <table-x-column field="createdAt" header="Enrolled" />
</table-x>
```

### Blazor (.NET 8 Server / WebAssembly / Auto)

Add `@using TableX.AspNetCore.Components` to your `_Imports.razor`:

```razor
@* Pages/Students.razor *@
@page "/students"
@using TableX.AspNetCore.Components

<PageTitle>Students</PageTitle>

<h1>Students</h1>

<TableX TItem="StudentRow" Caption="Students Directory" Endpoint="/api/students" EnableSelection="true">
    <TableXColumn Field="name" Header="Name" MinWidth="180" />
    <TableXColumn Field="email" Header="Email" />
    <TableXColumn Field="status" Header="Status" Align="TableXColumnAlign.Center" />
    <TableXColumn Field="score" Header="Score" Align="TableXColumnAlign.Right" Width="90" />
    <TableXColumn Field="createdAt" Header="Enrolled" />
</TableX>
```

That is the whole integration. The grid fetches its own data, manages its
loading and error states, and re-fetches on every query change.


Static web assets are served by `app.UseStaticFiles()`, which the default
templates already call:

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(
    builder.Configuration.GetConnectionString("Default")));
builder.Services.AddControllersWithViews();

var app = builder.Build();
app.UseStaticFiles();      // serves _content/TableX.AspNetCore/*
app.MapDefaultControllerRoute();
app.Run();
```

> Running a **Release** build without publishing is the one case where neither
> the development-time asset provider nor a published `wwwroot` applies, and the
> two files 404. Publish, or set `ASPNETCORE_ENVIRONMENT=Development`.

Full attribute tables: [`TableX.AspNetCore` API](api/aspnet.md).

## Vanilla JavaScript

No build step needed. The browser bundle inlines `@nexgrid/core` and exposes
everything on a global called `TableX`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Students</title>
  <link rel="stylesheet" href="https://unpkg.com/@nexgrid/vanilla@0.1.0/dist/tablex.css" />
</head>
<body>
  <h1>Students</h1>
  <div id="grid"></div>

  <script src="https://unpkg.com/@nexgrid/vanilla@0.1.0/dist/tablex.global.js"></script>
  <script>
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
      query: TableX.parseQuery(location.search),
      onQueryChange: (next) => {
        history.replaceState(null, "", `?${TableX.serializeQuery(next)}`);
      },
      onSelectionChange: (ids) => console.log("selected", ids),
      onNotify: ({ type, message }) => console.info(type, message),
    });

    window.addEventListener("beforeunload", () => grid.destroy());
  </script>
</body>
</html>
```

Through a bundler instead:

```js
import { createTableX, parseQuery, serializeQuery } from "@nexgrid/vanilla";
import "@nexgrid/vanilla/styles.css";

const grid = createTableX(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns: [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "email", header: "Email" },
  ],
  query: parseQuery(location.search),
  onQueryChange: (next) => history.replaceState(null, "", `?${serializeQuery(next)}`),
});
```

Call `grid.destroy()` when the containing view goes away — it aborts any
in-flight request and releases every listener the grid put on `document`.

Full option table: [`@nexgrid/vanilla` API](api/vanilla.md).

## What you need on the server

Whatever the platform, the endpoint contract is the same:

1. Accept `page`, `pageSize`, repeatable `sort=field:dir`, `q`, and
   `filter[field]` from the query string.
2. Apply search → filters → sort → count → page, in that order.
3. Answer with `{ items, page, pageSize, total, totalPages }`, where `total` is
   the **full filtered count**.

On ASP.NET Core, `TableXQuery` + `ToPagedResponseAsync` do all three. Elsewhere,
`parseQuery` from `@nexgrid/core` handles step 1 with the same degradation rules.
Worked endpoints for ASP.NET Core, Node/Express and Next.js are in
[Server integration](server-integration.md).

## Next

- [JavaScript Guide](javascript-guide.md) — Using NexGrid in plain JS / JSX with JSDoc autocomplete
- [Columns](columns.md) — custom cells, widths, alignment, visibility
- [Features](README.md#features) — search, sorting, pagination, selection, density, export, responsive
- [Theming](theming.md) — every token, dark mode
- [Localization](localization.md) — every string
