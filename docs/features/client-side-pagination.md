# Client-Side Pagination & In-Memory Data Engine

NexGrid provides native client-side pagination, sorting, search, and filtering over in-memory datasets. You can pass a standard array of objects (e.g. 50, 500, or 5,000 items), and NexGrid will handle page slicing, total calculation, and pager controls entirely on the client with zero backend configuration needed.

---

## Features

1. **In-Memory Windowing**: Slices the visible rows according to `query.page` and `query.pageSize` automatically.
2. **Instant Navigation**: Page navigation (Next, Prev, numbered buttons, jump-to-page) updates the visible rows instantly without network requests.
3. **Full Dataset Search & Filter**: The global search field and column filters evaluate across the entire in-memory dataset in real time.
4. **Multi-Column Sorting**: Sorts the complete dataset across multiple fields.
5. **Accurate Record Range**: Displays the exact window (e.g., `Showing 11 to 20 of 142 records`).
6. **Complete Dataset Export**: Exporting to Excel, CSV, or Clipboard automatically includes all filtered records, not just the active page.

---

## Usage

### React

Simply provide your data array to `<NexGrid>`. Client-side mode activates automatically when no `onQueryChange` is passed, or explicitly via `clientSidePagination`:

```tsx
import { NexGrid } from "@nexgrid/react";
import "@nexgrid/react/styles.css";

const allEmployees = [
  { id: 1, name: "Alice", role: "Engineer" },
  { id: 2, name: "Bob", role: "Designer" },
  // ... 500 records
];

export function EmployeesTable() {
  return (
    <NexGrid
      caption="Employees"
      columns={columns}
      data={allEmployees}
      clientSidePagination={true}
    />
  );
}
```

### Angular

```html
<table-x
  caption="Employees"
  [columns]="columns"
  [data]="allEmployees"
  [clientSidePagination]="true"
/>
```

### Vanilla JS / Plain DOM

```javascript
import { createNexGrid } from "@nexgrid/vanilla";
import "@nexgrid/vanilla/tablex.css";

const grid = createNexGrid(container, {
  caption: "Employees",
  columns,
  data: allEmployees,
  clientSidePagination: true,
});

// Update data reactively:
grid.setData(updatedEmployees);
```
