// `<table-x>` — the Angular adapter for NexGrid.
//
// The grid is SERVER-DRIVEN: it holds exactly one page of rows and never
// sorts, filters or paginates locally. Every piece of user intent becomes a
// `QueryState` produced by a `@nexgrid/core` reducer and emitted through
// `queryChange`; the host fetches and hands back the next page. That is why
// this component is fully controlled — nothing it emits is applied to its own
// inputs.
//
// Rendering notes worth knowing before editing:
//
//  * The HOST element carries `.tbx-root`. An extra wrapper `<div>` would sit
//    inside an inline `<table-x>` box and break the root flex column, and the
//    shared stylesheet only ever selects by class, so the rendering is
//    identical to the `div.tbx-root` in the DOM contract.
//  * Icons are inlined as SVG literals rather than bound through `innerHTML`,
//    so `DomSanitizer` never enters the picture and there is no path from data
//    to markup.
//  * The component is `OnPush` and builds a flat view model (see
//    `view-model.ts`) instead of calling helpers from the template, so a
//    keystroke in the search box does not re-run `rows x columns` lookups.
//  * Both the table and the mobile card list are always rendered; the shared
//    stylesheet shows exactly one of them per viewport.

import { DOCUMENT, NgTemplateOutlet } from "@angular/common";
import {
  AfterContentInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  booleanAttribute,
  inject,
} from "@angular/core";
import { Subject, Subscription, debounceTime, distinctUntilChanged } from "rxjs";

import {
  DEFAULT_PAGE_SIZE,
  DENSITIES,
  DEFAULT_ROW_CAP,
  PAGE_SIZES,
  buildQueryUrl,
  computeAggregation,
  defaultQuery,
  downloadCsv,
  downloadExcel,
  fetchAllPages,
  filePrefixFromCaption,
  formatFilterPillValue,
  formatMessage,
  getCellValue,
  getColumnId,
  getColumnTitle,
  getFilterField,
  getSortField,
  getPageNumbers,
  getRecordRange,
  initialHiddenColumns,
  isEditable,
  isHideable,
  isMultiSelectFilter,
  isPageSize,
  isPinned,
  isSortable,
  isStructuralColumn,
  isFilterable,
  parseMultiFilterValues,
  primarySort,
  resolveLocale,
  searchableColumnIds,
  serialNumber,
  serializeMultiFilterValues,
  timestampedFilename,
  toExportColumns,
  totalPagesFor,
  visibleColumns,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withSort,
  withToggledSort,
  withToggledMultiSort,
  copyToClipboard,
  clearGridState,
  loadGridState,
  saveGridState,
  getCellText,
  queryClientData,
  flattenColumns,
  hasHeaderGroups,
  buildHeaderRows,
  type Density,
  type ExcelBadgeRule,
  type TableXLocale,
  type PagedResponse,
  type QueryState,
  type RecordRange,
} from "@nexgrid/core";

import { TableXBulkActionsDirective } from "./table-x-bulk-actions.directive";
import { TableXCellDirective } from "./table-x-cell.directive";
import { TableXExpandedRowDirective } from "./table-x-expanded-row.directive";
import { TableXToolbarDirective } from "./table-x-toolbar.directive";
import type {
  TableXAngularColumn,
  TableXBulkActionsTemplateContext,
  TableXCellEditEvent,
  NexGridCellTemplateContext,
  TableXNotice,
  TableXSelectionChange,
  TableXTheme,
} from "./types";
import {
  buildRangeParts,
  cellText,
  defaultRowId,
  eventValue,
  headerText,
  trackKeys,
  uniqueKey,
  type NexGridCellView,
  type TableXColumnToggle,
  type NexGridDensityOption,
  type NexGridHeaderView,
  type NexGridPagerItem,
  type NexGridRangePart,
  type NexGridRowView,
  type TableXSummaryCellView,
} from "./view-model";

/** Which toolbar dropdown is open, if any. */
type MenuName = "columns" | "density" | "export";

/** Search input debounce, in milliseconds. Identical in every adapter. */
const SEARCH_DEBOUNCE_MS = 350;

