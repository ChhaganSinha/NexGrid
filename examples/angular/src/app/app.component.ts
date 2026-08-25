// The whole integration: one standalone component, no NgModule.
//
// `<table-x>` is fully controlled. Every user action — a sort click, a page
// change, a debounced keystroke, a page-size change — arrives as ONE
// `queryChange` carrying a ready-to-send `QueryState`. Fetch it, push `data`
// and `total` back in. The grid never sorts, filters or pages on its own.
//
// Two Angular-specific notes:
//
//  * A column's `cell` function may only return a string here, because Angular
//    cannot render an arbitrary value returned from a function. Anything richer
//    is a `*tableXCell` TEMPLATE, keyed by column id. The same template draws
//    the table cell and the mobile card row, so the two cannot drift apart.
//  * The grid's stylesheet is registered in angular.json, not in this
//    component's `styles`. Component styles are scoped by emulated
//    encapsulation and would never reach the grid's markup.

import { DatePipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  TableXCellDirective,
  TableXComponent,
  TableXToolbarDirective,
  defaultQuery,
  serializeQuery,
  type TableXAngularColumn,
  type TableXNotice,
  type QueryState,
} from "@tablex/angular";
// Reducers live in the engine package. `@tablex/angular` re-exports the few a
// host needs on day one; everything else comes from `@tablex/core` directly.
import { withFilter } from "@tablex/core";
import { EMPTY, Subject, catchError, switchMap, tap } from "rxjs";

