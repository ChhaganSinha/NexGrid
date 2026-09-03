# Interactive Column Resizing & Auto-Fit

NexGrid supports interactive drag-to-resize columns as well as Excel/AG Grid-style double-click auto-fit.

---

## Features

1. **Interactive Dragging**: Hover between column headers to see the resize handle and drag to widen or shrink columns.
2. **Double-Click Auto-Fit**: Double-click any column resize handle to automatically measure header and cell contents and resize the column to fit the widest content.
3. **Persistence**: When used with `storageKey`, custom resized widths are automatically remembered across reloads.
4. **Boundary Clamping**: Respects column `meta.minWidth` (default `60px`).

---

## Usage

Enabled by default (`enableColumnResize: true`).

### React
```tsx
<NexGrid
  enableColumnResize={true} // default true
  ...
/>
```

### Angular
```html
<table-x
  [enableColumnResize]="true"
  ...
/>
```

### Vanilla JS
```javascript
createNexGrid(container, {
  enableColumnResize: true,
  ...
});
```
