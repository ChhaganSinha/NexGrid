// Custom cell rendering for `<nex-grid>`.
//
// A column's `cell` function can only return a string in Angular, so anything
// richer is a template captured here and looked up by column id at render
// time. The directive is deliberately inert — it captures a `TemplateRef` and
// nothing else — so the grid stays the single owner of when and how often a
// cell is instantiated (it renders each one twice: once in the table, once in
// the mobile card list).

import { Directive, Input, TemplateRef, inject } from "@angular/core";

import type { NexGridCellTemplateContext } from "./types";

/**
 * Declares a custom cell template for one column, keyed by column id.
 *
 * Write it either as a structural directive on a real element (or
 * `<ng-container>` when you want no wrapper):
 *
 * ```html
 * <ng-container *nexGridCell="'status'; let row; let value = value">
 *   <span class="badge">{{ value }}</span>
 * </ng-container>
 * ```
 *
 * or as a plain attribute on an `<ng-template>`:
 *
 * ```html
 * <ng-template nexGridCell="status" let-row let-value="value">
 *   <span class="badge">{{ value }}</span>
 * </ng-template>
 * ```
 *
 * Do NOT combine the two — `<ng-template *nexGridCell="…">` asks Angular for a
 * template that *contains* a template, so the grid renders the outer one and
 * the cell comes out empty.
 *
 * Add the type anchor to make the context strongly typed:
 * `*nexGridCell="'status'; of: rows"` / `[nexGridCellOf]="rows"`.
 *
 * @typeParam TData The row type, inferred from the {@link nexGridCellOf} anchor.
 */
@Directive({
  selector: "[nexGridCell]",
  standalone: true,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NexGridCellDirective<TData = any> {
  /** Id (or `accessorKey`) of the column this template renders. */
  @Input({ required: true }) nexGridCell = "";

  /**
   * Type anchor only — bind the same array you pass to `[data]` and the
   * template context becomes strongly typed. Never read at runtime.
   */
  @Input() nexGridCellOf?: readonly TData[];

  /** The captured template. Read by `<nex-grid>` via `@ContentChildren`. */
  readonly template: TemplateRef<NexGridCellTemplateContext<TData>> = inject(TemplateRef);

  /** Teaches the Angular template type-checker what `let-…` variables mean. */
  static ngTemplateContextGuard<T>(
    _directive: NexGridCellDirective<T>,
    _context: unknown,
  ): _context is NexGridCellTemplateContext<T> {
    return true;
  }
}
