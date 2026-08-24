# NexGrid.AspNetCore

A professional, **server-driven** data grid for ASP.NET Core — the Razor half of
[NexGrid](https://github.com/ChhaganSinha/NexGrid).

The grid never holds your dataset. Every user action (search, sort, page, page
size, column filter) becomes a query string; your endpoint answers with exactly
one page of rows and a total count. That is what makes the grid behave the same
at 50 rows and at 5,000,000.

This package gives you three things and nothing you have to glue together:

| | |
| --- | --- |
| **`NexGridQuery`** | Binds NexGrid's wire format straight off the query string. No configuration, no `[FromQuery]` gymnastics. |
| **`ToPagedResponseAsync`** | Applies search, filters, sorting and paging to an `IQueryable<T>` through an **explicit allowlist**, and returns a `PagedResponse<T>`. On EF Core it leaves as two SQL statements. |
| **Tag Helpers** | `<nex-grid>` and `<nex-grid-column>` render the grid, with the browser bundle shipped inside the package as a static web asset. |

- ASP.NET Core 8.0+ · zero package dependencies · MIT
- Excel (`.xls`, styled badges) and CSV export, including the **whole filtered
  dataset** across pages
- Global search (350 ms debounce), column visibility, density, row selection,
  automatic `S.No.`, numbered pagination with a page-jump box
- Responsive: a table at ≥ 768 px, a card per record below
- Light / dark / auto theming, fully localizable, accessible by construction

---

## Install

```bash
dotnet add package NexGrid.AspNetCore
```

Reference the bundle once, in `_Layout.cshtml`. Both files ship inside the
package as static web assets — there is nothing to copy, download, or build:

```cshtml
<link rel="stylesheet" href="~/_content/NexGrid.AspNetCore/nexgrid.css" />
<script src="~/_content/NexGrid.AspNetCore/nexgrid.global.js"></script>
```

Or without hard-coding the paths:

```cshtml
<link rel="stylesheet" href="@NexGridAssets.StylesheetPath" />
<script src="@NexGridAssets.ScriptPath"></script>
```

Static web assets are served by `app.UseStaticFiles()`, which the default
templates already call. In Development they are served straight out of the
package; `dotnet publish` copies them into your app's `wwwroot`. (Running a
Release build *without* publishing is the one case where neither applies and the
files 404 — publish, or set `ASPNETCORE_ENVIRONMENT=Development`.)

Then register the Tag Helpers once, in `Views/_ViewImports.cshtml` (or
`Pages/_ViewImports.cshtml`):

```cshtml
@using NexGrid.AspNetCore
@addTagHelper *, NexGrid.AspNetCore
```

---

## Quick start

**The endpoint**

```csharp
[HttpGet("/api/students")]
public Task<PagedResponse<Student>> Get(NexGridQuery query, CancellationToken ct) =>
    db.Students.AsNoTracking().ToPagedResponseAsync(query, options => options
        .Sortable(s => s.Name, s => s.CreatedAt)
        .Searchable(s => s.Name, s => s.Email)
        .Filterable("status", s => s.Status)
        .DefaultSort(s => s.CreatedAt, SortDirection.Descending), ct);
```

**The view (MVC / Razor Pages)**

```cshtml
<nex-grid caption="Students" endpoint="/api/students" enable-selection="true">
    <nex-grid-column field="name" header="Name" min-width="180" />
    <nex-grid-column field="email" header="Email" />
    <nex-grid-column field="status" header="Status" align="Center" />
    <nex-grid-column field="score" header="Score" align="Right" width="90" />
    <nex-grid-column field="createdAt" header="Enrolled" />
</nex-grid>
```

**The view (Blazor Server, WebAssembly, or Auto)**

Add `@using NexGrid.AspNetCore.Components` to `_Imports.razor`:

```razor
@page "/students"
@using NexGrid.AspNetCore.Components

<NexGrid TItem="Student" Caption="Students Directory" Endpoint="/api/students" EnableSelection="true">
    <NexGridColumn Field="name" Header="Name" MinWidth="180" />
    <NexGridColumn Field="email" Header="Email" />
    <NexGridColumn Field="status" Header="Status" Align="NexGridColumnAlign.Center" />
    <NexGridColumn Field="score" Header="Score" Align="NexGridColumnAlign.Right" Width="90" />
    <NexGridColumn Field="createdAt" Header="Enrolled" />
</NexGrid>
```

