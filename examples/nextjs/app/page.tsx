// A SERVER component. No "use client" anywhere in this file.
//
// It renders the first page on the server — the grid arrives with rows already
// in it, no loading flash — and then hands over to the client component for
// everything interactive.
//
// The boundary rule, which is the single most common Next.js mistake with any
// grid: PROPS CROSS THE BOUNDARY, FUNCTIONS DO NOT. `initial` below is plain
// JSON and serializes fine. A column definition contains `cell` render
// functions, so it must be created inside a "use client" module (see
// ./columns.tsx) — defining columns here and passing them down fails at
// runtime with "Functions cannot be passed directly to Client Components".

import { defaultQuery } from "@nexgrid/core";

import { queryStudents } from "@/lib/students";

import { StudentsGrid } from "./students-grid";

// The first page is rendered per request rather than baked in at build time.
export const dynamic = "force-dynamic";

export default async function Page() {
  // Called directly — a server component has no reason to HTTP-request its own
  // route handler. `/api/students` exists for the client component, which does.
  const initial = queryStudents(defaultQuery());

  return (
    <main className="page">
      <h1>NexGrid — Next.js App Router</h1>
      <p>
        This page is a Server Component. It renders the first page of 200 students on the server
        and passes it to a Client Component, which takes over every interaction and fetches
        subsequent pages from <code>/api/students</code>.
      </p>

      <p className="boundary-note">
        <strong>The &quot;use client&quot; boundary.</strong> <code>app/page.tsx</code> (this file)
        is a server file: it may query the database, but it may not pass functions down.{" "}
        <code>app/students-grid.tsx</code> and <code>app/columns.tsx</code> start with{" "}
        <code>&quot;use client&quot;</code> because they hold state and render functions.{" "}
        <code>&lt;NexGrid /&gt;</code> itself is published with a <code>&quot;use client&quot;</code>{" "}
        banner, so importing it needs no wrapper — but the <em>columns you give it</em> do.
      </p>

      <StudentsGrid initial={initial} />
    </main>
  );
}
