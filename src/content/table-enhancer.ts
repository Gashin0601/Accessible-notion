/**
 * F-04: Database Table View Enhancement
 *
 * Injects grid/table ARIA semantics into Notion's database table views.
 * Provides arrow-key cell navigation in grid mode.
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import { DB_COLLECTION_VIEW, DB_TABLE_VIEW } from './selectors';
import { announce } from './live-announcer';

/** Request DOMLock protection for an element's ARIA attributes */
function protect(el: Element): void {
  el.dispatchEvent(new CustomEvent('accessible-notion-protect', { bubbles: false }));
}

const MODULE = 'TableEnhancer';

let gridModeActive = false;
let currentRow = 0;
let currentCol = 0;

interface TableInfo {
  container: HTMLElement;
  headerRow: HTMLElement | null;
  headerCells: HTMLElement[];
  dataRows: HTMLElement[];
  getRowCells: (row: HTMLElement) => HTMLElement[];
}

/**
 * Parse a Notion collection view into a structured table representation.
 */
function parseTableView(container: HTMLElement): TableInfo | null {
  // Notion table views have a specific structure with header and body rows
  // The exact selectors may vary — we try common patterns
  const headerRow = container.querySelector(
    '.notion-table-view-header-row, .notion-collection-header, [class*="header"]',
  ) as HTMLElement | null;

  const headerCells = headerRow
    ? Array.from(headerRow.querySelectorAll<HTMLElement>(
      '[class*="header-cell"], [class*="property-header"], > div > div',
      ))
    : [];

  // Data rows — Notion renders visible rows in scrollable container
  const bodyContainer = container.querySelector(
    '.notion-table-view-body, .notion-collection-list, [class*="body"]',
  );
  const dataRows = bodyContainer
    ? Array.from(bodyContainer.querySelectorAll<HTMLElement>(
      ':scope > [class*="row"], :scope > div > [data-block-id]',
      ))
    : [];

  if (headerCells.length === 0 && dataRows.length === 0) return null;

  return {
    container,
    headerRow,
    headerCells,
    dataRows,
    getRowCells(row: HTMLElement): HTMLElement[] {
      return Array.from(row.querySelectorAll<HTMLElement>(
        ':scope > [class*="cell"], :scope > div > div[class*="property"]',
      ));
    },
  };
}

/**
 * Inject ARIA table semantics into a Notion collection view.
 */
export function enhanceTableView(container: HTMLElement): void {
  if (container.hasAttribute(EXTENSION_ATTR)) return;

  const info = parseTableView(container);
  if (!info) {
    logDebug(MODULE, 'Could not parse table structure');
    return;
  }

  // Set role on container
  container.setAttribute('role', 'grid');
  container.setAttribute('aria-roledescription', 'データベーステーブル');
  container.setAttribute('aria-rowcount', String(info.dataRows.length + 1)); // +1 for header
  container.setAttribute('aria-colcount', String(info.headerCells.length));

  // Try to get DB name
  const titleEl = container.querySelector('[class*="title"], [class*="collection-title"]');
  const dbName = titleEl?.textContent?.trim() ?? 'データベース';
  container.setAttribute('aria-label', `${dbName} テーブル ${info.dataRows.length}行 ${info.headerCells.length}列`);

  // Header row
  if (info.headerRow) {
    info.headerRow.setAttribute('role', 'row');
    info.headerRow.setAttribute('aria-rowindex', '1');

    info.headerCells.forEach((cell, i) => {
      cell.setAttribute('role', 'columnheader');
      cell.setAttribute('aria-colindex', String(i + 1));
      if (!cell.getAttribute('aria-label')) {
        cell.setAttribute('aria-label', cell.textContent?.trim() ?? `列${i + 1}`);
      }
    });
  }

  // Data rows
  info.dataRows.forEach((row, rowIdx) => {
    row.setAttribute('role', 'row');
    row.setAttribute('aria-rowindex', String(rowIdx + 2)); // 1-based, header is row 1

    const cells = info.getRowCells(row);
    cells.forEach((cell, colIdx) => {
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-colindex', String(colIdx + 1));
      cell.setAttribute('tabindex', '-1');

      // Build label: "columnName: value"
      const colName = info.headerCells[colIdx]?.textContent?.trim() ?? `列${colIdx + 1}`;
      const value = cell.textContent?.trim() ?? '';
      cell.setAttribute('aria-label', `${colName}: ${value || '空'}`);
    });
  });

  container.setAttribute(EXTENSION_ATTR, 'table');
  protect(container);

  // Protect header cells and data cells from DOMLock reverts
  if (info.headerRow) {
    protect(info.headerRow);
    info.headerCells.forEach((c) => protect(c));
  }
  info.dataRows.forEach((row) => {
    protect(row);
    info.getRowCells(row).forEach((c) => protect(c));
  });

  logDebug(MODULE, `Enhanced table: ${info.dataRows.length} rows, ${info.headerCells.length} cols`);
}