@Component({
  selector: "table-x, nex-grid",
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "tbx-root",
    "[attr.data-density]": "currentDensity",
    "[class.tbx-dark]": "theme === 'dark'",
    "[class.tbx-auto]": "theme === 'auto'",
  },
  template: `
    @if (error) {
      <div class="tbx-state-card">
        <p class="tbx-state-text">{{ strings.errorText }}</p>
        @if (retry.observed) {
          <button type="button" class="tbx-btn" (click)="retry.emit()">
            <svg
              class="tbx-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>{{ strings.retryButton }}</span>
          </button>
        }
      </div>
    } @else {
      @if (showToolbar) {
        <div class="tbx-toolbar">
          <div class="tbx-toolbar-group">
            @if (enableSearch) {
            <div class="tbx-search">
              <svg
                class="tbx-search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                class="tbx-search-input"
                type="search"
                [value]="searchText"
                [placeholder]="searchPlaceholder ?? strings.searchPlaceholder"
                [attr.aria-label]="searchLabel"
                (input)="onSearchInput($event)"
                (keydown.escape)="clearSearch()"
              />
              @if (searchText !== '') {
                <button
                  type="button"
                  class="tbx-search-clear"
                  [attr.aria-label]="strings.clearSearch"
                  (click)="clearSearch()"
                >
                  <svg
                    class="tbx-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                  <span class="tbx-sr-only">{{ strings.clearSearch }}</span>
                </button>
              }
            </div>
          }
        </div>

        <div class="tbx-toolbar-group tbx-toolbar-group--end">
          @if (isColumnsVisible) {
            <div class="tbx-menu-wrap">
              <button
                type="button"
                class="tbx-btn"
                aria-haspopup="menu"
                [attr.aria-expanded]="openMenu === 'columns'"
                (click)="toggleMenu('columns', $event)"
              >
              <svg
                class="tbx-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M15 3v18" />
              </svg>
              <span>{{ strings.columnsButton }}</span>
            </button>
            @if (openMenu === 'columns') {
              <div class="tbx-menu" role="menu" (click)="$event.stopPropagation()">
                <div class="tbx-menu-label">{{ strings.toggleColumnsLabel }}</div>
                <div class="tbx-menu-separator"></div>
                @for (column of columnToggles; track column.key) {
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitemcheckbox"
                    [attr.aria-checked]="column.visible"
                    (click)="toggleColumn(column.id)"
                  >
                    <svg
                      class="tbx-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{{ column.title }}</span>
                  </button>
                }
                @if (storageKey) {
                  <div class="tbx-menu-separator"></div>
                  <button
                    type="button"
                    class="tbx-menu-item tbx-menu-item--reset"
                    role="menuitem"
                    (click)="resetView()"
                  >
                    <svg
                      class="tbx-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    <span>{{ strings.resetView }}</span>
                  </button>
                }
              </div>
            }
          </div>
        }

        @if (isDensityVisible) {
          <div class="tbx-menu-wrap">
            <button
              type="button"
              class="tbx-btn tbx-capitalize"
              aria-haspopup="menu"
              [attr.aria-expanded]="openMenu === 'density'"
              (click)="toggleMenu('density', $event)"
            >
              <svg
                class="tbx-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4.5" width="18" height="6" rx="1.5" />
                <rect x="3" y="13.5" width="18" height="6" rx="1.5" />
              </svg>
              <span>{{ densityButtonLabel }}</span>
            </button>
            @if (openMenu === 'density') {
              <div class="tbx-menu" role="menu" (click)="$event.stopPropagation()">
                @for (option of densityOptions; track option.value) {
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitemcheckbox"
                    [attr.aria-checked]="option.selected"
                    (click)="setDensity(option.value)"
                  >
                    <svg
                      class="tbx-check"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>{{ option.label }}</span>
                  </button>
                }
              </div>
            }
          </div>
        }

        @if (isExportVisible) {
          @if (resolvedExportMode === 'excel' || resolvedExportMode === 'csv') {
            <button
              type="button"
              class="tbx-btn tbx-btn--export"
              [disabled]="isExporting"
              [attr.aria-label]="isExporting ? strings.exportingButton : (resolvedExportMode === 'excel' ? (strings.exportExcelButton ?? 'Export Excel') : (strings.exportCsvButton ?? 'Export CSV'))"
              (click)="runExport(resolvedExportMode)"
            >
              <svg
                class="tbx-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" x2="12" y1="15" y2="3" />
              </svg>
              <span>{{ isExporting ? strings.exportingButton : (resolvedExportMode === 'excel' ? (strings.exportExcelButton ?? 'Export Excel') : (strings.exportCsvButton ?? 'Export CSV')) }}</span>
            </button>
          } @else if (resolvedExportMode === 'split') {
            <div class="tbx-menu-wrap">
              <div class="tbx-split-btn">
                <button
                  type="button"
                  class="tbx-btn tbx-btn--export"
                  [disabled]="isExporting"
                  [attr.aria-label]="isExporting ? strings.exportingButton : (strings.exportExcelButton ?? 'Export Excel')"
                  (click)="runExport('excel')"
                >
                  <svg
                    class="tbx-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" x2="12" y1="15" y2="3" />
                  </svg>
                  <span>{{ isExporting ? strings.exportingButton : (strings.exportExcelButton ?? 'Export Excel') }}</span>
                </button>
                <button
                  type="button"
                  class="tbx-btn tbx-btn--export"
                  aria-haspopup="menu"
                  [disabled]="isExporting"
                  [attr.aria-expanded]="openMenu === 'export'"
                  aria-label="More export options"
                  (click)="toggleMenu('export', $event)"
                >
                  <svg
                    class="tbx-icon tbx-chevron"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
              @if (openMenu === 'export') {
                <div
                  class="tbx-menu tbx-menu--end"
                  role="menu"
                  (click)="$event.stopPropagation()"
                >
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitem"
                    (click)="runExport('excel')"
                  >
                    <svg
                      class="tbx-icon--excel"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                      <path d="M8 13h2" />
                      <path d="M14 13h2" />
                      <path d="M8 17h2" />
                      <path d="M14 17h2" />
                    </svg>
                    <div class="tbx-menu-item-title">
                      <strong>{{ strings.exportExcelTitle }}</strong>
                      <small>{{ strings.exportExcelSubtitle }}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitem"
                    (click)="runExport('csv')"
                  >
                    <svg
                      class="tbx-icon--csv"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                      <path d="M10 9H8" />
                      <path d="M16 13H8" />
                      <path d="M16 17H8" />
                    </svg>
                    <div class="tbx-menu-item-title">
                      <strong>{{ strings.exportCsvTitle }}</strong>
                      <small>{{ strings.exportCsvSubtitle }}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitem"
                    (click)="runExport('clipboard')"
                  >
                    <svg
                      class="tbx-icon--csv"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                      <path d="M10 9H8" />
                      <path d="M16 13H8" />
                      <path d="M16 17H8" />
                    </svg>
                    <div class="tbx-menu-item-title">
                      <strong>{{ strings.exportClipboardTitle }}</strong>
                      <small>{{ strings.exportClipboardSubtitle }}</small>
                    </div>
                  </button>
                </div>
              }
            </div>
          } @else {
            <div class="tbx-menu-wrap">
              <button
                type="button"
                class="tbx-btn tbx-btn--export"
                aria-haspopup="menu"
                [disabled]="isExporting"
                [attr.aria-expanded]="openMenu === 'export'"
                (click)="toggleMenu('export', $event)"
              >
                <svg
                  class="tbx-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                <span>{{ isExporting ? strings.exportingButton : strings.exportButton }}</span>
                <svg
                  class="tbx-icon tbx-chevron"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              @if (openMenu === 'export') {
                <div
                  class="tbx-menu tbx-menu--end"
                  role="menu"
                  (click)="$event.stopPropagation()"
                >
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitem"
                    (click)="runExport('excel')"
                  >
                    <svg
                      class="tbx-icon--excel"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                      <path d="M8 13h2" />
                      <path d="M14 13h2" />
                      <path d="M8 17h2" />
                      <path d="M14 17h2" />
                    </svg>
                    <div class="tbx-menu-item-title">
                      <strong>{{ strings.exportExcelTitle }}</strong>
                      <small>{{ strings.exportExcelSubtitle }}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitem"
                    (click)="runExport('csv')"
                  >
                    <svg
                      class="tbx-icon--csv"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                      <path d="M10 9H8" />
                      <path d="M16 13H8" />
                      <path d="M16 17H8" />
                    </svg>
                    <div class="tbx-menu-item-title">
                      <strong>{{ strings.exportCsvTitle }}</strong>
                      <small>{{ strings.exportCsvSubtitle }}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="tbx-menu-item"
                    role="menuitem"
                    (click)="runExport('clipboard')"
                  >
                    <svg
                      class="tbx-icon--csv"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                      <path d="M10 9H8" />
                      <path d="M16 13H8" />
                      <path d="M16 17H8" />
                    </svg>
                    <div class="tbx-menu-item-title">
                      <strong>{{ strings.exportClipboardTitle }}</strong>
                      <small>{{ strings.exportClipboardSubtitle }}</small>
                    </div>
                  </button>
                </div>
              }
            </div>
          }
        }
        @if (toolbarSlot) {
            <ng-container [ngTemplateOutlet]="toolbarSlot.template" />
          }
          <ng-content select="[toolbarActions]" />
        </div>
      </div>
      }

      @if (showFilterPills && hasActiveFilters()) {
        <div class="tbx-filter-pills-bar">
          <span class="tbx-filter-pills-title">Active filters:</span>
          @if (query.q) {
            <div class="tbx-filter-pill">
              <span class="tbx-filter-pill-label">{{ searchPlaceholder || strings.searchPlaceholder || 'Search' }}:</span>
              <span class="tbx-filter-pill-val">"{{ query.q }}"</span>
              <button
                type="button"
                class="tbx-filter-pill-remove"
                title="Clear search"
                aria-label="Clear search"
                (click)="clearSearchFilter()"
              >
                ✕
              </button>
            </div>
          }
          @for (item of activeColumnFilterEntries(); track item.key) {
            <div class="tbx-filter-pill">
              <span class="tbx-filter-pill-label">{{ item.title }}:</span>
              <span class="tbx-filter-pill-val">{{ item.val }}</span>
              <button
                type="button"
                class="tbx-filter-pill-remove"
                [attr.title]="'Remove ' + item.title + ' filter'"
                [attr.aria-label]="'Remove ' + item.title + ' filter'"
                (click)="clearColumnFilter(item.key)"
              >
                ✕
              </button>
            </div>
          }
          <button
            type="button"
            class="tbx-filter-pill-clear-all"
            (click)="clearAllFilters()"
          >
            Clear all
          </button>
        </div>
      }

      <div class="tbx-table-wrap">
        <table class="tbx-table" [attr.aria-label]="caption">
          <thead>
            <ng-template #thInner let-header>
              <div
                class="tbx-th-inner"
                [class.tbx-th-inner--center]="header.align === 'center'"
                [class.tbx-th-inner--right]="header.align === 'right'"
              >
                <span>{{ header.title }}</span>
                @if (header.sortable) {
                  <span class="tbx-sort-icon-wrap">
                    @switch (header.sortState) {
                      @case ('asc') {
                        <svg
                          class="tbx-sort-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m5 12 7-7 7 7" />
                          <path d="M12 19V5" />
                        </svg>
                      }
                      @case ('desc') {
                        <svg
                          class="tbx-sort-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 5v14" />
                          <path d="m19 12-7 7-7-7" />
                        </svg>
                      }
                      @default {
                        <svg
                          class="tbx-sort-icon tbx-sort-icon--idle"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m21 16-4 4-4-4" />
                          <path d="M17 20V4" />
                          <path d="m3 8 4-4 4 4" />
                          <path d="M7 4v16" />
                        </svg>
                      }
                    }
                    @if (header.sortOrder !== null) {
                      <span class="tbx-sort-order">{{ header.sortOrder }}</span>
                    }
                  </span>
                }

                @if (header.showMenuTrigger) {
                  <div
                    class="tbx-col-filter-wrap"
                    draggable="false"
                    (dragstart)="$event.preventDefault(); $event.stopPropagation()"
                    (click)="$event.stopPropagation()"
                  >
                    <button
                      type="button"
                      class="tbx-col-filter-btn"
                      [attr.data-filter-col]="header.id"
                      [class.tbx-col-filter-btn--active]="header.activeFilter !== undefined && header.activeFilter !== ''"
                      [attr.aria-expanded]="openFilterColumn === header.id"
                      [attr.aria-label]="'Options and filter for ' + header.title"
                      (click)="toggleFilterPopover(header, $event)"
                    >
                      <svg
                        class="tbx-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>
                  </div>
                }
              </div>

              @if (enableColumnResize) {
                <div
                  class="tbx-resize-handle"
                  draggable="false"
                  (dragstart)="$event.preventDefault(); $event.stopPropagation()"
                  (pointerdown)="onResizePointerDown(header.id, header, $event)"
                  (dblclick)="onResizeHandleDblClick(header.id)"
                ></div>
              }
            </ng-template>

            <tr>
              @if (hasExpandColumn) {
                <th
                  class="tbx-th tbx-th--expand"
                  scope="col"
                  [attr.rowspan]="hasHeaderGroups ? 2 : null"
                  [class.tbx-th--pinned-left]="expandPinnedLeft !== null"
                  [class.tbx-pinned-border-left]="expandIsLastLeftPinned"
                  [style.width.px]="40"
                  [style.left.px]="expandPinnedLeft"
                ></th>
              }
              @if (enableSelection) {
                <th
                  class="tbx-th tbx-th--select"
                  scope="col"
                  [attr.rowspan]="hasHeaderGroups ? 2 : null"
                  [class.tbx-th--pinned-left]="selectPinnedLeft !== null"
                  [class.tbx-pinned-border-left]="selectIsLastLeftPinned"
                  [style.left.px]="selectPinnedLeft"
                >
                  @if (selectionMode !== 'single') {
                    <input
                      type="checkbox"
                      class="tbx-checkbox"
                      [checked]="allPageSelected"
                      [indeterminate]="somePageSelected"
                      [attr.aria-label]="strings.selectAllLabel"
                      (change)="toggleSelectAll()"
                    />
                  }
                </th>
              }
              @if (showSerialNumber) {
                <th
                  class="tbx-th tbx-th--serial"
                  scope="col"
                  [attr.rowspan]="hasHeaderGroups ? 2 : null"
                  [class.tbx-th--pinned-left]="serialPinnedLeft !== null"
                  [class.tbx-pinned-border-left]="serialIsLastLeftPinned"
                  [style.left.px]="serialPinnedLeft"
                >
                  {{ strings.serialHeader }}
                </th>
              }
              @for (header of topHeaderCells; track header.key) {
                @if (header.isGroup) {
                  <th
                    class="tbx-th tbx-th--group"
                    scope="colgroup"
                    [attr.colspan]="header.colSpan"
                  >
                    <span class="tbx-th-group-title">{{ header.title }}</span>
                  </th>
                } @else {
                  <th
                    class="tbx-th"
                    scope="col"
                    [attr.rowspan]="header.rowSpan && header.rowSpan > 1 ? header.rowSpan : null"
                    [attr.draggable]="header.draggable ? 'true' : null"
                    [class.tbx-th--sortable]="header.sortable"
                    [class.tbx-th--draggable]="header.draggable"
                    [class.tbx-th--dragging]="draggedColumnId === header.id"
                    [class.tbx-th--pinned-left]="header.pinnedLeft !== null && header.pinnedLeft !== undefined"
                    [class.tbx-th--pinned-right]="header.pinnedRight !== null && header.pinnedRight !== undefined"
                    [class.tbx-pinned-border-left]="header.isLastLeftPinned"
                    [class.tbx-pinned-border-right]="header.isFirstRightPinned"
                    [attr.tabindex]="header.sortable ? 0 : null"
                    [attr.aria-sort]="header.ariaSort"
                    [style.width.px]="header.width"
                    [style.minWidth.px]="header.minWidth"
                    [style.textAlign]="header.align"
                    [style.left.px]="header.pinnedLeft"
                    [style.right.px]="header.pinnedRight"
                    (pointerdown)="onHeaderPointerDown(header, $event)"
                    (dragstart)="onHeaderDragStart(header, $event)"
                    (dragover)="onHeaderDragOver(header, $event)"
                    (drop)="onHeaderDrop(header, $event)"
                    (dragend)="onHeaderDragEnd(header, $event)"
                    (click)="onHeaderActivate(header, $event)"
                    (keydown.enter)="onHeaderKeydown($event, header)"
                    (keydown.space)="onHeaderKeydown($event, header)"
                  >
                    <ng-container *ngTemplateOutlet="thInner; context: { $implicit: header }"></ng-container>
                  </th>
                }
              }
            </tr>
            @if (hasHeaderGroups) {
              <tr>
                @for (header of bottomHeaderCells; track header.key) {
                  <th
                    class="tbx-th tbx-th--grouped-child"
                    scope="col"
                    [class.tbx-th--sortable]="header.sortable"
                    [class.tbx-th--pinned-left]="header.pinnedLeft !== null && header.pinnedLeft !== undefined"
                    [class.tbx-th--pinned-right]="header.pinnedRight !== null && header.pinnedRight !== undefined"
                    [class.tbx-pinned-border-left]="header.isLastLeftPinned"
                    [class.tbx-pinned-border-right]="header.isFirstRightPinned"
                    [attr.tabindex]="header.sortable ? 0 : null"
                    [attr.aria-sort]="header.ariaSort"
                    [style.width.px]="header.width"
                    [style.minWidth.px]="header.minWidth"
                    [style.textAlign]="header.align"
                    [style.left.px]="header.pinnedLeft"
                    [style.right.px]="header.pinnedRight"
                    (click)="onHeaderActivate(header, $event)"
                    (keydown.enter)="onHeaderKeydown($event, header)"
                    (keydown.space)="onHeaderKeydown($event, header)"
                  >
                    <ng-container *ngTemplateOutlet="thInner; context: { $implicit: header }"></ng-container>
                  </th>
                }
              </tr>
            }
          </thead>
          <tbody>
            @if (isLoading) {
              <tr>
                <td class="tbx-state" [attr.colspan]="columnSpan">
                  <div class="tbx-dotted-loader" aria-hidden="true">
                    <span class="tbx-dot"></span>
                    <span class="tbx-dot"></span>
                    <span class="tbx-dot"></span>
                    <span class="tbx-dot"></span>
                  </div>
                  <div class="tbx-loading-text" aria-live="polite">{{ strings.loadingText }}</div>
                </td>
              </tr>
            } @else if (rows.length === 0) {
              <tr>
                <td class="tbx-state" [attr.colspan]="columnSpan">{{ strings.emptyText }}</td>
              </tr>
            } @else {
              @for (row of rows; track row.key) {
                <tr
                  class="tbx-row"
                  [class.tbx-row--selected]="row.selected"
                  [class.tbx-row--expanded]="row.expanded"
                  [class.tbx-row--clickable]="isRowClickable"
                  (click)="onRowActivate(row)"
                >
                  @if (hasExpandColumn) {
                    <td
                      class="tbx-td tbx-td--expand"
                      [class.tbx-td--pinned-left]="expandPinnedLeft !== null"
                      [class.tbx-pinned-border-left]="expandIsLastLeftPinned"
                      [style.width.px]="40"
                      [style.left.px]="expandPinnedLeft"
                      (click)="$event.stopPropagation()"
                    >
                      <button
                        type="button"
                        class="tbx-expand-btn"
                        [class.tbx-expand-btn--open]="row.expanded"
                        [attr.aria-expanded]="row.expanded"
                        [attr.aria-label]="row.expanded ? 'Collapse row' : 'Expand row'"
                        (click)="toggleExpandRow(row.id, $event)"
                      >
                        <svg
                          class="tbx-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    </td>
                  }
                  @if (enableSelection) {
                    <td
                      class="tbx-td tbx-td--select"
                      [class.tbx-td--pinned-left]="selectPinnedLeft !== null"
                      [class.tbx-pinned-border-left]="selectIsLastLeftPinned"
                      [style.left.px]="selectPinnedLeft"
                      (click)="$event.stopPropagation()"
                    >
                      <input
                        [type]="selectionMode === 'single' ? 'radio' : 'checkbox'"
                        [attr.name]="selectionMode === 'single' ? selectRadioGroupName : null"
                        class="tbx-checkbox"
                        [checked]="row.selected"
                        [attr.aria-label]="row.selectLabel"
                        (change)="toggleRow(row)"
                      />
                    </td>
                  }
                  @if (showSerialNumber) {
                    <td
                      class="tbx-td tbx-td--serial"
                      [class.tbx-td--pinned-left]="serialPinnedLeft !== null"
                      [class.tbx-pinned-border-left]="serialIsLastLeftPinned"
                      [style.left.px]="serialPinnedLeft"
                    >
                      {{ row.serial }}
                    </td>
                  }
                  @for (cell of row.cells; track cell.key) {
                    <td
                      class="tbx-td"
                      [class.tbx-cell--editable]="cell.editable"
                      [class.tbx-td--pinned-left]="cell.pinnedLeft !== null && cell.pinnedLeft !== undefined"
                      [class.tbx-td--pinned-right]="cell.pinnedRight !== null && cell.pinnedRight !== undefined"
                      [class.tbx-pinned-border-left]="cell.isLastLeftPinned"
                      [class.tbx-pinned-border-right]="cell.isFirstRightPinned"
                      [style.textAlign]="cell.align"
                      [style.left.px]="cell.pinnedLeft"
                      [style.right.px]="cell.pinnedRight"
                      (dblclick)="onCellDblClick(row, cell, $event)"
                    >
                      @if (editingCell?.rowId === row.id && editingCell?.columnId === cell.columnId) {
                        <div
                          class="tbx-cell-edit-wrap"
                          (click)="$event.stopPropagation()"
                          (dblclick)="$event.stopPropagation()"
                        >
                          @if (cell.editType === 'select' && cell.editOptions && cell.editOptions.length > 0) {
                            <select
                              class="tbx-cell-edit-select tbx-cell-edit-input"
                              (change)="onEditValueChange($event)"
                              (keydown.enter)="$event.preventDefault(); commitCellEdit(row, cell)"
                              (keydown.escape)="$event.preventDefault(); cancelCellEdit($event)"
                            >
                              @for (opt of cell.editOptions; track opt) {
                                <option [value]="opt" [selected]="opt === editingValue">{{ opt }}</option>
                              }
                            </select>
                          } @else {
                            <input
                              [type]="cell.editType === 'number' ? 'number' : 'text'"
                              class="tbx-cell-edit-input"
                              [value]="editingValue"
                              (input)="onEditValueChange($event)"
                              (keydown.enter)="$event.preventDefault(); commitCellEdit(row, cell)"
                              (keydown.escape)="$event.preventDefault(); cancelCellEdit($event)"
                            />
                          }
                          <div class="tbx-cell-edit-actions">
                            <button
                              type="button"
                              class="tbx-cell-edit-btn tbx-cell-edit-btn--save"
                              aria-label="Save"
                              (click)="commitCellEdit(row, cell, $event)"
                            >
                              <svg
                                class="tbx-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="tbx-cell-edit-btn tbx-cell-edit-btn--cancel"
                              aria-label="Cancel"
                              (click)="cancelCellEdit($event)"
                            >
                              <svg
                                class="tbx-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      } @else if (cell.template) {
                        <ng-container
                          [ngTemplateOutlet]="cell.template"
                          [ngTemplateOutletContext]="cell.context"
                        />
                      } @else {
                        {{ cell.text }}
                      }
                    </td>
                  }
                </tr>
                @if (row.expanded && hasExpandColumn) {
                  <tr class="tbx-expanded-row">
                    <td class="tbx-expanded-cell" [attr.colspan]="columnSpan">
                      <div class="tbx-detail-panel">
                        @if (expandedRowSlot) {
                          <ng-container
                            [ngTemplateOutlet]="expandedRowSlot.template"
                            [ngTemplateOutletContext]="row.expandedContext"
                          />
                        } @else {
                          {{ row.expandedText }}
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            }
          </tbody>
          @if (!isLoading && hasSummary && rows.length > 0) {
            <tfoot>
              <tr class="tbx-summary-row">
                @if (hasExpandColumn) {
                  <td
                    class="tbx-summary-cell"
                    [class.tbx-td--pinned-left]="expandPinnedLeft !== null"
                    [class.tbx-pinned-border-left]="expandIsLastLeftPinned"
                    [style.width.px]="40"
                    [style.left.px]="expandPinnedLeft"
                  ></td>
                }
                @if (enableSelection) {
                  <td
                    class="tbx-summary-cell tbx-summary-cell--select"
                    [class.tbx-td--pinned-left]="selectPinnedLeft !== null"
                    [class.tbx-pinned-border-left]="selectIsLastLeftPinned"
                    [style.left.px]="selectPinnedLeft"
                  ></td>
                }
                @if (showSerialNumber) {
                  <td
                    class="tbx-summary-cell tbx-summary-cell--serial"
                    [class.tbx-td--pinned-left]="serialPinnedLeft !== null"
                    [class.tbx-pinned-border-left]="serialIsLastLeftPinned"
                    [style.left.px]="serialPinnedLeft"
                  ></td>
                }
                @for (sumCell of summaryCells; track sumCell.key) {
                  <td
                    class="tbx-summary-cell"
                    [class.tbx-td--pinned-left]="sumCell.pinnedLeft !== null && sumCell.pinnedLeft !== undefined"
                    [class.tbx-td--pinned-right]="sumCell.pinnedRight !== null && sumCell.pinnedRight !== undefined"
                    [class.tbx-pinned-border-left]="sumCell.isLastLeftPinned"
                    [class.tbx-pinned-border-right]="sumCell.isFirstRightPinned"
                    [style.textAlign]="sumCell.align"
                    [style.left.px]="sumCell.pinnedLeft"
                    [style.right.px]="sumCell.pinnedRight"
                  >
                    @if (sumCell.value !== null) {
                      @if (sumCell.label) {
                        <span class="tbx-summary-label">{{ sumCell.label }} </span>
                      }
                      <strong>{{ sumCell.value }}</strong>
                    } @else if (sumCell.isTotalLabel) {
                      <strong>Total</strong>
                    }
                  </td>
                }
              </tr>
            </tfoot>
          }
        </table>
      </div>

      @if (activeFilterHeader) {
        <div
          class="tbx-filter-popover"
          role="dialog"
          [attr.aria-label]="'Filter ' + activeFilterHeader.title"
          [style]="filterPopoverStyles"
          (pointerdown)="$event.stopPropagation()"
          (mousedown)="$event.stopPropagation()"
          (click)="$event.stopPropagation()"
        >
          @if (enableColumnMenu !== false && (activeFilterHeader.sortable || activeFilterHeader.canPin || activeFilterHeader.canHide)) {
            <div class="tbx-col-menu-actions">
              @if (activeFilterHeader.sortable) {
                <button
                  type="button"
                  data-col-action="sort-asc"
                  class="tbx-col-menu-btn"
                  [class.tbx-col-menu-btn--active]="activeFilterHeader.sortState === 'asc'"
                  (click)="applyQuickSort(activeFilterHeader, 'asc')"
                >
                  <svg
                    class="tbx-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 12 7-7 7 7" />
                    <path d="M12 19V5" />
                  </svg>
                  <span>{{ strings.sortAscending ?? 'Sort ascending' }}</span>
                </button>
                <button
                  type="button"
                  data-col-action="sort-desc"
                  class="tbx-col-menu-btn"
                  [class.tbx-col-menu-btn--active]="activeFilterHeader.sortState === 'desc'"
                  (click)="applyQuickSort(activeFilterHeader, 'desc')"
                >
                  <svg
                    class="tbx-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14" />
                    <path d="m19 12-7 7-7-7" />
                  </svg>
                  <span>{{ strings.sortDescending ?? 'Sort descending' }}</span>
                </button>
              }
              @if (activeFilterHeader.canPin && activeFilterHeader.pinState !== 'left') {
                <button
                  type="button"
                  data-col-action="pin-left"
                  class="tbx-col-menu-btn"
                  (click)="setColumnPin(activeFilterHeader.id, 'left')"
                >
                  <span>{{ strings.pinLeft ?? 'Pin left' }}</span>
                </button>
              }
              @if (activeFilterHeader.canPin && activeFilterHeader.pinState !== 'right') {
                <button
                  type="button"
                  data-col-action="pin-right"
                  class="tbx-col-menu-btn"
                  (click)="setColumnPin(activeFilterHeader.id, 'right')"
                >
                  <span>{{ strings.pinRight ?? 'Pin right' }}</span>
                </button>
              }
              @if (activeFilterHeader.canPin && (activeFilterHeader.pinState === 'left' || activeFilterHeader.pinState === 'right')) {
                <button
                  type="button"
                  data-col-action="unpin"
                  class="tbx-col-menu-btn tbx-col-menu-btn--active"
                  (click)="setColumnPin(activeFilterHeader.id, 'none')"
                >
                  <span>{{ strings.unpinColumn ?? 'Unpin column' }}</span>
                </button>
              }
              @if (activeFilterHeader.canHide) {
                <button
                  type="button"
                  data-col-action="hide"
                  class="tbx-col-menu-btn"
                  (click)="hideColumnFromMenu(activeFilterHeader.id)"
                >
                  <span>{{ strings.hideColumn ?? 'Hide column' }}</span>
                </button>
              }
            </div>
            @if (activeFilterHeader.serverFilterable) {
              <div class="tbx-col-menu-sep"></div>
            }
          }

          @if (activeFilterHeader.serverFilterable) {
            @if (activeFilterHeader.filterType === 'date-range' || activeFilterHeader.filterType === 'number-range') {
              <div class="tbx-range-inputs">
                <input
                  [type]="activeFilterHeader.filterType === 'date-range' ? 'date' : 'number'"
                  class="tbx-range-input"
                  [value]="filterRangeMin"
                  [placeholder]="activeFilterHeader.filterType === 'date-range' ? 'From' : 'Min'"
                  [attr.aria-label]="activeFilterHeader.filterType === 'date-range' ? 'From date' : 'Minimum'"
                  (input)="onFilterRangeMinInput($event)"
                  (keydown.enter)="$event.preventDefault(); submitActiveFilter()"
                  (keydown.escape)="$event.preventDefault(); closeFilterPopover()"
                />
                <span class="tbx-range-sep">to</span>
                <input
                  [type]="activeFilterHeader.filterType === 'date-range' ? 'date' : 'number'"
                  class="tbx-range-input"
                  [value]="filterRangeMax"
                  [placeholder]="activeFilterHeader.filterType === 'date-range' ? 'To' : 'Max'"
                  [attr.aria-label]="activeFilterHeader.filterType === 'date-range' ? 'To date' : 'Maximum'"
                  (input)="onFilterRangeMaxInput($event)"
                  (keydown.enter)="$event.preventDefault(); submitActiveFilter()"
                  (keydown.escape)="$event.preventDefault(); closeFilterPopover()"
                />
              </div>
            } @else if (activeFilterHeader.multiSelectFilter && activeFilterHeader.filterOptions && activeFilterHeader.filterOptions.length > 0) {
              <input
                type="text"
                class="tbx-filter-popover-input"
                [value]="filterInputText"
                [placeholder]="activeFilterHeader.filterPlaceholder || ('Filter ' + activeFilterHeader.title + '…')"
                (input)="onFilterTextInput($event)"
                (keydown.enter)="$event.preventDefault(); submitActiveFilter()"
                (keydown.escape)="$event.preventDefault(); closeFilterPopover()"
              />
              <div class="tbx-filter-popover-options" role="listbox" aria-multiselectable="true">
                <div
                  class="tbx-filter-option"
                  role="option"
                  [attr.aria-selected]="filterSelectedSet.size === 0"
                  [class.tbx-filter-option--selected]="filterSelectedSet.size === 0"
                  (click)="clearMultiFilterSelection()"
                >
                  {{ strings.filterAll }}
                </div>
                @for (opt of filteredPopoverOptions; track opt) {
                  <div
                    class="tbx-filter-option"
                    role="option"
                    [attr.aria-selected]="filterSelectedSet.has(opt)"
                    [class.tbx-filter-option--selected]="filterSelectedSet.has(opt)"
                    (click)="toggleMultiFilterOption(opt)"
                  >
                    <input
                      type="checkbox"
                      class="tbx-filter-option-check"
                      [checked]="filterSelectedSet.has(opt)"
                      (click)="$event.stopPropagation()"
                      (change)="toggleMultiFilterOption(opt)"
                      tabindex="-1"
                      aria-hidden="true"
                    />
                    <span>{{ opt }}</span>
                  </div>
                }
              </div>
            } @else {
              <input
                [type]="activeFilterHeader.filterType === 'date' ? 'date' : activeFilterHeader.filterType === 'number' ? 'number' : 'text'"
                class="tbx-filter-popover-input"
                [value]="filterInputText"
                [placeholder]="activeFilterHeader.filterPlaceholder || ('Filter ' + activeFilterHeader.title + '…')"
                (input)="onFilterTextInput($event)"
                (keydown.enter)="$event.preventDefault(); submitActiveFilter()"
                (keydown.escape)="$event.preventDefault(); closeFilterPopover()"
              />
              @if (activeFilterHeader.filterOptions && activeFilterHeader.filterOptions.length > 0) {
                <div class="tbx-filter-popover-options" role="listbox">
                  <div
                    class="tbx-filter-option"
                    role="option"
                    [attr.aria-selected]="!filterInputText.trim()"
                    [class.tbx-filter-option--selected]="!filterInputText.trim()"
                    (click)="applyColumnFilter(activeFilterHeader.id, undefined)"
                  >
                    {{ strings.filterAll }}
                  </div>
                  @for (opt of filteredPopoverOptions; track opt) {
                    <div
                      class="tbx-filter-option"
                      role="option"
                      [attr.aria-selected]="filterInputText === opt"
                      [class.tbx-filter-option--selected]="filterInputText === opt"
                      (click)="applyColumnFilter(activeFilterHeader.id, opt)"
                    >
                      {{ opt }}
                    </div>
                  }
                </div>
              }
            }
            <div class="tbx-filter-popover-actions">
              <button
                type="button"
                class="tbx-filter-popover-btn"
                (click)="applyColumnFilter(activeFilterHeader.id, undefined)"
              >
                <svg
                  class="tbx-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span>{{ strings.clearFilter }}</span>
              </button>
              <button
                type="button"
                class="tbx-filter-popover-btn tbx-filter-popover-btn--primary"
                (click)="submitActiveFilter()"
              >
                <svg
                  class="tbx-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{{ strings.applyFilter }}</span>
              </button>
            </div>
          }
        </div>
      }

      <div class="tbx-cards">
        @if (isLoading) {
          <div class="tbx-card">
            <div class="tbx-state">
              <div class="tbx-dotted-loader" aria-hidden="true">
                <span class="tbx-dot"></span>
                <span class="tbx-dot"></span>
                <span class="tbx-dot"></span>
                <span class="tbx-dot"></span>
              </div>
              <div class="tbx-loading-text" aria-live="polite">{{ strings.loadingText }}</div>
            </div>
          </div>
        } @else if (rows.length === 0) {
          <div class="tbx-card">
            <div class="tbx-state">{{ strings.emptyText }}</div>
          </div>
        } @else {
          @for (row of rows; track row.key) {
            <div
              class="tbx-card"
              [class.tbx-card--selected]="row.selected"
              [class.tbx-card--clickable]="isRowClickable"
              (click)="onRowActivate(row)"
            >
              @if (showSerialNumber || enableSelection) {
                <div class="tbx-card-head">
                  @if (showSerialNumber) {
                    <span class="tbx-card-serial">#{{ row.serial }}</span>
                  }
                  @if (enableSelection) {
                    <span class="tbx-card-select" (click)="$event.stopPropagation()">
                      <input
                        [type]="selectionMode === 'single' ? 'radio' : 'checkbox'"
                        [attr.name]="selectionMode === 'single' ? cardSelectRadioGroupName : null"
                        class="tbx-checkbox"
                        [checked]="row.selected"
                        [attr.aria-label]="row.selectLabel"
                        (change)="toggleRow(row)"
                      />
                    </span>
                  }
                </div>
              }
              <dl class="tbx-card-rows">
                @for (cell of row.cells; track cell.key) {
                  <div class="tbx-card-row">
                    <dt>{{ cell.header }}</dt>
                    <dd>
                      @if (cell.template) {
                        <ng-container
                          [ngTemplateOutlet]="cell.template"
                          [ngTemplateOutletContext]="cell.context"
                        />
                      } @else {
                        {{ cell.text }}
                      }
                    </dd>
                  </div>
                }
              </dl>
            </div>
          }
        }
      </div>

      @if (enableSelection && enableBulkActions && selectedCount > 0) {
        <div class="tbx-bulk-bar" role="region" aria-label="Bulk actions">
          <span class="tbx-bulk-badge">{{ selectedBadge }}</span>
          <div class="tbx-bulk-actions">
            @if (isExportVisible) {
              <button
                type="button"
                class="tbx-bulk-btn"
                [disabled]="isExporting"
                (click)="runBulkExport('excel')"
              >
                <svg
                  class="tbx-icon--excel"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                  <path d="M8 13h2" />
                  <path d="M14 13h2" />
                  <path d="M8 17h2" />
                  <path d="M14 17h2" />
                </svg>
                <span>{{ strings.exportExcelButton ?? 'Export Excel' }}</span>
              </button>
              <button
                type="button"
                class="tbx-bulk-btn"
                [disabled]="isExporting"
                (click)="runBulkExport('csv')"
              >
                <svg
                  class="tbx-icon--csv"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                  <path d="M10 9H8" />
                  <path d="M16 13H8" />
                  <path d="M16 17H8" />
                </svg>
                <span>{{ strings.exportCsvButton ?? 'Export CSV' }}</span>
              </button>
            }
            @if (bulkActionsSlot) {
              <ng-container
                [ngTemplateOutlet]="bulkActionsSlot.template"
                [ngTemplateOutletContext]="bulkActionsContext"
              />
            }
          </div>
          <button
            type="button"
            class="tbx-bulk-btn tbx-bulk-btn--close"
            aria-label="Deselect all"
            (click)="deselectAll()"
          >
            <svg
              class="tbx-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      }

      @if (showFooter) {
        <div class="tbx-footer">
          <div class="tbx-range">
            <span
              >@for (part of rangeParts; track part.key) {@if (part.strong) {<strong
                  [class.tbx-range-total]="part.total"
                  >{{ part.value }}</strong
                >} @else {{{ part.value }}}}</span
            >
            @if (selectedCount > 0) {
              <span class="tbx-selected-badge">{{ selectedBadge }}</span>
            }
          </div>

          <div class="tbx-pagination">
            @if (isRowsPerPageVisible) {
              <div class="tbx-rows-per-page">
                <span>{{ strings.rowsPerPage }}</span>
                <select
                  class="tbx-rows-select"
                  [attr.aria-label]="strings.rowsPerPage"
                  (change)="onPageSizeChange($event)"
                >
                  @for (size of pageSizes; track size) {
                    <option [attr.value]="size" [selected]="size === query.pageSize">{{ size }} rows</option>
                  }
                </select>
              </div>
            }

            @if (isPaginationVisible) {
              <div class="tbx-pager">
                <button
                  type="button"
                  class="tbx-page-nav"
                  [disabled]="currentPage <= 1"
                  [attr.aria-label]="strings.previousPage"
                  (click)="$event.preventDefault(); $event.stopPropagation(); goToPage(currentPage - 1)"
                >
                  <svg
                    class="tbx-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  <span class="tbx-sr-only">{{ strings.previousPage }}</span>
                </button>
                @for (item of pagerItems; track item.key) {
                  @if (item.gap) {
                    <span class="tbx-page-ellipsis">…</span>
                  } @else {
                    <button
                      type="button"
                      class="tbx-page-btn"
                      [class.tbx-page-btn--current]="item.current"
                      [attr.aria-current]="item.current ? 'page' : null"
                      [attr.aria-label]="item.label"
                      (click)="$event.preventDefault(); $event.stopPropagation(); goToPage(item.page)"
                    >
                      {{ item.page }}
                    </button>
                  }
                }
                <button
                  type="button"
                  class="tbx-page-nav"
                  [disabled]="currentPage >= totalPages"
                  [attr.aria-label]="strings.nextPage"
                  (click)="$event.preventDefault(); $event.stopPropagation(); goToPage(currentPage + 1)"
                >
                  <svg
                    class="tbx-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <span class="tbx-sr-only">{{ strings.nextPage }}</span>
                </button>
              </div>
            }

            @if (isJumpToPageVisible) {
              <form class="tbx-jump" (submit)="onJumpSubmit($event)">
                <label class="tbx-jump-label" [attr.for]="jumpInputId">{{ strings.goToPage }}</label>
                <input
                  class="tbx-jump-input"
                  type="number"
                  [attr.id]="jumpInputId"
                  [attr.min]="1"
                  [attr.max]="totalPages"
                  [value]="jumpValue"
                  [attr.aria-label]="strings.goToPageOf"
                  (input)="onJumpInput($event)"
                  (blur)="submitJump()"
                />
              </form>
            }
          </div>
        </div>
      }
    }
  `,
})
export class TableXComponent<TData>
  implements OnInit, OnChanges, AfterContentInit, OnDestroy
{
  // ---------------------------------------------------------------------
  // Inputs
  // ---------------------------------------------------------------------

  /** Column definitions. `header`/`cell` functions must return strings. */
  @Input({ required: true }) columns: TableXAngularColumn<TData>[] = [];

  /** The CURRENT page of rows (or the full dataset when client-side pagination is active). */
  @Input({ required: true }) data: TData[] = [];

  /** Total filtered row count, from the server. Optional in client-side mode. */
  @Input() total?: number;

  /** The active query. Optional in uncontrolled client-side mode. */
  @Input() query: QueryState = defaultQuery();

  /** Accessible name for the grid; also seeds the export file name. */
  @Input() caption = "Data Grid";

  /** Row height preset. Changing it later overrides the user's menu choice. */
  @Input() density: Density = "default";

  // The flag inputs coerce, so `<table-x enableSelection>` reads the way an
  // HTML boolean attribute is expected to read.

  /** Replaces the rows with a spinner while the host is fetching. */
  @Input({ transform: booleanAttribute }) isLoading = false;

  /** Replaces the WHOLE grid with an error card. */
  @Input({ transform: booleanAttribute }) error = false;

  /** Adds the selection checkbox column and the "N selected" badge. */
  @Input({ transform: booleanAttribute }) enableSelection = false;

  /** Selection mode: multi (default) or single. */
  @Input() selectionMode: "multi" | "single" = "multi";

  /** Enable column-level filter menus on column headers. */
  @Input({ transform: booleanAttribute }) enableColumnFilters = true;

  /** Show quick column actions (Sort Asc/Desc, Pin Left/Right/Unpin, Hide) inside the column `⋮` popover. */
  @Input({ transform: booleanAttribute }) enableColumnMenu?: boolean;

  /** Explicit fields searched by global search (`q`) in client mode. */
  @Input() searchableFields?: (keyof TData & string)[];

  /** Enable dragging column borders to resize columns. */
  @Input({ transform: booleanAttribute }) enableColumnResize = true;

  /** Enable drag-and-drop column reordering on header cells. */
  @Input({ transform: booleanAttribute }) enableColumnReorder = false;

  /** Show the summary / aggregation footer row (`<tfoot>`). Automatically shown when any column defines `meta.aggregation`. */
  @Input({ transform: booleanAttribute }) enableSummaryRow = false;

  /** Show the floating bulk-actions bar when rows are selected (`enableSelection` must also be true). */
  @Input({ transform: booleanAttribute }) enableBulkActions = true;

  /** Plain-text detail fallback for expandable rows when no `*tableXExpandedRow` template is provided. */
  @Input() renderExpandedRow?: (row: TData) => string;

  /** Show the global search box. */
  @Input({ transform: booleanAttribute }) enableSearch = true;

  /** Overrides `locale.searchPlaceholder`. */
  @Input() searchPlaceholder?: string;

  /** Show the automatic `S.No.` column. */
  @Input({ transform: booleanAttribute }) showSerialNumber = true;

  /** Show the columns toggle dropdown menu button. */
  @Input({ transform: booleanAttribute }) enableColumns = true;
  @Input({ transform: booleanAttribute }) showColumnsButton?: boolean;

  /** Show the density dropdown menu button. */
  @Input({ transform: booleanAttribute }) enableDensity = true;
  @Input({ transform: booleanAttribute }) showDensityButton?: boolean;

  /** Show the export menu. */
  @Input({ transform: booleanAttribute }) enableExport = true;
  @Input({ transform: booleanAttribute }) showExportButton?: boolean;

  /** Enable sorting across all columns. */
  @Input({ transform: booleanAttribute }) enableSorting = true;

  /** Show the footer pagination controls. */
  @Input({ transform: booleanAttribute }) enablePagination = true;
  @Input({ transform: booleanAttribute }) showPagination?: boolean;

  /** Show the rows-per-page dropdown in the footer. */
  @Input({ transform: booleanAttribute }) enableRowsPerPage = true;
  @Input({ transform: booleanAttribute }) showRowsPerPage?: boolean;

  /** Show the jump to page input in the footer. */
  @Input({ transform: booleanAttribute }) enableJumpToPage = true;
  @Input({ transform: booleanAttribute }) showJumpToPage?: boolean;

  /** Show the entire toolbar area. */
  @Input({ transform: booleanAttribute }) showToolbar = true;

  /** Show the entire footer area. */
  @Input({ transform: booleanAttribute }) showFooter = true;

  /** Unique key to persist and restore grid state (column widths, column order, hidden columns, density) in localStorage. */
  @Input() storageKey?: string;

  /** Show the active filter pills bar beneath the toolbar when filters or search are active. */
  @Input({ transform: booleanAttribute }) showFilterPills = true;

  /** Enable client-side pagination, sorting, search, and filtering over in-memory `data`. */
  @Input({ transform: booleanAttribute }) clientSidePagination = false;

  /** Explicit pagination mode: `"server"` (default) or `"client"`. */
  @Input() paginationMode: "client" | "server" = "server";

  /** Export file name without extension. Defaults to a slug of `caption`. */
  @Input() exportFileName?: string;

  /** Full in-memory dataset, enabling whole-dataset export across all pages. */
  @Input() allData?: readonly TData[];

  /** Function returning all matching rows for export without manual file generation. */
  @Input() fetchAllData?: (query: QueryState) => Promise<readonly TData[]> | readonly TData[];

  /** Paged fetch function to walk all pages for export without requiring a REST URL. */
  @Input() fetchPage?: (page: number, pageSize: number, query: QueryState) => Promise<PagedResponse<TData>>;

  /** Maximum rows collected during a full dataset export walk. Defaults to DEFAULT_ROW_CAP (2000). Pass 0 for uncapped. */
  @Input() maxExportRows?: number;

  /** Export button presentation: "menu" (default), "excel" (1-click direct), "csv" (1-click direct), or "split". */
  @Input() exportMode?: "menu" | "split" | "excel" | "csv";

  /** Shortcut for direct 1-click export (defaults to "excel" when true). */
  @Input() quickExport?: boolean | "excel" | "csv" | "clipboard";

  protected get resolvedExportMode(): "menu" | "split" | "excel" | "csv" {
    if (this.quickExport) {
      return typeof this.quickExport === "string" && (this.quickExport === "excel" || this.quickExport === "csv")
        ? this.quickExport
        : "excel";
    }
    return this.exportMode ?? "menu";
  }

  /**
   * List endpoint used to collect the WHOLE filtered dataset for an export.
   * Without it, exports contain the current page only.
   */
  @Input() fetchEndpoint?: string;

  /** Value-based badge styling for the Excel export. Defaults to core's rules. */
  @Input() badgeRules?: readonly ExcelBadgeRule[];

  /** Partial locale overrides, merged over the defaults. */
  @Input() locale?: Partial<TableXLocale>;

  /** Row identity, used for selection and `@for` tracking. */
  @Input() getRowId: (row: TData) => string = defaultRowId;

  /** `dark` / `auto` add the matching class to the root element. */
  @Input() theme: TableXTheme = "light";

  /**
   * Force the row-click affordance on. It is already on whenever something is
   * listening to `rowClick`, so this is only needed when a host binds the
   * output conditionally.
   */
  @Input({ transform: booleanAttribute }) rowClickable = false;

  // ---------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------

  /** A new `QueryState`. The host fetches it and feeds `data`/`total` back. */
  @Output() readonly queryChange = new EventEmitter<QueryState>();

  /** Emitted whenever the selected set changes. */
  @Output() readonly selectionChange = new EventEmitter<TableXSelectionChange>();

  /** A row was clicked (checkbox clicks never reach here). */
  @Output() readonly rowClick = new EventEmitter<TData>();

  /** The retry button in the error card was pressed. Observed => button shown. */
  @Output() readonly retry = new EventEmitter<void>();

  /** A user-facing notice. The grid never renders toasts itself. */
  @Output() readonly notify = new EventEmitter<TableXNotice>();

  /** Observed => replaces the built-in export entirely. */
  @Output() readonly exportAll = new EventEmitter<void>();

  /** Emitted with the ordered array of column IDs whenever columns are reordered via drag-and-drop. */
  @Output() readonly columnOrderChange = new EventEmitter<string[]>();

  /** Emitted whenever an inline cell edit is committed. */
  @Output() readonly cellEdit = new EventEmitter<TableXCellEditEvent<TData>>();

  // ---------------------------------------------------------------------
  // Content
  // ---------------------------------------------------------------------

  @ContentChildren(TableXCellDirective, { descendants: true })
  private readonly cellDirectives!: QueryList<TableXCellDirective>;

  @ContentChild(TableXToolbarDirective)
  protected toolbarSlot?: TableXToolbarDirective;

  @ContentChild(TableXExpandedRowDirective)
  protected expandedRowSlot?: TableXExpandedRowDirective;

  @ContentChild(TableXBulkActionsDirective)
  protected bulkActionsSlot?: TableXBulkActionsDirective;

  // ---------------------------------------------------------------------
  // Template state (protected: read by the template, not part of the API)
  // ---------------------------------------------------------------------

  private static nextInstanceId = 0;
  private readonly instanceUid = ++TableXComponent.nextInstanceId;
  protected readonly selectRadioGroupName = `tbx-sel-${this.instanceUid}`;
  protected readonly cardSelectRadioGroupName = `tbx-card-sel-${this.instanceUid}`;

  protected strings: TableXLocale = resolveLocale();
  protected currentDensity: Density = "default";
  protected openMenu: "columns" | "density" | "export" | null = null;
  protected openFilterColumn: string | null = null;
  protected activeFilterHeader: NexGridHeaderView | null = null;
  protected filterPopoverStyles: Record<string, string> | null = null;
  protected filterInputText = "";
  protected filterRangeMin = "";
  protected filterRangeMax = "";
  protected filterHasTyped = false;
  protected filterSelectedSet: Set<string> = new Set<string>();
  protected filteredPopoverOptions: readonly string[] = [];
  protected columnWidths: Record<string, number> = {};
  protected draggedColumnId: string | null = null;
  protected editingCell: { rowId: string; columnId: string } | null = null;
  protected editingValue = "";
  protected isExporting = false;
  protected searchText = "";
  protected searchLabel = "";
  protected jumpValue = "1";
  protected jumpInputId = "tbx-jump-page";

  protected hasExpandColumn = false;
  protected expandPinnedLeft: number | null = null;
  protected expandIsLastLeftPinned = false;
  protected selectPinnedLeft: number | null = null;
  protected selectIsLastLeftPinned = false;
  protected serialPinnedLeft: number | null = null;
  protected serialIsLastLeftPinned = false;

  protected headers: NexGridHeaderView[] = [];
  protected hasHeaderGroups = false;
  protected topHeaderCells: NexGridHeaderView[] = [];
  protected bottomHeaderCells: NexGridHeaderView[] = [];
  protected rows: NexGridRowView<TData>[] = [];
  protected hasSummary = false;
  protected summaryCells: TableXSummaryCellView[] = [];
  protected columnToggles: TableXColumnToggle[] = [];
  protected densityOptions: NexGridDensityOption[] = [];
  protected densityButtonLabel = "";
  protected pagerItems: NexGridPagerItem[] = [];
  protected rangeParts: NexGridRangePart[] = [];
  protected rangeLabel = "";
  protected selectedBadge = "";
  protected selectedCount = 0;
  protected allPageSelected = false;
  protected somePageSelected = false;
  protected bulkActionsContext: TableXBulkActionsTemplateContext = {
    $implicit: [],
    selectedIds: [],
    deselectAll: () => this.deselectAll(),
  };
  protected columnSpan = 1;
  protected currentPage = 1;
  protected totalPages = 1;
  protected readonly pageSizes = PAGE_SIZES;

  /** Row clicks are live when a host listens, or when forced by the input. */
  protected get isRowClickable(): boolean {
    return this.rowClickable || this.rowClick.observed;
  }

  get isColumnsVisible(): boolean {
    return this.enableColumns && this.showColumnsButton !== false;
  }

  get isDensityVisible(): boolean {
    return this.enableDensity && this.showDensityButton !== false;
  }

  get isExportVisible(): boolean {
    return this.enableExport && this.showExportButton !== false;
  }

  get isPaginationVisible(): boolean {
    return this.enablePagination && this.showPagination !== false;
  }

  get isRowsPerPageVisible(): boolean {
    return this.enableRowsPerPage && this.showRowsPerPage !== false;
  }

  get isJumpToPageVisible(): boolean {
    return this.enableJumpToPage && this.showJumpToPage !== false;
  }

  // ---------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);

  private readonly searchInput$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  private hiddenColumns: Readonly<Record<string, boolean>> = {};
  private pinnedColumns: Record<string, "left" | "right" | "none"> = {};
  private orderedColumns: TableXAngularColumn<TData>[] = [];
  private columnsSeeded = false;
  private hasBoundQuery = false;
  private selectedIds: ReadonlySet<string> = new Set<string>();
  private expandedRowIds = new Set<string>();
  private headerPointer: {
    colId: string;
    sortField: string;
    x: number;
    y: number;
    shiftKey: boolean;
    dropped: boolean;
  } | null = null;
  private cellTemplates = new Map<string, TemplateRef<NexGridCellTemplateContext<TData>>>();
  private detachMenuListeners: (() => void) | null = null;
  private detachFilterListeners: (() => void) | null = null;
  private detachResizeListeners: (() => void) | null = null;

  private get isClientMode(): boolean {
    return (
      this.clientSidePagination ||
      this.paginationMode === "client" ||
      (!this.hasBoundQuery && !this.queryChange.observed)
    );
  }

  /**
   * The search value we last pushed to the host. Lets an ECHO of our own
   * search (the host feeding `query.q` straight back) be ignored, while a
   * genuinely external `query.q` change still syncs into the input — without
   * clobbering what the user is typing mid-round-trip.
   */
  private pendingSearchEcho: string | null = null;

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  ngOnInit(): void {
    this.subscriptions.add(
      this.searchInput$
        .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged())
        .subscribe((text) => {
          if (text === (this.query.q ?? "")) return;
          this.pendingSearchEcho = text;
          this.emitQuery(withSearch(this.query, text));
        }),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["locale"]) this.strings = resolveLocale(this.locale);
    if (changes["density"]) this.currentDensity = this.density;
    if (changes["columns"] && this.columnsSeeded && this.columns.length > 0) {
      const colMap = new Map(this.columns.map((c) => [getColumnId(c), c]));
      const updatedOrder: TableXAngularColumn<TData>[] = [];
      for (const existing of this.orderedColumns) {
        const id = getColumnId(existing);
        const fresh = colMap.get(id);
        if (fresh) {
          updatedOrder.push(fresh);
          colMap.delete(id);
        }
      }
      for (const remaining of colMap.values()) {
        updatedOrder.push(remaining);
      }
      this.orderedColumns = updatedOrder;
    } else if (changes["columns"] && !this.columnsSeeded && this.columns.length > 0) {
      this.hiddenColumns = initialHiddenColumns(flattenColumns(this.columns));
      this.orderedColumns = [...this.columns];
      if (this.storageKey) {
        const persisted = loadGridState(this.storageKey);
        if (persisted) {
          if (persisted.density) {
            this.density = persisted.density;
            this.currentDensity = persisted.density;
          }
          if (persisted.columnWidths) Object.assign(this.columnWidths, persisted.columnWidths);
          if (persisted.pinnedColumns && typeof persisted.pinnedColumns === "object") {
            this.pinnedColumns = { ...persisted.pinnedColumns };
          }
          if (persisted.hiddenColumns && Array.isArray(persisted.hiddenColumns)) {
            const hiddenMap: Record<string, boolean> = {};
            for (const col of flattenColumns(this.columns)) {
              const id = getColumnId(col);
              if (id) hiddenMap[id] = persisted.hiddenColumns.includes(id);
            }
            this.hiddenColumns = hiddenMap;
          }
          if (persisted.columnOrder && Array.isArray(persisted.columnOrder)) {
            const colMap = new Map(this.columns.map((c) => [getColumnId(c), c]));
            const reordered: TableXAngularColumn<TData>[] = [];
            for (const id of persisted.columnOrder) {
              const col = colMap.get(id);
              if (col) {
                reordered.push(col);
                colMap.delete(id);
              }
            }
            for (const remaining of colMap.values()) {
              reordered.push(remaining);
            }
            if (reordered.length === this.columns.length) {
              this.orderedColumns = reordered;
            }
          }
        }
      }
      this.columnsSeeded = true;
    }
    if (changes["query"]) {
      this.hasBoundQuery = true;
      this.syncFromQuery();
    }

    this.recompute();
  }

  ngAfterContentInit(): void {
    this.syncCellTemplates();
    this.subscriptions.add(
      this.cellDirectives.changes.subscribe(() => {
        this.syncCellTemplates();
        this.cdr.markForCheck();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.searchInput$.complete();
    this.detachMenuListeners?.();
    this.detachMenuListeners = null;
    this.detachFilterListeners?.();
    this.detachFilterListeners = null;
    this.detachResizeListeners?.();
    this.detachResizeListeners = null;
  }

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  protected onSearchInput(event: Event): void {
    this.searchText = eventValue(event);
    this.searchInput$.next(this.searchText);
  }

  protected clearSearch(): void {
    this.searchText = "";
    this.searchInput$.next("");
  }

  // ---------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------

  /**
   * Toggle a dropdown. `stopPropagation` matters: the document listener that
   * closes menus is attached DURING this click, and would otherwise see the
   * same event bubble up and close the menu the instant it opened.
   */
  protected toggleMenu(name: MenuName, event: Event): void {
    event.stopPropagation();
    if (this.openMenu === name) {
      this.closeMenus();
      return;
    }
    this.openMenu = name;
    this.attachMenuListeners();
  }

  protected closeMenus(): void {
    this.openMenu = null;
    this.detachMenuListeners?.();
    this.detachMenuListeners = null;
  }

  /**
   * Outside-click and Escape handling, attached only while a menu is open and
   * registered OUTSIDE the Angular zone so a host app is not forced through a
   * change-detection pass on every click anywhere on the page.
   */
  private attachMenuListeners(): void {
    if (this.detachMenuListeners) return;

    const onClick = (): void => this.zone.run(() => this.closeAndCheck());
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") this.zone.run(() => this.closeAndCheck());
    };

    this.zone.runOutsideAngular(() => {
      this.document.addEventListener("click", onClick);
      this.document.addEventListener("keydown", onKeydown);
    });

    this.detachMenuListeners = () => {
      this.document.removeEventListener("click", onClick);
      this.document.removeEventListener("keydown", onKeydown);
    };
  }

  private closeAndCheck(): void {
    this.closeMenus();
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------
  // Columns / density
  // ---------------------------------------------------------------------

  /**
   * Column visibility is a `menuitemcheckbox`, so the menu deliberately stays
   * open — hiding four columns should not cost four trips to the button.
   */
  protected toggleColumn(id: string): void {
    this.hiddenColumns = { ...this.hiddenColumns, [id]: this.hiddenColumns[id] !== true };
    this.saveState();
    this.recompute();
  }

  protected setDensity(density: Density): void {
    this.currentDensity = density;
    this.saveState();
    this.recompute();
  }

  // ---------------------------------------------------------------------
  // Sorting, Column Drag-Reorder & Column Filtering
  // ---------------------------------------------------------------------

  protected onHeaderPointerDown(header: NexGridHeaderView, event: PointerEvent): void {
    if (!header.draggable) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
      this.headerPointer = null;
      return;
    }
    this.headerPointer = {
      colId: header.id,
      sortField: header.sortField || header.id,
      x: event.clientX,
      y: event.clientY,
      shiftKey: event.shiftKey,
      dropped: false,
    };
  }

  protected onHeaderDragStart(header: NexGridHeaderView, event: DragEvent): void {
    if (!header.draggable) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
      event.preventDefault();
      return;
    }
    this.draggedColumnId = header.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", header.id);
    }
  }

  protected onHeaderDragOver(header: NexGridHeaderView, event: DragEvent): void {
    if (!header.draggable || !this.draggedColumnId) return;
    event.preventDefault();
  }

  protected onHeaderDrop(header: NexGridHeaderView, event: DragEvent): void {
    if (!header.draggable) return;
    event.preventDefault();
    const fromId = this.draggedColumnId;
    const toId = header.id;
    if (!fromId || fromId === toId) return;
    if (this.headerPointer) {
      this.headerPointer.dropped = true;
    }
    const baseCols =
      this.orderedColumns.length === this.columns.length ? [...this.orderedColumns] : [...this.columns];
    const fromIdx = baseCols.findIndex((c) => getColumnId(c) === fromId);
    const toIdx = baseCols.findIndex((c) => getColumnId(c) === toId);
    if (fromIdx >= 0 && toIdx >= 0) {
      const moved = baseCols[fromIdx];
      if (!moved) return;
      baseCols.splice(fromIdx, 1);
      baseCols.splice(toIdx, 0, moved);
      this.orderedColumns = baseCols;
      this.saveState();
      this.recompute();
      this.columnOrderChange.emit(baseCols.map(getColumnId));
      this.cdr.markForCheck();
    }
  }

  protected onHeaderDragEnd(header: NexGridHeaderView, event: DragEvent): void {
    const ptr = this.headerPointer;
    this.headerPointer = null;
    this.draggedColumnId = null;
    if (
      header.sortable &&
      ptr &&
      ptr.colId === header.id &&
      !ptr.dropped &&
      event.clientX > 0 &&
      Math.hypot(event.clientX - ptr.x, event.clientY - ptr.y) < 6
    ) {
      this.emitQuery(
        ptr.shiftKey
          ? withToggledMultiSort(this.query, ptr.sortField)
          : withToggledSort(this.query, ptr.sortField),
      );
    }
    this.cdr.markForCheck();
  }

  protected onHeaderActivate(header: NexGridHeaderView, event?: MouseEvent | KeyboardEvent | Event): void {
    const target = event?.target as HTMLElement | null;
    if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
      return;
    }
    this.headerPointer = null;
    if (!header.sortable) return;
    const sortField = header.sortField || header.id;
    const isMulti =
      event instanceof MouseEvent || event instanceof KeyboardEvent ? event.shiftKey : false;
    this.emitQuery(
      isMulti ? withToggledMultiSort(this.query, sortField) : withToggledSort(this.query, sortField),
    );
  }

  protected onHeaderKeydown(event: Event, header: NexGridHeaderView): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".tbx-col-filter-wrap")) return;
    event.preventDefault();
    this.onHeaderActivate(header, event);
  }

  protected toggleFilterPopover(header: NexGridHeaderView, event: Event): void {
    event.stopPropagation();
    const id = header.id;
    if (this.openFilterColumn === id) {
      this.closeFilterPopover();
      return;
    }
    this.closeMenus();
    this.openFilterColumn = id;
    this.filterHasTyped = false;
    const activeVal = header.activeFilter ?? "";
    if (header.filterType === "date-range" || header.filterType === "number-range") {
      const parts = activeVal.split("..");
      this.filterRangeMin = parts[0] ?? "";
      this.filterRangeMax = parts[1] ?? "";
      this.filterInputText = "";
      this.filterSelectedSet = new Set();
    } else if (header.multiSelectFilter && header.filterOptions && header.filterOptions.length > 0) {
      const tokens = parseMultiFilterValues(activeVal, true).map((t) => t.toLowerCase());
      this.filterSelectedSet = new Set(
        header.filterOptions.filter((opt) => tokens.includes(opt.trim().toLowerCase())),
      );
      this.filterInputText = "";
      this.filterRangeMin = "";
      this.filterRangeMax = "";
    } else {
      this.filterInputText = activeVal;
      this.filterRangeMin = "";
      this.filterRangeMax = "";
      this.filterSelectedSet = new Set();
    }
    this.recompute();
    const btn = (event.currentTarget || event.target) as HTMLElement | null;
    this.updateFilterPopoverPosition(btn);
    this.attachFilterListeners();
    this.cdr.markForCheck();

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        const input = this.hostRef.nativeElement?.querySelector?.(
          ".tbx-filter-popover input",
        ) as HTMLInputElement | null;
        input?.focus?.({ preventScroll: true });
      });
    }
  }

  protected closeFilterPopover(): void {
    if (this.openFilterColumn === null && !this.detachFilterListeners) return;
    this.openFilterColumn = null;
    this.activeFilterHeader = null;
    this.filterPopoverStyles = null;
    this.detachFilterListeners?.();
    this.detachFilterListeners = null;
    this.cdr.markForCheck();
  }

  private updateFilterPopoverPosition(anchorBtn?: HTMLElement | null): void {
    if (!this.openFilterColumn) {
      this.filterPopoverStyles = null;
      return;
    }
    const rootEl = this.hostRef.nativeElement;
    const btn =
      anchorBtn ??
      (Array.from(rootEl?.querySelectorAll?.(".tbx-col-filter-btn") ?? []).find(
        (el) => el.getAttribute("data-filter-col") === this.openFilterColumn,
      ) as HTMLElement | undefined) ??
      null;

    if (!rootEl || !btn || typeof btn.getBoundingClientRect !== "function" || typeof rootEl.getBoundingClientRect !== "function") {
      this.filterPopoverStyles = null;
      return;
    }

    const rootRect = rootEl.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.width <= 0 || rootRect.width <= 0) {
      this.filterPopoverStyles = null;
      return;
    }

    const margin = 6;
    const popoverWidth = 240;
    const popoverHeight = 220;
    const viewportW = typeof window !== "undefined" ? window.innerWidth : 1024;
    const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;

    let viewportTop = btnRect.bottom + margin;
    if (viewportTop + popoverHeight > viewportH - 12 && btnRect.top - popoverHeight - margin > 12) {
      viewportTop = btnRect.top - popoverHeight - margin;
    }

    let viewportLeft = btnRect.right - popoverWidth;
    if (viewportLeft < 12) {
      viewportLeft = Math.max(12, btnRect.left);
    }
    if (viewportLeft + popoverWidth > viewportW - 12) {
      viewportLeft = Math.max(12, viewportW - popoverWidth - 12);
    }

    this.filterPopoverStyles = {
      position: "absolute",
      top: `${Math.round(viewportTop - rootRect.top)}px`,
      left: `${Math.round(viewportLeft - rootRect.left)}px`,
      right: "auto",
      "z-index": "60",
    };
  }

  private attachFilterListeners(): void {
    this.detachFilterListeners?.();
    const rootEl = this.hostRef.nativeElement;
    const tableWrap = rootEl?.querySelector?.(".tbx-table-wrap") as HTMLElement | null;

    const onPointerDown = (event: Event): void => {
      const target = event.target as Node | null;
      if (!target) return;
      const popover = rootEl?.querySelector?.(".tbx-filter-popover");
      if (popover?.contains(target)) return;
      const el = target as HTMLElement;
      if (el.closest?.(".tbx-col-filter-wrap")) return;
      this.zone.run(() => this.closeFilterPopover());
    };

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        this.zone.run(() => this.closeFilterPopover());
      }
    };

    const onReposition = (): void => {
      this.zone.run(() => {
        this.updateFilterPopoverPosition();
        this.cdr.markForCheck();
      });
    };

    this.zone.runOutsideAngular(() => {
      this.document.addEventListener("pointerdown", onPointerDown);
      this.document.addEventListener("keydown", onKeydown);
      tableWrap?.addEventListener("scroll", onReposition, { passive: true });
      if (typeof window !== "undefined") {
        window.addEventListener("resize", onReposition, { passive: true });
      }
    });

    this.detachFilterListeners = () => {
      this.document.removeEventListener("pointerdown", onPointerDown);
      this.document.removeEventListener("keydown", onKeydown);
      tableWrap?.removeEventListener("scroll", onReposition);
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", onReposition);
      }
    };
  }

  protected onFilterTextInput(event: Event): void {
    this.filterInputText = eventValue(event);
    this.filterHasTyped = true;
    this.syncFilteredPopoverOptions();
  }

  protected onFilterRangeMinInput(event: Event): void {
    this.filterRangeMin = eventValue(event);
  }

  protected onFilterRangeMaxInput(event: Event): void {
    this.filterRangeMax = eventValue(event);
  }

  private syncFilteredPopoverOptions(): void {
    const opts = this.activeFilterHeader?.filterOptions ?? [];
    if (!this.filterHasTyped || !this.filterInputText.trim()) {
      this.filteredPopoverOptions = opts;
      return;
    }
    const q = this.filterInputText.trim().toLowerCase();
    this.filteredPopoverOptions = opts.filter((opt) => opt.toLowerCase().includes(q));
  }

  protected toggleMultiFilterOption(opt: string): void {
    const next = new Set(this.filterSelectedSet);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    this.filterSelectedSet = next;
  }

  protected clearMultiFilterSelection(): void {
    this.filterSelectedSet = new Set();
  }

  protected applyQuickSort(header: NexGridHeaderView, dir: "asc" | "desc"): void {
    const sortField = header.sortField || header.id;
    this.closeFilterPopover();
    if (header.sortState === dir) {
      this.emitQuery({ ...this.query, sort: [], page: 1 });
    } else {
      this.emitQuery(withSort(this.query, sortField, dir));
    }
  }

  protected setColumnPin(id: string, side: "left" | "right" | "none"): void {
    this.pinnedColumns = { ...this.pinnedColumns, [id]: side };
    this.closeFilterPopover();
    this.saveState();
    this.recompute();
    this.cdr.markForCheck();
  }

  protected hideColumnFromMenu(id: string): void {
    this.hiddenColumns = { ...this.hiddenColumns, [id]: true };
    this.closeFilterPopover();
    this.saveState();
    this.recompute();
    this.cdr.markForCheck();
  }

  protected submitActiveFilter(): void {
    const header = this.activeFilterHeader;
    if (!header) return;
    if (header.filterType === "date-range" || header.filterType === "number-range") {
      const min = this.filterRangeMin.trim();
      const max = this.filterRangeMax.trim();
      const combined = min || max ? `${min}..${max}` : undefined;
      this.applyColumnFilter(header.id, combined);
      return;
    }
    if (header.multiSelectFilter && header.filterOptions && header.filterOptions.length > 0) {
      const ordered = header.filterOptions.filter((opt) => this.filterSelectedSet.has(opt));
      this.applyColumnFilter(header.id, serializeMultiFilterValues(ordered));
      return;
    }
    this.applyColumnFilter(header.id, this.filterInputText.trim() || undefined);
  }

  protected applyColumnFilter(id: string, value: string | undefined): void {
    const cols = flattenColumns(this.columns);
    const col = cols.find((c) => getColumnId(c) === id);
    const filterField = col ? getFilterField(col) : id;
    this.closeFilterPopover();
    let nextQuery = withFilter(this.query, filterField, value);
    if (filterField !== id && nextQuery.filter?.[id] !== undefined) {
      nextQuery = withFilter(nextQuery, id, undefined);
    }
    this.emitQuery(nextQuery);
  }

  protected onResizePointerDown(id: string, header: NexGridHeaderView, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.detachResizeListeners?.();
    const startX = event.clientX;
    const targetTh = ((event.currentTarget as HTMLElement)?.closest?.("th") ??
      (event.currentTarget as HTMLElement)?.parentElement) as HTMLElement | null;
    const startWidth = targetTh ? targetTh.getBoundingClientRect().width : (header.width ?? 120);

    const onMove = (moveEvent: PointerEvent) => {
      const nextW = Math.max(header.minWidth ?? 60, Math.round(startWidth + (moveEvent.clientX - startX)));
      this.columnWidths[id] = nextW;
      this.recompute();
      this.cdr.markForCheck();
    };

    const cleanup = () => {
      this.document.removeEventListener("pointermove", onMove);
      this.document.removeEventListener("pointerup", onUp);
      this.document.body?.classList.remove("tbx-resizing");
      this.detachResizeListeners = null;
    };

    const onUp = () => {
      cleanup();
      this.saveState();
    };

    this.detachResizeListeners = cleanup;
    this.document.body?.classList.add("tbx-resizing");
    this.document.addEventListener("pointermove", onMove);
    this.document.addEventListener("pointerup", onUp);
  }

  protected onResizeHandleDblClick(id: string): void {
    const cols = flattenColumns(
      this.orderedColumns.length === this.columns.length ? this.orderedColumns : this.columns,
    );
    const col = cols.find((c) => getColumnId(c) === id);
    if (!col) return;
    const meta = col.meta ?? {};
    let maxContentWidth = 0;
    const headerTitle = getColumnTitle(col) || id;
    maxContentWidth = Math.max(maxContentWidth, headerTitle.length * 8.5 + 50);

    for (const row of this.data) {
      const rawVal = getCellValue(col, row);
      const val = getCellText(rawVal);
      if (val) {
        maxContentWidth = Math.max(maxContentWidth, String(val).length * 8 + 26);
      }
    }

    const minW = meta.minWidth ?? 60;
    const maxW = 550;
    const finalWidth = Math.min(maxW, Math.max(minW, Math.round(maxContentWidth)));

    this.columnWidths[id] = finalWidth;
    this.saveState();
    this.recompute();
    this.cdr.markForCheck();
  }

  private saveState(): void {
    if (!this.storageKey) return;
    const hiddenList: string[] = [];
    for (const [id, isHidden] of Object.entries(this.hiddenColumns)) {
      if (isHidden) hiddenList.push(id);
    }
    const cols = this.orderedColumns.length === this.columns.length ? this.orderedColumns : this.columns;
    saveGridState(this.storageKey, {
      density: this.currentDensity,
      columnWidths: { ...this.columnWidths },
      columnOrder: cols.map(getColumnId).filter(Boolean) as string[],
      hiddenColumns: hiddenList,
      pinnedColumns: { ...this.pinnedColumns },
    });
  }

  protected resetView(): void {
    if (this.storageKey) {
      clearGridState(this.storageKey);
    }
    this.density = "default";
    this.currentDensity = "default";
    this.columnWidths = {};
    this.pinnedColumns = {};
    this.hiddenColumns = initialHiddenColumns(flattenColumns(this.columns));
    this.orderedColumns = [...this.columns];
    this.openMenu = null;
    this.recompute();
    if (this.columnOrderChange.observed) {
      this.columnOrderChange.emit(this.orderedColumns.map(getColumnId));
    }
    this.cdr.markForCheck();
  }

  protected hasActiveFilters(): boolean {
    return Boolean(this.query.q?.trim()) || Object.keys(this.query.filter ?? {}).some((k) => Boolean(this.query.filter?.[k]));
  }

  protected activeColumnFilterEntries(): Array<{ key: string; title: string; val: string }> {
    const filters = this.query.filter ?? {};
    const entries: Array<{ key: string; title: string; val: string }> = [];
    const cols = flattenColumns(
      this.orderedColumns.length === this.columns.length ? this.orderedColumns : this.columns,
    );
    for (const [key, val] of Object.entries(filters)) {
      if (val === undefined || val === "") continue;
      const keyLower = key.toLowerCase();
      const col = cols.find(
        (c) =>
          getColumnId(c).toLowerCase() === keyLower ||
          getFilterField(c).toLowerCase() === keyLower,
      );
      const title = col ? (getColumnTitle(col) || key) : key;
      entries.push({ key, title, val: formatFilterPillValue(String(val)) });
    }
    return entries;
  }

  protected clearSearchFilter(): void {
    this.clearSearch();
    this.emitQuery(withSearch(this.query, ""));
  }

  protected clearColumnFilter(key: string): void {
    this.emitQuery(withFilter(this.query, key, undefined));
  }

  protected clearAllFilters(): void {
    this.clearSearch();
    this.closeFilterPopover();
    this.emitQuery({ ...this.query, page: 1, q: undefined, filter: undefined });
  }

  // ---------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------

  protected toggleSelectAll(): void {
    if (this.selectionMode === "single") return;
    const next = new Set(this.selectedIds);
    if (this.allPageSelected) {
      for (const row of this.rows) next.delete(row.id);
    } else {
      for (const row of this.rows) next.add(row.id);
    }
    this.applySelection(next);
  }

  protected toggleRow(row: NexGridRowView<TData>): void {
    if (this.selectionMode === "single") {
      if (this.selectedIds.has(row.id)) this.applySelection(new Set());
      else this.applySelection(new Set([row.id]));
      return;
    }
    const next = new Set(this.selectedIds);
    if (next.has(row.id)) next.delete(row.id);
    else next.add(row.id);
    this.applySelection(next);
  }

  protected deselectAll(): void {
    if (this.selectedIds.size === 0) return;
    this.applySelection(new Set());
  }

  private applySelection(next: Set<string>): void {
    this.selectedIds = next;
    this.recompute();
    this.selectionChange.emit({ ids: Array.from(next), allAcrossSelected: false });
  }

  // ---------------------------------------------------------------------
  // Rows, Expansion & Inline Cell Editing
  // ---------------------------------------------------------------------

  protected onRowActivate(row: NexGridRowView<TData>): void {
    if (!this.isRowClickable) return;
    this.rowClick.emit(row.data);
  }

  protected toggleExpandRow(rowId: string, event: Event): void {
    event.stopPropagation();
    if (this.expandedRowIds.has(rowId)) {
      this.expandedRowIds.delete(rowId);
    } else {
      this.expandedRowIds.add(rowId);
    }
    this.recompute();
  }

  protected onCellDblClick(
    row: NexGridRowView<TData>,
    cell: NexGridCellView<TData>,
    event: MouseEvent,
  ): void {
    if (!cell.editable) return;
    event.stopPropagation();
    this.editingCell = { rowId: row.id, columnId: cell.columnId };
    this.editingValue =
      cell.rawValue !== null && cell.rawValue !== undefined ? String(cell.rawValue) : "";
    this.cdr.markForCheck();

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        const input = this.hostRef.nativeElement?.querySelector?.(
          ".tbx-cell-edit-input",
        ) as (HTMLElement & { value?: string }) | null;
        if (input) {
          if ("value" in input && input.value !== this.editingValue) {
            input.value = this.editingValue;
          }
          input.focus?.();
        }
      });
    }
  }

  protected onEditValueChange(event: Event): void {
    this.editingValue = eventValue(event);
  }

  protected cancelCellEdit(event?: Event): void {
    event?.stopPropagation();
    this.editingCell = null;
    this.cdr.markForCheck();
  }

  protected commitCellEdit(
    row: NexGridRowView<TData>,
    cell: NexGridCellView<TData>,
    event?: Event,
  ): void {
    event?.stopPropagation();
    const rawVal = this.editingValue;
    const nextVal = cell.editType === "number" ? Number(rawVal) : rawVal;
    const cols = flattenColumns(
      this.orderedColumns.length === this.columns.length ? this.orderedColumns : this.columns,
    );
    const col = cols.find((c) => getColumnId(c) === cell.columnId);
    const propKey =
      col?.accessorKey !== undefined && String(col.accessorKey) !== ""
        ? String(col.accessorKey)
        : cell.columnId;
    const targetRow = row.data;
    if (
      targetRow !== null &&
      typeof targetRow === "object" &&
      !Object.isFrozen(targetRow) &&
      !propKey.includes(".") &&
      propKey !== "__proto__" &&
      propKey !== "constructor" &&
      propKey !== "prototype"
    ) {
      try {
        (targetRow as Record<string, unknown>)[propKey] = nextVal;
      } catch {
        // Host owns immutable/read-only state via (cellEdit)
      }
    }
    this.editingCell = null;
    this.recompute();
    this.cellEdit.emit({
      row: targetRow,
      columnId: cell.columnId,
      oldValue: cell.rawValue,
      newValue: nextVal,
    });
    this.cdr.markForCheck();
  }

  // ---------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------

  protected goToPage(page: number): void {
    if (page === this.currentPage) return;
    this.emitQuery(withPage(this.query, page, this.totalPages));
  }

  protected onPageSizeChange(event: Event): void {
    const size = Number.parseInt(eventValue(event), 10);
    if (!isPageSize(size) || size === this.query.pageSize) return;
    this.emitQuery(withPageSize(this.query, size));
  }

  protected onJumpInput(event: Event): void {
    this.jumpValue = eventValue(event);
  }

  protected onJumpSubmit(event: Event): void {
    event.preventDefault();
    this.submitJump();
  }

  /** Enter or blur commits the jump; anything invalid snaps back. */
  protected submitJump(): void {
    const page = Number.parseInt(this.jumpValue, 10);
    if (Number.isFinite(page) && page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.emitQuery(withPage(this.query, page, this.totalPages));
      return;
    }
    this.jumpValue = String(this.currentPage);
  }

  // ---------------------------------------------------------------------
  // Export (spec section 5 — identical flow in every adapter)
  // ---------------------------------------------------------------------

  protected async runBulkExport(format: "excel" | "csv"): Promise<void> {
    const pool = this.allData ?? (this.isClientMode ? this.data : this.rows.map((r) => r.data));
    const selectedRows = pool.filter((r) => this.selectedIds.has(this.getRowId(r)));
    if (selectedRows.length > 0) {
      await this.exportRowsWithFormat(format, selectedRows);
      return;
    }
    await this.runExport(format);
  }

  protected async runExport(format: "excel" | "csv" | "clipboard"): Promise<void> {
    this.closeMenus();

    // 1. The host owns the export when it is listening for it.
    if (this.exportAll.observed && format !== "clipboard") {
      this.exportAll.emit();
      return;
    }

    this.isExporting = true;
    this.cdr.markForCheck();
    try {
      // 2. Collect rows: the whole filtered dataset when we can reach it.
      const rows = await this.collectExportRows();
      await this.exportRowsWithFormat(format, rows);
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  private async exportRowsWithFormat(
    format: "excel" | "csv" | "clipboard",
    rows: readonly TData[],
  ): Promise<void> {
    if (rows.length === 0) {
      this.notify.emit({ type: "error", message: this.strings.exportNoData });
      return;
    }

    const rawColumns =
      this.orderedColumns.length === this.columns.length ? this.orderedColumns : this.columns;
    const exportColumns = toExportColumns(
      visibleColumns(flattenColumns(rawColumns), this.hiddenColumns),
      {
        yes: this.strings.booleanYes,
        no: this.strings.booleanNo,
      },
    );
    const prefix = this.exportFileName ?? filePrefixFromCaption(this.caption);

    if (format === "clipboard") {
      const ok = await copyToClipboard(rows, exportColumns);
      if (ok) {
        this.notify.emit({
          type: "success",
          message: formatMessage(this.strings.exportClipboardSuccess, {
            count: rows.length.toLocaleString(),
          }),
        });
      } else {
        this.notify.emit({ type: "error", message: "Failed to copy to clipboard" });
      }
      return;
    }

    if (format === "excel") {
      const count = downloadExcel<TData>({
        filename: prefix,
        caption: this.caption,
        rows,
        columns: exportColumns,
        badgeRules: this.badgeRules,
        serialHeader: this.strings.serialHeader,
      });
      this.notify.emit({
        type: "success",
        message: formatMessage(this.strings.exportExcelSuccess, {
          count: count.toLocaleString(),
        }),
      });
    } else {
      const count = downloadCsv(timestampedFilename(prefix), rows, exportColumns);
      this.notify.emit({
        type: "success",
        message: formatMessage(this.strings.exportCsvSuccess, {
          count: count.toLocaleString(),
        }),
      });
    }
  }

  /**
   * The current page is the whole dataset when it already holds every row, or
   * when there is no endpoint to walk. Otherwise every page is fetched with
   * the CURRENT search / sort / filter preserved, so an export always matches
   * what the user is looking at.
   */
  private async collectExportRows(): Promise<TData[]> {
    const knownTotal = this.total ?? this.data.length;
    if (this.fetchAllData) {
      this.notify.emit({
        type: "info",
        message: formatMessage(this.strings.exportFetchingAll, {
          total: knownTotal.toLocaleString(),
        }),
      });
      try {
        const rows = await this.fetchAllData(this.query);
        return Array.isArray(rows) ? (rows as TData[]) : this.data;
      } catch {
        this.notify.emit({ type: "error", message: this.strings.exportFetchFailed });
        return this.data;
      }
    }

    const all = this.allData ?? (this.isClientMode ? this.data : undefined);
    if (all && all.length > 0) {
      const rawColumns = this.orderedColumns.length === this.columns.length ? this.orderedColumns : this.columns;
      const leafCols = flattenColumns(rawColumns);
      const searchFields =
        this.searchableFields && this.searchableFields.length > 0
          ? this.searchableFields
          : (searchableColumnIds(leafCols) as (keyof TData & string)[]);
      const full = queryClientData(all, this.query, {
        paginate: false,
        columns: rawColumns,
        ...(searchFields.length > 0 ? { searchableFields: searchFields } : {}),
      });
      return full.items;
    }

    if (this.fetchPage) {
      this.notify.emit({
        type: "info",
        message: formatMessage(this.strings.exportFetchingAll, {
          total: knownTotal.toLocaleString(),
        }),
      });
      try {
        const cap = this.maxExportRows ?? DEFAULT_ROW_CAP;
        const result = await fetchAllPages<TData>(
          (page, pageSize) => this.fetchPage!(page, pageSize, this.query),
          cap,
        );
        return cap > 0 && result.items.length > cap ? result.items.slice(0, cap) : result.items;
      } catch {
        this.notify.emit({ type: "error", message: this.strings.exportFetchFailed });
        return this.data;
      }
    }

    const endpoint = this.fetchEndpoint;
    if (!endpoint || this.data.length >= knownTotal) return this.data;

    this.notify.emit({
      type: "info",
      message: formatMessage(this.strings.exportFetchingAll, {
        total: knownTotal.toLocaleString(),
      }),
    });

    try {
      const cap = this.maxExportRows ?? DEFAULT_ROW_CAP;
      const result = await fetchAllPages<TData>(async (page, pageSize) => {
        const url = buildQueryUrl(endpoint, {
          ...this.query,
          page,
          pageSize: isPageSize(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
        });
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PagedResponse<TData>;
      }, cap);
      return cap > 0 && result.items.length > cap ? result.items.slice(0, cap) : result.items;
    } catch {
      this.notify.emit({ type: "error", message: this.strings.exportFetchFailed });
      return this.data;
    }
  }

  // ---------------------------------------------------------------------
  // View-model construction
  // ---------------------------------------------------------------------

  private emitQuery(next: QueryState): void {
    if (this.isClientMode) {
      this.query = next;
      this.recompute();
      this.cdr.markForCheck();
    }
    this.queryChange.emit(next);
  }

  /** Keep the search box and jump input in step with an external query. */
  private syncFromQuery(): void {
    const incoming = this.query.q ?? "";
    if (this.pendingSearchEcho !== null && incoming === this.pendingSearchEcho) {
      this.pendingSearchEcho = null;
    } else if (incoming !== this.searchText) {
      this.searchText = incoming;
      this.pendingSearchEcho = null;
    }
    this.jumpValue = String(Math.max(1, Math.trunc(this.query.page)));
  }

  private syncCellTemplates(): void {
    const templates = new Map<string, TemplateRef<NexGridCellTemplateContext<TData>>>();
    this.cellDirectives.forEach((directive) => {
      const key = directive.tableXCell || directive.nexGridCell;
      if (!key) return;
      // The directive cannot know the grid's row type (it is keyed by a column
      // id), so the two generic instantiations are reconciled here.
      templates.set(
        key,
        directive.template as TemplateRef<NexGridCellTemplateContext<TData>>,
      );
    });
    this.cellTemplates = templates;
    this.recompute();
  }

  private mapColumnToHeaderView(
    column: TableXAngularColumn<TData>,
    key: string,
    rowSpan: number,
    isGroupChild: boolean,
    leftOffsets: ReadonlyMap<string, number>,
    rightOffsets: ReadonlyMap<string, number>,
    lastLeftPinnedId: string | null,
    firstRightPinnedId: string | null,
    visibleCount: number,
  ): NexGridHeaderView {
    const id = getColumnId(column);
    const effectiveSortable = isSortable(column) && this.enableSorting !== false;
    const effectiveFilterable = isFilterable(column, this.enableColumnFilters !== false);
    const isNonStructural = !isStructuralColumn(column) && id !== "";
    const showMenuTrigger =
      effectiveFilterable || (isNonStructural && this.enableColumnMenu === true);
    const sortField = getSortField(column);
    const sortFieldLower = sortField.toLowerCase();
    const idLower = id.toLowerCase();
    const sortIndex = this.query.sort.findIndex(
      (s) => s.field.toLowerCase() === sortFieldLower || s.field.toLowerCase() === idLower,
    );
    const sortItem = sortIndex >= 0 ? this.query.sort[sortIndex] : undefined;
    const direction = effectiveSortable && sortItem ? sortItem.dir : null;
    const sortOrder = this.query.sort.length > 1 && sortIndex >= 0 ? sortIndex + 1 : null;
    const customWidth = this.columnWidths[id];
    const width = customWidth !== undefined ? customWidth : (column.meta?.width ?? null);
    const filterField = getFilterField(column);
    const filterFieldLower = filterField.toLowerCase();
    let activeFilter = this.query.filter?.[filterField] ?? this.query.filter?.[id];
    if (activeFilter === undefined && this.query.filter) {
      const matchKey = Object.keys(this.query.filter).find(
        (k) => k.toLowerCase() === filterFieldLower || k.toLowerCase() === idLower,
      );
      if (matchKey) activeFilter = this.query.filter[matchKey];
    }
    return {
      key,
      id,
      sortField,
      title: headerText(column) || id || "Column",
      sortable: effectiveSortable,
      sortState: direction ?? "none",
      sortOrder,
      serverFilterable: effectiveFilterable,
      showMenuTrigger,
      filterOptions: column.meta?.filterOptions,
      filterType: column.meta?.filterType,
      multiSelectFilter: isMultiSelectFilter(column),
      filterPlaceholder: column.meta?.filterPlaceholder,
      activeFilter,
      pinState: isPinned(column, this.pinnedColumns),
      canPin: isNonStructural,
      canHide: isHideable(column) && this.isColumnsVisible && visibleCount > 1,
      ariaSort: !effectiveSortable
        ? null
        : direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none",
      align: column.meta?.align ?? "left",
      width,
      minWidth: width === null ? (column.meta?.minWidth ?? 120) : null,
      rowSpan,
      colSpan: 1,
      isGroup: false,
      isGroupChild,
      pinnedLeft: leftOffsets.get(id) ?? null,
      pinnedRight: rightOffsets.get(id) ?? null,
      isLastLeftPinned: lastLeftPinnedId === id,
      isFirstRightPinned: firstRightPinnedId === id,
      draggable: this.enableColumnReorder && !isGroupChild,
    };
  }

  /** Rebuild everything the template reads. Cheap enough to never be partial. */
  private recompute(): void {
    const strings = this.strings;
    const rawColumns = this.orderedColumns.length === this.columns.length ? this.orderedColumns : this.columns;
    const leafCols = flattenColumns(rawColumns);
    const visible = visibleColumns(leafCols, this.hiddenColumns);
    const keys = trackKeys(visible.map(getColumnId));
    const headerRows = buildHeaderRows(rawColumns, this.hiddenColumns);
    this.hasHeaderGroups = headerRows.hasGroups;
    this.hasExpandColumn = Boolean(this.expandedRowSlot || this.renderExpandedRow);
    const labels = { yes: strings.booleanYes, no: strings.booleanNo };

    // Compute sticky left/right offsets matching React & Vanilla
    const leftOffsets = new Map<string, number>();
    const rightOffsets = new Map<string, number>();
    let lastLeftPinnedId: string | null = null;
    let currentLeft = 0;
    const hasLeftPinned = visible.some((c) => isPinned(c, this.pinnedColumns) === "left");

    if (hasLeftPinned) {
      if (this.hasExpandColumn) {
        leftOffsets.set("__expand", currentLeft);
        currentLeft += 40;
        lastLeftPinnedId = "__expand";
      }
      if (this.enableSelection) {
        leftOffsets.set("__select", currentLeft);
        currentLeft += 44;
        lastLeftPinnedId = "__select";
      }
      if (this.showSerialNumber) {
        leftOffsets.set("__serial", currentLeft);
        currentLeft += 56;
        lastLeftPinnedId = "__serial";
      }
      for (const col of visible) {
        const id = getColumnId(col);
        if (isPinned(col, this.pinnedColumns) === "left") {
          const w = this.columnWidths[id] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
          leftOffsets.set(id, currentLeft);
          currentLeft += w;
          lastLeftPinnedId = id;
        }
      }
    }

    let currentRight = 0;
    let firstRightPinnedId: string | null = null;
    for (let i = visible.length - 1; i >= 0; i--) {
      const col = visible[i];
      if (!col) continue;
      const id = getColumnId(col);
      if (isPinned(col, this.pinnedColumns) === "right") {
        const w = this.columnWidths[id] ?? col.meta?.width ?? col.meta?.minWidth ?? 140;
        rightOffsets.set(id, currentRight);
        currentRight += w;
        firstRightPinnedId = id;
      }
    }

    this.expandPinnedLeft = leftOffsets.get("__expand") ?? null;
    this.expandIsLastLeftPinned = lastLeftPinnedId === "__expand";
    this.selectPinnedLeft = leftOffsets.get("__select") ?? null;
    this.selectIsLastLeftPinned = lastLeftPinnedId === "__select";
    this.serialPinnedLeft = leftOffsets.get("__serial") ?? null;
    this.serialIsLastLeftPinned = lastLeftPinnedId === "__serial";

    this.searchLabel = `Search ${this.caption}`;
    this.jumpInputId = `tbx-jump-page-${this.caption.toLowerCase().replace(/\s+/g, "-")}`;

    this.headers = visible.map((column, index) =>
      this.mapColumnToHeaderView(
        column,
        keys[index] ?? String(index),
        1,
        false,
        leftOffsets,
        rightOffsets,
        lastLeftPinnedId,
        firstRightPinnedId,
        visible.length,
      ),
    );

    if (!headerRows.hasGroups) {
      this.topHeaderCells = this.headers;
      this.bottomHeaderCells = [];
    } else {
      this.topHeaderCells = headerRows.topRow.map((cell, idx) => {
        if (cell.isGroup) {
          return {
            key: `grp-${cell.id}-${idx}`,
            id: cell.id,
            title: cell.title,
            isGroup: true,
            colSpan: cell.colSpan,
            rowSpan: cell.rowSpan,
          };
        }
        return this.mapColumnToHeaderView(
          cell.leafColumn!,
          cell.id,
          cell.rowSpan,
          false,
          leftOffsets,
          rightOffsets,
          lastLeftPinnedId,
          firstRightPinnedId,
          visible.length,
        );
      });

      this.bottomHeaderCells = headerRows.bottomRow.map((cell) =>
        this.mapColumnToHeaderView(
          cell.leafColumn!,
          cell.id,
          1,
          true,
          leftOffsets,
          rightOffsets,
          lastLeftPinnedId,
          firstRightPinnedId,
          visible.length,
        ),
      );
    }

    this.activeFilterHeader = this.openFilterColumn
      ? (this.headers.find((h) => h.id === this.openFilterColumn) ?? null)
      : null;
    if (this.activeFilterHeader) {
      this.syncFilteredPopoverOptions();
    }

    const isClient = this.isClientMode;
    const searchFields =
      this.searchableFields && this.searchableFields.length > 0
        ? this.searchableFields
        : (searchableColumnIds(leafCols, this.hiddenColumns as Record<string, boolean>) as (keyof TData & string)[]);
    const clientPaged = isClient
      ? queryClientData(this.data, this.query, {
          columns: rawColumns,
          ...(searchFields.length > 0 ? { searchableFields: searchFields } : {}),
        })
      : null;
    const displayData = clientPaged ? clientPaged.items : this.data;
    const effectiveTotal = clientPaged ? clientPaged.total : (this.total ?? this.data.length);

    const page = Math.max(1, Math.trunc(this.query.page));
    const pageSize = this.query.pageSize;
    const rowKeys = new Set<string>();

    this.rows = displayData.map((row, rowIndex) => {
      const id = this.getRowId(row);
      const selected = this.selectedIds.has(id);
      const expanded = this.hasExpandColumn && this.expandedRowIds.has(id);
      const expandedText =
        expanded && !this.expandedRowSlot && this.renderExpandedRow
          ? this.renderExpandedRow(row)
          : null;
      const cells: NexGridCellView<TData>[] = visible.map((column, columnIndex) => {
        const header = this.headers[columnIndex];
        const value = getCellValue(column, row);
        const colId = getColumnId(column);
        const accessor = column.accessorKey === undefined ? "" : String(column.accessorKey);
        const template =
          this.cellTemplates.get(colId) ??
          (accessor ? this.cellTemplates.get(accessor) : undefined) ??
          null;
        return {
          key: header?.key ?? String(columnIndex),
          columnId: colId,
          rawValue: value,
          header: header?.title ?? "",
          align: header?.align ?? "left",
          template,
          context: template === null ? null : { $implicit: row, value, column, rowIndex },
          text: template === null ? cellText(column, row, value, labels) : "",
          editable: isEditable(column),
          editType: column.meta?.editType ?? "text",
          editOptions: column.meta?.editOptions,
          pinnedLeft: leftOffsets.get(colId) ?? null,
          pinnedRight: rightOffsets.get(colId) ?? null,
          isLastLeftPinned: lastLeftPinnedId === colId,
          isFirstRightPinned: firstRightPinnedId === colId,
        };
      });
      return {
        key: uniqueKey(id === "" ? String(rowIndex) : id, rowKeys),
        id,
        rowIndex,
        data: row,
        serial: serialNumber(page, pageSize, rowIndex),
        selected,
        expanded,
        expandedText,
        expandedContext: { $implicit: row, rowIndex },
        selectLabel: formatMessage(strings.selectRowLabel, { id }),
        cells,
      };
    });

    this.hasSummary =
      this.enableSummaryRow || visible.some((col) => col.meta?.aggregation !== undefined);
    if (this.hasSummary && displayData.length > 0) {
      this.summaryCells = visible.map((col, colIndex) => {
        const colId = getColumnId(col);
        const aggVal = computeAggregation(col, displayData);
        const aggLabel =
          col.meta?.aggregationLabel ||
          (typeof col.meta?.aggregation === "string" ? `${col.meta.aggregation}:` : "");
        return {
          key: `sum-${keys[colIndex] ?? colIndex}`,
          align: col.meta?.align ?? "left",
          label: aggLabel,
          value: aggVal !== null && aggVal !== undefined ? String(aggVal) : null,
          isTotalLabel: colIndex === 0 && !aggLabel && (aggVal === null || aggVal === undefined),
          pinnedLeft: leftOffsets.get(colId) ?? null,
          pinnedRight: rightOffsets.get(colId) ?? null,
          isLastLeftPinned: lastLeftPinnedId === colId,
          isFirstRightPinned: firstRightPinnedId === colId,
        };
      });
    } else {
      this.summaryCells = [];
    }

    const toggleKeys = new Set<string>();
    this.columnToggles = leafCols.filter(isHideable).map((column, index) => {
      const id = getColumnId(column);
      return {
        key: uniqueKey(id === "" ? String(index) : id, toggleKeys),
        id,
        title: getColumnTitle(column) || id,
        visible: this.hiddenColumns[id] !== true,
      };
    });

    this.densityOptions = DENSITIES.map((value) => ({
      value,
      label: this.densityLabel(value),
      selected: value === this.currentDensity,
    }));
    this.densityButtonLabel = formatMessage(strings.densityButton, {
      density: this.currentDensity,
    });

    this.columnSpan =
      visible.length +
        (this.hasExpandColumn ? 1 : 0) +
        (this.showSerialNumber ? 1 : 0) +
        (this.enableSelection ? 1 : 0) || 1;

    this.currentPage = page;
    this.totalPages = totalPagesFor(effectiveTotal, pageSize);
    this.pagerItems = getPageNumbers(this.currentPage, this.totalPages).map((item, index) =>
      item === "..."
        ? { key: `gap-${index}`, gap: true, page: 0, current: false, label: "" }
        : {
            key: `page-${item}`,
            gap: false,
            page: item,
            current: item === this.currentPage,
            label: formatMessage(strings.pageLabel, { page: item }),
          },
    );

    const range: RecordRange = getRecordRange(this.currentPage, pageSize, effectiveTotal);
    this.rangeParts = buildRangeParts(strings.showingRange, {
      start: range.start.toLocaleString(),
      end: range.end.toLocaleString(),
      total: range.total.toLocaleString(),
    });

    this.selectedCount = this.selectedIds.size;
    this.selectedBadge = formatMessage(strings.selectedBadge, { count: this.selectedCount });
    this.allPageSelected =
      this.rows.length > 0 && this.rows.every((row) => this.selectedIds.has(row.id));
    this.somePageSelected =
      !this.allPageSelected && this.rows.some((row) => this.selectedIds.has(row.id));
    const selectedList = Array.from(this.selectedIds);
    this.bulkActionsContext = {
      $implicit: selectedList,
      selectedIds: selectedList,
      deselectAll: () => this.deselectAll(),
    };
  }

  private densityLabel(density: Density): string {
    switch (density) {
      case "compact":
        return this.strings.densityCompact;
      case "comfortable":
        return this.strings.densityComfortable;
      default:
        return this.strings.densityDefault;
    }
  }
}

export const NexGridComponent = TableXComponent;
