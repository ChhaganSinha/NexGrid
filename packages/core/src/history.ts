// Undo / Redo mutation history manager for spreadsheet and enterprise grid editing.
//
// Tracks cell edits, bulk edits, cell-range fill operations, and clipboard
// paste mutations in a bounded, reversible history stack with Ctrl+Z / Ctrl+Y
// keyboard support and state notifications across all frameworks.

export interface CellMutation<T = unknown> {
  /** Target row id. */
  rowId: string;
  /** Target column id or field name. */
  columnId: string;
  /** Previous cell value before mutation. */
  oldValue: T;
  /** New cell value after mutation. */
  newValue: T;
}

export interface GridHistoryAction {
  /** Unique action id. */
  id: string;
  /** Optional human-readable action description (e.g. "Cell edit", "Range paste"). */
  description?: string;
  /** Timestamp when action was committed. */
  timestamp: number;
  /** Contained cell mutations. */
  mutations: readonly CellMutation[];
}

export interface GridHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}

let historyActionSeq = 0;

export class GridHistoryManager {
  private readonly maxHistory: number;
  private readonly undoStack: GridHistoryAction[] = [];
  private readonly redoStack: GridHistoryAction[] = [];

  constructor(maxHistory = 50) {
    this.maxHistory = Math.max(1, maxHistory);
  }

  /**
   * Record a new mutation or batch of mutations into the undo history.
   * Clears the redo stack.
   */
  push(
    actionOrMutations:
      | { description?: string; mutations: readonly CellMutation[] }
      | readonly CellMutation[]
      | CellMutation,
  ): GridHistoryAction | null {
    let description: string | undefined;
    let mutations: readonly CellMutation[];

    if (Array.isArray(actionOrMutations)) {
      mutations = actionOrMutations;
    } else if ("rowId" in actionOrMutations && "columnId" in actionOrMutations) {
      mutations = [actionOrMutations as CellMutation];
    } else {
      const act = actionOrMutations as {
        description?: string;
        mutations: readonly CellMutation[];
      };
      description = act.description;
      mutations = act.mutations;
    }

    // Filter out zero-effect mutations where oldValue === newValue
    const effective = mutations.filter((m) => m.oldValue !== m.newValue);
    if (effective.length === 0) return null;

    const action: GridHistoryAction = {
      id: `act_${++historyActionSeq}`,
      description: description ?? (effective.length > 1 ? "Batch edit" : "Cell edit"),
      timestamp: Date.now(),
      mutations: effective,
    };

    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;

    return action;
  }

  /**
   * Undo the latest action.
   * Returns the action containing mutations to be reverted, or `null` if nothing to undo.
   */
  undo(): GridHistoryAction | null {
    const action = this.undoStack.pop();
    if (!action) return null;

    this.redoStack.push(action);
    return action;
  }

  /**
   * Redo the latest reverted action.
   * Returns the action containing mutations to be re-applied, or `null` if nothing to redo.
   */
  redo(): GridHistoryAction | null {
    const action = this.redoStack.pop();
    if (!action) return null;

    this.undoStack.push(action);
    return action;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  getState(): GridHistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    };
  }
}
