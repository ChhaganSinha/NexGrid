"use client";

// The client half of the boundary.
//
// `<NexGrid />` is published with its own "use client" banner, so it can be
// imported from a Server Component without a wrapper. This file exists for the
// other reasons: it holds state (`useState`), it passes render functions
// (`columns`, `toolbarActions`), and it fetches on interaction.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NexGrid,
  defaultQuery,
  serializeQuery,
  withFilter,
  type NexGridNotice,
  type PagedResponse,
  type QueryState,
} from "@nexgrid/react";

// Imported from the shared types module, NOT from lib/students.ts — that one
// builds the dataset at import time and belongs on the server only.
import { STATUSES, type Student } from "@/lib/student-types";

import { studentColumns } from "./columns";

/** `initial` is plain JSON, so it crosses the server/client boundary happily. */
export function StudentsGrid({ initial }: { initial: PagedResponse<Student> }) {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Student>>(initial);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<NexGridNotice | null>(null);

  // The server already rendered page 1 for the default query, so the first
  // effect run must not refetch it.
  const isFirstRun = useRef(true);
  // Tickets: discard a response that a newer request has already superseded.
  const requestId = useRef(0);

  const load = useCallback(async (next: QueryState) => {
    const ticket = ++requestId.current;
    setIsLoading(true);
    setError(false);
    try {
      // serializeQuery writes the exact format route.ts parses back:
      // ?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active
      const response = await fetch(`/api/students?${serializeQuery(next)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as PagedResponse<Student>;
      if (ticket !== requestId.current) return;
      setPage(body);
    } catch {
      if (ticket !== requestId.current) return;
      setError(true);
    } finally {
      if (ticket === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    void load(query);
  }, [load, query]);

  // `columns` is created here rather than memoized at module scope only because
  // it closes over a handler; `useState` with an initializer keeps it stable
  // across renders without a dependency array to get wrong.
  const [columns] = useState(() =>
    studentColumns({
      onEdit: (student) =>
        setNotice({ type: "info", message: `Edit ${student.name} (#${student.id})` }),
    }),
  );

  const statusFilter = query.filter?.status ?? "";

  return (
    <>
      <NexGrid<Student>
        caption="Students"
        columns={columns}
        data={page.items}
        total={page.total}
        query={query}
        onQueryChange={setQuery}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load(query)}
        enableSelection
        exportFileName="students"
        // With an endpoint to page through, an export can cover the WHOLE
        // filtered dataset instead of just the visible page.
        fetchEndpoint="/api/students"
        searchPlaceholder="Search name, email or department…"
        onNotify={setNotice}
        onRowClick={(student) =>
          setNotice({ type: "info", message: `Opened ${student.name} (#${student.id})` })
        }
        toolbarActions={
          <label>
            <span className="nxg-sr-only">Filter by status</span>
            <select
              className="nxg-rows-select"
              value={statusFilter}
              onChange={(event) => {
                const value = event.target.value;
                // The grid renders no filter UI — the host owns filters and
                // expresses them through the same QueryState.
                setQuery((current) =>
                  withFilter(current, "status", value === "" ? undefined : value),
                );
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <footer className="page-foot">
        <p>
          Request: <code>GET /api/students?{serializeQuery(query)}</code>
        </p>
        {notice ? <p role="status">{notice.message}</p> : null}
      </footer>
    </>
  );
}
