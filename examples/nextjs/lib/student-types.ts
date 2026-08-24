// Types and constants that BOTH sides of the boundary need.
//
// Kept apart from lib/students.ts on purpose. That module builds a 200-row
// dataset at import time; a client component importing a single constant from
// it would drag the whole generator into the browser bundle. Types are erased
// at compile time and these two arrays are a handful of strings, so this file
// is safe to import from anywhere.

/** The row type this example pages through. */
export interface Student {
  id: number;
  name: string;
  email: string;
  department: string;
  status: StudentStatus;
  score: number;
  /** ISO-8601 date (`YYYY-MM-DD`), which sorts correctly as plain text. */
  enrolledAt: string;
  scholarship: boolean;
}

export type StudentStatus = "Active" | "Pending" | "Suspended" | "Alumni";

/** Values the toolbar's status filter offers. */
export const STATUSES: readonly StudentStatus[] = ["Active", "Pending", "Suspended", "Alumni"];

/** Departments in the dataset. */
export const DEPARTMENTS: readonly string[] = [
  "Computer Science",
  "Mechanical",
  "Electrical",
  "Mathematics",
  "Physics",
  "Economics",
];
