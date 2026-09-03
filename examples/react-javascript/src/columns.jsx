import React from "react";

/**
 * Column definitions for students table written in plain JavaScript (JSX).
 * 
 * JSDoc @type comment is completely optional, but gives full IntelliSense
 * and auto-complete in VS Code, WebStorm, and Cursor without TypeScript!
 * 
 * @type {import('@nexgrid/react').TableXColumn[]}
 */
export const studentColumns = [
  {
    header: "Personal Details",
    columns: [
      {
        accessorKey: "firstName",
        header: "First Name",
        sortable: true,
        meta: { minWidth: 130 },
      },
      {
        accessorKey: "lastName",
        header: "Last Name",
        sortable: true,
        meta: { minWidth: 130 },
      },
    ],
  },
  {
    header: "Contact Information",
    columns: [
      {
        accessorKey: "email",
        header: "Email",
        meta: { minWidth: 180 },
      },
      {
        accessorKey: "phone",
        header: "Phone",
        meta: { minWidth: 140 },
      },
    ],
  },
  {
    accessorKey: "role",
    header: "Department",
    sortable: true,
    meta: {
      filterOptions: ["Engineering", "Design", "Marketing", "Product", "Operations"],
    },
  },
  {
    accessorKey: "score",
    header: "Performance Score",
    sortable: true,
    meta: {
      align: "right",
      width: 150,
      aggregation: "avg",
    },
    cell: ({ getValue }) => {
      const val = Number(getValue() || 0);
      const color = val >= 90 ? "#10b981" : val >= 75 ? "#f59e0b" : "#ef4444";
      return (
        <span style={{ fontWeight: 600, color }}>
          {val}%
        </span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    sortable: true,
    meta: {
      align: "center",
      width: 120,
      filterOptions: ["Active", "Pending", "Disabled"],
    },
    cell: ({ getValue }) => {
      const status = String(getValue() || "");
      const bg =
        status === "Active"
          ? "rgba(16, 185, 129, 0.15)"
          : status === "Pending"
          ? "rgba(245, 158, 11, 0.15)"
          : "rgba(239, 68, 68, 0.15)";
      const fg =
        status === "Active"
          ? "#059669"
          : status === "Pending"
          ? "#d97706"
          : "#dc2626";

      return (
        <span
          style={{
            display: "inline-block",
            padding: "2px 10px",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            background: bg,
            color: fg,
          }}
        >
          {status}
        </span>
      );
    },
  },
];