That is the whole integration. The grid fetches its own data, manages its
loading and error states, and re-fetches on every query change.


---

## Wiring the query binder

`NexGridQuery` binds itself in all three hosting styles. Nothing needs to be
registered in `Program.cs`.

### MVC and API controllers

The type carries `[ModelBinder(typeof(NexGridQueryModelBinder))]`, so an
undecorated parameter is enough:

```csharp
[ApiController]
[Route("api/students")]
public sealed class StudentsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public Task<PagedResponse<Student>> Get(NexGridQuery query, CancellationToken ct) => /* ... */;
}
```

`[FromQuery] NexGridQuery query` works too and binds identically — the attribute
only names the binding source, which this binder reads directly off
`HttpContext.Request.Query`.

### Minimal APIs

`NexGridQuery` implements the `BindAsync(HttpContext)` hook that minimal APIs
look for:

```csharp
app.MapGet("/api/students", (NexGridQuery query, AppDbContext db, CancellationToken ct) =>
    db.Students.AsNoTracking().ToPagedResponseAsync(query, o => o
        .Sortable(s => s.Name)
        .Searchable(s => s.Name, s => s.Email), ct));
```

### Razor Pages, middleware, background jobs

Call the parser yourself:

```csharp
public async Task OnGetAsync()
{
    var query = NexGridQuery.Parse(Request.Query);
    Result = await db.Students.AsNoTracking().ToPagedResponseAsync(query, Configure);
}
```

`NexGridQuery.Parse(string)` takes a raw query string (with or without the
leading `?`), which is convenient in tests.

### Binding never fails

Parsing mirrors `@nexgrid/core`'s `parseQuery` exactly, including how it
degrades. A hand-edited URL produces a usable grid, not a `400`:

| Query string | Result |
| --- | --- |
| `?page=0`, `?page=-3`, `?page=abc` | `Page = 1` |
| `?page=12abc` | `Page = 12` (JavaScript `parseInt` semantics, so client and server read a URL the same way) |
| `?pageSize=7`, `?pageSize=100000` | `PageSize = 10` (the allowlist is `10, 25, 50, 100`) |
| `?sort=name` | `name` ascending |
| `?sort=name:sideways` | `name` ascending |
| `?sort=:desc` | dropped |
| `?sort=a:b:desc` | field `a:b`, descending (the field is everything before the **last** colon) |
| `?q=` | `Q = null` |
| `?filter[status]=` | kept in `Filter`, but ignored when the query is applied |

---

## Full example — controller + EF Core

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using NexGrid.AspNetCore;

public enum StudentStatus { Active, Suspended, Alumni }

public sealed class Student
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public StudentStatus Status { get; set; }
    public int Score { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? InternalNotes { get; set; }   // never exposed: not allowlisted
}

[ApiController]
[Route("api/students")]
public sealed class StudentsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public Task<PagedResponse<StudentRow>> Get(NexGridQuery query, CancellationToken ct) =>
        db.Students
            .AsNoTracking()
            .Where(s => s.TenantId == User.TenantId())   // authorization first, always
            .Select(s => new StudentRow(s.Id, s.Name, s.Email, s.Status, s.Score, s.CreatedAt))
            .ToPagedResponseAsync(query, options => options
                .Sortable(s => s.Name, s => s.Score, s => s.CreatedAt)
                .Searchable(s => s.Name, s => s.Email)
                .Filterable("status", s => s.Status)
                .DefaultSort(s => s.CreatedAt, SortDirection.Descending), ct);
}

public sealed record StudentRow(
    int Id, string Name, string Email, StudentStatus Status, int Score, DateTime CreatedAt);
```

Two round trips reach the database, and neither materialises a row the user is
not looking at:

```sql
SELECT COUNT(*) FROM [Students] WHERE [TenantId] = @tenant AND ([Name] LIKE @q OR [Email] LIKE @q);

