# ⚡ Bulk Actions Floating Bar

When rows are selected in multi-selection mode, TableX displays a contextual floating action pill bar docked at the bottom center of the viewport.

---

## Overview

The floating bulk action bar appears automatically when 1 or more rows are checked. It provides immediate access to selection counts, quick export actions, and custom batch operations.

---

## Usage in React

```tsx
<TableX<Student>
  caption="Students"
  columns={columns}
  data={data}
  total={total}
  query={query}
  onQueryChange={setQuery}
  enableSelection={true}
  enableBulkActions={true}
  bulkActions={(selectedIds, deselectAll) => (
    <>
      <button
        type="button"
        className="tbx-bulk-btn"
        onClick={() => {
          console.log("Delete items:", selectedIds);
          deselectAll();
        }}
      >
        Delete Selected
      </button>
      <button
        type="button"
        className="tbx-bulk-btn"
        onClick={() => {
          console.log("Approve items:", selectedIds);
          deselectAll();
        }}
      >
        Approve
      </button>
    </>
  )}
/>
```

---

## Built-in Actions

- **Selection Count Badge**: Displays `"N selected"`.
- **Export Excel**: Directly exports only the selected rows to formatted Excel (.xlsx / .xls).
- **Export CSV**: Directly exports only the selected rows to RFC 4180 CSV.
- **Close Button (✕)**: Deselects all rows and dismisses the floating bar.
