# 🧮 Summary / Aggregation Footer Row

TableX can calculate and display totals, averages, counts, minimums, and maximums in a dedicated `<tfoot>` summary row.

---

## Overview

The summary row is rendered at the bottom of the table body. TableX computes aggregations across the currently loaded page rows and supports built-in aggregation presets as well as custom functions.

---

## Built-in Aggregation Functions

Configure `meta.aggregation` and optional `meta.aggregationLabel` on any column:

```ts
export const columns: TableXReactColumn<Order>[] = [
  {
    accessorKey: "item",
    header: "Item",
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    meta: {
      align: "right",
      aggregation: "sum",
      aggregationLabel: "Total Items:",
    },
  },
  {
    accessorKey: "amount",
    header: "Amount",
    meta: {
      align: "right",
      aggregation: "sum",
      aggregationLabel: "Total Amount: $",
    },
  },
  {
    accessorKey: "discount",
    header: "Avg Discount",
    meta: {
      align: "right",
      aggregation: "avg",
      aggregationLabel: "Avg:",
    },
  },
];
```

### Supported Presets

- `"sum"`: Numeric sum of all values.
- `"avg"`: Numeric average of all values.
- `"count"`: Total non-null row count.
- `"min"`: Minimum value across rows.
- `"max"`: Maximum value across rows.

---

## Custom Aggregation Functions

You can also pass a custom function `(values: unknown[], rows: unknown[]) => string | number`:

```ts
{
  accessorKey: "score",
  header: "Score",
  meta: {
    aggregation: (values, rows) => {
      const nums = values.map(Number).filter(n => !isNaN(n));
      const passed = nums.filter(n => n >= 60).length;
      return `${passed}/${nums.length} Passed`;
    },
  },
}
```
