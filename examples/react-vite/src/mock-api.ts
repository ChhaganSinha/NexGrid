// A fake list endpoint that speaks TableX's contract.
//
// This file is the whole point of the example. TableX is server-driven: it
// hands you a `QueryState` and expects a `PagedResponse<T>` back. Whether that
// round trip crosses a network is irrelevant to the grid, so a plain function
// over an in-memory array is a complete, honest server — and it makes the rules
// a real endpoint has to follow visible in twenty lines:
//
//   1. Search and filter FIRST — they decide which rows match.
//   2. Count the matches. `total` is the filtered count across every page; it
//      is what draws the pager. Returning `items.length` collapses the grid to
//      one page.
//   3. Sort, then slice the page window out of the ordered set.
//   4. Only sort/filter on ALLOWLISTED fields. Column ids arrive from the URL
//      and are untrusted — `TableX.AspNetCore` makes the same rule structural
//      with `.Sortable(...)` / `.Filterable(...)`.

import type { PagedResponse, QueryState } from "@tablex/core";

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

/** Values the status filter offers. */
export const STATUSES: readonly StudentStatus[] = ["Active", "Pending", "Suspended", "Alumni"];

/** Values the department filter offers. */
export const DEPARTMENTS: readonly string[] = [
  "Computer Science",
  "Mechanical",
  "Electrical",
  "Mathematics",
  "Physics",
  "Economics",
];

type StudentField = keyof Student;

/** Columns a `sort=<field>:dir` token may name. Anything else is dropped. */
const SORTABLE: readonly StudentField[] = [
  "name",
  "email",
  "department",
  "status",
  "score",
  "enrolledAt",
  "scholarship",
];

/** Columns the global search looks at. */
const SEARCHABLE: readonly StudentField[] = ["name", "email", "department"];

/** Columns a `filter[<field>]=value` may name. */
const FILTERABLE: readonly StudentField[] = [
  "name",
  "email",
  "department",
  "status",
  "score",
  "enrolledAt",
  "scholarship",
];

/** Check if a cell value matches a column filter criteria (smart text, numeric, date, boolean). */
function matchesFilterValue(val: unknown, filterVal: string): boolean {
  if (val === null || val === undefined) return false;
  const rawStr = String(val).trim().toLowerCase();
  const wanted = filterVal.trim().toLowerCase();
  if (rawStr === wanted) return true;
  if (rawStr.includes(wanted)) return true;

  // Percentage / numeric matching: e.g. val is 63 or 63.0, filterVal is "63%" or "63" or "63.0%"
  const cleanWanted = wanted.replace(/%/g, "").trim();
  const cleanRaw = rawStr.replace(/%/g, "").trim();
  if (cleanRaw === cleanWanted || cleanRaw.includes(cleanWanted)) return true;

  const numVal = Number(cleanRaw);
  const numWanted = Number(cleanWanted);
  if (!Number.isNaN(numVal) && !Number.isNaN(numWanted) && numVal === numWanted) {
    return true;
  }

  // Boolean matching: "true" / "yes" vs true, "false" / "no" vs false
  if (typeof val === "boolean") {
    if (val && (wanted === "true" || wanted === "yes" || wanted === "active")) return true;
    if (!val && (wanted === "false" || wanted === "no")) return true;
  }

  // Date matching: e.g. val is "2023-04-12"
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val + "T00:00:00Z");
    if (!Number.isNaN(d.getTime())) {
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const fullMonthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      const m = d.getUTCMonth();
      const formatted = `${monthNames[m]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`.toLowerCase();
      const formattedFull = `${fullMonthNames[m]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`.toLowerCase();
      if (formatted.includes(wanted) || formattedFull.includes(wanted)) return true;
    }
  }

  return false;
}

/** Simulated network latency, in milliseconds. */
export const LATENCY_MS = 320;

// ---------------------------------------------------------------------------
// The dataset — 200 rows, generated deterministically so every reload, every
// export and every screenshot shows the same data.
// ---------------------------------------------------------------------------

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

