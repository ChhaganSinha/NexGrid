# `@nexgrid/core` API reference

The framework-agnostic engine behind every TableX adapter: the server contract,
the column model, the query reducers, pagination math, the wire format, the
export pipeline, and the locale.

```bash
npm install @nexgrid/core
```

```ts
import { defaultQuery, serializeQuery, type QueryState } from "@nexgrid/core";
```

Every adapter already depends on core and re-exports the parts a host normally
needs, so most apps never import this package directly. Import it when you need
something the adapter does not re-export — `fetchAllPages`, `toExportColumns`,
`getCellText`, `DENSITY_ROW_HEIGHT`.

The stylesheet ships here too:

```css
@import "@nexgrid/core/styles.css";
```

- [Server contract](#server-contract)
- [Column model](#column-model)
- [Query reducers](#query-reducers)
- [Pagination presentation](#pagination-presentation)
- [Wire format](#wire-format)
- [Full-dataset collection](#full-dataset-collection)
- [Export engine](#export-engine)
- [Locale](#locale)
- [Complete export list](#complete-export-list)

## Server contract

```ts
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 10;
export function isPageSize(n: number): n is PageSize;

export type SortDir = "asc" | "desc";
export interface SortSpec {
  field: string;
  dir: SortDir;
}

export interface QueryState {
  page: number;                       // 1-based
  pageSize: PageSize;
  sort: SortSpec[];                   // first = primary
  q?: string;
  filter?: Record<string, string>;
}

export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;                      // FULL filtered count
  totalPages: number;
}

export type Density = "compact" | "default" | "comfortable";
export const DENSITIES: readonly Density[] = ["compact", "default", "comfortable"];
export const DENSITY_ROW_HEIGHT: Record<Density, number>;   // 36 / 44 / 52
```

| Member | Notes |
| --- | --- |
| `PAGE_SIZES` | The rows-per-page allowlist. Mirrored server-side by `PageSizes.All`. |
| `isPageSize(n)` | Type guard. `withPageSize` and `parseQuery` both use it. |
| `PageSize` | A union type, so an out-of-range size cannot be constructed in TypeScript. |
| `DENSITY_ROW_HEIGHT` | Informational — the numbers a designer would quote. The CSS applies padding, not a fixed height. |

`total` is the full filtered count, not `items.length`. See
[Concepts](../concepts.md#the-contract-querystate-and-pagedresponse).

## Column model

```ts
export interface TableXCellContext<TData> {
  row: { original: TData };
  getValue: () => unknown;
}

export interface TableXColumnMeta {
  width?: number;
  minWidth?: number;
  flex?: number;
  align?: "left" | "center" | "right";
  hidden?: boolean;
  hideable?: boolean;
  exportable?: boolean;
  serverFilterable?: boolean;
  serverFilterField?: string;
  filterOptions?: readonly string[];
}

export interface TableXColumn<TData, TRender = unknown> {
  id?: string;
  accessorKey?: string;
  header?: string | ((ctx: Record<string, never>) => TRender);
  cell?: (ctx: TableXCellContext<TData>) => TRender;
  enableSorting?: boolean;
  meta?: TableXColumnMeta;
}

export const STRUCTURAL_COLUMN_IDS: readonly string[];   // ["select", "actions"]
```

### Helpers

| Function | Signature | Behaviour |
| --- | --- | --- |
| `getColumnId` | `(col) => string` | `col.id ?? String(col.accessorKey) ?? ""`. |
| `isStructuralColumn` | `(col) => boolean` | Id is `select` or `actions`. |
| `getColumnTitle` | `(col) => string` | The `header` string; otherwise the id, title-cased; otherwise `""`. |
| `getCellValue` | `(col, row) => unknown` | `row[getColumnId(col)]`, or `undefined` when the id is empty. |
| `getCellText` | `(value, labels?) => string` | Plain-text rendering — see below. |
| `isSortable` | `(col) => boolean` | `enableSorting !== false`, id non-empty, not structural. |
| `isHideable` | `(col) => boolean` | `meta.hideable !== false`, id non-empty, not structural. |
| `isExportable` | `(col) => boolean` | `meta.exportable !== false`, id non-empty, not structural. |
| `isPinned` | `(col) => "left" \| "right" \| false` | Check if column has `meta.pinned`. |
| `isEditable` | `(col) => boolean` | Check if column has `meta.editable === true`. |
| `computeAggregation` | `(col, rows) => string \| number \| null` | Compute aggregation total / average / count / min / max / custom across rows. |
| `isFilterable` | `(col, globalFilterable?) => boolean` | Check if column is filterable. |
| `initialHiddenColumns` | `(columns) => Record<string, boolean>` | Map of ids with `meta.hidden === true`. |
| `visibleColumns` | `(columns, hidden) => TableXColumn[]` | Filters out ids marked `true` in `hidden`. Columns with no id are kept. |

```ts
export function getCellText(
  value: unknown,
  labels: { yes: string; no: string } = { yes: "Yes", no: "No" },
): string;
```

| Value | Result |
| --- | --- |
| `null` / `undefined` | `""` |
| `true` / `false` | `labels.yes` / `labels.no` |
| an object or array | `JSON.stringify(value)` |
| anything else | `String(value)` |

```ts
import {
  getCellText,
  getColumnTitle,
  initialHiddenColumns,
  visibleColumns,
  type TableXColumn,
} from "@nexgrid/core";

interface Student {
  id: number;
  name: string;
  active: boolean;
}

const columns: TableXColumn<Student, string>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "active", header: "Active" },
  { accessorKey: "id", header: "Id", meta: { hidden: true } },
];

const hidden = initialHiddenColumns(columns);       // { id: true }
const shown = visibleColumns(columns, hidden);      // name, active
shown.map(getColumnTitle);                          // ["Name", "Active"]
getCellText(true, { yes: "Oui", no: "Non" });       // "Oui"
```

More: [Columns](../columns.md).

## Query reducers

The only supported way to mutate a `QueryState`. They are what guarantee
identical behaviour across adapters.

```ts
export function defaultQuery(): QueryState;
export function primarySort(query: QueryState): SortSpec | undefined;
export function withToggledSort(query: QueryState, field: string): QueryState;
export function withSort(query: QueryState, field: string, dir: SortDir): QueryState;
export function withSearch(query: QueryState, q: string): QueryState;
export function withPage(query: QueryState, page: number, totalPages: number): QueryState;
export function withPageSize(query: QueryState, pageSize: number): QueryState;
export function withFilter(query: QueryState, field: string, value: string | undefined): QueryState;
export function totalPagesFor(total: number, pageSize: number): number;
```

| Function | Effect | Resets to page 1 |
| --- | --- | --- |
| `defaultQuery()` | `{ page: 1, pageSize: 10, sort: [] }` | — |
| `primarySort(query)` | `query.sort[0]`, or `undefined` | — |
| `withToggledSort(query, field)` | Advances `none → asc → desc → none`; a different column starts at `asc` | yes |
| `withSort(query, field, dir)` | Sets exactly one sort | yes |
| `withSearch(query, q)` | `q` when truthy, otherwise the key is removed. No trimming. | yes |
| `withPage(query, page, totalPages)` | `Math.trunc`, clamped to `[1, max(1, totalPages)]` | — |
| `withPageSize(query, pageSize)` | Returns the query **unchanged** when `pageSize` is not in `PAGE_SIZES` | yes |
| `withFilter(query, field, value)` | `undefined` or `""` deletes the key; an emptied map becomes `undefined` | yes |
| `totalPagesFor(total, pageSize)` | `max(1, ceil(max(0, total) / max(1, pageSize)))` | — |

All of them are pure and return a new object; none mutates its input.

```ts
import {
  defaultQuery,
  totalPagesFor,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withToggledSort,
  type QueryState,
} from "@nexgrid/core";

let query: QueryState = defaultQuery();
query = withSearch(query, "smith");                     // q: "smith", page: 1
query = withToggledSort(query, "name");                 // sort: [{ name, asc }]
query = withToggledSort(query, "name");                 // sort: [{ name, desc }]
query = withToggledSort(query, "name");                 // sort: []
query = withPageSize(query, 50);                        // pageSize: 50, page: 1
query = withFilter(query, "status", "Active");          // filter: { status: "Active" }
query = withPage(query, 4, totalPagesFor(1284, query.pageSize));
```

More: [Concepts](../concepts.md#the-reducers-are-the-api).

## Pagination presentation

```ts
export type PageItem = number | "...";
export function getPageNumbers(currentPage: number, totalPages: number): PageItem[];

export interface RecordRange {
  start: number;   // 0 when empty
  end: number;     // 0 when empty
  total: number;
}
export function getRecordRange(page: number, pageSize: number, total: number): RecordRange;

export function serialNumber(page: number, pageSize: number, indexOnPage: number): number;
```

`getPageNumbers` shows seven or fewer pages in full; beyond that, the first
page, the last page, and a window of one page either side of the current page,
with `"..."` in the gaps.

```ts
import { getPageNumbers, getRecordRange, serialNumber } from "@nexgrid/core";

getPageNumbers(1, 5);      // [1, 2, 3, 4, 5]
getPageNumbers(5, 20);     // [1, "...", 4, 5, 6, "...", 20]
getPageNumbers(19, 20);    // [1, "...", 18, 19, 20]

getRecordRange(3, 20, 1284);   // { start: 41, end: 60, total: 1284 }
getRecordRange(1, 20, 0);      // { start: 0, end: 0, total: 0 }

serialNumber(3, 20, 0);        // 41 — row 1 of page 3
```

More: [Pagination](../features/pagination.md).

## Wire format

```ts
export function toSearchParams(query: QueryState): URLSearchParams;
export function serializeQuery(query: QueryState): string;              // no leading "?"
export function parseQuery(input: string | URLSearchParams): QueryState;
export function buildQueryUrl(endpoint: string, query: QueryState): string;
```

`toSearchParams` always writes `page` and `pageSize`, appends one `sort` entry
per `SortSpec`, writes `q` only when truthy, and writes one `filter[field]` per
filter entry.

`parseQuery` accepts a string (with or without a leading `?`) or a
`URLSearchParams`, and degrades rather than throwing — the full table is in
[Server integration](../server-integration.md#parsing-rules).

`buildQueryUrl` preserves parameters already present on the endpoint.

```ts
import { buildQueryUrl, parseQuery, serializeQuery, withSearch, defaultQuery } from "@nexgrid/core";

const query = withSearch(defaultQuery(), "smith");
serializeQuery(query);
// "page=1&pageSize=10&q=smith"

buildQueryUrl("/api/students?cohort=2026", query);
// "/api/students?cohort=2026&page=1&pageSize=10&q=smith"

parseQuery("?page=abc&pageSize=7&sort=name:sideways");
// { page: 1, pageSize: 10, sort: [{ field: "name", dir: "asc" }] }
```

## Full-dataset collection

```ts
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_ROW_CAP = 2000;

export interface AllPages<T> {
  items: T[];
  total: number;        // the server's true total
  complete: boolean;    // false when the cap stopped collection early
}

export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<PagedResponse<T>>,
  cap: number = DEFAULT_ROW_CAP,
): Promise<AllPages<T>>;
```

Walks pages at `MAX_PAGE_SIZE` and stops on the first of: reaching `total`, an
empty page, a page shorter than `MAX_PAGE_SIZE`, or the cap. It throws whatever
`fetchPage` throws — callers decide how to degrade.

Requesting `pageSize=100` rather than `pageSize=999999` is deliberate: a
well-behaved endpoint clamps `pageSize` to an allowlist, so a huge request
returns a default-sized page, and an export would end up with 10 rows labelled
"all".

```ts
import { buildQueryUrl, fetchAllPages, type PagedResponse, type QueryState } from "@nexgrid/core";

interface Student {
  id: number;
  name: string;
}

export async function collectAll(endpoint: string, query: QueryState) {
  const result = await fetchAllPages<Student>(async (page, pageSize) => {
    const response = await fetch(buildQueryUrl(endpoint, { ...query, page, pageSize: 100 }), {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as PagedResponse<Student>;
  }, 10_000);

  if (!result.complete) {
    console.warn(`Collected ${result.items.length} of ${result.total} rows.`);
  }
  return result.items;
}
```

The `pageSize` parameter handed to `fetchPage` is always `MAX_PAGE_SIZE`;
`QueryState.pageSize` is typed as `PageSize`, and `100` is a member, so passing
it through is type-safe.

## Export engine

### Export columns

```ts
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export function toExportColumns<TData, TRender>(
  columns: readonly TableXColumn<TData, TRender>[],
  labels?: { yes: string; no: string },
): ExportColumn<TData>[];
```

Drops structural columns and anything marked `meta.exportable: false`. Values
are read by column id and rendered as plain text — custom cell renderers are
presentation, not data.

### CSV

```ts
export function toCsv<T>(rows: readonly T[], columns: readonly ExportColumn<T>[]): string;
export function downloadCsv<T>(
  filename: string,
  rows: readonly T[],
  columns: readonly ExportColumn<T>[],
): number;
```

RFC 4180, CRLF line endings, quotes doubled inside quoted cells. `downloadCsv`
prepends a UTF-8 BOM, appends `.csv` if missing, and returns the row count
written (`0` outside a browser).

Cells beginning `=`, `+`, `-`, `@`, tab or CR are prefixed with a single quote —
spreadsheet formula-injection defence. See
[Export › Security](../features/export.md#security).

### Excel

```ts
export interface ExcelBadgeRule {
  values: readonly string[];        // matched case-insensitively, exact
  background: string;
  color: string;
}

export const DEFAULT_BADGE_RULES: readonly ExcelBadgeRule[];

export interface ExcelExportOptions<T> {
  filename: string;                 // ".xls" appended if missing
  caption: string;                  // sheet name and document title
  rows: readonly T[];
  columns: readonly ExportColumn<T>[];
  badgeRules?: readonly ExcelBadgeRule[];   // defaults to DEFAULT_BADGE_RULES
  serialHeader?: string;                    // defaults to "S.No."
}

export function toExcelHtml<T>(options: ExcelExportOptions<T>): string;
export function downloadExcel<T>(options: ExcelExportOptions<T>): number;
```

`toExcelHtml` renders the styled `mso` HTML workbook — exposed for testing and
for server-side reuse. `downloadExcel` wraps it in a Blob and triggers the
download, returning the row count (`0` outside a browser).

An empty cell is written as `—`. The sheet name strips `\ / * ? : [ ]` and
truncates to 31 characters.

### Download helpers

```ts
export function downloadBlob(filename: string, blob: Blob): boolean;
export function timestampedFilename(prefix: string, now?: Date): string;
export function filePrefixFromCaption(caption: string): string;
```

| Function | Notes |
| --- | --- |
| `downloadBlob` | Creates an object URL, clicks a temporary anchor, revokes on the next tick. Returns `false` outside a browser. |
| `timestampedFilename("students")` | `"students_export_2026-08-24"` |
| `filePrefixFromCaption("Student Records")` | `"student_records"` |

```ts
import {
  downloadCsv,
  downloadExcel,
  filePrefixFromCaption,
  timestampedFilename,
  toExportColumns,
  type TableXColumn,
} from "@nexgrid/core";

interface Student {
  id: number;
  name: string;
  status: string;
}

const columns: TableXColumn<Student, string>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
];

export function exportStudents(rows: Student[], caption = "Students") {
  const exportColumns = toExportColumns(columns, { yes: "Yes", no: "No" });
  const prefix = filePrefixFromCaption(caption);

  downloadExcel({ filename: prefix, caption, rows, columns: exportColumns });
  downloadCsv(timestampedFilename(prefix), rows, exportColumns);
}
```

More: [Export](../features/export.md).

## Locale

```ts
export interface TableXLocale { /* 36 string keys */ }
export const DEFAULT_LOCALE: TableXLocale;
export function resolveLocale(partial?: Partial<TableXLocale>): TableXLocale;
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string;
```

`resolveLocale` is a shallow merge over the defaults. `formatMessage`
substitutes `{name}` tokens and leaves unknown tokens untouched.

```ts
import { formatMessage, resolveLocale } from "@nexgrid/core";

const locale = resolveLocale({ showingRange: "Affichage de {start} à {end} sur {total}" });
formatMessage(locale.showingRange, { start: 21, end: 40, total: "1 284" });
// "Affichage de 21 à 40 sur 1 284"
```

Every key: [Localization](../localization.md#every-key).

## Complete export list

```ts
// Server contract
export { PAGE_SIZES, DEFAULT_PAGE_SIZE, DENSITY_ROW_HEIGHT, DENSITIES, isPageSize };
export type { PageSize, SortDir, SortSpec, QueryState, PagedResponse, Density };

// Column model
export {
  STRUCTURAL_COLUMN_IDS, getColumnId, getColumnTitle, getCellValue, getCellText,
  isSortable, isHideable, isExportable, isStructuralColumn,
  initialHiddenColumns, visibleColumns,
};
export type { TableXColumn, TableXColumnMeta, TableXCellContext };

// Query reducers
export {
  defaultQuery, primarySort, withToggledSort, withSort, withSearch,
  withPage, withPageSize, withFilter, totalPagesFor,
};

// Pagination presentation
export { getPageNumbers, getRecordRange, serialNumber };
export type { PageItem, RecordRange };

// Wire format
export { toSearchParams, serializeQuery, parseQuery, buildQueryUrl };

// Full-dataset collection
export { fetchAllPages, MAX_PAGE_SIZE, DEFAULT_ROW_CAP };
export type { AllPages };

// Export engine
export { toExportColumns };
export type { ExportColumn };
export { toCsv, downloadCsv };
export { toExcelHtml, downloadExcel, DEFAULT_BADGE_RULES };
export type { ExcelBadgeRule, ExcelExportOptions };
export { downloadBlob, timestampedFilename, filePrefixFromCaption };

// Locale
export { DEFAULT_LOCALE, resolveLocale, formatMessage };
export type { TableXLocale };
```

Package entry points: `.` (ESM + CJS + types), `./styles.css`,
`./package.json`. Node >= 18.

## Related

- [`@nexgrid/react`](react.md) · [`@nexgrid/angular`](angular.md) · [`@nexgrid/vanilla`](vanilla.md) · [`TableX.AspNetCore`](aspnet.md)
- [Concepts](../concepts.md) · [Columns](../columns.md) · [Server integration](../server-integration.md)