import { STATUSES, StudentsService, type Student } from "./students.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [DatePipe, TableXComponent, TableXCellDirective, TableXToolbarDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <h1>TableX — Angular</h1>
      <p class="intro">
        200 students served by an in-memory service that honours the same
        <code>QueryState</code> a real endpoint would: search, sort, column filter, paging. The
        live query is printed under the grid — watch it change as you interact.
      </p>

      <table-x
        caption="Students"
        exportFileName="students"
        searchPlaceholder="Search name, email or department…"
        enableSelection
        [columns]="columns"
        [data]="rows()"
        [total]="total()"
        [query]="query()"
        [isLoading]="loading()"
        [error]="failed()"
        (queryChange)="load($event)"
        (retry)="load(query())"
        (rowClick)="open($event)"
        (selectionChange)="selected.set($event.ids)"
        (notify)="notice.set($event)"
      >
        <!-- Custom cells, keyed by column id. "of: rows()" is a type anchor
             only — it makes let row a fully typed Student. -->
        <ng-container *tableXCell="'name'; of: rows(); let row">
          <div class="cell-stack">
            <strong>{{ row.name }}</strong>
            <small>{{ row.email }}</small>
          </div>
        </ng-container>

        <ng-container *tableXCell="'status'; of: rows(); let row">
          <span class="badge badge--{{ row.status.toLowerCase() }}">{{ row.status }}</span>
        </ng-container>

        <!-- Sorting happens on the server against the raw ISO value, so the
             display format is free. -->
        <ng-container *tableXCell="'enrolledAt'; of: rows(); let row">
          <time [attr.datetime]="row.enrolledAt">{{ row.enrolledAt | date: 'dd MMM yyyy' }}</time>
        </ng-container>

        <!-- "actions" is a structural id: never sorted, never exported, never
             listed in the Columns menu. stopPropagation keeps the button from
             also firing (rowClick). -->
        <ng-container *tableXCell="'actions'; of: rows(); let row">
          <div class="row-actions">
            <button type="button" class="tbx-btn" (click)="edit(row); $event.stopPropagation()">
              Edit
            </button>
          </div>
        </ng-container>

        <!-- Rendered at the end of the toolbar. The grid has no filter UI of
             its own: a column filter is just another QueryState change. -->
        <ng-template tableXToolbar>
          <label>
            <span class="tbx-sr-only">Filter by status</span>
            <select
              class="tbx-rows-select"
              [value]="statusFilter()"
              (change)="onStatusFilter($event)"
            >
              <option value="">All statuses</option>
              @for (status of statuses; track status) {
                <option [value]="status">{{ status }}</option>
              }
            </select>
          </label>

          <button type="button" class="tbx-btn" (click)="breakNextLoad()">Break next load</button>
        </ng-template>
      </table-x>

      <footer class="page-foot">
        <p>
          Query: <code>{{ wireFormat() }}</code>
        </p>
        <p>
          Selected ids: <code>{{ selected().length ? selected().join(', ') : 'none' }}</code>
        </p>
        @if (notice(); as current) {
          <p role="status">{{ current.message }}</p>
        }
      </footer>
    </main>
  `,
})
export class AppComponent {
  private readonly service = inject(StudentsService);

  /**
   * Column definitions, structurally compatible with TanStack Table's
   * `ColumnDef`. `header` and `cell` return strings here; richer cells are the
   * `*tableXCell` templates above.
   */
  readonly columns: TableXAngularColumn<Student>[] = [
    { accessorKey: "name", header: "Student", meta: { minWidth: 200 } },
    { accessorKey: "email", header: "Email", meta: { hidden: true, minWidth: 220 } },
    { accessorKey: "department", header: "Department", meta: { minWidth: 160 } },
    {
      accessorKey: "status",
      header: "Status",
      meta: {
        align: "center",
        width: 130,
        serverFilterable: true,
        filterOptions: ["Active", "Pending", "Suspended", "Alumni"],
      },
    },
    { accessorKey: "score", header: "Score", meta: { align: "right", width: 90 } },
    { accessorKey: "enrolledAt", header: "Enrolled", meta: { width: 140 } },
    // No cell template: booleans fall back to the locale's yes/no labels.
    { accessorKey: "scholarship", header: "Scholarship", meta: { align: "center", width: 120 } },
    { id: "actions", header: "", meta: { align: "right", width: 90 } },
  ];

  readonly rows = signal<Student[]>([]);
  readonly total = signal(0);
  readonly query = signal<QueryState>(defaultQuery());
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly selected = signal<string[]>([]);
  readonly notice = signal<TableXNotice | null>(null);

  readonly statuses = STATUSES;

  /** `noPropertyAccessFromIndexSignature` is on, hence the bracket access. */
  readonly statusFilter = computed(() => this.query().filter?.["status"] ?? "");

  /** The exact query string a real endpoint would receive. */
  readonly wireFormat = computed(() => serializeQuery(this.query()));

  /**
   * One request stream. `switchMap` cancels the in-flight request whenever a
   * newer query arrives, which is what stops a slow response from painting
   * over a fresher one after three fast keystrokes.
   */
  private readonly requests = new Subject<QueryState>();

  constructor() {
    this.requests
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap((query) =>
          this.service.page(query).pipe(
            catchError(() => {
              this.failed.set(true);
              this.loading.set(false);
              // EMPTY, not throwError: the outer stream must survive so the
              // retry button has something to push into.
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((page) => {
        this.rows.set(page.items);
        this.total.set(page.total);
        this.loading.set(false);
      });

    this.load(this.query());
  }

  /** Adopt a new query and fetch the page that answers it. */
  load(query: QueryState): void {
    this.query.set(query);
    this.requests.next(query);
  }

  onStatusFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    // Always go through a reducer: `withFilter` clears the key when the value
    // is empty and resets to page 1 either way.
    this.load(withFilter(this.query(), "status", value === "" ? undefined : value));
  }

  open(student: Student): void {
    this.notice.set({ type: "info", message: `Opened ${student.name} (#${student.id})` });
  }

  edit(student: Student): void {
    this.notice.set({ type: "info", message: `Edit ${student.name} (#${student.id})` });
  }

  breakNextLoad(): void {
    this.service.breakNextRequest();
    this.load(this.query());
  }
}
