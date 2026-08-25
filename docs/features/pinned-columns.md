# 📌 Pinned / Sticky Columns

TableX allows freezing columns to the left or right edge of the table while horizontally scrolling through wide datasets.

---

## Overview

Pinned columns remain sticky when users scroll through wide tables. TableX dynamically calculates exact left/right pixel offsets for selection, expanders, serial numbers, and pinned columns, applying sticky positioning and elevation separator borders.

---

## Configuration

Specify `meta.pinned: "left" | "right"` on any column definition:

```ts
export const columns: TableXReactColumn<Student>[] = [
  // Freeze 'Student' column to the left
  {
    accessorKey: "name",
    header: "Student",
    meta: {
      pinned: "left",
      width: 240,
    },
  },
  { accessorKey: "email", header: "Email", meta: { width: 220 } },
  { accessorKey: "department", header: "Department", meta: { width: 180 } },
  { accessorKey: "score", header: "Score", meta: { width: 120 } },

  // Freeze 'Actions' column to the right
  {
    id: "actions",
    header: "Actions",
    meta: {
      pinned: "right",
      width: 90,
    },
  },
];
```

---

## Visual Styling

When content scrolls underneath pinned columns, TableX adds `.tbx-pinned-border-left` and `.tbx-pinned-border-right` CSS classes to display an elevation divider shadow indicating that scrollable content continues beneath.
