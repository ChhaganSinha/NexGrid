// Every user-facing string in the grid, overridable per instance so the grid
// can be localized without forking any adapter.

export interface TableXLocale {
  searchPlaceholder: string;
  clearSearch: string;
  columnsButton: string;
  toggleColumnsLabel: string;
  densityButton: string;
  densityCompact: string;
  densityDefault: string;
  densityComfortable: string;
  exportButton: string;
  exportingButton: string;
  exportExcelTitle: string;
  exportExcelSubtitle: string;
  exportCsvTitle: string;
  exportCsvSubtitle: string;
  exportClipboardTitle: string;
  exportClipboardSubtitle: string;
  exportClipboardSuccess: string;
  filterColumnPlaceholder: string;
  filterAll: string;
  clearFilter: string;
  applyFilter: string;
  serialHeader: string;
  selectAllLabel: string;
  selectRowLabel: string;
  loadingText: string;
  emptyText: string;
  errorText: string;
  retryButton: string;
  /** `Showing {start} to {end} of {total} entries` */
  showingRange: string;
  selectedBadge: string;
  rowsPerPage: string;
  previousPage: string;
  nextPage: string;
  goToPage: string;
  goToPageOf: string;
  pageLabel: string;
  booleanYes: string;
  booleanNo: string;
  exportFetchingAll: string;
  exportFetchFailed: string;
  exportNoData: string;
  exportExcelSuccess: string;
  exportCsvSuccess: string;
  /**
   * Label of the "reset the view" item in the Columns menu.
   *
   * Optional because it was added after the contract shipped: every field above
   * is required, so a consumer who annotates a complete `TableXLocale` object
   * would stop compiling the day a required key appears. `resolveLocale` fills
   * it in from {@link DEFAULT_LOCALE}, so adapters can read it unconditionally.
   */
  resetView?: string;
  /** Direct Excel export button label (for quickExport or split button). */
  exportExcelButton?: string;
  /** Direct CSV export button label. */
  exportCsvButton?: string;
  /** Column menu: Sort ascending. */
  sortAscending?: string;
  /** Column menu: Sort descending. */
  sortDescending?: string;
  /** Column menu: Pin left. */
  pinLeft?: string;
  /** Column menu: Pin right. */
  pinRight?: string;
  /** Column menu: Unpin column. */
  unpinColumn?: string;
  /** Column menu: Hide column. */
  hideColumn?: string;
  /** Select-all across pages banner prompt (`All {pageCount} rows on this page are selected.`). */
  selectAllAcrossPages?: string;
  /** Select-all across pages active message (`All {total} matching rows across all pages are selected.`). */
  allAcrossPagesSelected?: string;
  /** Clear selection link label. */
  clearSelection?: string;
  /** Column menu quick action: Group by column. */
  groupByColumn?: string;
  /** Column menu quick action: Ungroup. */
  ungroupColumn?: string;
}
export type NexGridLocale = TableXLocale;

// Typed `Required<>` so that reading an optional key off the defaults yields a
// string rather than `string | undefined`.
export const DEFAULT_LOCALE: Required<TableXLocale> = {
  searchPlaceholder: "Search records…",
  clearSearch: "Clear search",
  columnsButton: "Columns",
  toggleColumnsLabel: "Toggle Columns",
  densityButton: "Density",
  densityCompact: "Compact",
  densityDefault: "Standard",
  densityComfortable: "Comfortable",
  exportButton: "Export",
  exportingButton: "Exporting…",
  exportExcelTitle: "Formatted Excel (.xlsx)",
  exportExcelSubtitle: "With colored badges & styling",
  exportCsvTitle: "Raw CSV (.csv)",
  exportCsvSubtitle: "Standard unformatted data",
  exportClipboardTitle: "Copy to Clipboard",
  exportClipboardSubtitle: "Tab-separated values (TSV)",
  exportClipboardSuccess: "Copied {count} records to clipboard",
  filterColumnPlaceholder: "Filter {column}…",
  filterAll: "All",
  clearFilter: "Clear",
  applyFilter: "Apply",
  serialHeader: "S.No.",
  selectAllLabel: "Select all rows",
  selectRowLabel: "Select row {id}",
  loadingText: "Fetching table records…",
  emptyText: "No records match your query criteria.",
  errorText: "Something went wrong loading this table dataset.",
  retryButton: "Try again",
  showingRange: "Showing {start} to {end} of {total} entries",
  selectedBadge: "{count} selected",
  rowsPerPage: "Page size:",
  previousPage: "Previous page",
  nextPage: "Next page",
  goToPage: "Go to",
  goToPageOf: "Go to page number",
  pageLabel: "Go to page {page}",
  booleanYes: "Yes",
  booleanNo: "No",
  exportFetchingAll: "Fetching all {total} records for export…",
  exportFetchFailed: "Could not fetch all records. Exporting current page data.",
  exportNoData: "No data available to export.",
  exportExcelSuccess: "Exported {count} formatted records to Excel (.xlsx)",
  exportCsvSuccess: "Exported {count} raw records to CSV (.csv)",
  resetView: "Reset to default view",
  exportExcelButton: "Export Excel",
  exportCsvButton: "Export CSV",
  sortAscending: "Sort ascending",
  sortDescending: "Sort descending",
  pinLeft: "Pin left",
  pinRight: "Pin right",
  unpinColumn: "Unpin column",
  hideColumn: "Hide column",
  selectAllAcrossPages: "Select all {total} matching records",
  allAcrossPagesSelected: "All {total} matching records across all pages are selected.",
  clearSelection: "Clear selection",
  groupByColumn: "Group by column",
  ungroupColumn: "Ungroup",
};

/**
 * Merge a partial locale over the defaults. The result is `Required<>`: every
 * key — including the optional ones — is present, so adapters never have to
 * re-apply a fallback at the render site.
 */
export function resolveLocale(partial?: Partial<TableXLocale>): Required<TableXLocale> {
  if (!partial) return DEFAULT_LOCALE;
  return {
    ...DEFAULT_LOCALE,
    ...partial,
    resetView: partial.resetView ?? DEFAULT_LOCALE.resetView,
    exportExcelButton: partial.exportExcelButton ?? DEFAULT_LOCALE.exportExcelButton,
    exportCsvButton: partial.exportCsvButton ?? DEFAULT_LOCALE.exportCsvButton,
    sortAscending: partial.sortAscending ?? DEFAULT_LOCALE.sortAscending,
    sortDescending: partial.sortDescending ?? DEFAULT_LOCALE.sortDescending,
    pinLeft: partial.pinLeft ?? DEFAULT_LOCALE.pinLeft,
    pinRight: partial.pinRight ?? DEFAULT_LOCALE.pinRight,
    unpinColumn: partial.unpinColumn ?? DEFAULT_LOCALE.unpinColumn,
    hideColumn: partial.hideColumn ?? DEFAULT_LOCALE.hideColumn,
    selectAllAcrossPages: partial.selectAllAcrossPages ?? DEFAULT_LOCALE.selectAllAcrossPages,
    allAcrossPagesSelected: partial.allAcrossPagesSelected ?? DEFAULT_LOCALE.allAcrossPagesSelected,
    clearSelection: partial.clearSelection ?? DEFAULT_LOCALE.clearSelection,
    groupByColumn: partial.groupByColumn ?? DEFAULT_LOCALE.groupByColumn,
    ungroupColumn: partial.ungroupColumn ?? DEFAULT_LOCALE.ungroupColumn,
  };
}

/** Tiny `{placeholder}` formatter for locale strings. */
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = values[key];
    return v === undefined ? match : String(v);
  });
}
