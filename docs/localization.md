# Localization

Every user-facing string in the grid comes from a locale object. Override any
subset; anything you leave out falls back to English.

- [How it works](#how-it-works)
- [Every key](#every-key)
- [Placeholders](#placeholders)
- [Passing a locale](#passing-a-locale)
- [Worked example: French](#worked-example-french)
- [Switching language at runtime](#switching-language-at-runtime)
- [Reusing your i18n framework](#reusing-your-i18n-framework)
- [What is not in the locale](#what-is-not-in-the-locale)

## How it works

```ts
import { DEFAULT_LOCALE, resolveLocale, formatMessage, type TableXLocale } from "@tablex/core";

/** Merge a partial locale over the defaults. */
export function resolveLocale(partial?: Partial<TableXLocale>): TableXLocale;

/** Tiny `{placeholder}` formatter for locale strings. */
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string;
```

Every adapter calls `resolveLocale(props.locale)` once and formats with
`formatMessage`. The merge is **shallow and total**: `TableXLocale` is a flat
object of strings, so any key you supply wins and everything else is the
default.

Because it is data, not a compile-time catalogue, the same grid can render in
different languages on the same page, and a language switch is a prop change.

## Every key

All 36 keys, with their English defaults and where each appears.

### Toolbar

| Key | Default | Where |
| --- | --- | --- |
| `searchPlaceholder` | `Search records…` | Search input placeholder. Overridden per grid by the `searchPlaceholder` prop. |
| `clearSearch` | `Clear search` | Accessible name of the clear (×) button. |
| `columnsButton` | `Columns` | Columns menu trigger. |
| `toggleColumnsLabel` | `Toggle Columns` | Label at the top of the Columns menu. |
| `densityButton` | `Density: {density}` | Density menu trigger. |
| `densityCompact` | `Compact (36px)` | Density menu item. |
| `densityDefault` | `Standard (44px)` | Density menu item. |
| `densityComfortable` | `Comfortable (52px)` | Density menu item. |

### Export

| Key | Default | Where |
| --- | --- | --- |
| `exportButton` | `Export Data` | Export menu trigger. |
| `exportingButton` | `Exporting…` | Trigger label while an export is running. |
| `exportExcelTitle` | `Formatted Excel (.xls)` | Excel menu item title. |
| `exportExcelSubtitle` | `With colored badges & styling` | Excel menu item subtitle. |
| `exportCsvTitle` | `Raw CSV (.csv)` | CSV menu item title. |
| `exportCsvSubtitle` | `Standard unformatted data` | CSV menu item subtitle. |
| `exportFetchingAll` | `Fetching all {total} records for export…` | `info` notice when a fetch-all starts. |
| `exportFetchFailed` | `Could not fetch all records. Exporting current page data.` | `error` notice; the export falls back to the current page. |
| `exportNoData` | `No data available to export.` | `error` notice; the export stops. |
| `exportExcelSuccess` | `Exported {count} formatted records to Excel (.xls)` | `success` notice. |
| `exportCsvSuccess` | `Exported {count} raw records to CSV (.csv)` | `success` notice. |

### Table

| Key | Default | Where |
| --- | --- | --- |
| `serialHeader` | `S.No.` | The automatic serial column header — in the table **and** in the Excel export. |
| `selectAllLabel` | `Select all rows` | Accessible name of the header checkbox. |
| `selectRowLabel` | `Select row {id}` | Accessible name of a row checkbox. |
| `booleanYes` | `Yes` | Rendering of `true` in a default cell and in exports. |
| `booleanNo` | `No` | Rendering of `false`. |

### States

| Key | Default | Where |
| --- | --- | --- |
| `loadingText` | `Fetching table records…` | Under the spinner (rows only). |
| `emptyText` | `No records match your query criteria.` | Empty result set. |
| `errorText` | `Something went wrong loading this table dataset.` | The error card, which replaces the whole grid. |
| `retryButton` | `Try again` | Retry button on the error card. |

### Footer and pager

| Key | Default | Where |
| --- | --- | --- |
| `showingRange` | `Showing {start} to {end} of {total} entries` | Record range. |
| `selectedBadge` | `{count} selected` | Selection badge. |
| `rowsPerPage` | `Rows:` | Label beside the page-size select. |
| `previousPage` | `Previous page` | Accessible name of the ‹ button. |
| `nextPage` | `Next page` | Accessible name of the › button. |
| `goToPage` | `Go to` | Visible label of the page-jump box. |
| `goToPageOf` | `Go to page number` | Accessible name of the page-jump input. |
| `pageLabel` | `Go to page {page}` | Accessible name of a numbered page button. |

## Placeholders

`formatMessage` substitutes `{name}` tokens. An unknown token is left as-is, so
a typo degrades to visible text rather than an empty string.

| Key | Tokens |
| --- | --- |
| `densityButton` | `{density}` — the current density name |
| `showingRange` | `{start}`, `{end}`, `{total}` |
| `selectedBadge` | `{count}` |
| `pageLabel` | `{page}` |
| `selectRowLabel` | `{id}` — the row id from `getRowId` |
| `exportFetchingAll` | `{total}` |
| `exportExcelSuccess`, `exportCsvSuccess` | `{count}` |

Numbers are run through `toLocaleString()` before substitution, so `{count}`
arrives already grouped (`1,284`).

Keep the tokens, move them freely — word order is yours:

```ts
// English:  "Showing 21 to 40 of 1,284 entries"
// German:   "Zeige 21 bis 40 von 1.284 Einträgen"
// Japanese: "1,284 件中 21 〜 40 件を表示"
locale={{ showingRange: "{total} 件中 {start} 〜 {end} 件を表示" }}
```

## Passing a locale

```tsx
// React
<TableX locale={{ searchPlaceholder: "Rechercher…" }} {...props} />
```

```html
<!-- Angular -->
<table-x [locale]="{ searchPlaceholder: 'Suchen…' }" …/>
```

```js
// Vanilla
createTableX(document.getElementById("grid"), {
  caption: "Students",
  endpoint: "/api/students",
  columns,
  locale: { searchPlaceholder: "Buscar…" },
});
```

For the ASP.NET Core Tag Helper there is no `locale` attribute — a locale is an
object, and the helper writes JSON configuration. Set `init="false"` and attach
it when you start the grid:

```cshtml
<table-x id="students-grid" caption="Étudiants" endpoint="/api/students" init="false">
    <table-x-column field="name" header="Nom" />
    <table-x-column field="email" header="Courriel" />
</table-x>

@section Scripts {
<script>
    (function () {
        var host = document.getElementById("students-grid");
        var config = JSON.parse(document.getElementById("students-grid-config").textContent);

        config.locale = {
            searchPlaceholder: "Rechercher…",
            columnsButton: "Colonnes",
            emptyText: "Aucun enregistrement ne correspond à votre recherche.",
            showingRange: "Affichage de {start} à {end} sur {total} entrées",
            rowsPerPage: "Lignes :"
        };

        host.tablex = TableX.createTableX(host, config);
    })();
</script>
}
```

## Worked example: French

A complete locale, defined once and shared by every grid in the app.

```ts
// locales/fr.ts
import type { TableXLocale } from "@tablex/core";

export const fr: TableXLocale = {
  // Toolbar
  searchPlaceholder: "Rechercher…",
  clearSearch: "Effacer la recherche",
  columnsButton: "Colonnes",
  toggleColumnsLabel: "Afficher/masquer les colonnes",
  densityButton: "Densité : {density}",
  densityCompact: "Compacte (36 px)",
  densityDefault: "Standard (44 px)",
  densityComfortable: "Confortable (52 px)",

  // Export
  exportButton: "Exporter",
  exportingButton: "Exportation…",
  exportExcelTitle: "Excel mis en forme (.xls)",
  exportExcelSubtitle: "Avec badges colorés et styles",
  exportCsvTitle: "CSV brut (.csv)",
  exportCsvSubtitle: "Données brutes non formatées",
  exportFetchingAll: "Récupération des {total} enregistrements pour l'export…",
  exportFetchFailed:
    "Impossible de récupérer tous les enregistrements. Export de la page courante.",
  exportNoData: "Aucune donnée à exporter.",
  exportExcelSuccess: "{count} enregistrements exportés vers Excel (.xls)",
  exportCsvSuccess: "{count} enregistrements exportés vers CSV (.csv)",

  // Table
  serialHeader: "N°",
  selectAllLabel: "Sélectionner toutes les lignes",
  selectRowLabel: "Sélectionner la ligne {id}",
  booleanYes: "Oui",
  booleanNo: "Non",

  // States
  loadingText: "Chargement des enregistrements…",
  emptyText: "Aucun enregistrement ne correspond à votre recherche.",
  errorText: "Une erreur est survenue lors du chargement des données.",
  retryButton: "Réessayer",

  // Footer and pager
  showingRange: "Affichage de {start} à {end} sur {total} entrées",
  selectedBadge: "{count} sélectionné(s)",
  rowsPerPage: "Lignes :",
  previousPage: "Page précédente",
  nextPage: "Page suivante",
  goToPage: "Aller à",
  goToPageOf: "Numéro de page",
  pageLabel: "Aller à la page {page}",
};
```

Annotating it `TableXLocale` (not `Partial<TableXLocale>`) makes the compiler
tell you when a release adds a key. Use `Partial<TableXLocale>` when you
deliberately want to translate only part of the UI.

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TableX,
  buildQueryUrl,
  defaultQuery,
  type TableXReactColumn,
  type PagedResponse,
  type QueryState,
} from "@tablex/react";
import "@tablex/react/styles.css";

import { fr } from "./locales/fr";

interface Etudiant {
  id: number;
  nom: string;
  courriel: string;
  actif: boolean;
}

const columns: TableXReactColumn<Etudiant>[] = [
  { accessorKey: "nom", header: "Nom", meta: { minWidth: 180 } },
  { accessorKey: "courriel", header: "Courriel" },
  // No `cell`: booleans render with locale.booleanYes / booleanNo -> Oui / Non,
  // in the grid AND in exports.
  { accessorKey: "actif", header: "Actif", meta: { align: "center", width: 110 } },
];

export function GrilleEtudiants() {
  const [query, setQuery] = useState<QueryState>(defaultQuery());
  const [page, setPage] = useState<PagedResponse<Etudiant> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (next: QueryState) => {
    setIsLoading(true);
    setError(false);
    try {
      const response = await fetch(buildQueryUrl("/api/etudiants", next));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPage((await response.json()) as PagedResponse<Etudiant>);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [load, query]);

  return (
    <TableX
      caption="Étudiants"
      columns={columns}
      data={page?.items ?? []}
      total={page?.total ?? 0}
      query={query}
      onQueryChange={setQuery}
      isLoading={isLoading}
      error={error}
      onRetry={() => void load(query)}
      locale={fr}
      enableSelection
      fetchEndpoint="/api/etudiants"
    />
  );
}
```

The same object drops into Angular and vanilla unchanged:

```ts
// Angular component field
readonly locale: TableXLocale = fr;
```

```html
<table-x caption="Étudiants" [locale]="locale" …/>
```

```js
// Vanilla
import { createTableX } from "@tablex/vanilla";
import "@tablex/vanilla/styles.css";
import { fr } from "./locales/fr.js";

const grid = createTableX(document.getElementById("grid"), {
  caption: "Étudiants",
  endpoint: "/api/etudiants",
  columns: [
    { accessorKey: "nom", header: "Nom" },
    { accessorKey: "courriel", header: "Courriel" },
  ],
  locale: fr,
});
```

## Switching language at runtime

The locale is an ordinary prop, so a language switch is a re-render:

```tsx
"use client";

import { useState } from "react";
import type { TableXLocale } from "@tablex/react";

import { de } from "./locales/de";
import { fr } from "./locales/fr";

const LOCALES: Record<"en" | "fr" | "de", TableXLocale | undefined> = {
  en: undefined,   // undefined = the built-in English defaults
  fr,
  de,
};

export function useGridLocale() {
  const [lang, setLang] = useState<"en" | "fr" | "de">("en");
  return { lang, setLang, locale: LOCALES[lang] };
}
```

In vanilla, options are read at construction; to change locale, destroy and
recreate:

```js
let grid = createTableX(host, { ...options, locale: fr });

function setLocale(locale) {
  const query = grid.getQuery();      // keep the user where they were
  grid.destroy();
  grid = createTableX(host, { ...options, locale, query });
}
```

## Reusing your i18n framework

`TableXLocale` is a flat `Record<string, string>` in shape, so building it from
an existing catalogue is a map:

```ts
import type { TableXLocale } from "@tablex/core";

// `t` is any translate function: i18next, @angular/localize, vue-i18n, …
export function gridLocale(t: (key: string) => string): TableXLocale {
  return {
    searchPlaceholder: t("grid.searchPlaceholder"),
    clearSearch: t("grid.clearSearch"),
    columnsButton: t("grid.columnsButton"),
    toggleColumnsLabel: t("grid.toggleColumnsLabel"),
    densityButton: t("grid.densityButton"),
    densityCompact: t("grid.densityCompact"),
    densityDefault: t("grid.densityDefault"),
    densityComfortable: t("grid.densityComfortable"),
    exportButton: t("grid.exportButton"),
    exportingButton: t("grid.exportingButton"),
    exportExcelTitle: t("grid.exportExcelTitle"),
    exportExcelSubtitle: t("grid.exportExcelSubtitle"),
    exportCsvTitle: t("grid.exportCsvTitle"),
    exportCsvSubtitle: t("grid.exportCsvSubtitle"),
    serialHeader: t("grid.serialHeader"),
    selectAllLabel: t("grid.selectAllLabel"),
    selectRowLabel: t("grid.selectRowLabel"),
    loadingText: t("grid.loadingText"),
    emptyText: t("grid.emptyText"),
    errorText: t("grid.errorText"),
    retryButton: t("grid.retryButton"),
    showingRange: t("grid.showingRange"),
    selectedBadge: t("grid.selectedBadge"),
    rowsPerPage: t("grid.rowsPerPage"),
    previousPage: t("grid.previousPage"),
    nextPage: t("grid.nextPage"),
    goToPage: t("grid.goToPage"),
    goToPageOf: t("grid.goToPageOf"),
    pageLabel: t("grid.pageLabel"),
    booleanYes: t("grid.booleanYes"),
    booleanNo: t("grid.booleanNo"),
    exportFetchingAll: t("grid.exportFetchingAll"),
    exportFetchFailed: t("grid.exportFetchFailed"),
    exportNoData: t("grid.exportNoData"),
    exportExcelSuccess: t("grid.exportExcelSuccess"),
    exportCsvSuccess: t("grid.exportCsvSuccess"),
  };
}
```

Keep TableX's `{token}` syntax in the catalogue values. The grid substitutes
them itself; it does not know about ICU message format, `%s`, or `$t()`.

To seed a catalogue, spread the defaults:

```ts
import { DEFAULT_LOCALE } from "@tablex/core";

console.log(JSON.stringify(DEFAULT_LOCALE, null, 2));
```

## What is not in the locale

| Not localized | Where it comes from |
| --- | --- |
| Column headers | `column.header`, and card `dt` labels |
| Cell values | your data, and your `cell` renderers |
| `caption` | the `caption` prop — it is also the export sheet title |
| The search input's `aria-label` | composed as `Search {caption}` |
| Number and date formatting in cells | your `cell` renderer (`toLocaleString`, `Intl.*`) |
| Excel badge values | `badgeRules` match your data's raw values, not translations |
| RTL layout | CSS `direction` on an ancestor; the stylesheet uses logical properties where it matters |

Two of these are worth a second look. Badge rules match the **stored** value, so
if your API returns translated statuses, the rules must list those translated
values. And a date column is not localized until you say so:

```tsx
{
  accessorKey: "joinedAt",
  header: "Inscrit le",
  cell: ({ getValue }) =>
    new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
      new Date(String(getValue())),
    ),
}
```

## Related

- [Theming](theming.md) — the other half of "make it ours"
- [Export](features/export.md) — every export string, and `serialHeader` in the workbook
- [`@tablex/core` API](api/core.md) — `DEFAULT_LOCALE`, `resolveLocale`, `formatMessage`
