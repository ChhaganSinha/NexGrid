// Saved Grid Views / Filter & Layout Presets (`enableSavedViews`).
//
// Allows users (or host apps) to save named snapshots of query state (filters,
// global search, multi-column sort, page size), column visibility, column
// pinning, column order, row grouping, and density — persisted cleanly in
// `localStorage` alongside `storageKey` or managed via callbacks.

import type { Density, QueryState } from "./types.js";

export interface SavedGridView {
  /** Unique identifier for this saved preset. */
  id: string;
  /** User-visible preset title (e.g. `"Active Honor Roll"`). */
  name: string;
  /** ISO timestamp when saved. */
  createdAt: string;
  /** Saved query state (filters, search, sort, pageSize). */
  query: QueryState;
  /** Optional column visibility snapshot. */
  hiddenColumns?: Record<string, boolean>;
  /** Optional runtime column pinning snapshot. */
  pinnedColumns?: Record<string, "left" | "right" | "none">;
  /** Optional column order snapshot. */
  columnOrder?: string[];
  /** Optional grouping column(s). */
  groupBy?: string[];
  /** Optional row density. */
  density?: Density;
}

function viewsStorageKey(storageKey?: string): string {
  return `nexgrid:views:${storageKey || "default"}`;
}

/**
 * Read saved views from `localStorage` safely (returns `[]` in SSR or on parse error).
 */
export function loadSavedViews(storageKey?: string): SavedGridView[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(viewsStorageKey(storageKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedGridView =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as SavedGridView).id === "string" &&
        typeof (item as SavedGridView).name === "string" &&
        Boolean((item as SavedGridView).query),
    );
  } catch {
    return [];
  }
}

/**
 * Persist a full list of saved views to `localStorage` safely.
 */
export function writeSavedViews(
  storageKey: string | undefined,
  views: readonly SavedGridView[],
): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(viewsStorageKey(storageKey), JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

/**
 * Create (or overwrite by matching case-insensitive `name` or `id`) a saved view
 * and persist to `localStorage` when available.
 */
export function upsertSavedView(
  existing: readonly SavedGridView[],
  input: Omit<SavedGridView, "id" | "createdAt"> & { id?: string; createdAt?: string },
  storageKey?: string,
): SavedGridView[] {
  const trimmedName = input.name.trim();
  if (!trimmedName) return [...existing];

  const lower = trimmedName.toLowerCase();
  const matchIdx = existing.findIndex(
    (v) => (input.id && v.id === input.id) || v.name.trim().toLowerCase() === lower,
  );

  const entry: SavedGridView = {
    ...input,
    id:
      input.id ??
      (matchIdx >= 0
        ? existing[matchIdx]!.id
        : `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: trimmedName,
    createdAt: input.createdAt ?? new Date().toISOString(),
    query: {
      ...input.query,
      page: 1,
      sort: [...input.query.sort],
      ...(input.query.filter ? { filter: { ...input.query.filter } } : {}),
    },
  };

  const next = [...existing];
  if (matchIdx >= 0) next[matchIdx] = entry;
  else next.push(entry);

  if (storageKey !== undefined) {
    writeSavedViews(storageKey, next);
  }
  return next;
}

/**
 * Remove a saved view by `viewId` and persist when `storageKey` is provided.
 */
export function removeSavedView(
  existing: readonly SavedGridView[],
  viewId: string,
  storageKey?: string,
): SavedGridView[] {
  const next = existing.filter((v) => v.id !== viewId);
  if (storageKey !== undefined) {
    writeSavedViews(storageKey, next);
  }
  return next;
}
