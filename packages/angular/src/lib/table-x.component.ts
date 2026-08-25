// `<table-x>` — the Angular adapter for NexGrid.
//
// The grid is SERVER-DRIVEN: it holds exactly one page of rows and never
// sorts, filters or paginates locally. Every piece of user intent becomes a
// `QueryState` produced by a `@tablex/core` reducer and emitted through
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
  PAGE_SIZES,
  buildQueryUrl,
  defaultQuery,
  downloadCsv,
  downloadExcel,
  fetchAllPages,
  filePrefixFromCaption,
  formatMessage,
  getCellValue,
  getColumnId,
  getColumnTitle,
  getPageNumbers,
  getRecordRange,
  initialHiddenColumns,
  isHideable,
  isPageSize,
  isSortable,
  isFilterable,
  primarySort,
  resolveLocale,
  serialNumber,
  timestampedFilename,
  toExportColumns,
  totalPagesFor,
  visibleColumns,
  withFilter,
  withPage,
  withPageSize,
  withSearch,
  withToggledSort,
  withToggledMultiSort,
  copyToClipboard,
  type Density,
  type ExcelBadgeRule,
  type TableXLocale,
  type PagedResponse,
  type QueryState,
  type RecordRange,
} from "@tablex/core";

import { TableXCellDirective } from "./table-x-cell.directive";
import { TableXToolbarDirective } from "./table-x-toolbar.directive";
import type {
  TableXAngularColumn,
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
} from "./view-model";

/** Which toolbar dropdown is open, if any. */
type MenuName = "columns" | "density" | "export";

/** Search input debounce, in milliseconds. Identical in every adapter. */
const SEARCH_DEBOUNCE_MS = 350;

