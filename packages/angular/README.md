# @nexgrid/angular

A professional, **server-driven** data grid for Angular 17+ — standalone, zero
runtime dependencies beyond [`@nexgrid/core`](../core), and no NgModule.

The grid never holds your dataset. It holds one page, turns every user action
into a `QueryState`, and hands that back to you; you fetch and feed the next
page in. Search, sorting, paging and filtering happen where the data lives.

- Global search, debounced 350 ms
- Column visibility and density menus
- Server sorting with the `asc → desc → cleared` cycle
- Row selection across pages
- Automatic `S.No.` column
- Formatted Excel (`.xls`) and raw CSV export, optionally over the **whole**
  filtered dataset
- Full pagination footer with page jump
- Responsive: a table at ≥ 768 px, a card list below — same cells, same
  selection, same row clicks
- Light / dark / auto theming through CSS custom properties
- Every user-facing string localizable

<p align="center">
  <img src="https://raw.githubusercontent.com/ChhaganSinha/NexGrid/master/docs/assets/tablex-preview.png" alt="TableX Angular Data Grid Preview" width="100%" />
</p>

---

## Install

```bash
npm install @nexgrid/angular
```

`@angular/core`, `@angular/common` (>= 17) and `rxjs` (>= 7) are peer
dependencies — every Angular app already has them.

## Register the stylesheet

The grid ships one global stylesheet. Add it to the `styles` array of your
build target in `angular.json`:

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

Prefer to import it from CSS instead? The identical sheet is published by the
engine package with a proper export map:

```css
@import "@nexgrid/core/styles.css";
```

Either way it must be **global**. Component styles are scoped by Angular's
emulated encapsulation and will not reach the grid's markup.

---

## Quick start

### 1. A service that fetches one page

`buildQueryUrl` serializes a `QueryState` into the exact wire format the rest
of TableX speaks (`?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active`),
which is also what `TableX.AspNetCore` binds on the server.