SELECT [Id], [Name], [Email], [Status], [Score], [CreatedAt] FROM [Students]
WHERE [TenantId] = @tenant AND ([Name] LIKE @q OR [Email] LIKE @q)
ORDER BY [CreatedAt] DESC
OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
```

Notice `@q` and `@take` are **parameters**. Values from the query string are
lifted into the expression tree the way a C# closure is, not baked in as
constants, so the database can reuse one query plan for every search term.

> **Project before you page.** `.Select(...)` into a row type keeps columns the
> UI never shows — `InternalNotes`, `PasswordHash` — out of the SQL entirely.
> The allowlist already prevents them being sorted or filtered on; projecting
> keeps them from being *read*.

### Async without an EF Core dependency

`ToPagedResponseAsync` runs genuinely asynchronously on EF Core, but this
package takes **no** `Microsoft.EntityFrameworkCore` package reference — it must
not pin an EF version onto your app, and it must stay usable over other
providers. The async path is discovered at run time instead: rows are
materialised through `IAsyncEnumerable<T>` (a BCL interface EF Core's queryables
implement), and the count goes through EF Core's `IAsyncQueryProvider` located by
type name. Anything without an async surface — LINQ to Objects, an in-memory
test double — falls back to the synchronous path, which is the correct answer
there anyway.

---

## Full example — minimal API

```csharp
using Microsoft.EntityFrameworkCore;
using NexGrid.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlServer(/* ... */));
builder.Services.AddRazorPages();

var app = builder.Build();
app.UseStaticFiles();       // serves _content/NexGrid.AspNetCore/*
app.MapRazorPages();

app.MapGet("/api/students", (NexGridQuery query, AppDbContext db, CancellationToken ct) =>
    db.Students
        .AsNoTracking()
        .ToPagedResponseAsync(query, options => options
            .Sortable(s => s.Name, s => s.Score, s => s.CreatedAt)
            .Searchable(s => s.Name, s => s.Email)
            .Filterable("status", s => s.Status)
            .DefaultSort(s => s.CreatedAt, SortDirection.Descending), ct));

