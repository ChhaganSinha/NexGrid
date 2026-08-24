// Browser download helper shared by the CSV and Excel exporters.

/** Trigger a client-side file download. No-ops outside the browser. Returns success. */
export function downloadBlob(filename: string, blob: Blob): boolean {
  if (typeof document === "undefined") return false;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so the download has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/** `prefix_export_2026-08-24` — sortable and unambiguous about when it was taken. */
export function timestampedFilename(prefix: string, now = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  return `${prefix}_export_${iso}`;
}

/** Turn a grid caption into a safe file prefix (`Student Records` -> `student_records`). */
export function filePrefixFromCaption(caption: string): string {
  return (caption || "table").toLowerCase().replace(/\s+/g, "_");
}
