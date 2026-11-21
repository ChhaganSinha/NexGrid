import { computed, ref, toValue, type MaybeRefOrGetter } from "vue";
import {
  defaultQuery,
  queryClientData,
  type ClientQueryOptions,
  type QueryState,
} from "@nexgrid/core";

/** Options for {@link useClientTableX}. */
export interface UseClientTableXOptions<TData> extends ClientQueryOptions<TData> {
  /** Optional initial query state overrides. */
  initialQuery?: Partial<QueryState>;
}
export type UseClientNexGridOptions<TData> = UseClientTableXOptions<TData>;

/**
 * Vue 3 composable for reactive in-memory client-side grid operations
 * (search, multi-column sort, column filters, pagination, and full-dataset export).
 */
export function useClientTableX<TData>(
  allDataSource: MaybeRefOrGetter<readonly TData[]>,
  options?: UseClientTableXOptions<TData>,
) {
  const query = ref<QueryState>({
    ...defaultQuery(),
    ...options?.initialQuery,
  });

  const allData = computed(() => toValue(allDataSource));
  const paged = computed(() => queryClientData(allData.value, query.value, options));
  const data = computed(() => paged.value.items);
  const total = computed(() => paged.value.total);
  const page = computed(() => paged.value.page);
  const pageSize = computed(() => paged.value.pageSize);
  const totalPages = computed(() => paged.value.totalPages);

  const setQuery = (next: QueryState): void => {
    query.value = next;
  };

  const fetchAllData = (q: QueryState): TData[] =>
    queryClientData(allData.value, q, { ...options, paginate: false }).items;

  return {
    data,
    allData,
    fetchAllData,
    total,
    query,
    onQueryChange: setQuery,
    page,
    pageSize,
    totalPages,
    setQuery,
  };
}

export const useClientNexGrid = useClientTableX;