app.Run();
```

`PagedResponse<T>` serializes to exactly the shape every NexGrid adapter reads,
regardless of your app's `JsonSerializerOptions`:

```jsonc
{
  "items": [ /* exactly ONE page of rows */ ],
  "page": 2,
  "pageSize": 25,
  "total": 1284,      // full FILTERED count — this drives the pager
  "totalPages": 52
}
```

---

## The allowlist, and why it is not optional

A grid sends the column ids it was configured with. The query string is not a
grid — it is whatever anyone types into the address bar:

```
?sort=PasswordHash:asc
?filter[IsDeleted]=false
?sort=Owner.Organisation.BillingEmail:desc
```

A grid library that resolved those names by reflection would happily order by a
password hash and let an attacker read it one binary-search page at a time.

NexGrid never turns a client string into a member access. `Sortable`,
`Searchable` and `Filterable` build dictionaries from expressions **the server
wrote**, and applying a query is a lookup:

```csharp
if (!options.SortableMembers.TryGetValue(spec.Field, out var selector))
{
    continue;   // not allowlisted: dropped, never reflected
}
```

Which means:

- **An unregistered key does nothing.** No error, no leak, no 500 — the grid
  renders in its default order. There is no code path from a query-string value
  to a property, so there is nothing to escape and nothing to sanitise.
- **Keys are matched case-insensitively** against the member name, so
  `s => s.CreatedAt` answers the browser's `?sort=createdAt:desc`. Use the
  `Sortable(key, selector)` / `Filterable(key, selector)` overloads when the
  column id differs from the member name, or to order by a computed expression.
- **Filter values are converted, never interpreted.** `?filter[score]=banana`
  drops the filter rather than failing the request. Strings, enums, `bool`,
  numbers, `Guid`, `DateTime`, `DateTimeOffset`, `DateOnly` and `TimeOnly` are
  supported.
- **Nothing is allowed by default.** A call with no `configure` delegate ignores
  every sort, search and filter and just pages.

The allowlist is not authorization. Filter by tenant, owner, or role **before**
`ToPagedResponse` — the grid pages whatever query you hand it.

### Always set a `DefaultSort`

`Skip`/`Take` over an unordered SQL query has no defined row order. Without a
default sort a user can page forward and see the same record twice, and never
see another. One line fixes it:

```csharp
.DefaultSort(s => s.CreatedAt, SortDirection.Descending)
```

---

## Tag Helpers

### `<nex-grid>`

Renders three things: a `<div>` for the bundle to mount into, a
`<script type="application/json">` block holding the configuration, and a short
init script that calls `NexGrid.createNexGrid`.

Configuration never goes inside executable JavaScript. It travels in an inert
JSON block written with `System.Text.Json`'s default encoder, which escapes `<`,
`>` and `&` — so no caption, header, or endpoint can close the `<script>`
element early, whatever it contains.

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `caption` | string | **required** | Accessible name for the table; also the default export file prefix. |
| `endpoint` | string | — | URL the grid fetches, expecting a `PagedResponse`. |
| `fetch-endpoint` | string | `endpoint` | Endpoint used to pull the whole filtered dataset for export. |
| `id` | string | generated | The container element's id. |
| `density` | `Compact` \| `Default` \| `Comfortable` | `Default` | Row height. |
| `theme` | `Light` \| `Dark` \| `Auto` | `Light` | Colour scheme. |
| `grid-class` | string | — | Extra classes for the grid root (`.nxg-root`). The element's own `class` stays on the mount point. |
| `enable-search` | bool | `true` | Show the global search field. |
| `search-placeholder` | string | locale | Placeholder for the search field. |
| `enable-selection` | bool | `false` | Show row selection checkboxes. |
| `enable-export` | bool | `true` | Show the Excel/CSV export menu. |
| `export-file-name` | string | slug of `caption` | Export file prefix. |
| `show-serial-number` | bool | `true` | Show the automatic `S.No.` column. |
| `page` | int | `1` | Initial page. |
| `page-size` | int | `10` | Initial rows per page; coerced to `10, 25, 50, 100`. |
| `sort` | string | — | Initial sort as a `field:dir` token, e.g. `createdAt:desc`. |
| `search` | string | — | Initial search text. |
| `init` | bool | `true` | Emit the init script. See *Custom cell renderers*. |
| `nonce` | string | — | CSP nonce for the init script. |

The grid handle is left on the container as `element.nexgrid`, so other scripts
can call `refresh()`, `getQuery()`, `getSelection()` or `update()` on it:

```js
document.getElementById("students-grid").nexgrid.refresh();
```

### `<nex-grid-column>`

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `field` | string | **required** | The row property this column reads, and the id used in `sort=` and `filter[]`. Match the JSON name your endpoint returns (`createdAt`, not `CreatedAt`). |
| `header` | string | `field`, capitalised | Header text. |
| `sortable` | bool | `true` | Whether the header sorts. Set `false` for columns your endpoint cannot order by. |
| `align` | `Left` \| `Center` \| `Right` | `Left` | Header and cell alignment. |
| `width` | int | — | Fixed width in px. |
| `min-width` | int | `120` | Minimum width in px. Ignored when `width` is set. |
| `flex` | int | — | Proportional width unit. |
| `hidden` | bool | `false` | Start hidden (still listed in the Columns menu). |
| `hideable` | bool | `true` | Whether the Columns menu may toggle it. |
| `exportable` | bool | `true` | Whether it appears in CSV/Excel exports. |
| `filterable` | bool | `false` | Send `filter[field]=value` for this column. Register the member with `Filterable(...)` or it is ignored. |
| `filter-field` | string | `field` | Filter key when it differs from `field`. |
| `filter-options` | string | — | Comma-separated allowed values; renders a picker instead of free text. |

### Custom cell renderers

A cell renderer is a function, and functions do not survive JSON. Set
`init="false"` to get the container and the configuration block without the init
script, then start the grid yourself:

```cshtml
<nex-grid id="students-grid" caption="Students" endpoint="/api/students" init="false">
    <nex-grid-column field="name" header="Name" />
    <nex-grid-column field="status" header="Status" align="Center" />
</nex-grid>

<script>
    const host = document.getElementById("students-grid");
    const config = JSON.parse(document.getElementById("students-grid-config").textContent);

    config.columns.find(c => c.accessorKey === "status").cell = ({ getValue }) => {
        const badge = document.createElement("span");
        badge.className = "badge badge-" + String(getValue()).toLowerCase();
        badge.textContent = getValue();     // textContent, never innerHTML
        return badge;
    };

    host.nexgrid = NexGrid.createNexGrid(host, config);
