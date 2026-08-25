# `TableX.AspNetCore` API reference

> The canonical attribute tables and the long-form rationale live in the package
> README:
> **[`dotnet/TableX.AspNetCore/README.md`](../../dotnet/TableX.AspNetCore/README.md)**.
> This page is the type surface and the details that only matter once you are
> wiring it up.

```bash
dotnet add package TableX.AspNetCore
```

A Razor Class Library targeting `net8.0`, with a `FrameworkReference` on
`Microsoft.AspNetCore.App` and **zero package dependencies**. It gives you three
things: a query binder, `IQueryable` paging extensions, and Tag Helpers over the
`@tablex/vanilla` browser bundle, which ships inside the package as a static
web asset.

- [Setup](#setup)
- [Models](#models)
- [Query extensions](#query-extensions)
- [`TableXQueryOptions<T>`](#tablexqueryoptionst)
- [Tag Helpers](#tag-helpers)
- [Assets](#assets)
- [Async without an EF Core dependency](#async-without-an-ef-core-dependency)
- [Packaging](#packaging)

## Setup

Layout — both files ship inside the package; there is nothing to copy or build:

```cshtml
<link rel="stylesheet" href="@TableXAssets.StylesheetPath" />
<script src="@TableXAssets.ScriptPath"></script>
```

`_ViewImports.cshtml`, once:

```cshtml
@using TableX.AspNetCore
@addTagHelper *, TableX.AspNetCore
```

Static web assets are served by `app.UseStaticFiles()`, which the default
templates already call. In Development they come straight out of the package;
`dotnet publish` copies them into your app's `wwwroot`. Running a **Release**
build without publishing is the one case where neither applies and the two files
404 — publish, or set `ASPNETCORE_ENVIRONMENT=Development`.

Nothing needs registering in `Program.cs`.

## Models

### `TableXQuery`

Binds TableX's wire format straight off the query string, in all three hosting
styles.

| Member | Signature | Notes |
| --- | --- | --- |
| `Page` | `int { get; init; }` | 1-based; always ≥ 1. |
| `PageSize` | `int { get; init; }` | Coerced to `PageSizes.All`. |
| `Sort` | `IReadOnlyList<SortSpec> { get; init; }` | First is primary. |
| `Q` | `string? { get; init; }` | `null` when absent or empty. |
| `Filter` | `IReadOnlyDictionary<string, string> { get; init; }` | Case-insensitive keys. |
| `PrimarySort` | `SortSpec?` | `Sort[0]`, or `null`. |
| `GetFilter(string field)` | `string?` | One filter value, or `null`. Case-insensitive. |
| `Parse(IQueryCollection? query)` | `static TableXQuery` | Parse from a request. |
| `Parse(string? queryString)` | `static TableXQuery` | Raw query string, with or without `?`. Handy in tests. |
| `BindAsync(HttpContext)` | `static ValueTask<TableXQuery?>` | Minimal API binding hook; the framework calls it. |
| `ToQueryString()` | `string` | Render back to a query string. |
| `Default` | `static TableXQuery` | Page 1, default size, no sort/search/filter. |
| `PageKey`, `PageSizeKey`, `SortKey`, `SearchKey`, `FilterKeyPrefix` | `const string` | `"page"`, `"pageSize"`, `"sort"`, `"q"`, `"filter["`. |

Binding never fails — parsing mirrors `@tablex/core`'s `parseQuery` exactly,
including how it degrades. A hand-edited URL produces a usable grid, not a 400.
The full degradation table is in the
[README](../../dotnet/TableX.AspNetCore/README.md#binding-never-fails) and in
[Server integration](../server-integration.md#parsing-rules).

```csharp
// MVC / API controllers — the type carries [ModelBinder], so no attribute is needed
[HttpGet]
public Task<PagedResponse<Student>> Get(TableXQuery query, CancellationToken ct) => /* … */;

// Minimal APIs — BindAsync is found automatically
app.MapGet("/api/students", (TableXQuery query, AppDbContext db, CancellationToken ct) => /* … */);

// Razor Pages, middleware, jobs — parse it yourself
var query = TableXQuery.Parse(Request.Query);
var fromString = TableXQuery.Parse("?page=2&pageSize=25&sort=name:asc");
```

`[FromQuery] TableXQuery query` binds identically: the attribute only names the
binding source, which this binder reads directly off `HttpContext.Request.Query`.

### `PagedResponse<T>`

```csharp
public sealed class PagedResponse<T>
{
    public PagedResponse();
    public PagedResponse(IReadOnlyList<T> items, int page, int pageSize, int total);

    public IReadOnlyList<T> Items { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int Total { get; init; }      // FULL filtered count
    public int TotalPages { get; }       // derived
}
```

Serializes to exactly the shape every adapter reads, regardless of your app's
`JsonSerializerOptions`:

```jsonc
{
  "items": [ /* exactly ONE page of rows */ ],
  "page": 2,
  "pageSize": 25,
  "total": 1284,      // full FILTERED count — this drives the pager
  "totalPages": 52
}
```

### `SortSpec` and `SortDirection`

```csharp
public enum SortDirection { Ascending, Descending }

public sealed record SortSpec(string Field, SortDirection Direction)
{
    public const string AscendingToken = "asc";
    public const string DescendingToken = "desc";

    public static bool TryParse(string? token, out SortSpec? spec);
    public string ToToken();      // "name:asc"
}
```

The field is everything before the **last** colon, so `a:b:desc` parses as field
`a:b`, descending.

### `PageSizes`

```csharp
public static class PageSizes
{
    public const int Default = 10;
    public static IReadOnlyList<int> All { get; }     // 10, 25, 50, 100
    public static bool IsAllowed(int value);
    public static int Coerce(int value);              // -> Default when not allowed
}
```

The same allowlist as `@tablex/core`'s `PAGE_SIZES`.

### `TableXQueryModelBinder`

The MVC binder. Attached to `TableXQuery` by attribute — you never register it.

## Query extensions

```csharp
public static class TableXQueryableExtensions
{
    public static PagedResponse<T> ToPagedResponse<T>(
        this IQueryable<T> source,
        TableXQuery query,
        Action<TableXQueryOptions<T>>? configure = null);

    public static Task<PagedResponse<T>> ToPagedResponseAsync<T>(
        this IQueryable<T> source,
        TableXQuery query,
        Action<TableXQueryOptions<T>>? configure = null,
        CancellationToken cancellationToken = default);
}
```

Both apply **search → filters → sort → count → page**, in that order, and both
throw `ArgumentNullException` when `source` or `query` is null.

The count and the page share the same composed query, so they can never
disagree. Two round trips reach the database and neither materialises a row the
user is not looking at.

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TableX.AspNetCore;

[ApiController]
[Route("api/students")]
public sealed class StudentsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public Task<PagedResponse<StudentRow>> Get(TableXQuery query, CancellationToken ct) =>
        db.Students
            .AsNoTracking()
            .Where(s => s.TenantId == TenantId)          // authorization first, always
            .Select(s => new StudentRow(
                s.Id, s.Name, s.Email, s.Status, s.Score, s.CreatedAt))
            .ToPagedResponseAsync(query, options => options
                .Sortable(s => s.Name, s => s.Score, s => s.CreatedAt)
                .Searchable(s => s.Name, s => s.Email)
                .Filterable("status", s => s.Status)
                .DefaultSort(s => s.CreatedAt, SortDirection.Descending), ct);

    private int TenantId => int.Parse(User.FindFirst("tenant_id")!.Value);
}

public sealed record StudentRow(
    int Id, string Name, string Email, string Status, int Score, DateTime CreatedAt);
```

Calling `ToPagedResponse(query)` with **no** `configure` delegate ignores every
sort, search and filter and just pages. Nothing is allowed by default.

## `TableXQueryOptions<T>`

The allowlist. `Sortable`, `Searchable` and `Filterable` build dictionaries from
expressions **the server wrote**; applying a query is a lookup, and an
unregistered key is dropped — no error, no reflection, no leak.

| Method | Signature | Effect |
| --- | --- | --- |
| `Sortable` | `(params Expression<Func<T, object?>>[] members)` | Allow sorting by these members, keyed by member name. |
| `Sortable` | `(string key, Expression<Func<T, object?>> selector)` | Allow sorting under an explicit key, or by a computed expression. |
| `Searchable` | `(params Expression<Func<T, string?>>[] members)` | Include these string members in the global search (OR'd `Contains`). |
| `Filterable` | `(string key, Expression<Func<T, object?>> selector)` | Allow `filter[key]=value` as an equality comparison. |
| `Filterable` | `(Expression<Func<T, object?>> selector)` | Same, keyed by member name. |
| `DefaultSort` | `(selector, direction)` | Ordering used when the request carries no usable sort. |

All of them return `this`, so calls chain.

Behaviour worth knowing:

- **Keys match case-insensitively** against the member name, so
  `s => s.CreatedAt` answers `?sort=createdAt:desc`.
- **Filter values are converted, never interpreted.** `?filter[score]=banana`
  drops the filter rather than failing the request. `string`, enums, `bool`,
  numeric types, `Guid`, `DateTime`, `DateTimeOffset`, `DateOnly` and `TimeOnly`
  are supported.
- **`?filter[status]=`** (empty) is kept in `TableXQuery.Filter` but ignored
  when the query is applied.
- **Values are parameters, not constants.** They are lifted into the expression
  tree the way a C# closure is, so the database reuses one query plan for every
  search term.

> **Always set a `DefaultSort`.** `Skip`/`Take` over an unordered SQL query has
> no defined row order: a user can page forward, see the same record twice, and
> never see another.

> **The allowlist is not authorization.** Filter by tenant, owner or role
> **before** `ToPagedResponse` — the grid pages whatever query you hand it.

## Tag Helpers

### `<table-x>` — `TableXTagHelper`

Renders three things: a `<div>` for the bundle to mount into, a
`<script type="application/json">` block holding the configuration, and a short
init script that calls `TableX.createTableX`.

Configuration never goes inside executable JavaScript. It travels in an inert
JSON block written with `System.Text.Json`'s default encoder, which escapes `<`,
`>` and `&` — so no caption, header or endpoint can close the `<script>` element
early, whatever it contains.

Full attribute table:
[README › `<table-x>`](../../dotnet/TableX.AspNetCore/README.md#table-x).

```cshtml
<table-x caption="Students" endpoint="/api/students" enable-selection="true"
          sort="createdAt:desc" page-size="25" theme="Auto" density="Compact">
    <table-x-column field="name" header="Name" min-width="180" />
    <table-x-column field="email" header="Email" />
    <table-x-column field="status" header="Status" align="Center"
                     filterable="true" filter-options="Active,Pending,Disabled" />
    <table-x-column field="score" header="Score" align="Right" width="90" />
    <table-x-column field="createdAt" header="Enrolled" />
</table-x>
```

Details:

| | |
| --- | --- |
| `caption` | **Required.** Omitting it throws `InvalidOperationException` at render time — it is the table's accessible name, and failing loudly beats shipping a grid without one. |
| `id` | Defaults to a generated `tbx-<12 hex chars>`. The config block's id is always `<container id>-config`, and the container also carries `data-tablex-config`. |
| `density`, `theme`, `align` | Parsed into `TableXDensity` / `TableXTheme` / `TableXColumnAlign` case-insensitively. An unrecognised value throws with the list of valid ones. |
| `grid-class` | Extra classes for the grid **root** (`.tbx-root`). The element's own `class` stays on the mount point — they are different elements. |
| `page`, `page-size`, `sort`, `search` | Seed the initial query. A `TableXQueryConfig` is emitted only when at least one differs from the defaults; otherwise the bundle's own `defaultQuery()` applies. `page-size` is coerced through `PageSizes.Coerce`. |
| `init` | `false` emits the container and the config block **without** the init script, so you can attach functions and start the grid yourself. |
| `nonce` | CSP nonce for the init script. |
| `<table-x-column>` | The only permitted child (`[RestrictChildren]`), and source order is column order. |

The grid handle is left on the container as `element.tablex`:

```js
document.getElementById("students-grid").tablex.refresh();
```

If the bundle is missing, the init script logs a console error naming the script
path rather than throwing.

### `<table-x-column>` — `TableXColumnTagHelper`

Maps one-to-one onto a `TableXColumn` and its `meta`. Full attribute table:
[README › `<table-x-column>`](../../dotnet/TableX.AspNetCore/README.md#table-x-column).

`field` is required and must match the **JSON** property name your endpoint
returns (`createdAt`, not `CreatedAt`) — it is the row accessor, the `sort=` id
and the `filter[]` key at once.

### Custom cell renderers

A cell renderer is a function, and functions do not survive JSON. Use
`init="false"`:

```cshtml
<table-x id="students-grid" caption="Students" endpoint="/api/students" init="false">
    <table-x-column field="name" header="Name" />
    <table-x-column field="status" header="Status" align="Center" />
</table-x>

@section Scripts {
<script>
    (function () {
        var host = document.getElementById("students-grid");
        var config = JSON.parse(document.getElementById("students-grid-config").textContent);

        config.columns.find(function (c) { return c.accessorKey === "status"; }).cell =
            function (ctx) {
                var badge = document.createElement("span");
                badge.className = "badge badge-" + String(ctx.getValue()).toLowerCase();
                badge.textContent = ctx.getValue();     // textContent, never innerHTML
                return badge;
            };

        config.onNotify = function (notice) { window.toast(notice.type, notice.message); };
        config.onRowClick = function (row) { window.location.assign("/students/" + row.id); };

        host.tablex = TableX.createTableX(host, config);
    })();
</script>
}
```

Everything `@tablex/vanilla` accepts is available on that object: `onNotify`,
`onRowClick`, `onSelectionChange`, `locale`, `badgeRules`, `fetchOptions`, and
the rest — see [`@tablex/vanilla` API](vanilla.md#tablexoptionstdata).

### Enums

```csharp
public enum TableXDensity { Default, Compact, Comfortable }
public enum TableXTheme { Light, Dark, Auto }
public enum TableXColumnAlign { Left, Center, Right }
```

## Assets

```csharp
public static class TableXAssets
{
    public const string ContentRoot   = "/_content/TableX.AspNetCore";
    public const string StylesheetPath = ContentRoot + "/tablex.css";
    public const string ScriptPath     = ContentRoot + "/tablex.global.js";
    public const string GlobalName     = "TableX";
}
```

Reference the bundle **once** per page, from the layout. `<table-x>` does not
emit it — a page with three grids should load one copy of the script.

## Async without an EF Core dependency

`ToPagedResponseAsync` runs genuinely asynchronously on EF Core, but this package
takes **no** `Microsoft.EntityFrameworkCore` package reference: it must not pin
an EF version onto your app, and it must stay usable over other providers.

The async path is discovered at run time instead — rows are materialised through
`IAsyncEnumerable<T>` (a BCL interface EF Core's queryables implement), and the
count goes through EF Core's `IAsyncQueryProvider`, located by type name.
Anything without an async surface — LINQ to Objects, an in-memory test double —
falls back to the synchronous path, which is the correct answer there anyway.

That is what makes this a legitimate unit test:

```csharp
var students = new[]
{
    new Student { Id = 1, Name = "Ada",  Email = "ada@example.com",  Score = 98 },
    new Student { Id = 2, Name = "Alan", Email = "alan@example.com", Score = 91 },
}.AsQueryable();

var query = TableXQuery.Parse("?page=1&pageSize=10&sort=name:desc&q=a");

var page = students.ToPagedResponse(query, options => options
    .Sortable(s => s.Name)
    .Searchable(s => s.Name, s => s.Email)
    .DefaultSort(s => s.Id, SortDirection.Ascending));

Assert.Equal(2, page.Total);
Assert.Equal("Alan", page.Items[0].Name);
```

## Packaging

| | |
| --- | --- |
| Type | Razor Class Library |
| Target | `net8.0`, `FrameworkReference` on `Microsoft.AspNetCore.App` |
| Package dependencies | none |
| Static web assets | `tablex.global.js`, `tablex.css` |
| License | MIT |

The `.csproj` copies `packages/vanilla/dist/tablex.global.js` and
`dist/tablex.css` into `wwwroot/` before every build, guarded by `Exists(...)`,
so a checkout where the JavaScript has not been built still compiles — it just
produces a package with no browser payload. Building from source:

```bash
npm install
npm run build:core && npm run build:vanilla
dotnet build dotnet/TableX.sln -c Release
```

## Related

- [Package README](../../dotnet/TableX.AspNetCore/README.md) — the canonical attribute tables
- [`@tablex/vanilla` API](vanilla.md) — the bundle this package embeds
- [Server integration](../server-integration.md) · [Getting started › ASP.NET Core](../getting-started.md#aspnet-core-8)
