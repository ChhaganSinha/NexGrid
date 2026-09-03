import React, { useState } from "react";
import { TableX } from "@nexgrid/react";
import "@nexgrid/react/styles.css";

import { studentColumns } from "./columns.jsx";
import { STUDENTS_DATA } from "./data.js";

export function App() {
  const [theme, setTheme] = useState("light");
  const [selectedIds, setSelectedIds] = useState([]);

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", margin: 0, fontWeight: 700 }}>
            NexGrid — React (Pure JavaScript Example)
          </h1>
          <p style={{ color: "#6b7280", margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Written entirely in standard JavaScript / JSX with zero TypeScript compilation required.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: "#ffffff",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          {theme === "light" ? "🌙 Dark Mode" : "☀️ Light Mode"}
        </button>
      </header>

      <main>
        {/*
          Using clientSidePagination:
          NexGrid handles all paging, multi-column sorting, global search,
          and column filters in-memory over the local JavaScript array!
        */}
        <TableX
          caption="Students Directory"
          columns={studentColumns}
          data={STUDENTS_DATA}
          clientSidePagination={true}
          storageKey="demo-react-js-grid"
          enableColumnResize={true}
          enableSelection={true}
          selectionMode="multi"
          onSelectionChange={setSelectedIds}
          enableSummaryRow={true}
          theme={theme}
        />
      </main>

      {selectedIds.length > 0 && (
        <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#374151" }}>
          Selected student IDs: <strong>{selectedIds.join(", ")}</strong>
        </div>
      )}
    </div>
  );
}

export default App;
