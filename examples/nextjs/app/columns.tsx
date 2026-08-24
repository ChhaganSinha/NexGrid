"use client";

// ^ Not optional. A column's `cell` is a FUNCTION, and functions cannot cross
// the server/client boundary. Defining these in a server file and passing them
// to <NexGrid /> fails at runtime with:
//
//   Error: Functions cannot be passed directly to Client Components unless you
//   explicitly expose it by marking it with "use server".
//
// Keeping the columns in their own client module (rather than inline in the
// grid component) is just tidiness — the directive is what matters.

import type { NexGridReactColumn } from "@nexgrid/react";

import type { Student } from "@/lib/student-types";

export interface StudentActions {
  onEdit: (student: Student) => void;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

export function studentColumns(actions: StudentActions): NexGridReactColumn<Student>[] {
  return [
    {
      accessorKey: "name",
      header: "Student",
      meta: { minWidth: 200 },
      cell: ({ row }) => (
        <div className="cell-stack">
          <strong>{row.original.name}</strong>
          <small>{row.original.email}</small>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      meta: { hidden: true, minWidth: 220 },
    },
    {
      accessorKey: "department",
      header: "Department",
      meta: { minWidth: 160 },
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        align: "center",
        width: 130,
        serverFilterable: true,
        filterOptions: ["Active", "Pending", "Suspended", "Alumni"],
      },
      // The badge is presentation only: exports still write "Active".
      cell: ({ getValue }) => {
        const status = String(getValue());
        return <span className={`badge badge--${status.toLowerCase()}`}>{status}</span>;
      },
    },
    {
      accessorKey: "score",
      header: "Score",
      meta: { align: "right", width: 90 },
    },
    {
      accessorKey: "enrolledAt",
      header: "Enrolled",
      meta: { width: 140 },
      // Sorting happens on the server against the raw ISO value, so the display
      // format is free.
      cell: ({ getValue }) => {
        const raw = String(getValue());
        return (
          <time dateTime={raw} title={raw}>
            {dateFormatter.format(new Date(`${raw}T00:00:00Z`))}
          </time>
        );
      },
    },
    {
      accessorKey: "scholarship",
      header: "Scholarship",
      meta: { align: "center", width: 120 },
    },
    {
      // `actions` is a structural id: never sorted, never exported, never listed
      // in the Columns menu.
      id: "actions",
      header: "",
      meta: { align: "right", width: 90 },
      cell: ({ row }) => (
        <div className="row-actions">
          <button
            type="button"
            className="nxg-btn"
            onClick={(event) => {
              // Without this the row click handler fires too.
              event.stopPropagation();
              actions.onEdit(row.original);
            }}
          >
            Edit
          </button>
        </div>
      ),
    },
  ];
}