</script>
```

Everything `@nexgrid/vanilla` accepts is available on that object: `onNotify`,
`onRowClick`, `onSelectionChange`, `locale`, `badgeRules`, `fetchOptions`, and
the rest. See the [`@nexgrid/vanilla` README](https://github.com/ChhaganSinha/NexGrid/tree/main/packages/vanilla).

---

## The wire format

Client to server:

```
GET /api/students?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active
```

| Parameter | Meaning |
| --- | --- |
| `page` | 1-based page number |
| `pageSize` | Rows per page: `10`, `25`, `50` or `100` |
| `sort` | Repeatable `field:dir` token; first is primary |
| `q` | Global search text |
| `filter[<field>]` | Per-column filter |

Server to client: a `PagedResponse<T>`. Implement those two and any NexGrid
adapter — React, Angular, vanilla — works against your endpoint with no glue.

---

## API reference

### Models

| Member | Description |
| --- | --- |
| `NexGridQuery.Page` / `.PageSize` / `.Sort` / `.Q` / `.Filter` | The parsed request. Always in range. |
| `NexGridQuery.PrimarySort` | The first sort, or `null`. |
| `NexGridQuery.GetFilter(string field)` | One filter value, or `null`. Case-insensitive. |
| `NexGridQuery.Parse(IQueryCollection)` | Parse from a request. |
| `NexGridQuery.Parse(string)` | Parse from a raw query string. |
| `NexGridQuery.BindAsync(HttpContext)` | Minimal API binding hook. Called by the framework. |
| `NexGridQuery.ToQueryString()` | Render back to a query string. |
| `NexGridQuery.Default` | Page 1, default size, no sort/search/filter. |
| `PagedResponse<T>(items, page, pageSize, total)` | The response contract. `TotalPages` is derived. |
| `SortSpec(Field, Direction)` · `.ToToken()` · `.TryParse(token, out spec)` | One sort intent and its `field:dir` token. |
| `SortDirection.Ascending` / `.Descending` | Sort direction. |
| `PageSizes.All` / `.Default` / `.IsAllowed(n)` / `.Coerce(n)` | The rows-per-page allowlist, shared with `@nexgrid/core`. |
| `NexGridQueryModelBinder` | MVC binder. Attached automatically; you never register it. |

### Query

| Member | Description |
| --- | --- |
| `IQueryable<T>.ToPagedResponse(query, configure?)` | Apply search → filters → sort → count → page. |
| `IQueryable<T>.ToPagedResponseAsync(query, configure?, ct)` | Async variant. Uses the provider's async surface when it has one. |
| `NexGridQueryOptions<T>.Sortable(params Expression<Func<T, object?>>[])` | Allow sorting by these members, keyed by member name. |
| `NexGridQueryOptions<T>.Sortable(string key, Expression<Func<T, object?>>)` | Allow sorting under an explicit key, or by a computed expression. |
| `NexGridQueryOptions<T>.Searchable(params Expression<Func<T, string?>>[])` | Include these string members in the global search (OR'd `Contains`). |
| `NexGridQueryOptions<T>.Filterable(string key, Expression<Func<T, object?>>)` | Allow `filter[key]=value` as an equality comparison. |
| `NexGridQueryOptions<T>.Filterable(Expression<Func<T, object?>>)` | Same, keyed by member name. |
| `NexGridQueryOptions<T>.DefaultSort(selector, direction)` | Ordering used when the request carries no usable sort. |

### Tag Helpers and assets

| Member | Description |
| --- | --- |
| `NexGridTagHelper` | `<nex-grid>` |
| `NexGridColumnTagHelper` | `<nex-grid-column>` |
| `NexGridDensity` · `NexGridTheme` · `NexGridColumnAlign` | Attribute enums. |
| `NexGridAssets.StylesheetPath` | `/_content/NexGrid.AspNetCore/nexgrid.css` |
| `NexGridAssets.ScriptPath` | `/_content/NexGrid.AspNetCore/nexgrid.global.js` |
| `NexGridAssets.ContentRoot` · `.GlobalName` | Static web asset root; the browser global (`NexGrid`). |

---

## Building from source

The package embeds `@nexgrid/vanilla`'s browser bundle, so build the JavaScript
first:

```bash
npm install
npm run build:core && npm run build:vanilla
dotnet build dotnet/NexGrid.sln -c Release
```

The `.csproj` copies `packages/vanilla/dist/nexgrid.global.js` and
`nexgrid.css` into `wwwroot/` before every build, guarded by `Exists(...)`. A
checkout where the JavaScript has not been built still compiles — it just warns
and produces a package with no browser payload.

## Author & Maintainer

**Chhagan Sinha**  
- Email: [sinhachhagan@outlook.com](mailto:sinhachhagan@outlook.com)  
- GitHub: [@ChhaganSinha](https://github.com/ChhaganSinha)

---

## License

MIT © 2026 Chhagan Sinha. See [LICENSE](https://github.com/ChhaganSinha/NexGrid/blob/main/LICENSE).

