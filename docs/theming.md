# Theming

Every colour and shape in the stylesheet reads a CSS custom property. You re-skin
the grid by overriding tokens — no class overrides, no `!important`.

- [Loading the stylesheet](#loading-the-stylesheet)
- [The tokens](#the-tokens)
- [Where to put your overrides](#where-to-put-your-overrides)
- [Dark mode](#dark-mode)
- [Worked example: a violet brand theme](#worked-example-a-violet-brand-theme)
- [Worked example: following an app-wide theme switch](#worked-example-following-an-app-wide-theme-switch)
- [Worked example: a dense, borderless report table](#worked-example-a-dense-borderless-report-table)
- [Styling beyond tokens](#styling-beyond-tokens)
- [Class reference](#class-reference)

## Loading the stylesheet

One global file, shared by all four renderers.

| Platform | How |
| --- | --- |
| React / Next.js | `import "@nexgrid/react/styles.css";` |
| Angular | add `node_modules/@nexgrid/angular/styles.css` to `angular.json` → `styles` |
| Vanilla (bundler) | `import "@nexgrid/vanilla/styles.css";` |
| Vanilla (script tag) | `<link rel="stylesheet" href=".../dist/nexgrid.css">` |
| ASP.NET Core | `<link rel="stylesheet" href="@NexGridAssets.StylesheetPath" />` |
| From CSS anywhere | `@import "@nexgrid/core/styles.css";` |

It must be **global**. In Angular, component styles are scoped by emulated
view encapsulation and will not reach the grid's markup — putting the import in
a component's `styles` array silently does nothing.

## The tokens

All of them are declared on `.nxg-root`. These are the light-mode defaults, as
shipped:

| Token | Default | Used for |
| --- | --- | --- |
| `--nxg-font` | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | Every string in the grid. |
| `--nxg-font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Serial numbers (table cell and card head). |
| `--nxg-bg` | `#ffffff` | Input, button, select, pager and checkbox backgrounds. |
| `--nxg-card` | `#ffffff` | Toolbar, table, footer, menu and card surfaces. |
| `--nxg-card-2` | `#f8fafc` | The table header band. |
| `--nxg-border` | `#e2e8f0` | Every border, divider and row rule. |
| `--nxg-fg` | `#0f172a` | Primary text. |
| `--nxg-muted` | `#f1f5f9` | Hover fills, range chips. |
| `--nxg-muted-fg` | `#64748b` | Secondary text: header labels, placeholders, ellipsis, states. |
| `--nxg-primary` | `#2563eb` | Accent: sort icons, current page, selection tint, focus, search icon. |
| `--nxg-primary-fg` | `#ffffff` | Text on primary fills (current page button, checkmark). |
| `--nxg-danger` | `#dc2626` | Destructive accents. |
| `--nxg-radius` | `12px` | Panel corners: toolbar, table wrap, footer, cards. |
| `--nxg-radius-sm` | `8px` | Control corners: buttons, inputs, menus, pager. |
| `--nxg-shadow` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Elevation on panels and controls. |
| `--nxg-focus-ring` | `0 0 0 2px color-mix(in srgb, var(--nxg-primary) 35%, transparent)` | The focus ring on every focusable control. |

Two colours are **not** tokenised, because they identify a file format rather
than the brand: the Excel menu icon (`.nxg-icon--excel`, `#10b981`) and the CSV
menu icon (`.nxg-icon--csv`, `#06b6d4`). Override those classes directly if you
need to.

Several rules derive shades from `--nxg-primary` with `color-mix`, so setting
one accent token updates the selection tint, the export button's border, the
range total chip and the focus ring together.

## Where to put your overrides

Anywhere the cascade reaches `.nxg-root`. Highest to lowest reach:

```css
/* 1. Every grid in the app. */
.nxg-root {
  --nxg-primary: #7c3aed;
  --nxg-radius: 8px;
}

/* 2. One grid, via className / grid-class / a class on <nex-grid>. */
.nxg-root.students-grid {
  --nxg-primary: #0f766e;
}

/* 3. A section of the app. */
.admin-area .nxg-root {
  --nxg-font: "Inter", system-ui, sans-serif;
}
```

```tsx
<NexGrid className="students-grid" {...props} />
```

```html
<nex-grid class="students-grid" caption="Students" …/>
```

```js
createNexGrid(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  className: "students-grid",
});
```

```cshtml
<nex-grid caption="Students" endpoint="/api/students" grid-class="students-grid">…</nex-grid>
```

On `<nex-grid>` (Angular) the **host element itself** carries `.nxg-root`, so a
plain `class` attribute lands on the grid root. In the ASP.NET Tag Helper the
element's own `class` stays on the mount point and `grid-class` targets the
root — they are different elements.

## Dark mode

Dark mode is a **class**, not a media query, so it can follow whatever your app
already uses. The `theme` prop is a convenience that adds it:

| Value | Adds | Behaviour |
| --- | --- | --- |
| `"light"` (default) | — | Always light. |
| `"dark"` | `.nxg-dark` on the root | Always dark. |
| `"auto"` | `.nxg-auto` on the root | Dark only when `prefers-color-scheme: dark`. |

```tsx
<NexGrid theme="dark" {...props} />
<NexGrid theme="auto" {...props} />
```

```html
<nex-grid theme="dark" …/>
<nex-grid [theme]="'auto'" …/>
```

```js
createNexGrid(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  theme: "auto",
});
```

```cshtml
<nex-grid caption="Students" endpoint="/api/students" theme="Dark">…</nex-grid>
```

The selectors match the class on the root **or on any ancestor**:

```css
.nxg-dark .nxg-root,
.nxg-root.nxg-dark {
  --nxg-bg: #0b1220;
  --nxg-card: #0f172a;
  --nxg-card-2: #16213a;
  --nxg-border: #253352;
  --nxg-fg: #e2e8f0;
  --nxg-muted: #1e293b;
  --nxg-muted-fg: #94a3b8;
  --nxg-primary: #3b82f6;
  --nxg-primary-fg: #ffffff;
  --nxg-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.4);
}

@media (prefers-color-scheme: dark) {
  .nxg-auto .nxg-root,
  .nxg-root.nxg-auto {
    /* the same nine tokens */
  }
}
```

Note which tokens dark mode does **not** redefine: `--nxg-font`,
`--nxg-font-mono`, `--nxg-danger`, `--nxg-radius`, `--nxg-radius-sm` and
`--nxg-focus-ring`. Type, shape and the focus ring formula are shared by both
schemes, so overriding them once covers light and dark.

If your app already toggles a dark class higher up the tree, put `nxg-dark`
alongside it and leave `theme` alone:

```html
<body class="app-dark nxg-dark">
  <!-- every .nxg-root below here is dark -->
</body>
```

## Worked example: a violet brand theme

Light and dark, from one block:

```css
/* app.css — loaded AFTER the NexGrid stylesheet. */
.nxg-root {
  --nxg-font: "Inter", system-ui, -apple-system, sans-serif;
  --nxg-primary: #7c3aed;
  --nxg-primary-fg: #ffffff;
  --nxg-radius: 10px;
  --nxg-radius-sm: 6px;
  --nxg-border: #e4e4e7;
  --nxg-card-2: #faf5ff;
  --nxg-shadow: 0 1px 3px 0 rgb(24 24 27 / 0.08);
}

.nxg-dark .nxg-root,
.nxg-root.nxg-dark {
  --nxg-primary: #a78bfa;
  --nxg-card-2: #241b3d;
  --nxg-border: #3f3355;
}

@media (prefers-color-scheme: dark) {
  .nxg-auto .nxg-root,
  .nxg-root.nxg-auto {
    --nxg-primary: #a78bfa;
    --nxg-card-2: #241b3d;
    --nxg-border: #3f3355;
  }
}
```

Order matters: your rules must come after the grid's stylesheet, since both
target `.nxg-root` at the same specificity.

## Worked example: following an app-wide theme switch

Reuse tokens your design system already publishes, instead of hard-coding a
second palette:

```css
:root {
  --brand-surface: #ffffff;
  --brand-surface-2: #f6f7f9;
  --brand-ink: #14181f;
  --brand-ink-2: #6b7280;
  --brand-line: #e3e6ea;
  --brand-accent: #0f766e;
}

:root[data-theme="dark"] {
  --brand-surface: #101418;
  --brand-surface-2: #171d24;
  --brand-ink: #e6eaef;
  --brand-ink-2: #9aa4b2;
  --brand-line: #2a323c;
  --brand-accent: #2dd4bf;
}

/* One mapping serves both, because the brand tokens flip. */
.nxg-root {
  --nxg-bg: var(--brand-surface);
  --nxg-card: var(--brand-surface);
  --nxg-card-2: var(--brand-surface-2);
  --nxg-border: var(--brand-line);
  --nxg-fg: var(--brand-ink);
  --nxg-muted-fg: var(--brand-ink-2);
  --nxg-muted: var(--brand-surface-2);
  --nxg-primary: var(--brand-accent);
  --nxg-primary-fg: #04211d;
}
```

Leave `theme` at its default `"light"` here — the grid's own dark class would
re-declare the tokens you are mapping and undo the wiring.

## Worked example: a dense, borderless report table

```css
.nxg-root.report {
  --nxg-radius: 0px;
  --nxg-radius-sm: 2px;
  --nxg-shadow: none;
  --nxg-card-2: #ffffff;
  --nxg-border: #eceff3;
  --nxg-font: "IBM Plex Sans", system-ui, sans-serif;
  --nxg-font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

/* Rules only under the header and between rows, nothing around the edges. */
.nxg-root.report .nxg-table-wrap,
.nxg-root.report .nxg-toolbar,
.nxg-root.report .nxg-footer {
  border-left: 0;
  border-right: 0;
  border-top: 0;
}

.nxg-root.report .nxg-table thead tr {
  border-bottom-width: 2px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

Pair it with `density="compact"` — see [Density](features/density.md).

## Styling beyond tokens

Tokens cover colour, type and shape. For layout, target the classes directly —
they are part of the [DOM contract](adapter-spec.md) and identical on every
adapter, so a rule written once works on all four.

```css
/* Give the search box more room on wide screens. */
@media (min-width: 1280px) {
  .nxg-search {
    max-width: 480px;
  }
}

/* Freeze the first data column. */
.nxg-table .nxg-th:nth-child(2),
.nxg-table .nxg-td:nth-child(2) {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--nxg-card);
}
```

Two habits keep this maintainable:

- **Scope to your own class** (`.nxg-root.students-grid .nxg-td`) rather than
  restyling `.nxg-td` globally.
- **Reuse `.nxg-btn`** for anything you inject through `toolbarActions` — it
  inherits the tokens and matches the built-in controls exactly.

Custom cells are your markup, so style them with your own classes. They inherit
`--nxg-*` from the root, which is the easy way to keep a status pill on-brand in
both schemes:

```css
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--nxg-radius-sm);
  font-size: 12px;
  font-weight: 600;
  color: var(--nxg-primary);
  background: color-mix(in srgb, var(--nxg-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--nxg-primary) 25%, transparent);
}
```

## Class reference

The hooks you are most likely to need. The full structural contract is
[`adapter-spec.md` §6](adapter-spec.md).

| Class | Element |
| --- | --- |
| `.nxg-root` | Grid root. Carries `data-density` and any `.nxg-dark` / `.nxg-auto`. |
| `.nxg-toolbar`, `.nxg-toolbar-group`, `.nxg-toolbar-group--end` | Toolbar and its two groups. |
| `.nxg-search`, `.nxg-search-input`, `.nxg-search-icon`, `.nxg-search-clear` | Search field. |
| `.nxg-btn`, `.nxg-btn--export` | Buttons; the export trigger. |
| `.nxg-menu-wrap`, `.nxg-menu`, `.nxg-menu--end`, `.nxg-menu-item`, `.nxg-menu-label`, `.nxg-menu-separator` | Dropdowns. |
| `.nxg-icon`, `.nxg-check`, `.nxg-icon--excel`, `.nxg-icon--csv`, `.nxg-sort-icon`, `.nxg-sort-icon--idle` | Icons. |
| `.nxg-table-wrap`, `.nxg-table` | Table (≥ 768 px). |
| `.nxg-th`, `.nxg-th--serial`, `.nxg-th--select`, `.nxg-th--sortable`, `.nxg-th-inner`, `.nxg-th-inner--center`, `.nxg-th-inner--right` | Header cells. |
| `.nxg-row`, `.nxg-row--selected`, `.nxg-row--clickable` | Body rows. |
| `.nxg-td`, `.nxg-td--serial`, `.nxg-td--select` | Body cells. |
| `.nxg-cards`, `.nxg-card`, `.nxg-card--selected`, `.nxg-card--clickable`, `.nxg-card-head`, `.nxg-card-serial`, `.nxg-card-select`, `.nxg-card-rows`, `.nxg-card-row` | Card layout (< 768 px). |
| `.nxg-state`, `.nxg-state-card`, `.nxg-state-text`, `.nxg-spinner` | Loading / empty / error. |
| `.nxg-footer`, `.nxg-range`, `.nxg-range-total`, `.nxg-selected-badge` | Footer left side. |
| `.nxg-pagination`, `.nxg-rows-per-page`, `.nxg-rows-select`, `.nxg-pager`, `.nxg-page-btn`, `.nxg-page-btn--current`, `.nxg-page-nav`, `.nxg-page-ellipsis` | Pager. |
| `.nxg-jump`, `.nxg-jump-label`, `.nxg-jump-input` | Page-jump box. |
| `.nxg-checkbox` | Selection checkboxes. |
| `.nxg-sr-only`, `.nxg-align-center`, `.nxg-align-right`, `.nxg-capitalize` | Utilities. |

## Related

- [Density](features/density.md) — `data-density` and the row-height steps
- [Responsive](features/responsive.md) — moving the 768 px breakpoint
- [Localization](localization.md) — the other half of "make it ours"
