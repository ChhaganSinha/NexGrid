# 💛 JavaScript (JS / JSX) Developer Guide

NexGrid is **100% compatible with both JavaScript and TypeScript**. You do **not** need TypeScript, a compiler, or any type-checking setup to use NexGrid in your applications.

Whether you are building with **React (JSX)**, **Next.js**, **Vanilla JavaScript (ES Modules)**, or **Plain HTML via `<script>` tags**, this guide covers everything you need.

---

## 📑 Table of Contents

- [Why NexGrid is JavaScript-First](#why-nexgrid-is-javascript-first)
- [React with Plain JavaScript (JSX)](#react-with-plain-javascript-jsx)
  - [Zero-Config In-Memory Grid (Client-Side)](#1-zero-config-in-memory-grid-client-side)
  - [Server-Driven Grid (Paging & Filtering)](#2-server-driven-grid-paging--filtering)
- [Getting Full IDE Autocomplete with JSDoc](#getting-full-ide-autocomplete-with-jsdoc)
- [Vanilla JavaScript (No Framework)](#vanilla-javascript-no-framework)
  - [Using ES Modules (`import`)](#using-es-modules-import)
  - [Using Plain `<script>` Tag (No Bundler / CDN)](#using-plain-script-tag-no-bundler--cdn)
- [Language Comparison: TypeScript vs JavaScript](#language-comparison-typescript-vs-javascript)

---

## 🌟 Why NexGrid is JavaScript-First

1. **Pure JavaScript Runtime Artifacts**: All NexGrid packages (`@nexgrid/core`, `@nexgrid/react`, `@nexgrid/vanilla`) are distributed as standard ES Modules (`.js`), CommonJS (`.cjs`), and IIFE UMD (`tablex.global.js`) bundles.
2. **Standard Plain Objects**: Columns, state persistence, query parameters, and custom cells are all defined using standard JavaScript objects and arrays.
3. **No Build Step Required for Vanilla JS**: You can drop `tablex.global.js` into any standard HTML page and render rich data grids immediately.
4. **Built-in IDE Autocomplete via JSDoc**: Modern editors (VS Code, WebStorm, Cursor) automatically read NexGrid's `.d.ts` declaration files, providing full autocomplete and hover hints even in `.js` and `.jsx` files.

---

## ⚛️ React with Plain JavaScript (JSX)

### Installation

```bash
npm install @nexgrid/react
```

### 1. Zero-Config In-Memory Grid (Client-Side)

If you have a local array of data, use `clientSidePagination`. NexGrid handles pagination, search, sorting, and column filters in-memory:

```jsx
// UsersGrid.jsx
import React from "react";
import { TableX } from "@nexgrid/react";
import "@nexgrid/react/styles.css";

const columns = [
  { accessorKey: "name", header: "Full Name", sortable: true },
  { accessorKey: "email", header: "Email Address" },
  {
    accessorKey: "status",
    header: "Status",
    sortable: true,
    cell: ({ getValue }) => {
      const status = getValue();
      return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
    },
  },
  {
    accessorKey: "score",
    header: "Score",
    sortable: true,
    meta: { align: "right" },
  },
];

export function UsersGrid({ users }) {
  return (
    <TableX
      caption="Users Table"
      columns={columns}
      data={users}
      clientSidePagination={true}
      enableColumnResize={true}
      enableSelection={true}
    />
  );
}
```

---

### 2. Server-Driven Grid (Paging & Filtering)

For datasets with thousands or millions of records, keep the query in state and fetch when it changes:

```jsx
// ServerUsersGrid.jsx
import React, { useEffect, useState } from "react";
import { TableX, buildQueryUrl, defaultQuery } from "@nexgrid/react";
import "@nexgrid/react/styles.css";

const columns = [
  { accessorKey: "name", header: "Name", sortable: true },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "role", header: "Role", sortable: true },
  { accessorKey: "status", header: "Status" },
];

export function ServerUsersGrid() {
  const [query, setQuery] = useState(defaultQuery());
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(buildQueryUrl("/api/users", query))
      .then((res) => res.json())
      .then((res) => setData(res))
      .catch((err) => console.error("Failed to load users:", err))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <TableX
      caption="Active Users"
      columns={columns}
      data={data.items}
      total={data.total}
      query={query}
      onQueryChange={setQuery}
      isLoading={loading}
      enableSelection={true}
    />
  );
}
```

---

## 💡 Getting Full IDE Autocomplete with JSDoc

You don't need TypeScript to get TypeScript's best feature: **IntelliSense and autocomplete**.

Simply place a JSDoc `/** @type {import('@nexgrid/react').TableXColumn[]} */` tag above your column array:

```javascript
// columns.js

/** @type {import('@nexgrid/react').TableXColumn[]} */
export const columns = [
  {
    accessorKey: "title",
    header: "Book Title",
    sortable: true, // <- Editor will autocomplete available options!
    meta: {
      minWidth: 150,
      align: "left", // <- Autocompletes "left" | "center" | "right"
    },
  },
  {
    header: "Author Details",
    columns: [ // <- Autocompletes multi-level stacked headers!
      { accessorKey: "authorName", header: "Author" },
      { accessorKey: "authorEmail", header: "Email" },
    ],
  },
];
```

Your editor will provide:
- Property name autocomplete (`accessorKey`, `header`, `sortable`, `cell`, `meta`, `columns`).
- Parameter hints inside custom `cell: ({ row, getValue }) => ...`.
- Inline documentation and type validation.

---

## 🍦 Vanilla JavaScript (No Framework)

### Using ES Modules (`import`)

```bash
npm install @nexgrid/vanilla
```

```javascript
import { createTableX } from "@nexgrid/vanilla";
import "@nexgrid/vanilla/dist/tablex.css";

const container = document.getElementById("grid-container");

const grid = createTableX(container, {
  caption: "Employee Directory",
  data: [
    { id: "1", name: "Alice", dept: "Engineering", status: "Active" },
    { id: "2", name: "Bob", dept: "Marketing", status: "Pending" },
  ],
  total: 2,
  clientSidePagination: true,
  columns: [
    { accessorKey: "name", header: "Name", sortable: true },
    { accessorKey: "dept", header: "Department", sortable: true },
    { accessorKey: "status", header: "Status" },
  ],
});
```

---

### Using Plain `<script>` Tag (No Bundler / CDN)

No `npm`, no Node.js, and no build setup required:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NexGrid Vanilla Example</title>
  
  <!-- 1. Stylesheet -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@nexgrid/vanilla/dist/tablex.css" />
</head>
<body>
  <div id="my-grid"></div>

  <!-- 2. Library script (exposes window.TableX and window.NexGrid) -->
  <script src="https://cdn.jsdelivr.net/npm/@nexgrid/vanilla/dist/tablex.global.js"></script>

  <!-- 3. Initialize the grid -->
  <script>
    const container = document.getElementById("my-grid");

    const grid = TableX.createTableX(container, {
      caption: "Users Directory",
      clientSidePagination: true,
      columns: [
        { accessorKey: "name", header: "Name", sortable: true },
        { accessorKey: "email", header: "Email" },
        { accessorKey: "role", header: "Role" },
      ],
      data: [
        { id: "1", name: "Sarah Connor", email: "sarah@example.com", role: "Admin" },
        { id: "2", name: "John Connor", email: "john@example.com", role: "User" },
      ],
    });
  </script>
</body>
</html>
```

---

## ⚖️ Language Comparison: TypeScript vs JavaScript

| Feature | TypeScript (`.tsx` / `.ts`) | JavaScript (`.jsx` / `.js`) |
| :--- | :--- | :--- |
| **Type Annotations** | `columns: TableXColumn<User>[]` | Plain array `const columns = [...]` |
| **Interface / Model** | `interface User { id: string; ... }` | Not needed (plain JS objects) |
| **State Hooks** | `useState<QueryState>(defaultQuery())` | `useState(defaultQuery())` |
| **IDE Autocomplete** | Automatic from type annotations | Automatic via JSDoc `@type` comments |
| **Custom Cell Renderer** | `cell: ({ getValue }: TableXCellContext<User>) => JSX` | `cell: ({ getValue }) => <span ...>` |
| **Build Tools** | Requires `tsc`, `ts-loader`, or `babel/preset-typescript` | Standard Babel, Vite, Webpack, or direct browser `<script>` |
