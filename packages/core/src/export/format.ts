// The export menu's vocabulary, in one place.
//
// Every adapter offers the same three destinations, and a host that takes the
// export over (`onExportAll`) has to be able to name the one the user picked —
// so the union lives in core rather than being re-typed inline per adapter.

/** The destination the user chose from the export menu. */
export type ExportFormat = "excel" | "csv" | "clipboard";
export type NexGridExportFormat = ExportFormat;

/** All export formats, in menu order. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ["excel", "csv", "clipboard"];
