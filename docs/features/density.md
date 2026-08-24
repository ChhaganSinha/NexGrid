# Density

Three row heights, switchable from the toolbar, applied by the shared
stylesheet.

- [The three densities](#the-three-densities)
- [Setting the initial density](#setting-the-initial-density)
- [Who owns density](#who-owns-density)
- [Styling from outside](#styling-from-outside)
- [Labels](#labels)

## The three densities

```ts
export type Density = "compact" | "default" | "comfortable";

export const DENSITIES: readonly Density[] = ["compact", "default", "comfortable"];

/** Density -> fixed row height in px (informational; the CSS theme applies it). */
export const DENSITY_ROW_HEIGHT: Record<Density, number> = {
  compact: 36,
  default: 44,
  comfortable: 52,
};
```

The grid writes the choice to `data-density` on the root element, and the
stylesheet does the rest:

```css
.nxg-root[data-density="compact"] .nxg-td {
  padding-top: 8px;
  padding-bottom: 8px;
  font-size: 12px;
}

.nxg-root[data-density="default"] .nxg-td {
  padding-top: 12px;
  padding-bottom: 12px;
  font-size: 14px;
}

.nxg-root[data-density="comfortable"] .nxg-td {
  padding-top: 16px;
  padding-bottom: 16px;
  font-size: 14px;
}
```

`DENSITY_ROW_HEIGHT` is informational — the numbers a designer would quote — not
something the grid enforces. Real row height follows content plus the padding
above. Nothing depends on a fixed height, so a wrapping cell grows its row
rather than clipping.

Density affects data cells only. The toolbar, footer and header band keep their
proportions, so switching to compact does not shrink the controls.

## Setting the initial density

```tsx
// React
<NexGrid density="compact" {...props} />
```

```html
<!-- Angular -->
<nex-grid density="compact" …/>
```

```js
// Vanilla
createNexGrid(container, {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  density: "compact",
});
```

```cshtml
<!-- ASP.NET Core -->
<nex-grid caption="Students" endpoint="/api/students" density="Compact">…</nex-grid>
```

The Tag Helper attribute takes `Compact`, `Default` or `Comfortable`, matched
case-insensitively. An unrecognised value throws at render time with the list of
valid ones rather than silently falling back.

## Who owns density

The prop is an **initial** value. Once the user picks from the Density menu,
they own it — the grid keeps the choice in its own state and later renders do
not fight it.

The one exception is Angular, where re-binding the `density` input overrides the
user's menu choice. Bind it once, or bind a signal you only set on first paint.

Density is UI state, not query state: it is not part of `QueryState`, never
reaches the server, and does not survive a reload on its own. To persist it,
store the user's choice yourself and pass it back as the initial value:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  NexGrid,
  buildQueryUrl,
  defaultQuery,
  type Density,
  type NexGridReactColumn,
  type PagedResponse,
  type QueryState,
} from "@nexgrid/react";
import "@nexgrid/react/styles.css";

interface Student {
  id: number;
  name: string;
  email: string;
}

const columns: NexGridReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
];

const STORAGE_KEY = "students-grid-density";

function readStoredDensity(): Density {
  const stored = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  return stored === "compact" || stored === "comfortable" ? stored : "default";
}

export function StudentsGrid() {
  // Read once: the prop is an INITIAL value, and the user owns it afterwards.
  const [density] = useState<Density>(readStoredDensity);
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Student> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (next: QueryState) => {
    setIsLoading(true);
    try {
      const response = await fetch(buildQueryUrl("/api/students", next));
      setPage((await response.json()) as PagedResponse<Student>);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  return (
    <NexGrid
      caption="Students"
      columns={columns}
      data={page?.items ?? []}
      total={page?.total ?? 0}
      query={query}
      onQueryChange={setQuery}
      isLoading={isLoading}
      density={density}
    />
  );
}
```

There is no `onDensityChange` callback. To observe the current density, watch
the `data-density` attribute on `.nxg-root`:

```js
const root = document.querySelector(".nxg-root");
new MutationObserver(() => {
  localStorage.setItem("students-grid-density", root.dataset.density);
}).observe(root, { attributes: true, attributeFilter: ["data-density"] });
```

## Styling from outside

Because density is a data attribute rather than a class the grid owns, your own
CSS can hang off it:

```css
/* Tighten a custom cell's own chrome when the grid is compact. */
.nxg-root[data-density="compact"] .pill {
  padding: 1px 6px;
  font-size: 11px;
}

/* Give comfortable mode more breathing room in the card layout too. */
.nxg-root[data-density="comfortable"] .nxg-card {
  padding: 18px;
}
```

To change the built-in steps themselves, override the rules with the same
specificity — no `!important` needed:

```css
.nxg-root[data-density="compact"] .nxg-td {
  padding-top: 6px;
  padding-bottom: 6px;
  font-size: 11px;
}
```

## Labels

Menu labels come from the [locale](../localization.md), including the pixel
hints, so a localized grid can drop or translate them:

| Key | Default |
| --- | --- |
| `densityButton` | `"Density: {density}"` |
| `densityCompact` | `"Compact (36px)"` |
| `densityDefault` | `"Standard (44px)"` |
| `densityComfortable` | `"Comfortable (52px)"` |

```tsx
<NexGrid
  locale={{
    densityButton: "Dichte: {density}",
    densityCompact: "Kompakt",
    densityDefault: "Standard",
    densityComfortable: "Komfortabel",
  }}
  {...props}
/>
```

`{density}` is substituted with the current density name; the trigger button
carries `.nxg-capitalize`, so a lower-case value still reads correctly.

## Related

- [Theming](../theming.md) — tokens, dark mode
- [Responsive](responsive.md) — density and the card layout
- [Localization](../localization.md) — the four density strings
