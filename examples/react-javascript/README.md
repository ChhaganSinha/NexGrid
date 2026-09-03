# NexGrid — React (Pure JavaScript Example)

This example demonstrates using `@nexgrid/react` in a **pure JavaScript / JSX** project without TypeScript.

## 🚀 Running the Example

From this directory:

```bash
npm install
npm run dev
```

Visit [http://localhost:5174](http://localhost:5174) in your browser.

---

## 💡 Key Highlights for JavaScript Developers

1. **No TypeScript Needed**:
   - Plain `.jsx` and `.js` files.
   - Standard object literals for column definitions.
2. **Optional JSDoc for Autocomplete**:
   ```javascript
   /** @type {import('@nexgrid/react').TableXColumn[]} */
   export const columns = [ ... ];
   ```
   Adding this JSDoc tag gives VS Code, WebStorm, and Cursor full autocomplete, prop validation, and hover documentation without TypeScript!
3. **In-Memory Client-Side Pagination**:
   ```jsx
   <TableX
     caption="Students"
     columns={columns}
     data={data}
     clientSidePagination
   />
   ```
4. **Custom Cell Rendering**:
   Use standard JSX in `cell: ({ getValue }) => <span ...>{getValue()}</span>`.
