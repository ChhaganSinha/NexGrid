# 🗂️ Column Header Grouping (Multi-Level / Stacked Headers)

NexGrid supports **Column Header Grouping** (also known as multi-level or stacked headers). This feature allows you to organize related columns beneath shared parent headers (e.g., grouping `firstName` and `lastName` under `"User Details"`, or `email` and `phone` under `"Contact Info"`).

---

## 🌟 Overview & Key Capabilities

- **Arbitrary Nesting**: Define groups by attaching a nested `columns` array to any parent column definition.
- **Automatic `colSpan` & `rowSpan`**: The grid engine (`@nexgrid/core`) automatically calculates exact column and row spans. Standalone columns span 2 rows vertically, while parent groups span across all currently visible sub-columns.
- **Dynamic Hiding**: When a child column inside a group is hidden via the Columns menu, the parent group's `colSpan` dynamically shrinks. If all children in a group are hidden, the parent header cleanly disappears from the DOM.
- **Full Feature Parity**: Child columns retain all standard column features including sorting, multi-column sorting, column-level 3-dot filters, drag-to-resize, and double-click auto-fit.
- **Framework Agnostic**: Identical behavior and styling in React (`@nexgrid/react`), Angular (`@nexgrid/angular`), Vanilla JavaScript (`@nexgrid/vanilla`), and ASP.NET Core.

---

## 📐 Defining Column Groups

To create stacked headers, simply provide a `header` string and a `columns` array containing sub-column definitions.

### Column Definition Contract

```typescript
export interface TableXColumn<TData = any, TRender = any> {
  accessorKey?: string;
  header: string | ((col: TableXColumn<TData, TRender>) => TRender);
  
  /**
   * Child columns for multi-level / stacked header grouping.
   * When specified, this column acts as a parent group header.
   */
  columns?: TableXColumn<TData, TRender>[];

  // Sorting, filtering, resizing, pinning, etc. apply to leaf columns
  sortable?: boolean;
  filterable?: boolean;
  meta?: TableXColumnMeta<TData>;
}
```

---

## 💻 Code Examples

### 1. React (`@nexgrid/react`)

```tsx
import React, { useState } from "react";
import { TableX, TableXColumn, defaultQuery, QueryState } from "@nexgrid/react";
import "@nexgrid/react/styles.css";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
}

const columns: TableXColumn<User>[] = [
  {
    header: "Personal Details",
    columns: [
      { accessorKey: "firstName", header: "First Name", sortable: true },
      { accessorKey: "lastName", header: "Last Name", sortable: true },
    ],
  },
  {
    header: "Contact Information",
    columns: [
      { accessorKey: "email", header: "Email Address", sortable: true },
      { accessorKey: "phone", header: "Phone Number" },
    ],
  },
  {
    accessorKey: "status",
    header: "Account Status",
    sortable: true,
  },
];

export function UserGrid({ users }: { users: User[] }) {
  const [query, setQuery] = useState<QueryState>(defaultQuery());

  return (
    <TableX
      caption="Users Directory"
      columns={columns}
      data={users}
      total={users.length}
      query={query}
      onQueryChange={setQuery}
      enableColumnResize={true}
      clientSidePagination={true}
    />
  );
}
```

---

### 2. Angular (`@nexgrid/angular`)

```typescript
import { Component } from "@angular/core";
import { TableXComponent, TableXAngularColumn, defaultQuery } from "@nexgrid/angular";

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
}

@Component({
  selector: "app-user-grid",
  standalone: true,
  imports: [TableXComponent],
  template: `
    <table-x
      caption="Users Directory"
      [columns]="columns"
      [data]="users"
      [total]="users.length"
      [query]="query"
      (queryChange)="query = $event"
      [enableColumnResize]="true"
      [clientSidePagination]="true"
    />
  `,
})
export class UserGridComponent {
  users: User[] = [ /* ... */ ];
  query = defaultQuery();

  columns: TableXAngularColumn<User>[] = [
    {
      header: "Personal Details",
      columns: [
        { accessorKey: "firstName", header: "First Name", sortable: true },
        { accessorKey: "lastName", header: "Last Name", sortable: true },
      ],
    },
    {
      header: "Contact Info",
      columns: [
        { accessorKey: "email", header: "Email" },
        { accessorKey: "phone", header: "Phone" },
      ],
    },
    {
      accessorKey: "status",
      header: "Status",
      sortable: true,
    },
  ];
}
```

---

### 3. Vanilla JavaScript (`@nexgrid/vanilla`)

```html
<link rel="stylesheet" href="node_modules/@nexgrid/vanilla/dist/tablex.css">
<div id="grid-container"></div>

<script type="module">
  import { createTableX } from "@nexgrid/vanilla";

  const columns = [
    {
      header: "Personal Info",
      columns: [
        { accessorKey: "firstName", header: "First Name", sortable: true },
        { accessorKey: "lastName", header: "Last Name", sortable: true },
      ],
    },
    {
      header: "Contact Info",
      columns: [
        { accessorKey: "email", header: "Email" },
        { accessorKey: "phone", header: "Phone" },
      ],
    },
    { accessorKey: "status", header: "Status", sortable: true },
  ];

  const grid = createTableX(document.getElementById("grid-container"), {
    caption: "Users Directory",
    columns,
    data: [
      { id: "1", firstName: "Alice", lastName: "Smith", email: "alice@example.com", phone: "555-0101", status: "Active" },
    ],
    total: 1,
    clientSidePagination: true,
  });
</script>
```

---

## 🏗️ Core Engine Grouping Utilities

If you are developing custom plugins or interacting directly with `@nexgrid/core`, the following helpers are exported:

| Utility Function | Description |
| :--- | :--- |
| `flattenColumns(columns)` | Recursively flattens column definitions to return only data-bearing leaf columns. |
| `hasHeaderGroups(columns)` | Returns `true` if any column in the configuration has child `columns`. |
| `buildHeaderRows(columns, hiddenColumns)` | Returns a 2-tier header matrix (`topRow`, `bottomRow`, `hasGroups`) with precalculated `colSpan` and `rowSpan`. |

### DOM Structure Rendered

When column header grouping is active, NexGrid produces a clean 2-tier `<thead>`:

```html
<thead>
  <tr>
    <!-- Structural column spans 2 rows -->
    <th class="tbx-th tbx-th--select" rowspan="2">...</th>
    
    <!-- Parent group spans 2 columns -->
    <th class="tbx-th tbx-th--group" colspan="2" scope="colgroup">
      <span class="tbx-th-group-title">Personal Details</span>
    </th>
    
    <!-- Standalone column spans 2 rows -->
    <th class="tbx-th" rowspan="2" scope="col">Status</th>
  </tr>
  <tr>
    <!-- Child leaf columns in tier 2 -->
    <th class="tbx-th tbx-th--grouped-child" scope="col">First Name</th>
    <th class="tbx-th tbx-th--grouped-child" scope="col">Last Name</th>
  </tr>
</thead>
```

---

## 🎨 Styling & Theming

Group headers use dedicated semantic CSS classes:

- `.tbx-th--group`: The parent container cell spanning across columns. Centered text with a bottom divider border.
- `.tbx-th-group-title`: Bold typography styling for group labels.
- `.tbx-th--grouped-child`: The bottom-row leaf headers, visually connected to their parent.
