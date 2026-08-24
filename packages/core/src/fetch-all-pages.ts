// Collect every row of a server-paginated list by walking its pages.
//
// WHY THIS EXISTS: well-behaved list endpoints clamp `pageSize` to an
// allowlist, so asking for `pageSize=5000` does NOT return 5000 rows — it
// silently returns a default-sized page. Exports that want "the whole
// filtered dataset" therefore walk pages at the largest allowlisted size,
// and report whether they actually reached the end so callers can be honest
// when they did not.

import type { PagedResponse } from "./types.js";

/** The largest value the page-size allowlist accepts. */
export const MAX_PAGE_SIZE = 100;

/**
 * Hard ceiling on rows collected, so a very large dataset can never turn one
 * export into an unbounded fetch loop. 20 requests at 100 rows.
 */
export const DEFAULT_ROW_CAP = 2000;

export interface AllPages<T> {
  items: T[];
  /** The server's true total, independent of how many rows were collected. */
  total: number;
  /** False when the cap stopped collection early — surface this to the user. */
  complete: boolean;
}

/**
 * Walk every page of a list endpoint.
 *
 * @param fetchPage Issues one request for the given 1-based page and size.
 * @param cap Stop after this many rows (default {@link DEFAULT_ROW_CAP}).
 * @throws Whatever `fetchPage` throws — callers decide how to degrade.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PagedResponse<T>>,
  cap: number = DEFAULT_ROW_CAP,
): Promise<AllPages<T>> {
  const items: T[] = [];
  let total = 0;
  let page = 1;

  for (;;) {
    const response = await fetchPage(page, MAX_PAGE_SIZE);
    total = response.total ?? items.length;
    const batch = response.items ?? [];
    items.push(...batch);

    // Stop on: reached the total, an empty/short page (server said that's all),
    // or the safety cap. The short-page check also protects against a server
    // whose `total` disagrees with what it actually returns.
    if (
      items.length >= total ||
      batch.length === 0 ||
      batch.length < MAX_PAGE_SIZE ||
      items.length >= cap
    ) {
      break;
    }
    page++;
  }

  return { items, total, complete: items.length >= total };
}
