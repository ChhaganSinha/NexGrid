// Pagination presentation math, shared so every adapter's pager looks and
// behaves the same.

/** A pager item: a 1-based page number or an ellipsis. */
export type PageItem = number | "...";

/**
 * The numbered-button model with ellipsis: always shows first and last page,
 * plus a window of one page around the current page. Seven or fewer pages are
 * shown in full.
 */
export function getPageNumbers(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: PageItem[] = [1];

  if (currentPage > 3) pages.push("...");

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    if (!pages.includes(i)) pages.push(i);
  }

  if (currentPage < totalPages - 2) pages.push("...");
  if (!pages.includes(totalPages)) pages.push(totalPages);

  return pages;
}

/** The "Showing X to Y of Z" range for the footer. */
export interface RecordRange {
  /** 1-based index of the first visible record (0 when empty). */
  start: number;
  /** 1-based index of the last visible record (0 when empty). */
  end: number;
  /** Total filtered records. */
  total: number;
}

/** Compute the visible record range for the current page. */
export function getRecordRange(page: number, pageSize: number, total: number): RecordRange {
  if (total <= 0) return { start: 0, end: 0, total: 0 };
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return { start, end, total };
}

/** The absolute serial number (S.No.) of a row within the whole result set. */
export function serialNumber(page: number, pageSize: number, indexOnPage: number): number {
  return (page - 1) * pageSize + indexOnPage + 1;
}
