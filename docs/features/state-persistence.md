# Grid State Persistence (`storageKey`)

NexGrid provides built-in view state persistence. When a `storageKey` is provided, user layout customizations are automatically preserved in `localStorage` across page reloads and user sessions.

---

## What is Persisted?

1. **Custom Column Widths**: When a user drags column borders or double-clicks to auto-fit.
2. **Column Order**: When a user drags and drops column headers to rearrange columns.
3. **Column Visibility**: When a user hides or shows columns from the Columns toggle dropdown.
4. **Row Density**: When a user switches between `compact`, `default`, and `comfortable` density presets.

---

## Usage

### React

```tsx
import { NexGrid } from "@nexgrid/react";
import "@nexgrid/react/styles.css";

export function CustomersTable() {
  return (
    <NexGrid
      caption="Customers"
      storageKey="customers-table-view"
      columns={columns}
      data={data}
      total={total}
      query={query}
      onQueryChange={setQuery}
    />
  );
}
```

### Angular

```html
<table-x
  caption="Customers"
  storageKey="customers-table-view"
  [columns]="columns"
  [data]="data"
  [total]="total"
  [query]="query"
  (queryChange)="onQueryChange($event)"
/>
```

### Vanilla JS / DOM

```javascript
import { createNexGrid } from "@nexgrid/vanilla";
import "@nexgrid/vanilla/tablex.css";

const grid = createNexGrid(container, {
  caption: "Customers",
  storageKey: "customers-table-view",
  columns,
  data,
  total,
});
```

---

## Resetting to Default View

When `storageKey` is active, NexGrid automatically renders a **"Reset to default view"** option inside the Columns dropdown menu. Clicking it clears `localStorage` and restores the original table defaults.

Programmatically in core:
```typescript
import { clearGridState } from "@nexgrid/core";

clearGridState("customers-table-view");
```
