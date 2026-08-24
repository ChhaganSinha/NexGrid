import { useMemo, useState } from "react";
import {
  defaultQuery,
  queryClientData,
  type ClientQueryOptions,
  type QueryState,
} from "@nexgrid/core";

/** Options for {@link useClientNexGrid}. */
export interface UseClientNexGridOptions<TData> extends ClientQueryOptions<TData> {
  /** Optional initial query state overrides. */
  initialQuery?: Partial<QueryState>;
}

/**
 * React hook for effortless in-memory client-side grid operations.
 *
 * Automatically manages search, sorting, column filtering, and pagination
 * over a client-side dataset array.
 *
 * @example
 * ```tsx
 * export function StudentsGrid({ allStudents }: { allStudents: Student[] }) {
 *   const grid = useClientNexGrid(allStudents);
 *
 *   return (
 *     <NexGrid
 *       caption="Students"
 *       columns={columns}
 *       {...grid}
 *     />
 *   );
 * }
 * ```
 */
export function useClientNexGrid<TData>(
  allData: readonly TData[],
  options?: UseClientNexGridOptions<TData>,
) {
  const [query, setQuery] = useState<QueryState>(() => ({
    ...defaultQuery(),
    ...options?.initialQuery,
  }));

  const page = useMemo(
    () => queryClientData(allData, query, options),
    [allData, query, options],
  );

  return {
    data: page.items,
    total: page.total,
    query,
    onQueryChange: setQuery,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    setQuery,
  };
}
