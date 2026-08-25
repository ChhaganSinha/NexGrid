// Column definitions, including the three renderers every real admin table
// ends up needing: a status badge, a formatted date, and a row-actions cell.
//
// A column is a plain object — structurally the same shape TanStack Table uses
// — so there is no builder API to learn. `cell` returns any `ReactNode` and the
// SAME renderer draws the table cell and the mobile card row, which is why the
// two can never drift apart.
//
// Worth knowing before copying this file:
//
//   * Exports read the underlying ROW VALUE, not the rendered node. The status
//     column below exports `Active`, not the markup of the badge.
//   * `actions` (and `select`) are structural ids: never sortable, never
//     hideable, never exported. `enableSorting: false` on it would be
//     redundant.
//   * With `onRowClick` set, interactive content inside a cell must call
//     `event.stopPropagation()` or a button press also opens the row.

import type { TableXReactColumn } from "@tablex/react";

import type { Student } from "./mock-api";

/** Handlers the actions column needs from the page. */
export interface StudentActions {
  onEdit: (student: Student) => void;
  onRemove: (student: Student) => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
});

/** Build the column set. Memoize the result — a new array every render is churn. */
export function studentColumns(actions: StudentActions): TableXReactColumn<Student>[] {
  return [
    {
      accessorKey: "name",
      header: "Student",
      meta: { minWidth: 230, filterable: true, filterPlaceholder: "Search student..." },
      // A cell composed from avatar, name, and email: reach through `row.original`.
      cell: ({ row }) => (
        <div className="cell-user">
          <img
            className="avatar"
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(row.original.name)}`}
            alt={row.original.name}
            width={32}
            height={32}
            loading="lazy"
          />
          <div className="cell-stack">
            <strong>{row.original.name}</strong>
            <small>{row.original.email}</small>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: "Email",
      // Redundant with the cell above, so it starts hidden — the user can still
      // switch it on from the Columns menu, and exports include it when visible.
      meta: { hidden: true, minWidth: 220, filterable: true },
    },
    {
      accessorKey: "department",
      header: "Department",
      meta: {
        minWidth: 160,
        filterable: true,
        filterOptions: [
          "Computer Science",
          "Mechanical",
          "Electrical",
          "Mathematics",
          "Physics",
          "Economics",
        ],
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        align: "center",
        width: 130,
        filterable: true,
        filterOptions: ["Active", "Pending", "Suspended", "Alumni"],
      },
      cell: ({ getValue }) => {
        const status = String(getValue());
        return <span className={`badge badge--${status.toLowerCase()}`}>{status}</span>;
      },
    },
    {
      accessorKey: "score",
      header: "Score",
      meta: { align: "right", width: 90 },
      cell: ({ getValue }) => {
        const score = Number(getValue());
        return <span className={score >= 80 ? "score score--high" : "score"}>{score}</span>;
      },
    },
    {
      accessorKey: "enrolledAt",
      header: "Enrolled",
      meta: { width: 140 },
      // Sorting still happens on the server against the raw ISO value, so the
      // display format is free to be whatever reads best.
      cell: ({ getValue }) => {
        const raw = String(getValue());
        const date = new Date(`${raw}T00:00:00Z`);
        return (
          <time dateTime={raw} title={raw}>
            {dateFormatter.format(date)}
          </time>
        );
      },
    },
    {
      accessorKey: "scholarship",
      header: "Scholarship",
      meta: { align: "center", width: 120 },
      // No `cell`: booleans fall back to the locale's yes/no labels.
    },
    {
      id: "actions",
      header: "",
      meta: { align: "right", width: 130 },
      cell: ({ row }) => (
        <div className="row-actions">
          <button
            type="button"
            className="tbx-btn"
            onClick={(event) => {
              event.stopPropagation();
              actions.onEdit(row.original);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="tbx-btn"
            onClick={(event) => {
              event.stopPropagation();
              actions.onRemove(row.original);
            }}
          >
            Remove
          </button>
        </div>
      ),
    },
  ];
}
