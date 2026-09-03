# Active Filter Pills Bar

NexGrid includes an interactive **Active Filter Pills Bar** that appears directly beneath the toolbar whenever a search term or column filter is applied.

---

## Features

1. **At-a-glance Visibility**: Immediately shows all active filters without having to open column menus.
2. **One-Click Removal (`✕`)**: Users can remove individual filters or the search term with a single click.
3. **Clear All Button**: Resets all active filters and search query in one go.
4. **Customization**: Can be disabled by setting `showFilterPills={false}` / `showFilterPills: false`.

---

## Usage

Enabled by default. To explicitly control or disable:

### React
```tsx
<NexGrid
  showFilterPills={true} // default true
  ...
/>
```

### Angular
```html
<table-x
  [showFilterPills]="true"
  ...
/>
```

### Vanilla JS
```javascript
createNexGrid(container, {
  showFilterPills: true,
  ...
});
```
