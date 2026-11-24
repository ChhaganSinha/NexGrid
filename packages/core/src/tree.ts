// Hierarchical tree-data flattening engine (`enableTreeData` / `childrenKey` / `getSubRows`).
//
// Flattens arbitrarily nested parent/child row hierarchies of the same schema
// into a linear render list carrying `depth`, `hasChildren`, `isExpanded`, and
// `parentId`, so adapters render indented tree chevrons inside standard `<tr>`
// rows (compatible with pinned columns, sorting, selection, and virtualization).

import { readPropertyByPath } from "./column.js";

export interface TreeRowNode<TData> {
  /** Original row data item. */
  row: TData;
  /** Stable unique node id. */
  id: string;
  /** 0-based nesting depth (`0` for root rows). */
  depth: number;
  /** True when this node has 1+ child rows or is marked as expandable parent. */
  hasChildren: boolean;
  /** True when this node is currently expanded. */
  isExpanded: boolean;
  /** True when this node is actively loading async child rows. */
  isLoading?: boolean;
  /** Parent node id, or `null` for root rows. */
  parentId: string | null;
  /** Direct child count. */
  childCount: number;
}

export interface FlattenTreeOptions<TData> {
  /** Property name holding child row arrays (defaults to `"children"`). */
  childrenKey?: string;
  /** Custom child accessor overriding `childrenKey`. */
  getSubRows?: (row: TData) => readonly TData[] | undefined;
  /** Dynamically loaded children map for async lazy-loaded nodes. */
  lazyChildren?: ReadonlyMap<string, readonly TData[]> | Record<string, readonly TData[]>;
  /** Set of node IDs currently fetching async children. */
  loadingNodeIds?: ReadonlySet<string>;
  /** Optional custom predicate to determine if a node has children (e.g. `row.hasChildren === true`). */
  hasChildren?: (row: TData) => boolean;
  /** Row identity extractor. */
  getRowId?: (row: TData) => string;
  /** Set of currently expanded node IDs. */
  expandedIds?: ReadonlySet<string>;
}

function defaultTreeRowId<TData>(row: TData, fallbackPath: string): string {
  if (row !== null && typeof row === "object") {
    const id = (row as Record<string, unknown>)["id"];
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return fallbackPath;
}

function extractChildren<TData>(
  row: TData,
  childrenKey: string,
  getSubRows?: (row: TData) => readonly TData[] | undefined,
  lazyChildrenMap?: ReadonlyMap<string, readonly TData[]> | Record<string, readonly TData[]>,
  rowId?: string,
): readonly TData[] {
  if (rowId && lazyChildrenMap) {
    const lazy =
      lazyChildrenMap instanceof Map
        ? lazyChildrenMap.get(rowId)
        : (lazyChildrenMap as Record<string, readonly TData[]>)[rowId];
    if (Array.isArray(lazy)) return lazy;
  }
  if (getSubRows) {
    const custom = getSubRows(row);
    return Array.isArray(custom) ? custom : [];
  }
  const raw = readPropertyByPath(row, childrenKey);
  return Array.isArray(raw) ? (raw as readonly TData[]) : [];
}

/**
 * Collect node IDs up to `maxDepth` (`-1` or `Infinity` to expand all levels)
 * to seed initial tree expansion state.
 */
export function collectInitialExpandedTreeIds<TData>(
  rows: readonly TData[],
  defaultExpandedDepth = 0,
  options?: Omit<FlattenTreeOptions<TData>, "expandedIds">,
): Set<string> {
  const expanded = new Set<string>();
  if (defaultExpandedDepth === 0 || rows.length === 0) return expanded;

  const childrenKey = options?.childrenKey || "children";
  const expandAll = defaultExpandedDepth < 0 || !Number.isFinite(defaultExpandedDepth);

  const walk = (items: readonly TData[], depth: number, prefix: string): void => {
    if (!expandAll && depth >= defaultExpandedDepth) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item === undefined) continue;
      const path = prefix ? `${prefix}.${i}` : String(i);
      const id = options?.getRowId ? options.getRowId(item) : defaultTreeRowId(item, path);
      const children = extractChildren(item, childrenKey, options?.getSubRows);
      if (children.length > 0) {
        expanded.add(id);
        walk(children, depth + 1, path);
      }
    }
  };

  walk(rows, 0, "");
  return expanded;
}

/**
 * Flatten hierarchical `rows` according to `expandedIds`, preserving depth-first order.
 */
export function flattenTreeRows<TData>(
  rows: readonly TData[],
  options?: FlattenTreeOptions<TData>,
): TreeRowNode<TData>[] {
  const out: TreeRowNode<TData>[] = [];
  if (rows.length === 0) return out;

  const childrenKey = options?.childrenKey || "children";
  const expandedIds = options?.expandedIds ?? new Set<string>();
  const visited = new Set<string>();

  const walk = (
    items: readonly TData[],
    depth: number,
    parentId: string | null,
    prefix: string,
  ): void => {
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (row === undefined) continue;
      const path = prefix ? `${prefix}.${i}` : String(i);
      const rawId = options?.getRowId ? options.getRowId(row) : defaultTreeRowId(row, path);
      const id = visited.has(rawId) ? `${rawId}__${path}` : rawId;
      visited.add(id);

      const children = extractChildren(row, childrenKey, options?.getSubRows, options?.lazyChildren, id);
      const isParentDeclared = options?.hasChildren ? options.hasChildren(row) : false;
      const hasChildren = children.length > 0 || isParentDeclared;
      const isExpanded = hasChildren && expandedIds.has(id);
      const isLoading = Boolean(options?.loadingNodeIds?.has(id));

      out.push({
        row,
        id,
        depth,
        hasChildren,
        isExpanded,
        isLoading,
        parentId,
        childCount: children.length,
      });

      if (isExpanded && children.length > 0) {
        walk(children, depth + 1, id, path);
      }
    }
  };

  walk(rows, 0, null, "");
  return out;
}
