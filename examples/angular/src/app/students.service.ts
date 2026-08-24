// A fake list endpoint that speaks NexGrid's contract, wrapped in an
// Observable so it drops into an Angular app exactly where `HttpClient` would.
//
// The rules a real endpoint has to follow are all visible here:
//
//   1. Search and filter FIRST — they decide which rows match.
//   2. `total` is the filtered count across every page. That is what draws the
//      pager; returning `items.length` collapses the grid to one page.
//   3. Sort, then slice the page window out of the ordered set.
//   4. Only sort/filter on ALLOWLISTED fields. Column ids arrive from the URL
//      and are untrusted.
//
// Swapping this for a real API is a one-method change — see the README.

import { Injectable } from "@angular/core";
import type { PagedResponse, QueryState } from "@nexgrid/angular";
import { Observable, delay, of } from "rxjs";

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

export const STATUSES: readonly StudentStatus[] = ["Active", "Pending", "Suspended", "Alumni"];

export const DEPARTMENTS: readonly string[] = [
  "Computer Science",
  "Mechanical",
  "Electrical",
  "Mathematics",
  "Physics",
  "Economics",
];

type StudentField = keyof Student;

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

/** Simulated network latency, in milliseconds. */
const LATENCY_MS = 320;

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

@Injectable({ providedIn: "root" })
export class StudentsService {
  private readonly students: readonly Student[] = buildStudents(200);

  private failNext = false;

  /** Make the next `page()` call error, to demo the grid's error card. */
  breakNextRequest(): void {
    this.failNext = true;
  }

  /**
   * One page of students for a `QueryState`.
   *
   * Against a real API this becomes:
   *
   * ```ts
   * page(query: QueryState) {
   *   return this.http.get<PagedResponse<Student>>(buildQueryUrl("/api/students", query));
   * }
   * ```
   */
  page(query: QueryState): Observable<PagedResponse<Student>> {
    if (this.failNext) {
      this.failNext = false;
      return new Observable<PagedResponse<Student>>((subscriber) => {
        const timer = setTimeout(
          () => subscriber.error(new Error("Mock API: simulated network failure")),
          LATENCY_MS,
        );
        return () => clearTimeout(timer);
      });
    }

    return of(this.query(query)).pipe(delay(LATENCY_MS));
  }

  /** The synchronous core: apply search -> filter -> sort -> count -> page. */
  private query(query: QueryState): PagedResponse<Student> {
    let matching = this.students.slice();

    const term = query.q?.trim().toLowerCase();
    if (term) {
      matching = matching.filter((row) =>
        SEARCHABLE.some((field) => String(row[field]).toLowerCase().includes(term)),
      );
    }

    for (const [field, value] of Object.entries(query.filter ?? {})) {
      if (!value || !isAllowed(field, FILTERABLE)) continue;
      const wanted = value.toLowerCase();
      matching = matching.filter((row) => String(row[field]).toLowerCase() === wanted);
    }

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
}
