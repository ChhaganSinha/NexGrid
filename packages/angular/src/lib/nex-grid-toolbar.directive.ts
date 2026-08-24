// Host-supplied toolbar actions.
//
// A template (rather than plain content projection) is the default because the
// toolbar's action slot sits at the END of the toolbar, after the export menu,
// and a template can be placed anywhere in the host's markup while still
// rendering in exactly that slot. Plain `<ng-content>` is still honoured for
// hosts that prefer it.

import { Directive, TemplateRef, inject } from "@angular/core";

/**
 * Marks a template as the grid's toolbar action slot.
 *
 * ```html
 * <nex-grid …>
 *   <ng-template nexGridToolbar>
 *     <button class="nxg-btn" (click)="addStudent()">Add student</button>
 *   </ng-template>
 * </nex-grid>
 * ```
 */
@Directive({
  selector: "[nexGridToolbar]",
  standalone: true,
})
export class NexGridToolbarDirective {
  /** The captured template, rendered at the end of the toolbar. */
  readonly template: TemplateRef<unknown> = inject(TemplateRef);
}
