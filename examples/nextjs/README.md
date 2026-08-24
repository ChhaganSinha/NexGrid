# NexGrid — Next.js App Router example

A Next.js 15 App Router app showing the three pieces a real integration needs:

1. **A Server Component page** (`app/page.tsx`) that renders the first page of
   data on the server, so the grid arrives with rows already in it.
2. **A Client Component grid** (`app/students-grid.tsx`) that owns the
   `QueryState` and fetches every page after the first.
3. **A route handler** (`app/api/students/route.ts`) that parses the incoming
   query with `parseQuery` from `@nexgrid/core` and answers with a
   `PagedResponse`.

## Run it

The example links the packages straight out of this repository, so build them
first:

```bash
# from the repository root
npm install
npm run build          # produces packages/*/dist

# then, in this folder
cd examples/nextjs
npm install
npm run dev            # http://localhost:3000
```

`package.json` resolves `@nexgrid/react` and `@nexgrid/core` with `file:`
specifiers plus an `overrides` block (so the transitive `@nexgrid/core` also
resolves locally). In your own app those are just `"0.1.0"`, and
`next.config.mjs` needs nothing at all — the `outputFileTracingRoot` line only
exists because of the local symlinks.

---

## The `"use client"` boundary

This is where most Next.js grid integrations go wrong, so it is worth being
precise about which file needs the directive and why.

```text
app/layout.tsx        server   imports @nexgrid/react/styles.css  (build-time, fine)
app/page.tsx          server   queries the data, renders <StudentsGrid initial={…} />
app/students-grid.tsx CLIENT   holds QueryState, fetches, passes render functions
app/columns.tsx       CLIENT   cell renderers — functions, so they cannot cross
lib/students.ts       server   the dataset + queryStudents()
lib/student-types.ts  shared   types and constants only, safe on both sides
app/api/students/     server   route handler: parseQuery -> PagedResponse
```

**`<NexGrid />` itself does not need a wrapper.** The published bundle starts
with a `"use client"` banner, so a Server Component can import it directly.

**Your columns do.** A column's `cell` is a function, and functions cannot be
serialized across the boundary. Define columns in a server file and you get:

```text
Error: Functions cannot be passed directly to Client Components unless you
explicitly expose it by marking it with "use server".
```

`app/columns.tsx` therefore starts with `"use client"`. The same applies to
`toolbarActions`, `onRowClick`, `onQueryChange`, `getRowId`, and any other prop
that is a function — which in practice means the component that renders the grid
is a client component.

**Data crosses fine.** `initial` in `app/page.tsx` is a plain
`PagedResponse<Student>` — JSON, no functions — so the server can render page 1
and hand it to the client for hydration. The client's first effect run skips the
fetch because the data is already there.

**Keep the dataset off the client.** `lib/students.ts` builds 200 rows at import
time; importing even one constant from it inside a client file would pull the
generator into the browser bundle. The shared `Student` type and the status list
live in `lib/student-types.ts` instead. (Add the `server-only` package as a
tripwire if you want that mistake to fail the build.)

---

## The route handler

The entire server-side parse is one call:

```ts
import { parseQuery } from "@nexgrid/core";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const query = parseQuery(searchParams);          // QueryState
  return Response.json(queryStudents(query));      // PagedResponse<Student>
}
```

`parseQuery` reads exactly what `serializeQuery` writes:

```text
GET /api/students?page=2&pageSize=25&sort=name:asc&q=smith&filter[status]=Active

{ "items": [...], "page": 2, "pageSize": 25, "total": 137, "totalPages": 6 }
```

It never throws. A bad page becomes 1, an unsupported page size becomes the
default, a malformed sort token is dropped — so a hand-edited URL produces a
usable grid rather than a 400 in the middle of a table.

`export const dynamic = "force-dynamic"` matters: the response depends entirely
on the query string, so it must not be statically rendered at build time.

### Sorting and filtering are allowlisted

`lib/students.ts` only sorts and filters on fields it names in `SORTABLE`,
`SEARCHABLE` and `FILTERABLE`. Column ids arrive from a public URL — anyone can
ask to sort by `passwordHash`. Never reflect a query-string value into a
property access or a SQL fragment. (`NexGrid.AspNetCore` makes the same rule
structural with `.Sortable(...)` / `.Filterable(...)`; see
`examples/aspnet-mvc`.)

---

## Putting the query in the URL

`QueryState` round-trips through a query string, so making the grid shareable
and back-button-friendly is a swap of the state hook:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { parseQuery, serializeQuery } from "@nexgrid/react";

const searchParams = useSearchParams();
const router = useRouter();
const query = useMemo(() => parseQuery(searchParams.toString()), [searchParams]);

<NexGrid
  query={query}
  onQueryChange={(next) => router.replace(`?${serializeQuery(next)}`)}
  {…rest}
/>;
```

With that in place the server page can read `searchParams` and render the
*requested* page rather than always page 1.
