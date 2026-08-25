# Frequently Asked Questions (FAQ)

Answers to common questions about TableX architecture, server integration, performance, and customization.

---

### 1. Why is TableX server-driven rather than client-side?

Most data grids load an entire array into the browser and sort/filter in memory. This breaks down when datasets exceed a few hundred records:
- Sorting a large dataset in JS freezes the browser thread.
- "Sorting" a paginated table client-side only sorts the **current 25 visible rows**, giving inaccurate results.
- Exports only capture what was downloaded to the browser instead of the entire filtered dataset.

TableX treats paging, sorting, global search, and column filters as a **single serialized server query (`QueryState`)**. The server answers with exactly one page of rows plus the total matching count. The grid remains fast and lightweight whether your database has 50 rows or 5,000,000 rows.

---

### 2. How do full-dataset exports work if the browser only has one page?

When the user clicks **Export to Excel** or **Export to CSV**:
1. If `fetchEndpoint` (or `endpoint`) is provided, TableX's export engine calls `fetchAllPages()` in the background.
2. It requests pages in parallel/chunks using the maximum allowable page size (100 rows per request) matching the active search and filter criteria.
3. It compiles the collected dataset into an RFC 4180 CSV with UTF-8 BOM or a formatted XML Excel spreadsheet (.xls) with custom badges, and triggers a browser file download.
4. If no endpoint is configured, it exports the currently loaded page rows.

> [!NOTE]
> Exports include OWASP spreadsheet-injection neutralization (prefixing formula triggers like `=`, `+`, `-`, `@` with a single quote) to protect spreadsheet users.

---

### 3. How do I add custom action buttons (Edit, Delete) to a row?

Use a column definition with a custom `cell` renderer and structural `id`:

#### React
```tsx
const columns: TableXColumn<Student, React.ReactNode>[] = [
  { accessorKey: "name", header: "Name" },
  {
    id: "actions",
    header: "Actions",
    meta: { align: "right", exportable: false, hideable: false },
    cell: ({ row }) => (
      <div className="flex gap-2">
        <button onClick={() => handleEdit(row.original.id)}>Edit</button>
        <button onClick={() => handleDelete(row.original.id)}>Delete</button>
      </div>
    ),
  },
];
```

#### Angular
```html
<table-x [columns]="columns" [data]="students">
  <ng-template tableXCell="actions" let-row="row">
    <button (click)="editStudent(row)">Edit</button>
    <button (click)="deleteStudent(row)">Delete</button>
  </ng-template>
</table-x>
```

---

### 4. How do I use TableX in Next.js App Router?

TableX interactive components require client-side state hooks (`useState`, event listeners). Place `"use client";` at the top of the component containing `<TableX />`.

```tsx
// app/students/students-grid.tsx
"use client";

import { TableX } from "@tablex/react";
import "@tablex/react/styles.css";

export function StudentsGrid({ initialData, initialTotal }) {
  // ... state & grid render
}
```

---

### 5. How does Dark Mode work?

TableX styling is controlled via CSS custom properties. You can switch color themes in three ways:

1. **Prop / Attribute**: Set `theme="dark"` or `theme="auto"` (matches OS `prefers-color-scheme`).
2. **HTML Attribute**: Set `data-theme="dark"` on any parent container or `<html>`.
3. **CSS Class**: Add `.dark` to your `<body>` or root container.

```css
/* Customizing theme variables */
:root {
  --tbx-primary: #3b82f6;
  --tbx-radius: 8px;
  --tbx-font: system-ui, -apple-system, sans-serif;
}
```

---

### 6. Does `TableX.AspNetCore` require Entity Framework Core?

No. While `TableX.AspNetCore` works seamlessly with EF Core via dynamic discovery of `IAsyncQueryProvider` and `IAsyncEnumerable<T>`, it has **zero hard dependencies** on Entity Framework Core packages.

You can use it with:
- Entity Framework Core (`db.Students.AsNoTracking().ToPagedResponseAsync(query, ...)`)
- In-memory `List<T>` / `IQueryable<T>`
- Dapper or custom repositories producing `IQueryable<T>`

---

### 7. Is TableX free for commercial use?

Yes. TableX is released under the **MIT License**, meaning it is 100% free for both personal and commercial applications, with no restrictions or paid license tiers.