/**
 * Scan all collection views on the page and enhance them.
 */
export function scanAndEnhanceTables(): void {
  const views = document.querySelectorAll<HTMLElement>(DB_COLLECTION_VIEW);
  for (const view of views) {
    enhanceTableView(view);
  }
}

/**
 * Enter grid navigation mode for the nearest table.
 */
export function enterGridMode(): void {
  const active = document.activeElement as HTMLElement | null;
  const tableContainer = active?.closest(DB_COLLECTION_VIEW) as HTMLElement
    ?? document.querySelector(DB_COLLECTION_VIEW) as HTMLElement;

  if (!tableContainer) {
    announce('データベーステーブルが見つかりません');
    return;
  }

  const info = parseTableView(tableContainer);
  if (!info || info.dataRows.length === 0) {
    announce('テーブルにデータがありません');
    return;
  }

  gridModeActive = true;
  currentRow = 0;
  currentCol = 0;

  // Focus first cell of first data row
  const firstRowCells = info.getRowCells(info.dataRows[0]);
  if (firstRowCells.length > 0) {
    firstRowCells[0].focus();
    announce(`グリッドモード開始: ${firstRowCells[0].getAttribute('aria-label') ?? ''}`);
  }

  // Attach grid keyboard handler
  tableContainer.addEventListener('keydown', handleGridKeydown, true);
  logDebug(MODULE, 'Grid mode entered');
}

function handleGridKeydown(event: KeyboardEvent): void {
  if (!gridModeActive) return;

  const target = event.target as HTMLElement;
  const container = target.closest(DB_COLLECTION_VIEW) as HTMLElement;
  if (!container) return;

  const info = parseTableView(container);
  if (!info) return;

  switch (event.key) {
    case 'ArrowRight': {
      event.preventDefault();
      event.stopPropagation();
      moveTo(info, currentRow, currentCol + 1);
      break;
    }
    case 'ArrowLeft': {
      event.preventDefault();
      event.stopPropagation();
      moveTo(info, currentRow, currentCol - 1);
      break;
    }
    case 'ArrowDown': {
      event.preventDefault();
      event.stopPropagation();
      moveTo(info, currentRow + 1, currentCol);
      break;
    }
    case 'ArrowUp': {
      event.preventDefault();
      event.stopPropagation();
      moveTo(info, currentRow - 1, currentCol);
      break;
    }
    case 'Home': {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        moveTo(info, 0, 0);
      } else {
        moveTo(info, currentRow, 0);
      }
      break;
    }
    case 'End': {
      event.preventDefault();
      event.stopPropagation();
      const lastCol = info.headerCells.length - 1;
      if (event.ctrlKey) {
        moveTo(info, info.dataRows.length - 1, lastCol);
      } else {
        moveTo(info, currentRow, lastCol);
      }
      break;
    }
    case 'Escape': {
      event.preventDefault();
      event.stopPropagation();
      exitGridMode(container);
      break;
    }
  }
}

function moveTo(info: TableInfo, row: number, col: number): void {
  // Clamp
  if (row < 0 || row >= info.dataRows.length) return;
  if (col < 0 || col >= info.headerCells.length) return;

  currentRow = row;
  currentCol = col;

  const cells = info.getRowCells(info.dataRows[row]);
  const cell = cells[col];
  if (cell) {
    cell.focus();
    const label = cell.getAttribute('aria-label') ?? '';
    announce(label);
  }
}

function exitGridMode(container: HTMLElement): void {
  gridModeActive = false;
  container.removeEventListener('keydown', handleGridKeydown, true);
  container.focus();
  announce('グリッドモード終了');
  logDebug(MODULE, 'Grid mode exited');
}
