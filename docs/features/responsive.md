# Responsive: table and card layouts

Above 768 px the grid is a table. Below, it is a list of cards — one card per
record, one label/value row per visible column.

- [How it works](#how-it-works)
- [The card structure](#the-card-structure)
- [What carries over](#what-carries-over)
- [Writing columns that work in both](#writing-columns-that-work-in-both)
- [Moving the breakpoint](#moving-the-breakpoint)
- [Styling cards](#styling-cards)
- [Testing it](#testing-it)

## How it works

Every adapter renders **both** structures on every render, and the shared
stylesheet decides which one is visible:

```css
.nxg-table-wrap {
  display: none;
  overflow-x: auto;
  /* … */
}

@media (min-width: 768px) {
  .nxg-table-wrap {
    display: block;
  }
}

.nxg-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (min-width: 768px) {
  .nxg-cards {
    display: none;
  }
}
```

There is no JavaScript breakpoint, no `matchMedia` listener, and no resize
handler. That matters for three reasons: switching layouts costs nothing at
runtime, server-rendered markup cannot be wrong about the viewport it has not
seen yet, and print stylesheets or CSS-only overrides can pick a layout without
fighting component state.

The table also scrolls horizontally inside `.nxg-table-wrap`
(`overflow-x: auto`, `touch-action: pan-x`), so a wide table on a tablet pans
rather than pushing the page sideways.

The toolbar and footer are shared: both layouts sit between the same search /
menus above and the same pager below. The toolbar itself stacks vertically below
640 px, and the footer stacks below 768 px.

## The card structure

```text
div.nxg-cards
└─ div.nxg-card [--selected] [--clickable]
   ├─ div.nxg-card-head
   │  ├─ span.nxg-card-serial            (when showSerialNumber)
   │  └─ span.nxg-card-select > input.nxg-checkbox   (when enableSelection)
   └─ dl.nxg-card-rows
      └─ div.nxg-card-row > dt + dd      (one per visible column)
```

- `dt` is the column's header text; `dd` is the rendered cell.
- The serial number keeps counting across pages, exactly as in the table.
- `dd` wraps (`overflow-wrap: break-word`) and is end-aligned, so a long email
  stays readable next to a short label.

A card is a `<dl>`, not a table row: it is a description list of one record,
which is the correct semantics once the tabular relationship is gone.

## What carries over

| | Table | Cards |
| --- | --- | --- |
| Custom cell renderers | yes | **the same ones** |
| Column visibility | yes | yes — hiding a column removes its card row |
| Selection | header + row checkboxes | per-card checkbox in the head |
| Row click | `.nxg-row--clickable` | `.nxg-card--clickable` |
| Serial number | first column | card head |
| Sorting affordance | header click | — use the toolbar; there is no header |
| `meta.width`, `meta.minWidth`, `meta.align` | applied | **ignored** |
| Density | padding on `.nxg-td` | unchanged (style `.nxg-card` yourself) |

Because the cell renderer is shared, the two layouts cannot drift apart — there
is no second code path to forget. In React that means the renderer runs twice
per row per render, once in each structure; in vanilla it means a renderer
**must return a new node on every call** (handing back the same node would move
it out of the table and into the card).

Sorting has no card-layout affordance. A phone user sorts by whatever your app
offers in `toolbarActions`, or by a query the page owns:

```tsx
<NexGrid
  toolbarActions={
    <button type="button" className="nxg-btn" onClick={() => setQuery((q) => withSort(q, "createdAt", "desc"))}>
      Newest first
    </button>
  }
  {...props}
/>
```

## Writing columns that work in both

- **Give every column a real `header` string.** It is the card's `dt` label, the
  Columns-menu entry, and the export header. A function header has no string
  form, so those three fall back to the title-cased id.
- **Keep cell content self-describing.** A cell that only makes sense under a
  wide column header reads badly as a `dd`.
- **Hide table-only columns on small screens** by marking them `meta.hidden` and
  letting users re-enable them, rather than trying to branch on viewport.
- **Do not rely on width or alignment for meaning.** A right-aligned number
  column reads as a plain value in a card.

```ts
const columns: NexGridReactColumn<Student>[] = [
  { accessorKey: "name", header: "Name", meta: { minWidth: 180 } },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "status", header: "Status", meta: { align: "center", width: 130 } },
  // Wide, rarely needed: off by default, still in the Columns menu.
  { accessorKey: "internalRef", header: "Internal ref", meta: { hidden: true, width: 220 } },
];
```

## Moving the breakpoint

768 px is baked into the stylesheet. Shift it by re-declaring the two rules
after the grid's own stylesheet loads — no `!important` required, since the
selectors match:

```css
/* Switch to cards below 1024px instead of 768px. */
@media (max-width: 1023.98px) {
  .nxg-table-wrap { display: none; }
  .nxg-cards { display: flex; }
}

@media (min-width: 1024px) {
  .nxg-table-wrap { display: block; }
  .nxg-cards { display: none; }
}
```

To pin one layout everywhere — a print sheet, or a kiosk that is always wide:

```css
@media print {
  .nxg-table-wrap { display: block; }
  .nxg-cards { display: none; }
  .nxg-toolbar { display: none; }
}
```

Both structures always exist in the DOM, so either can be shown at any width
without re-rendering anything.

## Styling cards

Cards use the same [theme tokens](../theming.md) as the rest of the grid:

```css
.nxg-root {
  --nxg-card: #ffffff;      /* card background      */
  --nxg-border: #e2e8f0;    /* card border          */
  --nxg-radius: 12px;       /* card corner radius   */
  --nxg-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
}
```

Useful hooks:

| Class | Element |
| --- | --- |
| `.nxg-card` | one record |
| `.nxg-card--selected` | selected record (tinted with `--nxg-primary`) |
| `.nxg-card--clickable` | pointer cursor, active-state fill |
| `.nxg-card-head` | serial + checkbox strip |
| `.nxg-card-serial` | serial number (monospace, `--nxg-font-mono`) |
| `.nxg-card-rows` | the `<dl>` |
| `.nxg-card-row` | one `dt`/`dd` pair |

Stacking a card row on very narrow screens:

```css
@media (max-width: 380px) {
  .nxg-card-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .nxg-card-row dd {
    text-align: start;
  }
}
```

## Testing it

The layout is pure CSS, so a viewport change is enough — but remember both
structures are always in the DOM. A DOM query that finds "the row" will find the
table row *and* the card even when only one is painted. In tests, scope the
query:

```ts
const tableRows = container.querySelectorAll(".nxg-table-wrap .nxg-row");
const cards = container.querySelectorAll(".nxg-cards .nxg-card");
```

Screen readers see both too. That is intentional — each is complete and
correctly labelled — but it is why a custom cell should not, for example, carry
a globally unique DOM `id`.

## Related

- [Columns](../columns.md) — headers, widths, alignment, visibility
- [Density](density.md) — row heights in the table layout
- [Theming](../theming.md) — every `--nxg-*` token
- [`adapter-spec.md` §6](../adapter-spec.md) — the full DOM contract
