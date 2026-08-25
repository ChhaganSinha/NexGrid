# ✏️ Inline Cell Editing

TableX provides built-in inline cell editing with keyboard navigation and input types.

---

## Overview

Double-clicking any cell with `meta.editable: true` turns the cell into an inline editor without requiring complex external form state.

---

## Configuration

```ts
export const columns: TableXReactColumn<Student>[] = [
  // 1. Text editor
  {
    accessorKey: "name",
    header: "Student",
    meta: {
      editable: true,
      editType: "text",
    },
  },

  // 2. Numeric editor
  {
    accessorKey: "score",
    header: "Score",
    meta: {
      editable: true,
      editType: "number",
    },
  },

  // 3. Dropdown / Select editor
  {
    accessorKey: "status",
    header: "Status",
    meta: {
      editable: true,
      editType: "select",
      editOptions: ["Active", "Pending", "Suspended", "Alumni"],
    },
  },
];
```

---

## Listening to Cell Changes

Listen to cell commits via the `onCellEdit` callback:

```tsx
<TableX<Student>
  caption="Students"
  columns={columns}
  data={data}
  total={total}
  query={query}
  onQueryChange={setQuery}
  onCellEdit={({ row, columnId, oldValue, newValue }) => {
    console.log(`Updated ${columnId} for row #${row.id}:`, oldValue, "->", newValue);
    // Send PUT / PATCH update request to server
  }}
/>
```

---

## Keyboard Navigation

- <kbd>Enter</kbd>: Commits changes and exits editing mode.
- <kbd>Escape</kbd>: Cancels changes and restores the previous value.
