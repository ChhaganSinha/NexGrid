// The whole integration, in one controlled component.
//
// The contract is four props: `data`, `total`, `query`, `onQueryChange`. The
// grid renders exactly the page it is handed and reports intent back — it never
// sorts, filters or paginates locally, so nothing here has to guess what the
// grid did. Hold the query in state, fetch when it changes, feed the answer in.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TableX,
  defaultQuery,
  withFilter,
  type TableXNotice,
  type TableXTheme,
  type PagedResponse,
  type QueryState,
} from "@tablex/react";

import { studentColumns } from "./columns";
import { STATUSES, fetchStudents, scheduleFailure, type Student } from "./mock-api";

export function App() {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Student> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<TableXNotice | null>(null);
  const [theme, setTheme] = useState<TableXTheme>("light");

  // Every fetch gets a ticket. A response whose ticket is no longer the current
  // one is discarded, so a fast sequence of keystrokes can never end with an
  // older page overwriting a newer one.
  const requestId = useRef(0);

  const load = useCallback(async (next: QueryState) => {
    const ticket = ++requestId.current;
    setIsLoading(true);
    setError(false);
    try {
      const response = await fetchStudents(next);
      if (ticket !== requestId.current) return;
      setPage(response);
    } catch {
      if (ticket !== requestId.current) return;
      setError(true);
    } finally {
      if (ticket === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  const columns = useMemo(
    () =>
      studentColumns({
        onEdit: (student) =>
          setNotice({ type: "info", message: `Edit ${student.name} (#${student.id})` }),
        onRemove: (student) =>
          setNotice({ type: "error", message: `Remove ${student.name} (#${student.id})` }),
      }),
    [],
  );

  // Column filters are the host's job: the grid has no filter UI, it just
  // carries `filter[status]=…` in the query. `withFilter` clears the key when
  // the value is empty and resets to page 1 either way.
  const statusFilter = query.filter?.status ?? "";
  const onStatusChange = (value: string) => {
    setQuery((current) => withFilter(current, "status", value === "" ? undefined : value));
  };

  const toolbarActions = (
    <>
      <label className="filter">
        <span className="tbx-sr-only">Filter by status</span>
        <select
          className="tbx-rows-select"
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="tbx-btn"
        onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      >
        {theme === "dark" ? "Light" : "Dark"}
      </button>

      <button
        type="button"
        className="tbx-btn"
        onClick={() => {
          scheduleFailure();
          void load(query);
        }}
      >
        Break next load
      </button>
    </>
  );

  return (
    <main className="page">
      <header className="page-head">
        <h1>TableX — React + Vite</h1>
        <p>
          200 students served by an in-memory mock API that honours the same{" "}
          <code>QueryState</code> a real endpoint would: search, sort, column filter, paging. The
          live query is printed under the grid — watch it change as you interact.
        </p>
      </header>

      <TableX<Student>
        caption="Students"
        columns={columns}
        data={page?.items ?? []}
        total={page?.total ?? 0}
        query={query}
        onQueryChange={setQuery}
        isLoading={isLoading}
        error={error}
        onRetry={() => void load(query)}
        theme={theme}
        enableSelection
        enableColumnFilters
        onSelectionChange={(ids) => setSelectedIds(ids)}
        onRowClick={(student) =>
          setNotice({ type: "info", message: `Opened ${student.name} (#${student.id})` })
        }
        toolbarActions={toolbarActions}
        exportFileName="students"
        // The grid never renders toasts — it hands them to you.
        onNotify={setNotice}
        searchPlaceholder="Search name, email or department…"
      />

      <footer className="page-foot">
        <p>
          Query: <code>{JSON.stringify(query)}</code>
        </p>
        <p>
          Selected ids: <code>{selectedIds.length > 0 ? selectedIds.join(", ") : "none"}</code>
        </p>
        {notice ? (
          <p className={`notice notice--${notice.type}`} role="status">
            {notice.message}
          </p>
        ) : null}
      </footer>
    </main>
  );
}
