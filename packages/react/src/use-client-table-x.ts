import { useMemo, useState } from "react";
import {
  defaultQuery,
  queryClientData,
  type ClientQueryOptions,
  type QueryState,
} from "@tablex/core";

/** Options for {@link useClientTableX}. */
export interface UseClientTableXOptions<TData> extends ClientQueryOptions<TData> {
  /** Optional initial query state overrides. */
  initialQuery?: Partial<QueryState>;
}
export type UseClientNexGridOptions<TData> = UseClientTableXOptions<TData>;

/**
 * React hook for effortless in-memory client-side grid operations.
 *
 * Automatically manages search, sorting, column filtering, and pagination
 * over a client-side dataset array.
 *
 * @example
 * ```tsx
 * export function StudentsGrid({ allStudents }: { allStudents: Student[] }) {
 *   const grid = useClientTableX(allStudents);
 *
 *   return (
 *     <TableX
 *       caption="Students"
 *       columns={columns}
 *       {...grid}
 *     />
 *   );
 * }
 * ```
 */
export function useClientTableX<TData>(
  allData: readonly TData[],
  options?: UseClientTableXOptions<TData>,
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

export const useClientNexGrid = useClientTableX;
