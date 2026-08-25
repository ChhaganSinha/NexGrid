# TableX — Angular example

A standalone Angular 19 app (no NgModule) rendering `<table-x>` over 200
students from an in-memory service that honours the real `QueryState` contract:
global search, sorting, a column filter, and paging — with simulated latency and
a button that fails the next request so you can see the error card.

## Run it

The example links the packages straight out of this repository, so build them
first:

```bash
# from the repository root
npm install
npm run build          # produces packages/*/dist, including packages/angular/dist

# then, in this folder
cd examples/angular
npm install
npm start              # http://localhost:4200
```

`npm run build` here produces a production bundle in `dist/`.

### How the packages are resolved

```jsonc
"dependencies": {
  // ng-packagr's OUTPUT is the publishable package, so the link points at
  // dist/, not at packages/angular itself.
  "@tablex/angular": "file:../../packages/angular/dist",
  "@tablex/core": "file:../../packages/core"
},
// @tablex/angular depends on "@tablex/core": "0.1.0"; this points that
// transitive dependency at the local folder too.
"overrides": {
  "@tablex/core": "file:../../packages/core"
}
```

`angular.json` also sets `"preserveSymlinks": true`. That is a consequence of
the `file:` links — without it the CLI resolves the linked package through its
real path and can end up loading a second copy of `@angular/core` (`NG0203`).
In your own app you install from a registry and none of this applies:

```bash
npm install @tablex/angular
```

## Registering the stylesheet

The grid ships **one global stylesheet**, shared verbatim with the React and
vanilla adapters. It goes in the `styles` array of the build target, before
your own styles:

```jsonc
// angular.json → projects → … → architect → build → options
"styles": [
  "node_modules/@tablex/angular/styles.css",
  "src/styles.css"
]
```

It must be **global**. Putting it in a component's `styles` does nothing —
Angular's emulated encapsulation rewrites the selectors and they never match the
grid's markup. (`@import "@tablex/core/styles.css";` from a global CSS file
works too; it is the same sheet.)

## What is where

| File | What it shows |
| --- | --- |
| `src/app/students.service.ts` | The server half of the contract: 200 deterministic rows and a `page(query)` returning `Observable<PagedResponse<Student>>` after applying search → filter → sort → count → page. Sorting and filtering are **allowlisted**. |
| `src/app/app.component.ts` | The integration: signals for `data`/`total`/`query`, a `switchMap` request stream, custom `*tableXCell` templates, a `tableXToolbar` template, and a status filter built with `withFilter`. |
| `angular.json` | Where the grid stylesheet is registered. |
| `src/styles.css` | Page chrome and the classes the cell templates use. |

## Custom cells are templates, not render functions

A column's `cell` function may only return a **string** in Angular — the
framework cannot render an arbitrary value returned from a function. Anything
richer is a template declared as a content child of `<table-x>` and keyed by
column id:

```html
<ng-container *tableXCell="'status'; of: rows(); let row">
  <span class="badge badge--{{ row.status.toLowerCase() }}">{{ row.status }}</span>
</ng-container>
```

- `of: rows()` is a **type anchor only** — never read at run time. It is what
  makes `let row` a fully typed `Student` instead of `any`.
- Other context members are named: `let value = value`, `let i = rowIndex`,
  `let column = column`.
- The same template renders the table cell **and** the mobile card row.
- The equivalent plain-attribute form is
  `<ng-template tableXCell="status" let-row>`. Do **not** combine the two —
  `<ng-template *tableXCell="…">` asks Angular for a template that contains a
  template, and the cell comes out empty.

## Everything goes through `queryChange`

```html
<table-x
  [columns]="columns"
  [data]="rows()"      <!-- the CURRENT page only -->
  [total]="total()"    <!-- the full filtered count — this draws the pager -->
  [query]="query()"
  (queryChange)="load($event)"
  caption="Students"
/>
```

`load()` stores the new query and pushes it into a `Subject` piped through
`switchMap`, so a superseded request is cancelled rather than allowed to
overwrite a fresher page. `catchError` returns `EMPTY` — not `throwError` — so
the outer stream survives a failure and the retry button still works.

Column filters are the host's job: the grid renders no filter UI, it only
carries `filter[status]=…` inside the query. Build that with `withFilter` from
`@tablex/core` rather than spreading the object by hand — the reducers are what
guarantee a filter change resets to page 1 and that the sort cycle stays
`asc → desc → cleared` on every platform.

## Swapping the mock for a real API

`StudentsService.page` is the only method that changes:

```ts
import { HttpClient } from "@angular/common/http";
import { buildQueryUrl, type PagedResponse, type QueryState } from "@tablex/angular";

private readonly http = inject(HttpClient);

page(query: QueryState) {
  return this.http.get<PagedResponse<Student>>(buildQueryUrl("/api/students", query));
}
```

(and add `provideHttpClient()` to the providers in `src/main.ts`).

`buildQueryUrl` writes
`?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active` — exactly what
`TableX.AspNetCore` binds and what `examples/nextjs`'s route handler parses.

Once you have a real endpoint, add `fetchEndpoint="/api/students"` to the grid
and the export menu will page in the whole filtered dataset instead of only the
visible page.
