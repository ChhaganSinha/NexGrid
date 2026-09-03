// The data layer. Plain TypeScript with no React in it, so both the route
// handler (`app/api/students/route.ts`) and the server page can call it.
//
// There is deliberately no "use client" and no "server-only" marker here: the
// module is pure data logic, and keeping it framework-free is what lets the
// server page render the first page directly instead of round-tripping through
// its own HTTP endpoint. It is not imported by any client file, so the 200-row
// dataset below never reaches the browser bundle — the shared type and the
// status list live in ./student-types.ts for exactly that reason.
//
// A real app swaps `queryStudents` for a database query. The ORDER is the part
// worth copying: search and filter decide WHICH rows match, so they run before
// the count that draws the pager; sort decides what the page window slices.

import type { PagedResponse, QueryState } from "@nexgrid/core";

import { DEPARTMENTS, STATUSES, type Student } from "./student-types";

type StudentField = keyof Student;

// The allowlists. Column ids arrive from a public query string, so nothing is
// sortable, searchable or filterable unless it is named here — the same
// boundary `TableXQueryOptions<T>` draws on the ASP.NET Core side.
const SORTABLE: readonly StudentField[] = [
  "name",
  "email",
  "department",
  "status",
  "score",
  "enrolledAt",
  "scholarship",
];
const SEARCHABLE: readonly StudentField[] = ["name", "email", "department"];
const FILTERABLE: readonly StudentField[] = ["status", "department"];

const FIRST_NAMES = [
  "Aditi", "Rahul", "Meera", "Jonas", "Priya", "Chen", "Sofia", "Omar",
  "Elena", "Tomas", "Nadia", "Hiroshi", "Grace", "Malik", "Ingrid", "Yusuf",
  "Clara", "Diego", "Anika", "Peter",
];

const LAST_NAMES = [
  "Sharma", "Okafor", "Lindqvist", "Alvarez", "Tanaka", "Fitzgerald", "Novak",
  "Haddad", "Kowalski", "Mbeki", "Rossi", "Andersen", "Duarte", "Volkov",
];

/** A sine hash: reproducible pseudo-randomness in `[0, 1)` with no state. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pick<T>(values: readonly T[], index: number, fallback: T): T {
  return values[index % values.length] ?? fallback;
}

function buildStudents(count: number): Student[] {
  const rows: Student[] = [];

  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES, i * 7 + 3, "Alex");
    const last = pick(LAST_NAMES, i * 5 + 1, "Doe");
    const department = pick(DEPARTMENTS, i * 5 + 2, "Computer Science");
    const status = pick(STATUSES, Math.floor(pseudoRandom(i + 1) * STATUSES.length), "Active");

    const day = new Date(Date.UTC(2021, 0, 1));
    day.setUTCDate(day.getUTCDate() + i * 7 + (i % 5));

    rows.push({
      id: 1000 + i,
      name: `${first} ${last}`,
      email: `${first}.${last}${i}`.toLowerCase() + "@example.edu",
      department,
      status,
      score: Math.round(45 + pseudoRandom(i + 101) * 55),
      enrolledAt: day.toISOString().slice(0, 10),
      scholarship: pseudoRandom(i + 7) > 0.68,
    });
  }

  return rows;
}

/** The 200-row dataset, generated once per server process. */
export const STUDENTS: readonly Student[] = buildStudents(200);

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isAllowed(field: string, allowlist: readonly StudentField[]): field is StudentField {
  return (allowlist as readonly string[]).includes(field);
}

/** Apply a `QueryState` to the dataset and return exactly one page. */
export function queryStudents(
  query: QueryState,
  rows: readonly Student[] = STUDENTS,
): PagedResponse<Student> {
  let matching = rows.slice();

  // 1. Global search across the searchable columns.
  const term = query.q?.trim().toLowerCase();
  if (term) {
    matching = matching.filter((row) =>
      SEARCHABLE.some((field) => String(row[field]).toLowerCase().includes(term)),
    );
  }

  // 2. Column filters (`filter[status]=Active`), equality, allowlisted.
  for (const [field, value] of Object.entries(query.filter ?? {})) {
    if (!value || !isAllowed(field, FILTERABLE)) continue;
    const wanted = value.toLowerCase();
    matching = matching.filter((row) => String(row[field]).toLowerCase() === wanted);
  }

  // 3. Sort. Unknown fields are dropped, exactly as the server allowlist does.
  const sorts = query.sort.filter((spec) => isAllowed(spec.field, SORTABLE));
  matching.sort((left, right) => {
    for (const spec of sorts) {
      const field = spec.field as StudentField;
      const result = compare(left[field], right[field]);
      if (result !== 0) return spec.dir === "desc" ? -result : result;
    }
    // A stable tiebreaker, so paging never shows the same row twice.
    return left.id - right.id;
  });

  // 4. Page. `total` is the FILTERED count, and the page is clamped so a stale
  //    bookmark pointing past the end shows the last page.
  const total = matching.length;
  const pageSize = query.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: matching.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

/** Pretend the database is somewhere else, so the loading state is visible. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
