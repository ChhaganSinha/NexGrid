# 🔍 Column Filters

TableX provides granular, column-level filter menus accessible via the **3-dot menu (`⋮`)** on every header cell.

---

## Overview

Column filters allow users to narrow down datasets field by field. Filters are integrated directly into the `QueryState.filter` object (e.g. `filter: { status: "Active", score: "80..100" }`), making them work seamlessly with both in-memory datasets and server-driven queries.

---

## Filter Types

Configure `meta.filterType` on any column:

```ts
export const columns: TableXReactColumn<Student>[] = [
  // 1. Text Filter (default)
  {
    accessorKey: "name",
    header: "Student",
    meta: {
      filterable: true,
      filterPlaceholder: "Search student...",
    },
  },

  // 2. Select / Dropdown List Filter
  {
    accessorKey: "status",
    header: "Status",
    meta: {
      filterable: true,
      filterOptions: ["Active", "Pending", "Suspended", "Alumni"],
    },
  },

  // 3. Numeric Range Filter (Min..Max)
  {
    accessorKey: "score",
    header: "Score",
    meta: {
      filterable: true,
      filterType: "number-range",
    },
  },

  // 4. Date Range Filter (From..To)
  {
    accessorKey: "enrolledAt",
    header: "Enrolled Date",
    meta: {
      filterable: true,
      filterType: "date-range",
    },
  },
];
```

---

## Range Query Syntax

For numeric and date range filters, TableX stores values using the standard `start..end` range syntax:
- Numbers: `"50..100"` (score between 50 and 100 inclusive)
- Dates: `"2024-01-01..2024-06-30"` (dates between Jan 1 and June 30)

The core query reducer `queryClientData` automatically filters in-memory arrays matching these range queries, and the wire format serializer emits `filter[score]=50..100` for backend endpoints.
