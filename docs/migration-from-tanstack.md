# Migrating from TanStack Table (v8) to TableX

If you are coming from [TanStack Table](https://tanstack.com/table/latest), you are already familiar with column definitions, accessor keys, and headless table concepts.

TableX shares the column definition structure with TanStack Table, but removes hundreds of lines of boilerplate by providing the UI, server-driven synchronization, responsive layouts, theming, and multi-format exports out of the box.

---

## Key Differences at a Glance

| Feature | TanStack Table (v8) | TableX |
| :--- | :--- | :--- |
| **Model** | Headless (you write all JSX, CSS, table tags) | Complete Component + Theme (zero boilerplate) |
| **Architecture** | Client-side in-memory by default; manual server plumbing | **Server-driven by design** via `QueryState` |
| **Pagination & Sorting** | Manual state wiring, custom reducer hooks, manual button loops | Built-in server sync, numbered pager, ellipsis, jump-to-page |
| **Mobile Layout** | You must design & write responsive media queries | **Automatic card layout** below 768px |
| **Exporting** | Requires 3rd party plugins (SheetJS, PapaParse, etc.) | **Built-in Excel (.xls) & RFC 4180 CSV** with OWASP injection defense |
| **Frameworks** | Separate adapters for React, Vue, Solid, Svelte | **React/Next.js, Angular, Vanilla JS, and ASP.NET Core** |

---

## Column Definition Comparison

TableX column definitions are structurally compatible with TanStack Table v8:

### TanStack Table (v8)
```tsx
import { createColumnHelper } from "@tanstack/react-table";

const columnHelper = createColumnHelper<Student>();

const columns = [
  columnHelper.accessor("name", {
    header: "Full Name",
    cell: (info) => <strong>{info.getValue()}</strong>,
  }),
  columnHelper.accessor("email", {
    header: "Email Address",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <span className={`badge ${info.getValue()}`}>{info.getValue()}</span>,
  }),
];
```

### TableX
```tsx
import type { TableXColumn } from "@tablex/core";

const columns: TableXColumn<Student, React.ReactNode>[] = [
  {
    accessorKey: "name",
    header: "Full Name",
    cell: ({ getValue }) => <strong>{String(getValue())}</strong>,
  },
  {
    accessorKey: "email",
    header: "Email Address",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => <span className={`badge ${String(getValue())}`}>{String(getValue())}</span>,
  },
];
```

> [!TIP]
> Notice that `accessorKey`, `header`, and `cell: ({ getValue, row }) => ...` match TanStack Table's convention. You can move your existing column definitions to TableX with virtually zero changes.

---

## Replacing the 200-line Table Boilerplate

With TanStack Table, rendering a full-featured table with search, pagination, and sorting requires manual markup for `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `flexRender()`, page buttons, rows-per-page dropdowns, and search debounce inputs.

### Before: TanStack Table Setup (~150+ lines)

```tsx
// With TanStack Table, you have to write and maintain all this:
const table = useReactTable({
  data,
  columns,
  pageCount: Math.ceil(total / pageSize),
  state: { pagination, sorting, globalFilter },
  onPaginationChange: setPagination,
  onSortingChange: setSorting,
  onGlobalFilterChange: setGlobalFilter,
  manualPagination: true,
  manualSorting: true,
  manualFiltering: true,
  getCoreRowModel: getCoreRowModel(),
});

return (
  <div className="table-container">
    <input
      value={globalFilter ?? ""}
      onChange={(e) => setGlobalFilter(e.target.value)}
      placeholder="Search..."
    />
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                {flexRender(header.column.columnDef.header, header.getContext())}
                {{ asc: " 🔼", desc: " 🔽" }[header.column.getIsSorted() as string] ?? null}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    {/* ... 50+ more lines for pagination controls, page jump, and page size selector ... */}
  </div>
);
```

### After: TableX (~20 lines)

```tsx
import { useState, useEffect } from "react";
import { TableX } from "@tablex/react";
import { defaultQuery, buildQueryUrl, type QueryState, type PagedResponse } from "@tablex/core";
import "@tablex/react/styles.css";

export function StudentsTable() {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Student>>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(buildQueryUrl("/api/students", query))
      .then((res) => res.json())
      .then(setPage)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <TableX
      caption="Students Directory"
      columns={columns}
      data={page?.items ?? []}
      total={page?.total ?? 0}
      query={query}
      onQueryChange={setQuery}
      isLoading={loading}
      enableSelection
      fetchEndpoint="/api/students"
    />
  );
}
```

---

## Summary of Migration Steps

1. **Install `@tablex/react` and `@tablex/core`**:
   ```bash
   npm install @tablex/react @tablex/core
   ```
2. **Import the stylesheet**:
   ```tsx
   import "@tablex/react/styles.css";
   ```
3. **Copy your `columns` array**:
   Replace `@tanstack/react-table` imports with `TableXColumn<T>` from `@tablex/core`.
4. **Replace the table rendering**:
   Replace the `useReactTable` hook and manual JSX with `<TableX />`.
5. **Connect your endpoint**:
   Use `buildQueryUrl(endpoint, query)` to fetch data as a `PagedResponse<T>`.
