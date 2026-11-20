// Master-detail expanded row template for `<nex-grid>` / `<table-x>`.
//
// Captures a `TemplateRef` rendered inside `.tbx-detail-panel` whenever a row
// is expanded via the leading chevron button.

import { Directive, Input, TemplateRef, inject } from "@angular/core";

import type { TableXExpandedRowTemplateContext } from "./types";

/**
 * Declares the detail panel template rendered underneath an expanded row.
 *
 * ```html
 * <ng-container *nexGridExpandedRow="let row; of: rows()">
 *   <div>Details for {{ row.name }}</div>
 * </ng-container>
 * ```
 *
 * or on an `<ng-template>`:
 *
 * ```html
 * <ng-template nexGridExpandedRow [nexGridExpandedRowOf]="rows()" let-row>
 *   <div>Details for {{ row.name }}</div>
 * </ng-template>
 * ```
 */
@Directive({
  selector: "[tableXExpandedRow], [nexGridExpandedRow]",
  standalone: true,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class TableXExpandedRowDirective<TData = any> {
  /** Optional structural binding (`*nexGridExpandedRow="let row"` or `*nexGridExpandedRow="rows(); let row"`). */
  @Input() tableXExpandedRow?: readonly TData[] | "";

  @Input()
  get nexGridExpandedRow(): readonly TData[] | "" | undefined {
    return this.tableXExpandedRow;
  }
  set nexGridExpandedRow(v: readonly TData[] | "" | undefined) {
    this.tableXExpandedRow = v;
  }

  /**
   * Type anchor only — bind the same array you pass to `[data]` so `let-row`
   * becomes strongly typed. Never read at runtime.
   */
  @Input() tableXExpandedRowOf?: readonly TData[];

  @Input()
  get nexGridExpandedRowOf(): readonly TData[] | undefined {
    return this.tableXExpandedRowOf;
  }
  set nexGridExpandedRowOf(v: readonly TData[] | undefined) {
    this.tableXExpandedRowOf = v;
  }

  /** The captured template, read by `<nex-grid>` via `@ContentChild`. */
  readonly template: TemplateRef<TableXExpandedRowTemplateContext<TData>> = inject(TemplateRef);

  /** Teaches the Angular template type-checker what `let-…` variables mean. */
  static ngTemplateContextGuard<T>(
    _directive: TableXExpandedRowDirective<T>,
    _context: unknown,
  ): _context is TableXExpandedRowTemplateContext<T> {
    return true;
  }
}

export const NexGridExpandedRowDirective = TableXExpandedRowDirective;
