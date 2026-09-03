// GET /api/students — the endpoint half of the TableX contract.
//
// The whole server-side parse is one line: `parseQuery` reads the exact wire
// format `serializeQuery` writes, and degrades instead of failing. A
// hand-edited `?page=abc&pageSize=99999&sort=;drop table` produces page 1, the
// default page size, and a sort token the allowlist in lib/students.ts drops —
// never a 400 in the middle of a paginated table.
//
// The response shape is `PagedResponse<T>`:
//   { items, page, pageSize, total, totalPages }
// where `total` is the FULL filtered count. That is what draws the pager.

import { parseQuery } from "@nexgrid/core";

import { delay, queryStudents } from "@/lib/students";

// The result depends entirely on the query string, so it must never be
// statically rendered at build time.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);

  // `parseQuery` accepts a URLSearchParams or a raw query string.
  const query = parseQuery(searchParams);

  await delay(280); // stand-in for a database round trip

  const page = queryStudents(query);

  return Response.json(page, {
    headers: { "Cache-Control": "no-store" },
  });
}