@Component({
  selector: "table-x, table-x",
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
          @if (toolbarSlot) {
            <ng-container [ngTemplateOutlet]="toolbarSlot.template" />
          }
          <ng-content select="[toolbarActions]" />
        </div>
      </div>
      }

      <div class="tbx-table-wrap">
        <table class="tbx-table" [attr.aria-label]="caption">
          <thead>
            <tr>
              @if (enableSelection) {
                <th class="tbx-th tbx-th--select" scope="col">
                  @if (selectionMode !== 'single') {
                    <input
                      type="checkbox"
                      class="tbx-checkbox"
                      [checked]="allPageSelected"
                      [attr.aria-label]="strings.selectAllLabel"
                      (change)="toggleSelectAll()"
                    />
                  }
                </th>
              }
              @if (showSerialNumber) {
                <th class="tbx-th tbx-th--serial" scope="col">{{ strings.serialHeader }}</th>
              }
              @for (header of headers; track header.key) {
                <th
                  class="tbx-th"
                  scope="col"
                  [class.tbx-th--sortable]="header.sortable"
                  [attr.aria-sort]="header.ariaSort"
                  [style.width.px]="header.width"
                  [style.minWidth.px]="header.minWidth"
                  [style.textAlign]="header.align"
                  (click)="onHeaderActivate(header, $event)"
                >
                  <div
                    class="tbx-th-inner"
                    [class.tbx-th-inner--center]="header.align === 'center'"
                    [class.tbx-th-inner--right]="header.align === 'right'"
                    [attr.role]="header.sortable ? 'button' : null"
                    [attr.tabindex]="header.sortable ? 0 : null"
                    (keydown.enter)="onHeaderKeydown($event, header)"
                    (keydown.space)="onHeaderKeydown($event, header)"
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

                    @if (header.serverFilterable) {
                      <div class="tbx-col-filter-wrap">
                        <button
                          type="button"
                          class="tbx-col-filter-btn"
                          [class.tbx-col-filter-btn--active]="header.activeFilter !== undefined && header.activeFilter !== ''"
                          [attr.aria-label]="'Options and filter for ' + header.title"
                          (click)="toggleFilterPopover(header.id, $event)"
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

                        @if (openFilterColumn === header.id) {
                          <div class="tbx-filter-popover" (click)="$event.stopPropagation()">
                            <input
                              #filterInput
                              type="text"
                              class="tbx-filter-popover-input"
                              [value]="header.activeFilter ?? ''"
                              [placeholder]="'Filter ' + header.title + '…'"
                              (keydown.enter)="applyColumnFilter(header.id, filterInput.value.trim() || undefined)"
                            />
                            @if (header.filterOptions && header.filterOptions.length > 0) {
                              <div class="tbx-filter-popover-options">
                                <div
                                  class="tbx-filter-option"
                                  [class.tbx-filter-option--selected]="!header.activeFilter"
                                  (click)="applyColumnFilter(header.id, undefined)"
                                >
                                  {{ strings.filterAll }}
                                </div>
                                @for (opt of header.filterOptions; track opt) {
                                  <div
                                    class="tbx-filter-option"
                                    [class.tbx-filter-option--selected]="header.activeFilter === opt"
                                    (click)="applyColumnFilter(header.id, opt)"
                                  >
                                    {{ opt }}
                                  </div>
                                }
                              </div>
                            }
                            <div class="tbx-filter-popover-actions">
                              <button
                                type="button"
                                class="tbx-filter-popover-btn"
                                (click)="applyColumnFilter(header.id, undefined)"
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
                                (click)="applyColumnFilter(header.id, filterInput.value.trim() || undefined)"
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
                          </div>
                        }
                      </div>
                    }
                  </div>

                  @if (enableColumnResize) {
                    <div class="tbx-resize-handle" (pointerdown)="onResizePointerDown(header.id, header, $event)"></div>
                  }
                </th>
              }
            </tr>
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
                  [class.tbx-row--clickable]="isRowClickable"
                  (click)="onRowActivate(row)"
                >
                  @if (enableSelection) {
                    <td class="tbx-td tbx-td--select" (click)="$event.stopPropagation()">
                      <input
                        [type]="selectionMode === 'single' ? 'radio' : 'checkbox'"
                        class="tbx-checkbox"
                        [checked]="row.selected"
                        [attr.aria-label]="row.selectLabel"
                        (change)="toggleRow(row)"
                      />
                    </td>
                  }
                  @if (showSerialNumber) {
                    <td class="tbx-td tbx-td--serial">{{ row.serial }}</td>
                  }
                  @for (cell of row.cells; track cell.key) {
                    <td class="tbx-td" [style.textAlign]="cell.align">
                      @if (cell.template) {
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
              }
            }
          </tbody>
        </table>
      </div>

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
                  (click)="goToPage(currentPage - 1)"
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
                      (click)="goToPage(item.page)"
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
                  (click)="goToPage(currentPage + 1)"
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

  /** The CURRENT page of rows only — never the full dataset. */
  @Input({ required: true }) data: TData[] = [];

  /** Total filtered row count, from the server. Drives the pager. */
  @Input({ required: true }) total = 0;

  /** The active query. Every mutation is emitted through `queryChange`. */
  @Input({ required: true }) query: QueryState = defaultQuery();

  /** Accessible name for the grid; also seeds the export file name. */
  @Input({ required: true }) caption = "";

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
  @Input({ transform: booleanAttribute }) enableColumnFilters = false;

  /** Enable dragging column borders to resize columns. */
  @Input({ transform: booleanAttribute }) enableColumnResize = true;

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

  /** Export file name without extension. Defaults to a slug of `caption`. */
  @Input() exportFileName?: string;

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

  // ---------------------------------------------------------------------
  // Content
  // ---------------------------------------------------------------------

  @ContentChildren(TableXCellDirective, { descendants: true })
  private readonly cellDirectives!: QueryList<TableXCellDirective>;

  @ContentChild(TableXToolbarDirective)
  protected toolbarSlot?: TableXToolbarDirective;

  // ---------------------------------------------------------------------
  // Template state (protected: read by the template, not part of the API)
  // ---------------------------------------------------------------------

  protected strings: TableXLocale = resolveLocale();
  protected currentDensity: Density = "default";
  protected openMenu: "columns" | "density" | "export" | null = null;
  protected openFilterColumn: string | null = null;
  protected columnWidths: Record<string, number> = {};
  protected isExporting = false;
  protected searchText = "";
  protected searchLabel = "";
  protected jumpValue = "1";
  protected jumpInputId = "tbx-jump-page";

  protected headers: NexGridHeaderView[] = [];
  protected rows: NexGridRowView<TData>[] = [];
  protected columnToggles: TableXColumnToggle[] = [];
  protected densityOptions: NexGridDensityOption[] = [];
  protected densityButtonLabel = "";
  protected pagerItems: NexGridPagerItem[] = [];
  protected rangeParts: NexGridRangePart[] = [];
  protected rangeLabel = "";
  protected selectedBadge = "";
  protected selectedCount = 0;
  protected allPageSelected = false;
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

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);

  private readonly searchInput$ = new Subject<string>();
  private readonly subscriptions = new Subscription();

  private hiddenColumns: Readonly<Record<string, boolean>> = {};
  private columnsSeeded = false;
  private selectedIds: ReadonlySet<string> = new Set<string>();
  private cellTemplates = new Map<string, TemplateRef<NexGridCellTemplateContext<TData>>>();
  private detachMenuListeners: (() => void) | null = null;

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
    if (changes["columns"] && !this.columnsSeeded && this.columns.length > 0) {
      this.hiddenColumns = initialHiddenColumns(this.columns);
      this.columnsSeeded = true;
    }
    if (changes["query"]) this.syncFromQuery();

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
    this.recompute();
  }

  protected setDensity(density: Density): void {
    this.currentDensity = density;
    this.recompute();
  }

  // ---------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------

  protected onHeaderActivate(header: NexGridHeaderView, event?: MouseEvent | KeyboardEvent | Event): void {
    const target = event?.target as HTMLElement | null;
    if (target?.closest(".tbx-col-filter-wrap") || target?.closest(".tbx-resize-handle")) {
      return;
    }
    if (!header.sortable) return;
    const isMulti =
      event instanceof MouseEvent || event instanceof KeyboardEvent ? event.shiftKey : false;
    this.emitQuery(
      isMulti ? withToggledMultiSort(this.query, header.id) : withToggledSort(this.query, header.id),
    );
  }

  protected onHeaderKeydown(event: Event, header: NexGridHeaderView): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".tbx-col-filter-wrap")) return;
    event.preventDefault();
    this.onHeaderActivate(header, event);
  }

  protected toggleFilterPopover(id: string, event: Event): void {
    event.stopPropagation();
    this.openFilterColumn = this.openFilterColumn === id ? null : id;
    this.recompute();
  }

  protected applyColumnFilter(id: string, value: string | undefined): void {
    this.openFilterColumn = null;
    this.emitQuery(withFilter(this.query, id, value));
  }

  protected onResizePointerDown(id: string, header: NexGridHeaderView, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const targetTh = (event.currentTarget as HTMLElement)?.parentElement as HTMLElement | null;
    const startWidth = targetTh ? targetTh.getBoundingClientRect().width : (header.width ?? 120);

    const onMove = (moveEvent: PointerEvent) => {
      const nextW = Math.max(header.minWidth ?? 60, Math.round(startWidth + (moveEvent.clientX - startX)));
      this.columnWidths[id] = nextW;
      this.recompute();
      this.cdr.markForCheck();
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body?.classList.remove("tbx-resizing");
    };

    document.body?.classList.add("tbx-resizing");
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
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

  private applySelection(next: Set<string>): void {
    this.selectedIds = next;
    this.recompute();
    this.selectionChange.emit({ ids: Array.from(next), allAcrossSelected: false });
  }

  // ---------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------

  protected onRowActivate(row: NexGridRowView<TData>): void {
    if (!this.isRowClickable) return;
    this.rowClick.emit(row.data);
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

      // 3. Nothing to write.
      if (rows.length === 0) {
        this.notify.emit({ type: "error", message: this.strings.exportNoData });
        return;
      }

      // 4. Visible + exportable columns only, rendered as plain text.
      const exportColumns = toExportColumns(visibleColumns(this.columns, this.hiddenColumns), {
        yes: this.strings.booleanYes,
        no: this.strings.booleanNo,
      });
      const prefix = this.exportFileName ?? filePrefixFromCaption(this.caption);

      // 5. Write the file or copy to clipboard
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
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * The current page is the whole dataset when it already holds every row, or
   * when there is no endpoint to walk. Otherwise every page is fetched with
   * the CURRENT search / sort / filter preserved, so an export always matches
   * what the user is looking at.
   */
  private async collectExportRows(): Promise<TData[]> {
    const endpoint = this.fetchEndpoint;
    if (!endpoint || this.data.length >= this.total) return this.data;

    this.notify.emit({
      type: "info",
      message: formatMessage(this.strings.exportFetchingAll, {
        total: this.total.toLocaleString(),
      }),
    });

    try {
      const result = await fetchAllPages<TData>(async (page, pageSize) => {
        const url = buildQueryUrl(endpoint, {
          ...this.query,
          page,
          pageSize: isPageSize(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
        });
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PagedResponse<TData>;
      });
      return result.items;
    } catch {
      this.notify.emit({ type: "error", message: this.strings.exportFetchFailed });
      return this.data;
    }
  }

  // ---------------------------------------------------------------------
  // View-model construction
  // ---------------------------------------------------------------------

  private emitQuery(next: QueryState): void {
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
      if (directive.nexGridCell === "") return;
      // The directive cannot know the grid's row type (it is keyed by a column
      // id), so the two generic instantiations are reconciled here.
      templates.set(
        directive.nexGridCell,
        directive.template as TemplateRef<NexGridCellTemplateContext<TData>>,
      );
    });
    this.cellTemplates = templates;
    this.recompute();
  }

  /** Rebuild everything the template reads. Cheap enough to never be partial. */
  private recompute(): void {
    const strings = this.strings;
    const columns = this.columns;
    const visible = visibleColumns(columns, this.hiddenColumns);
    const keys = trackKeys(visible.map(getColumnId));
    const sort = primarySort(this.query);
    const labels = { yes: strings.booleanYes, no: strings.booleanNo };

    this.searchLabel = `Search ${this.caption}`;
    this.jumpInputId = `tbx-jump-page-${this.caption.toLowerCase().replace(/\s+/g, "-")}`;

    this.headers = visible.map((column, index) => {
      const id = getColumnId(column);
      const sortable = isSortable(column);
      const sortIndex = this.query.sort.findIndex((s) => s.field === id);
      const sortItem = sortIndex >= 0 ? this.query.sort[sortIndex] : undefined;
      const direction = sortable && sortItem ? sortItem.dir : null;
      const sortOrder = this.query.sort.length > 1 && sortIndex >= 0 ? sortIndex + 1 : null;
      const customWidth = this.columnWidths[id];
      const width = customWidth !== undefined ? customWidth : (column.meta?.width ?? null);
      const activeFilter = this.query.filter?.[id];
      return {
        key: keys[index] ?? String(index),
        id,
        title: headerText(column) || id || "Column",
        sortable,
        sortState: direction ?? "none",
        sortOrder,
        serverSortable: isSortable(column) && this.enableSorting !== false,
        serverFilterable: isFilterable(column, this.enableColumnFilters !== false),
        filterOptions: column.meta?.filterOptions,
        activeFilter,
        ariaSort: !sortable
          ? null
          : direction === "asc"
            ? "ascending"
            : direction === "desc"
              ? "descending"
              : "none",
        align: column.meta?.align ?? "left",
        width,
        minWidth: width === null ? (column.meta?.minWidth ?? 120) : null,
      };
    });

    const page = Math.max(1, Math.trunc(this.query.page));
    const pageSize = this.query.pageSize;
    const rowKeys = new Set<string>();

    this.rows = this.data.map((row, rowIndex) => {
      const id = this.getRowId(row);
      const selected = this.selectedIds.has(id);
      const cells: NexGridCellView<TData>[] = visible.map((column, columnIndex) => {
        const header = this.headers[columnIndex];
        const value = getCellValue(column, row);
        const template = this.cellTemplates.get(getColumnId(column)) ?? null;
        return {
          key: header?.key ?? String(columnIndex),
          header: header?.title ?? "",
          align: header?.align ?? "left",
          template,
          context: template === null ? null : { $implicit: row, value, column, rowIndex },
          text: template === null ? cellText(column, row, value, labels) : "",
        };
      });
      return {
        key: uniqueKey(id === "" ? String(rowIndex) : id, rowKeys),
        id,
        data: row,
        serial: serialNumber(page, pageSize, rowIndex),
        selected,
        selectLabel: formatMessage(strings.selectRowLabel, { id }),
        cells,
      };
    });

    const toggleKeys = new Set<string>();
    this.columnToggles = columns.filter(isHideable).map((column, index) => {
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
      visible.length + (this.showSerialNumber ? 1 : 0) + (this.enableSelection ? 1 : 0) || 1;

    this.currentPage = page;
    this.totalPages = totalPagesFor(this.total, pageSize);
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

    const range: RecordRange = getRecordRange(this.currentPage, pageSize, this.total);
    this.rangeParts = buildRangeParts(strings.showingRange, {
      start: range.start.toLocaleString(),
      end: range.end.toLocaleString(),
      total: range.total.toLocaleString(),
    });

    this.selectedCount = this.selectedIds.size;
    this.selectedBadge = formatMessage(strings.selectedBadge, { count: this.selectedCount });
    this.allPageSelected =
      this.rows.length > 0 && this.rows.every((row) => this.selectedIds.has(row.id));
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
