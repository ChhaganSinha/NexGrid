# `@nexgrid/angular` API reference

> The canonical input/output tables, with prose for every member, live in the
> package README:
> **[`packages/angular/README.md`](../../packages/angular/README.md)**. This
> page is the import surface, the type signatures, and the Angular-specific
> details that catch people out.

```bash
npm install @nexgrid/angular
```

```ts
import { TableXCellDirective, TableXComponent, TableXToolbarDirective } from "@nexgrid/angular";
```

- [Exports](#exports)
- [`TableXComponent`](#tablexcomponent)
- [Directives](#directives)
- [Types](#types)
- [View-model types](#view-model-types)
- [Re-exported from `@nexgrid/core`](#re-exported-from-tablexcore)
- [Gotchas](#gotchas)
- [Packaging](#packaging)

## Exports

| Export | Kind | Notes |
| --- | --- | --- |
| `TableXComponent` | standalone component | Selector `table-x`. |
| `TableXCellDirective` | standalone directive | `[tableXCell]` — custom cell templates. |
| `TableXToolbarDirective` | standalone directive | `[tableXToolbar]` — toolbar actions template. |
| `TableXAngularColumn<TData>` | type | `TableXColumn<TData, string>`. |
| `TableXCellTemplateContext<TData>` | type | The `*tableXCell` template context. |
| `TableXNotice` | type | `{ type: "info" \| "success" \| "error"; message: string }`. |
| `TableXSelectionChange` | type | `{ ids: string[]; allAcrossSelected: boolean }`. |
| `TableXTheme` | type | `"light" \| "dark" \| "auto"`. |
| view-model types | types | See [View-model types](#view-model-types). |

Import the three symbols individually into a component's `imports` array. They
are deliberately **not** bundled into a convenience `const` array: such an array
crosses the library boundary as a bare `.d.ts` declaration with no initializer,
and the Angular compiler cannot see through it (`NG1010: 'imports' must be an
array of components, directives, pipes, or NgModules`).

```ts
@Component({
  standalone: true,
  imports: [TableXComponent, TableXCellDirective, TableXToolbarDirective],
  // …
})
export class StudentsComponent {}
```

## `TableXComponent`

Standalone, `ChangeDetectionStrategy.OnPush`, selector `table-x`. The **host
element itself** carries `.tbx-root`, so a `class` on `<table-x>` lands on the
grid root — there is no `className` input.

Full descriptions and defaults:
[README › Inputs](../../packages/angular/README.md#inputs) ·
[README › Outputs](../../packages/angular/README.md#outputs).

### Inputs

```ts
@Input({ required: true }) columns: TableXAngularColumn<TData>[] = [];
@Input({ required: true }) data: TData[] = [];
@Input({ required: true }) total = 0;
@Input({ required: true }) query: QueryState = defaultQuery();
@Input({ required: true }) caption = "";

@Input() density: Density = "default";
@Input({ transform: booleanAttribute }) isLoading = false;
@Input({ transform: booleanAttribute }) error = false;
@Input({ transform: booleanAttribute }) enableSelection = false;
@Input({ transform: booleanAttribute }) enableSearch = true;
@Input() searchPlaceholder?: string;
@Input({ transform: booleanAttribute }) showSerialNumber = true;
@Input({ transform: booleanAttribute }) enableExport = true;
@Input() exportFileName?: string;
@Input() fetchEndpoint?: string;
@Input() badgeRules?: readonly ExcelBadgeRule[];
@Input() locale?: Partial<TableXLocale>;
@Input() getRowId: (row: TData) => string = defaultRowId;
@Input() theme: TableXTheme = "light";
@Input({ transform: booleanAttribute }) rowClickable = false;
```

Flag inputs use `booleanAttribute`, so `enableSelection` and
`[enableSelection]="true"` are equivalent.

### Outputs

```ts
@Output() readonly queryChange = new EventEmitter<QueryState>();
@Output() readonly selectionChange = new EventEmitter<TableXSelectionChange>();
@Output() readonly rowClick = new EventEmitter<TData>();
@Output() readonly retry = new EventEmitter<void>();
@Output() readonly notify = new EventEmitter<TableXNotice>();
@Output() readonly exportAll = new EventEmitter<void>();
```

Three outputs change behaviour **by being observed** — Angular's idiomatic
replacement for React's optional callbacks:

| Output | Observing it… |
| --- | --- |
| `rowClick` | turns on the row-click affordance (pointer cursor, keyboard activation). `rowClickable` forces it on without a listener. |
| `retry` | renders the retry button on the error card. |
| `exportAll` | **replaces the built-in export entirely** — no fetch-all, no file writing, no notifications. |

There is no `onExportAll` input and no `endpoint` input: `fetchEndpoint` is used
only by the export's fetch-all pass, and the grid never fetches its own page
data. That is the host's job, through `queryChange`.

## Directives

### `TableXCellDirective` — `[tableXCell]`

```ts
@Input({ required: true }) tableXCell = "";        // the column id
@Input() tableXCellOf?: readonly TData[];          // TYPE ANCHOR ONLY
readonly template: TemplateRef<TableXCellTemplateContext<TData>>;
```

Declared as a **content child** of `<table-x>` and looked up by column id. The
template renders that column in both the table and the mobile card list.

```html
<ng-container *tableXCell="'status'; of: rows(); let row; let value = value; let i = rowIndex">
  <span class="pill">{{ value }}</span>
</ng-container>
```

The plain-attribute form on an `<ng-template>` is equivalent:

```html
<ng-template tableXCell="status" [tableXCellOf]="rows()" let-row let-value="value">
  <span class="pill">{{ value }}</span>
</ng-template>
```

> **Do not combine the two.** `<ng-template *tableXCell="…">` asks Angular for
> a template that *contains* a template; the grid renders the outer one and the
> cell comes out empty.

`tableXCellOf` is never read at runtime — it exists so the compiler can infer
`TData`. Bind the same array you pass to `[data]` and the context becomes fully
typed under `strictTemplates`. Without it, the row is `any`.

### `TableXToolbarDirective` — `[tableXToolbar]`

A template rendered at the end of the toolbar, after the export menu. Plain
content projection works too.

```html
<table-x caption="Students" [columns]="columns" [data]="rows()" [total]="total()"
          [query]="query()" (queryChange)="load($event)">
  <ng-template tableXToolbar>
    <button type="button" class="tbx-btn" (click)="create()">Add student</button>
  </ng-template>
</table-x>
```

Reuse `.tbx-btn` and the button inherits the theme tokens exactly.

## Types

```ts
export type TableXAngularColumn<TData> = TableXColumn<TData, string>;

export interface TableXCellTemplateContext<TData = any> {
  $implicit: TData;                          // let-row
  value: unknown;                            // let-value="value"
  column: TableXAngularColumn<TData>;       // let-col="column"
  rowIndex: number;                          // let-i="rowIndex" — index WITHIN THE PAGE
}

export interface TableXNotice {
  type: "info" | "success" | "error";
  message: string;
}

export interface TableXSelectionChange {
  ids: string[];                 // across pages, in selection order
  allAcrossSelected: boolean;    // reserved; always false today
}

export type TableXTheme = "light" | "dark" | "auto";
```

`TRender` is `string` because Angular cannot render an arbitrary value returned
from a function into the DOM. A `header` or `cell` function may return **text**;
anything richer is a `*tableXCell` template.

## View-model types

The component exposes the shapes its own template iterates over. They are
public so a consumer can type a helper or a test against them, not because you
need them for normal use:

```ts
import type {
  TableXCellView,
  TableXColumnToggle,
  TableXDensityOption,
  TableXHeaderView,
  TableXPagerItem,
  TableXRangePart,
  TableXRowView,
} from "@nexgrid/angular";
```

| Type | Models |
| --- | --- |
| `TableXHeaderView` | One header cell: `key`, `id`, `title`, `sortable`, `sortState`, `ariaSort`, `align`. |
| `TableXRowView<TData>` | One row: `key`, `id`, `data`, `serial`, `selected`, `selectLabel`, `cells`. |
| `TableXCellView<TData>` | One cell: `key`, `header`, `align`, `template`, `context`, `text`. |
| `TableXColumnToggle` | One Columns-menu entry: `key`, `id`, `title`, `visible`. |
| `TableXDensityOption` | One Density-menu entry: `value`, `label`, `selected`. |
| `TableXPagerItem` | One pager control: `key`, `gap`, `page`, `current`, `label`. |
| `TableXRangePart` | One fragment of the "Showing X to Y of Z" line: `key`, `strong`, `total`, `value`. |

## Re-exported from `@nexgrid/core`

A deliberately small set — the symbols a host touches on day one:

```ts
import { PAGE_SIZES, buildQueryUrl, defaultQuery, parseQuery, serializeQuery } from "@nexgrid/angular";

import type {
  Density, ExcelBadgeRule, TableXColumn, TableXColumnMeta, TableXLocale,
  PageSize, PagedResponse, QueryState, SortDir, SortSpec,
} from "@nexgrid/angular";
```

Everything else — the reducers (`withToggledSort`, `withSearch`, `withPage`,
`withPageSize`, `withFilter`), `totalPagesFor`, `primarySort`, the export
helpers, `DEFAULT_LOCALE`, `resolveLocale` — comes from `@nexgrid/core`
directly. It is already installed as a dependency of this package:

```ts
import { withSort, totalPagesFor, DEFAULT_LOCALE } from "@nexgrid/core";
```

## Gotchas

**The stylesheet must be global.** Add
`node_modules/@nexgrid/angular/styles.css` to the `styles` array of your build
target in `angular.json`. Component styles are scoped by emulated view
encapsulation and will not reach the grid's markup, so a `styleUrls` entry
silently does nothing.

**`density` is not "initial only" here.** Unlike React, re-binding the input
overrides the user's Density-menu choice. Bind it once, or bind a signal you set
only on first paint.

**`query` is required and fully controlled.** The grid never mutates it; every
change arrives through `(queryChange)`. Feed it back in, or the grid will not
move.

**`getRowId` must be a stable reference.** Bind a class field or an arrow
property, not an inline arrow in the template — a new function every change
detection cycle defeats memoisation.

```ts
readonly rowId = (row: Student): string => `${row.tenantId}:${row.studentNumber}`;
```

```html
<table-x [getRowId]="rowId" …/>
```

**`OnPush` means new references.** The component is `OnPush`; mutating the
`data` array in place will not re-render. Signals (or a fresh array on every
load) are the idiomatic answer.

## Packaging

| | |
| --- | --- |
| Build | ng-packagr; FESM2022 + `index.d.ts` |
| Stylesheet | `node_modules/@nexgrid/angular/styles.css` (a copy of the core sheet) |
| Runtime dependencies | `@nexgrid/core`, `tslib` |
| Peer dependencies | `@angular/common >= 17`, `@angular/core >= 17`, `rxjs >= 7` |
| Node | `>= 18` |
| License | MIT |

## Related

- [Package README](../../packages/angular/README.md) — the canonical input/output tables
- [`@nexgrid/core` API](core.md) · [Columns](../columns.md) · [Theming](../theming.md) · [Localization](../localization.md)
- [Getting started › Angular](../getting-started.md#angular-17)