```ts
import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { buildQueryUrl, type PagedResponse, type QueryState } from "@nexgrid/angular";

export interface Student {
  id: number;
  name: string;
  email: string;
  status: "Active" | "Pending" | "Disabled";
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

Your endpoint must answer with `{ items, page, pageSize, total, totalPages }`,
where `total` is the **full filtered count** — that is what drives the pager.

### 2. A standalone component that renders it

```ts
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
      <ng-container *nexGridCell="'status'; of: rows(); let value = value">
        <span class="pill" [class.pill--ok]="value === 'Active'">{{ value }}</span>
      </ng-container>

      <ng-template nexGridToolbar>
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
    { accessorKey: "status", header: "Status", meta: { align: "center", width: 120 } },
    { accessorKey: "joinedAt", header: "Joined", enableSorting: true },
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
    /* navigate to the detail page */
  }

  create(): void {
    /* open the create dialog */
  }

  toast(notice: TableXNotice): void {
    /* hand to your snackbar — the grid never renders one itself */
  }
}
```

That is the whole integration. Every sort click, page change, page-size change
and (debounced) keystroke arrives as one `queryChange` with a ready-to-send
`QueryState`.

---

## Inputs

| Input | Type | Default | Description |
|---|---|---|---|
| `columns` **(required)** | `TableXAngularColumn<TData>[]` | — | Column definitions. See [Columns](#columns). |
| `data` **(required)** | `TData[]` | `[]` | The **current page** of rows only. |
| `total` **(required)** | `number` | `0` | Full filtered row count from the server. Drives the pager. |
| `query` **(required)** | `QueryState` | `defaultQuery()` | The active query. The grid is fully controlled — it never mutates this. |
| `caption` **(required)** | `string` | `''` | Accessible name for the table; also seeds the export file name. |
| `density` | `'compact' \| 'default' \| 'comfortable'` | `'default'` | Initial row height. Changing it later overrides the user's menu choice. |
| `isLoading` | `boolean` | `false` | Replaces the rows with a spinner. The toolbar and footer stay. |
| `error` | `boolean` | `false` | Replaces the **whole** grid with an error card. |
| `enableSelection` | `boolean` | `false` | Adds the checkbox column, the card checkbox and the "N selected" badge. |
| `enableSearch` | `boolean` | `true` | Show the global search box. |
| `searchPlaceholder` | `string` | locale | Overrides `locale.searchPlaceholder`. |
| `showSerialNumber` | `boolean` | `true` | Show the automatic `S.No.` column. |
| `enableExport` | `boolean` | `true` | Show the export menu. |
| `exportFileName` | `string` | slug of `caption` | Export file name, without extension. |
| `fetchEndpoint` | `string` | — | List endpoint used to collect the whole filtered dataset for an export. Without it, exports contain the current page. |
| `badgeRules` | `readonly ExcelBadgeRule[]` | `DEFAULT_BADGE_RULES` | Value-based cell styling for the Excel export. |
| `locale` | `Partial<TableXLocale>` | — | Overrides merged over the default strings. |
| `getRowId` | `(row: TData) => string` | `r => String(r.id ?? r)` | Row identity. Drives selection and DOM reuse. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | `dark` / `auto` add `.tbx-dark` / `.tbx-auto` to the root. |
| `rowClickable` | `boolean` | `false` | Forces the row-click affordance on. Not normally needed — see `rowClick`. |

Flag inputs coerce like HTML boolean attributes, so `enableSelection` and
`[enableSelection]="true"` are equivalent.

## Outputs

| Output | Payload | Description |
|---|---|---|
| `queryChange` | `QueryState` | A new query. Fetch it and feed `data` / `total` back in. **Every** interaction goes through here. |
| `selectionChange` | `{ ids: string[]; allAcrossSelected: boolean }` | The selected set changed. `allAcrossSelected` is reserved and always `false` today. |
| `rowClick` | `TData` | A row (or card) was clicked. Checkbox clicks never reach here. **Listening to this turns on the pointer cursor**, so `rowClickable` is rarely needed. |
| `retry` | `void` | The retry button was pressed. **The button only renders when something is listening.** |
| `notify` | `{ type: 'info' \| 'success' \| 'error'; message: string }` | A user-facing notice — export progress, failures, results. The grid never renders a toast itself. |
| `exportAll` | `void` | **When something is listening, it replaces the built-in export entirely.** Use it to export server-side. |

---

## Columns

Column definitions are structurally compatible with TanStack Table's
`ColumnDef`, so an existing column set usually drops straight in.

```ts
const columns: TableXAngularColumn<Student>[] = [
  {
    accessorKey: "name",         // or `id`
    header: "Name",              // string, or (ctx) => string
    enableSorting: true,         // default true
    meta: {
      width: 200,                // fixed px; otherwise minWidth (default 120) is used
      minWidth: 160,
      align: "left",             // 'left' | 'center' | 'right'
      hidden: false,             // start hidden, still listed in the Columns menu
      hideable: true,            // allow toggling in the Columns menu
      exportable: true,          // include in CSV / Excel
    },
  },
];
```

Without a `cell` function or a template, a value renders as text: `null` and
`undefined` become empty, booleans become the locale's yes/no labels, objects
become JSON.

A `cell` function may return a **string** (Angular cannot render an arbitrary
value returned from a function). Anything richer is a template.

## Custom cell templates

Declare a `nexGridCell` template as a content child of `<table-x>`, keyed by
column id. It is used for that column in **both** the table and the mobile card
list, so the two can never drift apart.

Use it as a structural directive — on `<ng-container>` when you want no wrapper
element:

```html
<table-x caption="Students" [columns]="columns" [data]="rows()" …>
  <!-- `let row` is the row itself -->
  <ng-container *nexGridCell="'name'; let row">
    <a [routerLink]="['/students', row.id]">{{ row.name }}</a>
  </ng-container>

  <!-- other context members are named -->
  <ng-container *nexGridCell="'status'; let row; let value = value; let i = rowIndex">
    <span class="pill">{{ value }}</span>
  </ng-container>

  <!-- a column with no accessor, for row actions -->
  <ng-container *nexGridCell="'actions'; let row">
    <button type="button" class="tbx-btn" (click)="edit(row); $event.stopPropagation()">
      Edit
    </button>
  </ng-container>
</table-x>
```

The plain-attribute form on an `<ng-template>` is equivalent:

```html
<ng-template nexGridCell="status" let-row let-value="value" let-i="rowIndex">
  <span class="pill">{{ value }}</span>
</ng-template>
```

> **Do not combine the two.** `<ng-template *nexGridCell="…">` asks Angular for
> a template that *contains* a template; the grid renders the outer one and the
> cell comes out empty. Pick one form.

Template context:

| Variable | Structural form | `<ng-template>` form | Type | Meaning |
|---|---|---|---|---|
| row | `let row` | `let-row` | `TData` | The row object (`$implicit`). |
| value | `let value = value` | `let-value="value"` | `unknown` | The raw value the column reads for this row. |
| column | `let col = column` | `let-col="column"` | `TableXAngularColumn<TData>` | The column being rendered. |
| rowIndex | `let i = rowIndex` | `let-i="rowIndex"` | `number` | Index **within the current page**. |

### Strongly typed rows

A cell template is keyed by a string, so there is nothing for the compiler to
infer the row type from — the context defaults to `any`. Add the type anchor
and it becomes fully typed under `strictTemplates`:

```html
<ng-container *nexGridCell="'status'; of: rows(); let row">
  {{ row.status }}   <!-- typed as Student -->
</ng-container>

<ng-template nexGridCell="status" [nexGridCellOf]="rows()" let-row>
  {{ row.status }}
