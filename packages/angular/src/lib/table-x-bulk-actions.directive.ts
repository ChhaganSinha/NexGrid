// Custom bulk-action buttons for `<nex-grid>` / `<table-x>`.
//
// Rendered inside `.tbx-bulk-bar` whenever one or more rows are selected.

import { Directive, Input, TemplateRef, inject } from "@angular/core";

import type { TableXBulkActionsTemplateContext } from "./types";

/**
 * Marks a template as custom actions inside the floating bulk-selection bar.
 *
 * ```html
 * <ng-template nexGridBulkActions let-ids let-deselectAll="deselectAll">
 *   <button type="button" class="tbx-bulk-btn" (click)="archive(ids); deselectAll()">
 *     Archive ({{ ids.length }})
 *   </button>
 * </ng-template>
 * ```
 */
@Directive({
  selector: "[tableXBulkActions], [nexGridBulkActions]",
  standalone: true,
})
export class TableXBulkActionsDirective {
  @Input() tableXBulkActions?: "";

  @Input()
  get nexGridBulkActions(): "" | undefined {
    return this.tableXBulkActions;
  }
  set nexGridBulkActions(v: "" | undefined) {
    this.tableXBulkActions = v;
  }

  /** The captured template, rendered inside `.tbx-bulk-actions`. */
  readonly template: TemplateRef<TableXBulkActionsTemplateContext> = inject(TemplateRef);

  /** Teaches the Angular template type-checker what `let-…` variables mean. */
  static ngTemplateContextGuard(
    _directive: TableXBulkActionsDirective,
    _context: unknown,
  ): _context is TableXBulkActionsTemplateContext {
    return true;
  }
}

export const NexGridBulkActionsDirective = TableXBulkActionsDirective;
