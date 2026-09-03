# Selection

Optional row checkboxes, a select-all for the current page, and a running set of
ids that survives paging.

- [Turning it on](#turning-it-on)
- [Row identity](#row-identity)
- [What the header checkbox does](#what-the-header-checkbox-does)
- [The callback](#the-callback)
- [`allAcrossSelected`](#allacrossselected)
- [A bulk-action toolbar](#a-bulk-action-toolbar)
- [Selection and row click](#selection-and-row-click)
- [Reading selection from outside (vanilla)](#reading-selection-from-outside-vanilla)
- [Styling and accessibility](#styling-and-accessibility)

## Turning it on

```tsx
// React
<TableX
  enableSelection
  onSelectionChange={(ids, allAcrossSelected) => console.log(ids, allAcrossSelected)}
  {...props}
/>
```

```html
<!-- Angular -->
<table-x enableSelection (selectionChange)="selected.set($event.ids)" …/>
```

```js
// Vanilla
createTableX(container, {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  enableSelection: true,
  onSelectionChange: (ids, allAcrossSelected) => console.log(ids, allAcrossSelected),
});
```

```cshtml
<!-- ASP.NET Core -->
<table-x caption="Students" endpoint="/api/students" enable-selection="true">…</table-x>
```

Selection is **off** by default. Turning it on adds a checkbox column to the
table, a checkbox to each mobile card, and an "N selected" badge to the footer.

## Row identity

Selection is a set of string ids, so every row needs a stable one. The default:

```ts
/** Fallback row identity: the `id` property, else the row's own string form. */
function defaultRowId<TData>(row: TData): string {
  const record = row as Record<string, unknown> | null | undefined;
  const id = record === null || record === undefined ? undefined : record["id"];
  return String(id ?? row);
}
```

Rows with an `id` property just work. Anything else needs `getRowId`:

```tsx
<TableX
  enableSelection
  getRowId={(row) => `${row.tenantId}:${row.studentNumber}`}
  {...props}
/>
```

```ts
// Angular
readonly rowId = (row: Student): string => `${row.tenantId}:${row.studentNumber}`;
```

```html
<table-x enableSelection [getRowId]="rowId" …/>
```

```js
// Vanilla
createTableX(container, {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  enableSelection: true,
  getRowId: (row) => `${row.tenantId}:${row.studentNumber}`,
});
```

Two things depend on it: the selection set, and the framework's list-diffing key
(React keys, Angular `@for` tracking). Rows that share an id are one identity to
the grid — selecting one selects them all.

The id is a string on purpose. It is what you will send back to your API, and it
survives `JSON.stringify` without the numeric-precision trap a large `bigint`
primary key would hit.

## What the header checkbox does

It operates on the **current page only**, adding to or removing from the running
set:

- Not every visible row is selected → selects every row on this page, keeping
  everything already selected on other pages.
- Every visible row is already selected → deselects exactly this page's rows,
  leaving other pages' selections alone.
- Some but not all → reports the mixed (indeterminate) state.

That is the honest behavior for a server-driven grid: the grid does not have the
other 1,259 rows, so it cannot select them. If you need "select all 1,284
matching rows", express it as a server-side operation over the current
`QueryState` — see [`allAcrossSelected`](#allacrossselected).

Selection is not cleared when you change page, sort, or search. It is grid-local
state; clearing it is a decision only your app can make, e.g. after a bulk
action succeeds.

## The callback

| Adapter | Shape |
| --- | --- |
| React | `onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void` |
| Angular | `(selectionChange)` → `{ ids: string[]; allAcrossSelected: boolean }` |
| Vanilla | `onSelectionChange?: (selectedIds: string[], allAcrossSelected: boolean) => void` |

It fires after every change: a row checkbox, the header checkbox, or a clear.
`selectedIds` is the full running set across pages, in selection order.

## `allAcrossSelected`

Always `false` today. The argument is reserved for a future "select every row
matching the current query" affordance, and it exists now so adding it later is
not a breaking signature change.

Treat it as documentation of intent: when it is eventually `true`, `ids` will
not be the complete list and the operation must be expressed as a query, not as
an id array. Code defensively if you like:

```ts
function bulkDelete(ids: string[], allAcrossSelected: boolean, query: QueryState) {
  if (allAcrossSelected) {
    // Not reachable today — but this is the shape the server call would take.
    return fetch(`/api/students/bulk-delete?${serializeQuery(query)}`, { method: "POST" });
  }
  return fetch("/api/students/bulk-delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}
```

## A bulk-action toolbar

`toolbarActions` renders at the end of the toolbar, after the export menu.

```tsx
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

interface Student {
  id: number;
  name: string;
  email: string;
  status: string;
}

const columns: TableXReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "status", header: "Status", meta: { align: "center" } },
];

export function StudentsGrid() {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Student> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async (next: QueryState) => {
    setIsLoading(true);
    try {
      const response = await fetch(buildQueryUrl("/api/students", next));
      setPage((await response.json()) as PagedResponse<Student>);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  const archive = async () => {
    await fetch("/api/students/archive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: selected }),
    });
    setSelected([]);
    await load(query);   // re-fetch: the server changed underneath us
  };

  return (
    <TableX
      caption="Students"
      columns={columns}
      data={page?.items ?? []}
      total={page?.total ?? 0}
      query={query}
      onQueryChange={setQuery}
      isLoading={isLoading}
      enableSelection
      onSelectionChange={(ids) => setSelected(ids)}
      toolbarActions={
        <button
          type="button"
          className="tbx-btn"
          disabled={selected.length === 0}
          onClick={() => void archive()}
        >
          Archive {selected.length || ""}
        </button>
      }
    />
  );
}
```

The Angular equivalent is a `tableXToolbar` template:

```html
<table-x caption="Students" enableSelection [columns]="columns" [data]="rows()"
          [total]="total()" [query]="query()" (queryChange)="load($event)"
          (selectionChange)="selected.set($event.ids)">
  <ng-template tableXToolbar>
    <button type="button" class="tbx-btn"
            [disabled]="selected().length === 0"
            (click)="archive()">
      Archive {{ selected().length || '' }}
    </button>
  </ng-template>
</table-x>
```

In vanilla, `toolbarActions` takes a `Node` or a string:

```js
import { createTableX, el } from "@nexgrid/vanilla";

const archiveButton = el("button", {
  class: "tbx-btn",
  attrs: { type: "button", disabled: true },
  text: "Archive",
});

const grid = createTableX(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  enableSelection: true,
  toolbarActions: archiveButton,
  onSelectionChange: (ids) => {
    archiveButton.disabled = ids.length === 0;
    archiveButton.textContent = ids.length ? `Archive ${ids.length}` : "Archive";
  },
});

archiveButton.addEventListener("click", () => {
  console.log("archive", grid.getSelection());
});
```

Reusing `.tbx-btn` makes the action look native to the toolbar and inherit the
theme tokens.

## Selection and row click

Checkbox clicks never trigger `onRowClick` — the grid stops the event for you.
Any *other* interactive content you put in a cell does need
`event.stopPropagation()`, or a button click will also open the row. See
[Columns](../columns.md#custom-cells-per-framework).

## Reading selection from outside (vanilla)

The handle exposes the current set at any time:

```js
const ids = grid.getSelection();   // string[]
```

The ASP.NET Core Tag Helper leaves the same handle on the container element:

```js
const ids = document.getElementById("students-grid").tablex.getSelection();
```

## Styling and accessibility

- Selected rows get `.tbx-row--selected`, selected cards `.tbx-card--selected`;
  both tint with `--tbx-primary`. See [Theming](../theming.md).
- The footer badge is `.tbx-selected-badge`, text from `locale.selectedBadge`
  (`"{count} selected"`).
- The header checkbox is labelled `locale.selectAllLabel`; each row checkbox is
  labelled `locale.selectRowLabel` (`"Select row {id}"`).
- The header checkbox reports the mixed state when only part of the page is
  selected.

## Related

- [Pagination](pagination.md) — selection persists across pages
- [Columns](../columns.md) — the reserved `select` id
- [Localization](../localization.md) — `selectAllLabel`, `selectRowLabel`, `selectedBadge`