</ng-template>
```

Bind the same array you pass to `[data]`. It is a type anchor only — the grid
never reads it.

## Toolbar actions

Either a template — rendered at the end of the toolbar, after the export menu —
or plain content projection:

```html
<table-x …>
  <ng-template nexGridToolbar>
    <button type="button" class="tbx-btn" (click)="create()">Add student</button>
  </ng-template>
</table-x>
```

---

## Export

The export menu offers **Formatted Excel (.xls)** — a styled workbook with
colored status badges — and **Raw CSV (.csv)**, which is RFC 4180 quoted and
guards against spreadsheet formula injection.

The flow, identical in every TableX adapter:

1. If anything is listening to `exportAll`, it is emitted and the grid stops —
   the host owns the export.
2. Rows are collected: the current page when it already holds every row or when
   there is no `fetchEndpoint`; otherwise every page is walked with the current
   search, sort and filters preserved (capped at 2 000 rows). A failure falls
   back to the current page and reports it through `notify`.
3. Only **visible** and **exportable** columns are written. Custom templates are
   presentation, so exports use the underlying row values.
4. `notify` reports progress and the final row count.

```html
<!-- built-in export over the whole filtered dataset -->
<table-x fetchEndpoint="/api/students" exportFileName="students" …/>

<!-- or take it over entirely -->
<table-x (exportAll)="exportOnTheServer()" …/>
```

Custom Excel badge colors:

```ts
readonly badgeRules: ExcelBadgeRule[] = [
  { values: ["Active"], background: "#dcfce7", color: "#15803d" },
  { values: ["Disabled"], background: "#fee2e2", color: "#b91c1c" },
];
```

---

## Localization

Every string is overridable; anything you leave out falls back to English.

```html
<table-x
  [locale]="{
    searchPlaceholder: 'Suchen…',
    columnsButton: 'Spalten',
    emptyText: 'Keine Datensätze gefunden.',
    showingRange: 'Zeige {start} bis {end} von {total} Einträgen'
  }"
  …
/>
```

Placeholders in braces are substituted by the grid. See `TableXLocale` in
`@nexgrid/core` for the full list.

---

## Theming

The stylesheet is built entirely on CSS custom properties, so a host app
re-skins the grid by overriding tokens — never by fighting class selectors.

```css
.tbx-root {
  --tbx-primary: #7c3aed;
  --tbx-radius: 8px;
  --tbx-border: #e4e4e7;
  --tbx-font: "Inter", system-ui, sans-serif;
}
```

| Token | Purpose |
|---|---|
| `--tbx-font`, `--tbx-font-mono` | Type families |
| `--tbx-bg`, `--tbx-card`, `--tbx-card-2` | Surfaces |
| `--tbx-border` | All borders and dividers |
| `--tbx-fg`, `--tbx-muted`, `--tbx-muted-fg` | Text and muted fills |
| `--tbx-primary`, `--tbx-primary-fg` | Accent (sort icons, current page, selection) |
| `--tbx-danger` | Destructive accents |
| `--tbx-radius`, `--tbx-radius-sm`, `--tbx-shadow`, `--tbx-focus-ring` | Shape and depth |

Dark mode is a token swap: `[theme]="'dark'"` pins it, `[theme]="'auto'"`
follows `prefers-color-scheme`. You can also put `.tbx-dark` on any ancestor —
useful when your app already has a theme switch.

The **host element itself** carries `.tbx-root`, so a `class` on `<table-x>`
lands on the grid root:

```html
<table-x class="my-grid" caption="Students" …/>
```

---

## Accessibility

- `aria-label` on the table, from `caption`.
- `aria-sort` on every sortable header; the header is keyboard operable
  (`Tab` to it, `Enter` / `Space` to cycle the sort).
- Dropdowns are `role="menu"` with `role="menuitemcheckbox"` + `aria-checked`
  items, `aria-haspopup` / `aria-expanded` triggers, and they close on outside
  click and on `Escape`.
- Every icon-only control has an accessible name from the locale, plus
  visually hidden text.
- `aria-current="page"` on the current pager button; the page-jump input is
  labelled.

---

## Server side

The query format is stable and documented, and
[`TableX.AspNetCore`](../../README.md) binds it with no glue code:

```
?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active
```

Use `parseQuery` / `serializeQuery` from `@nexgrid/core` (re-exported here) to
round-trip it through the URL and make grid state shareable.

## Author & Maintainer

**Chhagan Sinha**  
- 📧 Contact: [sinhachhagan@outlook.com](mailto:sinhachhagan@outlook.com)  
- 🐙 GitHub: [@ChhaganSinha](https://github.com/ChhaganSinha)

---

## License

[MIT](https://github.com/ChhaganSinha/TableX/blob/main/LICENSE) © 2026 Chhagan Sinha

