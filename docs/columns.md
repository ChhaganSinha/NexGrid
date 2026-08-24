# Columns

A column is a plain object. The shape is deliberately structurally compatible
with TanStack Table's `ColumnDef`, so column sets written for a TanStack grid
usually work unchanged — see [Migrating from TanStack](migration-from-tanstack.md).

- [The column type](#the-column-type)
- [`meta` options](#meta-options)
- [Structural columns: `select` and `actions`](#structural-columns-select-and-actions)
- [Default cell rendering](#default-cell-rendering)
- [Custom cells per framework](#custom-cells-per-framework)
- [Alignment and width](#alignment-and-width)
- [Column visibility](#column-visibility)
- [Columns and export](#columns-and-export)

## The column type

```ts
// From @nexgrid/core
export interface NexGridCellContext<TData> {
  row: { original: TData };
  getValue: () => unknown;
}

export interface NexGridColumn<TData, TRender = unknown> {
  /** Column id. Falls back to `accessorKey`. */
  id?: string;
  /** The row property this column reads (TanStack-compatible alias for `id`). */
  accessorKey?: string;
  /** Header text, or a render function for custom headers. */
  header?: string | ((ctx: Record<string, never>) => TRender);
  /** Custom cell renderer. Without it the raw row value is rendered as text. */
  cell?: (ctx: NexGridCellContext<TData>) => TRender;
  /** Sorting is ON by default; set `false` to opt out. */
  enableSorting?: boolean;
  /** Layout and behavior hints. */
  meta?: NexGridColumnMeta;
}
```

`TRender` is the adapter's render output. Each adapter exports a pre-bound
alias, and that is what you should annotate with:

| Adapter | Alias | `TRender` |
| --- | --- | --- |
| React | `NexGridReactColumn<TData>` | `React.ReactNode` |
| Angular | `NexGridAngularColumn<TData>` | `string` |
| Vanilla | `NexGridVanillaColumn<TData>` | `string \| Node` |

The **id** is resolved as `id ?? accessorKey ?? ""`, and it is used for three
different things at once: reading the row value, the `sort=<id>:dir` token sent
to the server, and the `filter[<id>]` key. Match the JSON property name your
endpoint returns (`createdAt`, not `CreatedAt`).

A column with neither `id` nor `accessorKey` resolves to `""`: it is never
sortable, never hideable, never exported, and its default cell renders empty.
Give every column an id — use `id` for computed columns that read no single
property.

## `meta` options

```ts
export interface NexGridColumnMeta {
  width?: number;
  minWidth?: number;
  flex?: number;
  align?: "left" | "center" | "right";
  hidden?: boolean;
  hideable?: boolean;
  exportable?: boolean;
  serverFilterable?: boolean;
  serverFilterField?: string;
  filterOptions?: readonly string[];
}
```

| Field | Type | Default | Effect |
| --- | --- | --- | --- |
| `width` | `number` | — | Fixed pixel width on `th` and `td`. |
| `minWidth` | `number` | `120` | Minimum width, used when no `width` is set. |
| `flex` | `number` | — | Proportional width unit; adapters may use it when no `width` is given. |
| `align` | `"left" \| "center" \| "right"` | `"left"` | `text-align` on header and cells, plus `.nxg-th-inner--center` / `--right` on the header's inner wrapper. |
| `hidden` | `boolean` | `false` | Start hidden. Still listed (unchecked) in the Columns menu. |
| `hideable` | `boolean` | `true` | `false` pins the column visible and keeps it out of the Columns menu. |
| `exportable` | `boolean` | `true` | `false` keeps the column out of CSV and Excel exports. |
| `serverFilterable` | `boolean` | `false` | Marks the column as filterable on the server (`filter[<field>]=<value>`). |
| `serverFilterField` | `string` | column id | The key the API expects in `filter[...]` when it differs from the id. |
| `filterOptions` | `readonly string[]` | — | Allowed values for a server-filterable column — a picker rather than free text. |

## Structural columns: `select` and `actions`

Two ids are treated as structural everywhere:

```ts
export const STRUCTURAL_COLUMN_IDS: readonly string[] = ["select", "actions"];
```

A column with either id is never sortable, never listed in the Columns menu,
and never exported — regardless of what its `meta` says. Use `id: "actions"` for
a row-action column and the right thing happens on all four platforms without
extra flags.

Note that `enableSelection` renders the selection checkbox column for you; you
do not declare a `select` column yourself. The id is reserved so a column you
*do* declare with that id inherits the same structural treatment.

## Default cell rendering

With no `cell` function, a value is rendered as plain text through core's
`getCellText`:

| Value | Rendered |
| --- | --- |
| `null` / `undefined` | `""` |
| `true` / `false` | `locale.booleanYes` / `locale.booleanNo` (`"Yes"` / `"No"`) |
| an object or array | `JSON.stringify(value)` |
| anything else | `String(value)` |

Boolean labels come from the [locale](localization.md), so a German grid renders
`Ja` / `Nein` without touching the column set.

## Custom cells per framework

A custom cell is **presentation**. Exports always read the underlying row value,
so a status pill exports as `Active`, not as markup — see
[Columns and export](#columns-and-export).

The same renderer is used by the table and by the mobile card list, so the two
can never drift apart. See [Responsive](features/responsive.md).

### React — return any `ReactNode`

```tsx
import type { NexGridReactColumn } from "@nexgrid/react";

interface Student {
  id: number;
  name: string;
  email: string;
  status: "Active" | "Pending" | "Disabled";
  score: number;
}

export const columns: NexGridReactColumn<Student>[] = [
  // A status pill.
  {
    accessorKey: "status",
    header: "Status",
    meta: { align: "center", width: 130 },
    cell: ({ getValue }) => {
      const status = String(getValue());
      return <span className={`pill pill--${status.toLowerCase()}`}>{status}</span>;
    },
  },

  // Composed from more than one field — reach through `row.original`.
  {
    id: "student",
    header: "Student",
    meta: { minWidth: 220, exportable: false },
    cell: ({ row }) => (
      <div className="stack">
        <strong>{row.original.name}</strong>
        <small>{row.original.email}</small>
      </div>
    ),
  },

  // A row action menu. `actions` is structural: unsortable and never exported.
  {
    id: "actions",
    header: "",
    meta: { align: "right", width: 64 },
    cell: ({ row }) => (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          console.log("edit", row.original.id);
        }}
      >
        Edit
      </button>
    ),
  },
];
```

When `onRowClick` is set, call `event.stopPropagation()` in interactive cell
content so a button click does not also open the row. Selection checkboxes
already do this for you.

### Angular — templates, not functions

Angular cannot render an arbitrary value returned from a function, so
`NexGridAngularColumn<TData>` binds `TRender = string`: a `cell` function may
return **text**. Anything richer is a `*nexGridCell` template declared as a
content child of `<nex-grid>` and keyed by column id.

```ts
import { ChangeDetectionStrategy, Component, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  NexGridCellDirective,
  NexGridComponent,
  defaultQuery,
  type NexGridAngularColumn,
  type QueryState,
} from "@nexgrid/angular";

export interface Student {
  id: number;
  name: string;
  email: string;
  status: "Active" | "Pending" | "Disabled";
}

@Component({
  selector: "app-students",
  standalone: true,
  imports: [NexGridComponent, NexGridCellDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nex-grid
      caption="Students"
      [columns]="columns"
      [data]="rows()"
      [total]="total()"
      [query]="query()"
      (queryChange)="query.set($event)"
    >
      <!-- `let row` is the row itself -->
      <ng-container *nexGridCell="'name'; of: rows(); let row">
        <a [routerLink]="['/students', row.id]">{{ row.name }}</a>
      </ng-container>

      <!-- other context members are named -->
      <ng-container *nexGridCell="'status'; of: rows(); let value = value">
        <span class="pill">{{ value }}</span>
      </ng-container>

      <!-- a column with no accessor, for row actions -->
      <ng-container *nexGridCell="'actions'; of: rows(); let row">
        <button type="button" class="nxg-btn" (click)="edit(row); $event.stopPropagation()">
          Edit
        </button>
      </ng-container>
    </nex-grid>
  `,
})
export class StudentsComponent {
  readonly columns: NexGridAngularColumn<Student>[] = [
    { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "status", header: "Status", meta: { align: "center", width: 130 } },
    { id: "actions", header: "", meta: { align: "right", width: 64 } },
  ];

  readonly rows = signal<Student[]>([]);
  readonly total = signal(0);
  readonly query = signal<QueryState>(defaultQuery());

  edit(student: Student): void {
    console.log("edit", student.id);
  }
}
```

Template context:

| Variable | Structural form | `<ng-template>` form | Type | Meaning |
| --- | --- | --- | --- | --- |
| row | `let row` | `let-row` | `TData` | The row object (`$implicit`). |
| value | `let value = value` | `let-value="value"` | `unknown` | The raw value the column reads for this row. |
| column | `let col = column` | `let-col="column"` | `NexGridAngularColumn<TData>` | The column being rendered. |
| rowIndex | `let i = rowIndex` | `let-i="rowIndex"` | `number` | Index **within the current page**. |

The plain-attribute form on an `<ng-template>` is equivalent:

```html
<ng-template nexGridCell="status" [nexGridCellOf]="rows()" let-row let-value="value">
  <span class="pill">{{ value }}</span>
</ng-template>
```

> **Do not combine the two.** `<ng-template *nexGridCell="…">` asks Angular for a
> template that *contains* a template; the grid renders the outer one and the
> cell comes out empty. Pick one form.

`of: rows()` / `[nexGridCellOf]="rows()"` is a **type anchor only** — bind the
same array you pass to `[data]` and the context becomes fully typed under
`strictTemplates`. The grid never reads it.

### Vanilla — return a string or a `Node`

```js
import { createNexGrid, el } from "@nexgrid/vanilla";
import "@nexgrid/vanilla/styles.css";

const columns = [
  { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
  {
    accessorKey: "status",
    header: "Status",
    meta: { align: "center", width: 130 },
    cell: ({ row, getValue }) => {
      const badge = el("span", { class: "badge", text: String(getValue()) });
      badge.dataset.status = row.original.status;
      return badge;
    },
  },
  {
    id: "actions",
    header: "",
    meta: { align: "right", width: 64 },
    cell: ({ row }) => {
      const button = el("button", {
        class: "nxg-btn",
        attrs: { type: "button" },
        text: "Edit",
      });
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        console.log("edit", row.original.id);
      });
      return button;
    },
  },
];

const grid = createNexGrid(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns,
});
```

Two rules that matter:

- **Return a new node on every call.** The renderer runs once for the table row
  and once for the mobile card; handing back the same node would move it out of
  one and into the other.
- **Never build the node from an HTML string.** `el()`, `svgEl()`, `append()`
  and `replaceChildren()` are exported for exactly this reason — they only ever
  write text through `textContent`. A row value passed as `el("span", { text })`
  cannot be interpreted as markup, which is what keeps a name like
  `<img onerror=…>` a name.

### ASP.NET Core — declare columns in Razor, attach renderers in JS

`<nex-grid-column>` covers everything JSON can express. A cell renderer is a
function, and functions do not survive JSON — so set `init="false"` to get the
container and the configuration block without the init script, then start the
grid yourself:

```cshtml
<nex-grid id="students-grid" caption="Students" endpoint="/api/students" init="false">
    <nex-grid-column field="name" header="Name" min-width="180" />
    <nex-grid-column field="status" header="Status" align="Center" />
</nex-grid>

@section Scripts {
<script>
    (function () {
        var host = document.getElementById("students-grid");
        var config = JSON.parse(document.getElementById("students-grid-config").textContent);

        config.columns.find(function (c) { return c.accessorKey === "status"; }).cell =
            function (ctx) {
                var badge = document.createElement("span");
                badge.className = "badge badge-" + String(ctx.getValue()).toLowerCase();
                badge.textContent = ctx.getValue();   // textContent, never innerHTML
                return badge;
            };

        host.nexgrid = NexGrid.createNexGrid(host, config);
    })();
</script>
}
```

The configuration block's id is always `<container id>-config`. Everything
`@nexgrid/vanilla` accepts is available on that object: `onNotify`,
`onRowClick`, `onSelectionChange`, `locale`, `badgeRules`, `fetchOptions`.

## Alignment and width

Width resolution, identically on every adapter:

1. `meta.width` set → a fixed pixel width on the `th` and `td`.
2. Otherwise → `min-width: (meta.minWidth ?? 120)px` and natural table layout.

`meta.align` sets `text-align` on the header and the cells, and adds
`.nxg-th-inner--center` / `.nxg-th-inner--right` to the header's inner flex
wrapper so the sort icon travels with the label.

```ts
const columns: NexGridReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },        // grows
  { accessorKey: "score", header: "Score", meta: { align: "right", width: 90 } },  // fixed
  { accessorKey: "status", header: "Status", meta: { align: "center", width: 130 } },
];
```

Numeric columns read better right-aligned; short enum-like values read better
centered with a fixed width, so the column does not jump between pages.

Card layout ignores widths and alignment entirely — a card is a label/value list
— which is why a column that only makes sense as a wide table cell should carry
a real `header` string for its card label.

## Column visibility

The Columns menu lists every column for which core's `isHideable` returns true:

```ts
export function isHideable<TData, TRender>(col: NexGridColumn<TData, TRender>): boolean {
  if (isStructuralColumn(col) || getColumnId(col) === "") return false;
  return col.meta?.hideable !== false;
}
```

- `meta.hidden: true` — starts hidden, still listed and re-showable.
- `meta.hideable: false` — pinned visible, not listed at all.

Visibility is **local UI state**, owned by the grid. It is not part of
`QueryState` and never reaches the server: the endpoint returns the same row
shape either way. It does affect exports, which write only visible columns.

## Columns and export

`toExportColumns` decides what a CSV or Excel file contains:

```ts
export function isExportable<TData, TRender>(col: NexGridColumn<TData, TRender>): boolean {
  if (isStructuralColumn(col) || getColumnId(col) === "") return false;
  return col.meta?.exportable !== false;
}
```

An export column's header is `getColumnTitle(col)` — the `header` string when
there is one, otherwise the id, title-cased. A function header has no string
form, so give such a column a real id.

Values come from the row, not the renderer:

```ts
value: (row) => getCellText(getCellValue(col, row), { yes, no })
```

That means a composed column like `id: "student"` in the React example above
exports the value of `row.student` — which does not exist, so an empty cell. Set
`meta.exportable: false` on presentational columns, and let the underlying
`name` / `email` columns carry the data.

More: [Export](features/export.md).

## Related

- [Sorting](features/sorting.md) — `enableSorting` and the server allowlist
- [Responsive](features/responsive.md) — how columns become card rows
- [Theming](theming.md) — styling cells with tokens
- [`@nexgrid/core` API](api/core.md) — every column helper
