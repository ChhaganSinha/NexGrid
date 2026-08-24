# NexGrid — ASP.NET Core MVC example

An ASP.NET Core 8 MVC app with a `<nex-grid>` Tag Helper in the view and a
single controller action feeding it. 200 students, an allowlisted
`ToPagedResponse` query, and **no JavaScript to write** — the grid fetches its
own data.

## Run it

The browser bundle the Razor Class Library ships comes out of the JS build, so
produce it first:

```bash
# from the repository root
npm install
npm run build:vanilla      # writes packages/vanilla/dist/nexgrid.global.js + nexgrid.css

# then, in this folder
cd examples/aspnet-mvc
dotnet run                 # http://localhost:5080
```

`NexGrid.AspNetCore.csproj` copies those two files into its `wwwroot/` before
building, guarded by `Exists(...)` — the .NET project still compiles without
them, it just produces a grid with nothing to render it (you get a console
error saying the bundle is not loaded).

In your own app it is one package and no build step:

```bash
dotnet add package NexGrid.AspNetCore
```

## The three pieces

### 1. Register the Tag Helpers — `Views/_ViewImports.cshtml`

```cshtml
@using NexGrid.AspNetCore
@addTagHelper *, NexGrid.AspNetCore
```

Discovery is by **assembly name**, so that line is the same whether the package
arrived as a NuGet reference or a project reference. Forget it and `<nex-grid>`
renders as literal, inert HTML with no error — the most common "why is my grid
blank".

### 2. Reference the assets once — `Views/Shared/_Layout.cshtml`

```cshtml
<link rel="stylesheet" href="~/_content/NexGrid.AspNetCore/nexgrid.css" />
...
<script src="~/_content/NexGrid.AspNetCore/nexgrid.global.js"></script>
```

Both ship inside the package as static web assets, served by
`app.UseStaticFiles()`. Load the script **once per page** even with several
grids on it — it defines the `NexGrid` global that each grid's init script calls
into. (`NexGridAssets.StylesheetPath` and `NexGridAssets.ScriptPath` hold the
same two strings if you would rather not hard-code them.)

> In Development the assets are served straight out of the package, and
> `dotnet publish` copies them into your app's `wwwroot`. A **Release build that
> is run without publishing** is the one case where neither applies and the files
> 404 — publish, or run in Development.

### 3. The view — `Views/Home/Index.cshtml`

```cshtml
<nex-grid caption="Students" endpoint="/api/students" enable-selection="true"
          page-size="25" sort="enrolledAt:desc">
    <nex-grid-column field="name" header="Student" min-width="200" />
    <nex-grid-column field="status" header="Status" align="Center" width="130"
                     filterable="true" filter-options="Active,Pending,Suspended,Alumni" />
    <nex-grid-column field="enrolledAt" header="Enrolled" width="140" />
</nex-grid>
```

- `caption` is required — it is the table's accessible name and the default
  export file name. A missing one throws at render time rather than shipping an
  unlabelled table.
- `endpoint` turns on **endpoint mode**: the grid fetches
  `buildQueryUrl(endpoint, query)` itself, expects a `PagedResponse` body, and
  owns its own loading, error and retry states.
- `field` must match the **JSON property name** the endpoint returns —
  camelCase under ASP.NET Core's default policy, so `enrolledAt`, not
  `EnrolledAt`.
- `sort="enrolledAt:desc"` only takes effect because the controller registered
  `.Sortable(s => s.EnrolledAt)`. An unregistered field is silently ignored, by
  design.

The Tag Helper renders three things: an empty `<div>` to mount into, a
`<script type="application/json">` block with the configuration (never inside
executable JavaScript, so no caption or endpoint can close the element early),
and a small init call into `NexGrid.createNexGrid`.

## The endpoint — `Controllers/HomeController.cs`

```csharp
[HttpGet("/api/students")]
public PagedResponse<Student> Students(NexGridQuery query) =>
    _store.Query.ToPagedResponse(query, options => options
        .Sortable(s => s.Name, s => s.Email, s => s.Department, s => s.Status,
                  s => s.Score, s => s.EnrolledAt, s => s.Scholarship)
        .Searchable(s => s.Name, s => s.Email, s => s.Department)
        .Filterable("status", s => s.Status)
        .Filterable("department", s => s.Department)
        .DefaultSort(s => s.EnrolledAt, SortDirection.Descending));
```

**`NexGridQuery` binds itself.** No `[FromQuery]`, no startup registration, no
validation to write. Parsing mirrors `@nexgrid/core`'s `parseQuery` exactly,
including how it degrades: `?page=0` → page 1, `?pageSize=99999` → 10,
`?sort=:desc` → dropped. A hand-edited URL produces a usable grid, not a 400 in
the middle of a paginated table.

**The `options` lambda is a security boundary.** Column ids arrive from a public
query string; anyone can ask to sort by `passwordHash` or filter on `isDeleted`.
Nothing is sortable, searchable or filterable unless it is named there, and an
unregistered key is dropped without ever reaching a member. There is no
reflection path from a query-string value into an expression, which is why there
is nothing to escape.

**`DefaultSort` is worth setting on every grid.** `Skip`/`Take` over an
unordered query has no defined row order, so without it a user can page forward
and see the same record twice.

### Moving to a real database

Replace the store with a `DbContext` and switch to the async overload — nothing
else changes:

```csharp
[HttpGet("/api/students")]
public Task<PagedResponse<Student>> Students(NexGridQuery query, CancellationToken ct) =>
    db.Students.AsNoTracking().ToPagedResponseAsync(query, options => options
        .Sortable(s => s.Name, s => s.CreatedAt)
        .Searchable(s => s.Name, s => s.Email)
        .Filterable("status", s => s.Status), ct);
```

On EF Core the whole thing leaves as two SQL statements — a `COUNT` and a
windowed `SELECT` — and no row the user is not looking at is materialized.

> **One in-memory quirk:** `Searchable` translates to `string.Contains`, whose
> case sensitivity follows the data source. Over the `List<Student>` in this
> example the match is **ordinal**, so `sharma` does not find `Sharma`. On SQL
> Server with a default collation the identical code is case-insensitive.

## Driving the grid from your own script

The Tag Helper leaves the handle on the container as `element.nexgrid`, so any
script can reach it. `Views/Home/Index.cshtml` uses that to wire a status
`<select>` to the same query the grid is already running:

```js
var grid = document.getElementById("students-grid").nexgrid;
grid.update({
  query: NexGrid.withFilter(grid.getQuery(), "status", value || undefined)
});
```

In endpoint mode `update({ query })` refetches. The handle also offers
`refresh()`, `getQuery()`, `getSelection()` and `destroy()`.

## Custom cell renderers

Cell renderers are **functions**, and functions cannot travel through the JSON
configuration block. To use them, turn the automatic init off and call
`createNexGrid` yourself:

```cshtml
<nex-grid id="grid" caption="Students" endpoint="/api/students" init="false">
    <nex-grid-column field="name" header="Name" />
    <nex-grid-column field="status" header="Status" align="Center" />
</nex-grid>

@section Scripts {
<script>
  var host = document.getElementById("grid");
  var config = JSON.parse(document.getElementById("grid-config").textContent);

  config.columns[1].cell = function (ctx) {
    // el() writes text through textContent, so a row value can never be
    // interpreted as markup. Never build a cell from an HTML string.
    return NexGrid.el("span", { class: "badge", text: String(ctx.getValue()) });
  };

  host.nexgrid = NexGrid.createNexGrid(host, config);
</script>
}
```

The config block's id is always the container id plus `-config`.
