// Every user-facing string in the grid, overridable per instance so the grid
// can be localized without forking any adapter.

export interface NexGridLocale {
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
}

export const DEFAULT_LOCALE: NexGridLocale = {
  searchPlaceholder: "Search records…",
  clearSearch: "Clear search",
  columnsButton: "Columns",
  toggleColumnsLabel: "Toggle Columns",
  densityButton: "Density: {density}",
  densityCompact: "Compact (36px)",
  densityDefault: "Standard (44px)",
  densityComfortable: "Comfortable (52px)",
  exportButton: "Export Data",
  exportingButton: "Exporting…",
  exportExcelTitle: "Formatted Excel (.xls)",
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
  rowsPerPage: "Rows:",
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
  exportExcelSuccess: "Exported {count} formatted records to Excel (.xls)",
  exportCsvSuccess: "Exported {count} raw records to CSV (.csv)",
};

/** Merge a partial locale over the defaults. */
export function resolveLocale(partial?: Partial<NexGridLocale>): NexGridLocale {
  return partial ? { ...DEFAULT_LOCALE, ...partial } : DEFAULT_LOCALE;
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
