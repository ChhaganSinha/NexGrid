# `@nexgrid/vue`

Vue 3 and Nuxt 3+ adapter for **TableX** (`<TableX />` / `<NexGrid />`).

## Installation

```bash
npm install @nexgrid/vue @nexgrid/core
```

## Quick Start

```vue
<script setup lang="ts">
import { TableX, useClientTableX, type TableXVueColumn } from "@nexgrid/vue";
import "@nexgrid/vue/styles.css";

interface Employee {
  id: string;
  name: string;
  department: string;
  salary: number;
}

const columns: TableXVueColumn<Employee>[] = [
  { accessorKey: "name", header: "Employee", meta: { pinned: "left", editable: true } },
  {
    accessorKey: "department",
    header: "Department",
    meta: { filterType: "multi-select", filterOptions: ["Engineering", "Sales", "Design"] },
  },
  { accessorKey: "salary", header: "Salary", meta: { align: "right", aggregation: "sum" } },
];

const employees: Employee[] = [
  { id: "1", name: "Alice Johnson", department: "Engineering", salary: 145000 },
  { id: "2", name: "Bob Smith", department: "Sales", salary: 112000 },
];

const grid = useClientTableX(employees);
</script>

<template>
  <TableX
    caption="Employees"
    :columns="columns"
    :data="grid.data.value"
    :total="grid.total.value"
    v-model:query="grid.query.value"
    enable-selection
    enable-summary-row
    enable-saved-views
  >
    <template #cell-department="{ value }">
      <span class="badge">{{ value }}</span>
    </template>
  </TableX>
</template>
```