const HERO_STUDENTS: Student[] = [
  { id: 1, name: "Abne Smith", email: "abnesmith@gmail.com", department: "Computer Science", status: "Active", score: 63.0, enrolledAt: "2023-04-12", scholarship: true },
  { id: 2, name: "Bnan Mitun", email: "nnanmmav@gmail.com", department: "Electrical", status: "Pending", score: 64.0, enrolledAt: "2023-04-13", scholarship: false },
  { id: 3, name: "Darry Smith", email: "enithamith@gmail.com", department: "Mechanical", status: "Alumni", score: 90.7, enrolledAt: "2023-04-12", scholarship: false },
  { id: 4, name: "Davy Name", email: "daryname@gmail.com", department: "Mechanical", status: "Alumni", score: 93.0, enrolledAt: "2023-04-13", scholarship: true },
  { id: 6, name: "Maval Hamason", email: "parnanisv@gmail.com", department: "Computer Science", status: "Suspended", score: 79.0, enrolledAt: "2023-04-13", scholarship: false },
  { id: 7, name: "Jaran Jomin", email: "jaransmith@gmail.com", department: "Electrical", status: "Active", score: 88.6, enrolledAt: "2023-04-12", scholarship: false },
  { id: 8, name: "Saran Smith", email: "saramillf@gmail.com", department: "Mechanical", status: "Pending", score: 95.5, enrolledAt: "2023-04-13", scholarship: true },
  { id: 10, name: "David Vollin", email: "davivolin@gmail.com", department: "Computer Science", status: "Suspended", score: 80.0, enrolledAt: "2023-01-11", scholarship: false },
];

function buildStudents(count: number): Student[] {
  const rows: Student[] = [...HERO_STUDENTS];

  for (let i = HERO_STUDENTS.length; i < count; i++) {
    const first = pick(FIRST_NAMES, i * 7 + 3, "Alex");
    const last = pick(LAST_NAMES, i * 5 + 1, "Doe");
    const name = `${first} ${last}`;
    const department = pick(DEPARTMENTS, i * 5 + 2, "Computer Science");
    const status = pick(STATUSES, Math.floor(pseudoRandom(i + 1) * STATUSES.length), "Active");

    // Spread enrolment across roughly four years, oldest first.
    const day = new Date(Date.UTC(2021, 0, 1));
    day.setUTCDate(day.getUTCDate() + i * 7 + (i % 5));

    rows.push({
      id: 1000 + i,
      name,
      email: `${first}.${last}${i}`.toLowerCase() + "@example.edu",
      department,
      status,
      score: parseFloat((45 + pseudoRandom(i + 101) * 55).toFixed(1)),
      enrolledAt: day.toISOString().slice(0, 10),
      scholarship: pseudoRandom(i + 7) > 0.68,
    });
  }

  return rows;
}

/** The full in-memory dataset with 1,284 entries. */
export const STUDENTS: readonly Student[] = buildStudents(1284);

// ---------------------------------------------------------------------------
// The "endpoint"
// ---------------------------------------------------------------------------

/** Case-insensitive, numeric-aware comparison usable on every column type. */
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

/**
 * Answer one `QueryState` from the in-memory dataset.
 *
 * Synchronous and pure — the async wrapper below is only there to make the
 * loading state realistic. Reuse this from a route handler, a test, or a
 * service worker without changing a line.
 */
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

  // 2. Column filters
  for (const [field, value] of Object.entries(query.filter ?? {})) {
    if (!value || !isAllowed(field, FILTERABLE)) continue;
    matching = matching.filter((row) => matchesFilterValue(row[field], value));
  }

  // 3. Sort. Unknown fields are dropped, exactly as the server allowlist does.
  const sorts = query.sort.filter((spec) => isAllowed(spec.field, SORTABLE));
  matching.sort((left, right) => {
    for (const spec of sorts) {
      const field = spec.field as StudentField;
      const result = compare(left[field], right[field]);
      if (result !== 0) return spec.dir === "desc" ? -result : result;
    }
    // A stable tiebreaker. Without one, paging through an "unordered" result
    // can show the same row twice — the same reason `DefaultSort` exists in
    // TableX.AspNetCore.
    return left.id - right.id;
  });

  // 4. Page. `total` is the FILTERED count, and the page is clamped so a stale
  //    bookmark pointing at page 40 of a 3-page result shows the last page.
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

let failNextRequest = false;

/** Make the next `fetchStudents` call reject, to demo the grid's error card. */
export function scheduleFailure(): void {
  failNextRequest = true;
}

/** The async face of the mock API: latency, and an optional failure. */
export function fetchStudents(query: QueryState): Promise<PagedResponse<Student>> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (failNextRequest) {
        failNextRequest = false;
        reject(new Error("Mock API: simulated network failure"));
        return;
      }
      resolve(queryStudents(query));
    }, LATENCY_MS);
  });
}
