/**
 * F-04: Database View Enhancement
 *
 * Injects ARIA semantics into Notion's database views:
 * - Table view: grid/row/gridcell with arrow-key navigation
 * - Board view: labeled groups with card navigation
 * - List view: list/listitem roles
 * - Gallery view: grid with card roles
 * - Calendar view: labeled grid
 * - Timeline view: labeled region
 * - View tabs: tablist/tab roles with aria-selected
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
 *
 * Notion table DOM structure (2026-02):
 *   .notion-table-view
 *     > .notion-collection_view-block (inner wrapper)
 *       > div
 *         > ... > .notion-table-view-header-row
 *                    > div (gutter) > div (cells wrapper) > div (inner) > div* (header cells)
 *         > ... > .notion-collection-item[data-block-id]* (data rows)
 *                    > .notion-table-view-row > div (inner) > div* (row cells, first may be 0px gutter)
 */
function parseTableView(container: HTMLElement): TableInfo | null {
  // Find .notion-table-view inside the container, or the container itself
  const tableView = container.classList.contains('notion-table-view')
    ? container
    : container.querySelector('.notion-table-view') as HTMLElement | null;
  if (!tableView) return null;

  const headerRow = tableView.querySelector(
    '.notion-table-view-header-row',
  ) as HTMLElement | null;

  // Header cells: headerRow > div:nth-child(2) > div > div* (individual columns)
  let headerCells: HTMLElement[] = [];
  if (headerRow && headerRow.children.length >= 2) {
    const cellsContainer = headerRow.children[1] as HTMLElement;
    const inner = cellsContainer?.children[0] as HTMLElement;
    if (inner) {
      headerCells = Array.from(inner.children) as HTMLElement[];
    }
  }

  // Data rows: .notion-collection-item elements inside the table view
  const dataRows = Array.from(
    tableView.querySelectorAll<HTMLElement>('.notion-collection-item'),
  );

  if (headerCells.length === 0 && dataRows.length === 0) return null;

  return {
    container: tableView,
    headerRow,
    headerCells,
    dataRows,
    getRowCells(row: HTMLElement): HTMLElement[] {
      const tvRow = row.querySelector('.notion-table-view-row') as HTMLElement | null;
      if (!tvRow) return [];
      const inner = tvRow.children[0] as HTMLElement;
      if (!inner) return [];
      // Filter out 0px-wide gutter cells
      return Array.from(inner.children as HTMLCollectionOf<HTMLElement>).filter(
        (c) => c.offsetWidth > 0,
      );
    },
  };
}

/**
 * Inject ARIA table semantics into a Notion collection view.
 * Accepts either a .notion-collection_view-block or .notion-table-view element.
 */
export function enhanceTableView(container: HTMLElement): void {
  // Use a table-specific marker (aria-injector uses EXTENSION_ATTR="true" on the same element)
  if (container.getAttribute(EXTENSION_ATTR) === 'table') return;

  const info = parseTableView(container);
  if (!info) {
    logDebug(MODULE, 'Could not parse table structure');
    return;
  }

  // Set grid role on the actual .notion-table-view element
  const gridEl = info.container;
  gridEl.setAttribute('role', 'grid');
  gridEl.setAttribute('aria-roledescription', 'データベーステーブル');
  gridEl.setAttribute('aria-rowcount', String(info.dataRows.length + 1)); // +1 for header
  gridEl.setAttribute('aria-colcount', String(info.headerCells.length));

  // Get DB name from the parent collection_view block
  const cvBlock = gridEl.closest('.notion-collection_view-block');
  const dbLabel = cvBlock?.getAttribute('aria-label') ?? '';
  const dbName = dbLabel.replace(/^データベース(ページ)?:\s*/, '').trim() || 'データベース';
  gridEl.setAttribute('aria-label', `${dbName} テーブル ${info.dataRows.length}行 ${info.headerCells.length}列`);

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
  protect(gridEl);

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
 * Re-enhance rows that were added by virtual scroll.
 * Notion removes/adds rows dynamically as the user scrolls large tables.
 */
function reEnhanceVisibleRows(container: HTMLElement): void {
  const info = parseTableView(container);
  if (!info) return;

  let newRows = 0;
  info.dataRows.forEach((row, rowIdx) => {
    // Only process rows not yet enhanced
    if (row.getAttribute('role') === 'row') return;

    row.setAttribute('role', 'row');
    row.setAttribute('aria-rowindex', String(rowIdx + 2));

    const cells = info.getRowCells(row);
    cells.forEach((cell, colIdx) => {
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-colindex', String(colIdx + 1));
      cell.setAttribute('tabindex', '-1');
      const colName = info.headerCells[colIdx]?.textContent?.trim() ?? `列${colIdx + 1}`;
      const value = cell.textContent?.trim() ?? '';
      cell.setAttribute('aria-label', `${colName}: ${value || '空'}`);
    });

    protect(row);
    cells.forEach((c) => protect(c));
    newRows++;
  });

  // Update total row count
  if (newRows > 0) {
    container.setAttribute('aria-rowcount', String(info.dataRows.length + 1));
    logDebug(MODULE, `Virtual scroll: enhanced ${newRows} new rows`);
  }
}

let tableBodyObserver: MutationObserver | null = null;

/**
 * Set up a MutationObserver on the table body to detect virtual scroll row changes.
 */
function watchVirtualScroll(container: HTMLElement): void {
  // Find the element that contains .notion-collection-item rows
  const tableView = container.querySelector('.notion-table-view') ?? container;
  const firstRow = tableView.querySelector('.notion-collection-item');
  const bodyContainer = firstRow?.parentElement ?? null;
  if (!bodyContainer) return;

  // Debounce re-enhancement
  let timer: ReturnType<typeof setTimeout> | null = null;

  const vsObserver = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => reEnhanceVisibleRows(container), 100);
  });

  vsObserver.observe(bodyContainer, { childList: true, subtree: true });

  // Store reference for cleanup
  if (tableBodyObserver) tableBodyObserver.disconnect();
  tableBodyObserver = vsObserver;
}

/**
 * Enhance database view tabs (tablist/tab pattern).
 * Notion renders view tabs as .notion-collection-view-tab-button elements.
 */
function enhanceViewTabs(container: HTMLElement): void {
  // Only process top-level collection_view blocks (skip nested ones)
  if (container.parentElement?.closest('.notion-collection_view-block')) return;

  // Notion already provides role="tablist" and role="tab" — we just add labels
  const existingTablist = container.querySelector<HTMLElement>('[role="tablist"]');
  if (existingTablist && !existingTablist.getAttribute('aria-label')) {
    existingTablist.setAttribute('aria-label', 'データベースビュー');
  }

  // Enhance individual tab buttons with labels
  const tabButtons = container.querySelectorAll<HTMLElement>('.notion-collection-view-tab-button');
  tabButtons.forEach((tabBtn) => {
    const tabEl = tabBtn.querySelector<HTMLElement>('[role="tab"]') ?? tabBtn;
    const text = tabBtn.textContent?.trim();
    if (text && !tabEl.getAttribute('aria-label')) {
      tabEl.setAttribute('aria-label', text);
    }
  });

  if (tabButtons.length > 0) {
    logDebug(MODULE, `Enhanced ${tabButtons.length} view tabs`);
  }
}

/**
 * Enhance a board (kanban) view.
 */
function enhanceBoardView(container: HTMLElement): void {
  const boardView = container.querySelector('.notion-board-view') as HTMLElement | null;
  if (!boardView) return;
  if (boardView.getAttribute(EXTENSION_ATTR) === 'board') return;

  boardView.setAttribute('role', 'region');
  boardView.setAttribute('aria-roledescription', 'カンバンボード');

  // Find board groups (columns)
  const groups = boardView.querySelectorAll<HTMLElement>('.notion-board-group');
  groups.forEach((group, idx) => {
    group.setAttribute('role', 'group');

    // Group header is typically the first child
    const header = group.querySelector<HTMLElement>('.notion-board-group-header, [class*="board-group-header"]');
    const headerText = header?.textContent?.trim() ?? `グループ${idx + 1}`;
    group.setAttribute('aria-label', `${headerText}`);

    // Cards within the group
    const cards = group.querySelectorAll<HTMLElement>('.notion-collection-item');
    cards.forEach((card) => {
      card.setAttribute('role', 'article');
      card.setAttribute('tabindex', '-1');
      const cardText = card.textContent?.trim()?.substring(0, 50) ?? '';
      if (cardText && !card.getAttribute('aria-label')) {
        card.setAttribute('aria-label', cardText);
      }
    });
  });

  const cvBlock = boardView.closest('.notion-collection_view-block');
  const dbLabel = cvBlock?.getAttribute('aria-label') ?? '';
  const dbName = dbLabel.replace(/^データベース(ページ)?:\s*/, '').trim() || 'データベース';
  boardView.setAttribute('aria-label', `${dbName} ボードビュー ${groups.length}グループ`);

  boardView.setAttribute(EXTENSION_ATTR, 'board');
  logDebug(MODULE, `Enhanced board view: ${groups.length} groups`);
}

/**
 * Enhance a list view.
 */
function enhanceListView(container: HTMLElement): void {
  const listView = container.querySelector('.notion-list-view') as HTMLElement | null;
  if (!listView) return;
  if (listView.getAttribute(EXTENSION_ATTR) === 'list') return;

  listView.setAttribute('role', 'list');
  listView.setAttribute('aria-roledescription', 'データベースリスト');

  const items = listView.querySelectorAll<HTMLElement>('.notion-collection-item');
  items.forEach((item, idx) => {
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '-1');
    const text = item.textContent?.trim()?.substring(0, 50) ?? '';
    if (text && !item.getAttribute('aria-label')) {
      item.setAttribute('aria-label', text);
    }
  });

  const cvBlock = listView.closest('.notion-collection_view-block');
  const dbLabel = cvBlock?.getAttribute('aria-label') ?? '';
  const dbName = dbLabel.replace(/^データベース(ページ)?:\s*/, '').trim() || 'データベース';
  listView.setAttribute('aria-label', `${dbName} リストビュー ${items.length}件`);

  listView.setAttribute(EXTENSION_ATTR, 'list');
  logDebug(MODULE, `Enhanced list view: ${items.length} items`);
}

/**
 * Enhance a gallery view.
 */
function enhanceGalleryView(container: HTMLElement): void {
  const galleryView = container.querySelector('.notion-gallery-view') as HTMLElement | null;
  if (!galleryView) return;
  if (galleryView.getAttribute(EXTENSION_ATTR) === 'gallery') return;

  galleryView.setAttribute('role', 'grid');
  galleryView.setAttribute('aria-roledescription', 'ギャラリー');

  const cards = galleryView.querySelectorAll<HTMLElement>('.notion-collection-item');
  cards.forEach((card) => {
    card.setAttribute('role', 'gridcell');
    card.setAttribute('tabindex', '-1');
    const text = card.textContent?.trim()?.substring(0, 50) ?? '';
    if (text && !card.getAttribute('aria-label')) {
      card.setAttribute('aria-label', text);
    }
  });

  const cvBlock = galleryView.closest('.notion-collection_view-block');
  const dbLabel = cvBlock?.getAttribute('aria-label') ?? '';
  const dbName = dbLabel.replace(/^データベース(ページ)?:\s*/, '').trim() || 'データベース';
  galleryView.setAttribute('aria-label', `${dbName} ギャラリービュー ${cards.length}件`);

  galleryView.setAttribute(EXTENSION_ATTR, 'gallery');
  logDebug(MODULE, `Enhanced gallery view: ${cards.length} cards`);
}

/**
 * Enhance a calendar view.
 */
function enhanceCalendarView(container: HTMLElement): void {
  const calView = container.querySelector('.notion-calendar-view') as HTMLElement | null;
  if (!calView) return;
  if (calView.getAttribute(EXTENSION_ATTR) === 'calendar') return;

  calView.setAttribute('role', 'grid');
  calView.setAttribute('aria-roledescription', 'カレンダー');

  const cvBlock = calView.closest('.notion-collection_view-block');
  const dbLabel = cvBlock?.getAttribute('aria-label') ?? '';
  const dbName = dbLabel.replace(/^データベース(ページ)?:\s*/, '').trim() || 'データベース';
  calView.setAttribute('aria-label', `${dbName} カレンダービュー`);

  // Calendar day cells
  const dayCells = calView.querySelectorAll<HTMLElement>('.notion-calendar-view-day');
  dayCells.forEach((cell) => {
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('tabindex', '-1');
    // Try to extract date label
    const dateLabel = cell.querySelector<HTMLElement>('[class*="day-number"], [class*="date"]');
    const dateText = dateLabel?.textContent?.trim() ?? '';
    const items = cell.querySelectorAll('.notion-collection-item');
    if (dateText) {
      cell.setAttribute('aria-label', `${dateText}日 ${items.length}件`);
    }
  });

  calView.setAttribute(EXTENSION_ATTR, 'calendar');
  logDebug(MODULE, 'Enhanced calendar view');
}

/**
 * Enhance a timeline view.
 */
function enhanceTimelineView(container: HTMLElement): void {
  const tlView = container.querySelector('.notion-timeline-view') as HTMLElement | null;
  if (!tlView) return;
  if (tlView.getAttribute(EXTENSION_ATTR) === 'timeline') return;

  tlView.setAttribute('role', 'region');
  tlView.setAttribute('aria-roledescription', 'タイムライン');

  const cvBlock = tlView.closest('.notion-collection_view-block');
  const dbLabel = cvBlock?.getAttribute('aria-label') ?? '';
  const dbName = dbLabel.replace(/^データベース(ページ)?:\s*/, '').trim() || 'データベース';
  tlView.setAttribute('aria-label', `${dbName} タイムラインビュー`);

  const items = tlView.querySelectorAll<HTMLElement>('.notion-collection-item');
  items.forEach((item) => {
    item.setAttribute('role', 'article');
    item.setAttribute('tabindex', '-1');
  });

  tlView.setAttribute(EXTENSION_ATTR, 'timeline');
  logDebug(MODULE, `Enhanced timeline view: ${items.length} items`);
}

/**
 * Detect which view type is active and enhance accordingly.
 */
function enhanceActiveView(container: HTMLElement): void {
  // Table view (already handled by enhanceTableView)
  if (container.querySelector('.notion-table-view')) {
    enhanceTableView(container);
    watchVirtualScroll(container);
    return;
  }

  // Board view
  if (container.querySelector('.notion-board-view')) {
    enhanceBoardView(container);
    return;
  }

  // List view
  if (container.querySelector('.notion-list-view')) {
    enhanceListView(container);
    return;
  }

  // Gallery view
  if (container.querySelector('.notion-gallery-view')) {
    enhanceGalleryView(container);
    return;
  }

  // Calendar view
  if (container.querySelector('.notion-calendar-view')) {
    enhanceCalendarView(container);
    return;
  }

  // Timeline view
  if (container.querySelector('.notion-timeline-view')) {
    enhanceTimelineView(container);
    return;
  }
}

/**
 * Scan all collection views on the page and enhance them.
 */
export function scanAndEnhanceTables(): void {
  const views = document.querySelectorAll<HTMLElement>(DB_COLLECTION_VIEW);
  for (const view of views) {
    enhanceViewTabs(view);
    enhanceActiveView(view);
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

export function destroyTableEnhancer(): void {
  tableBodyObserver?.disconnect();
  tableBodyObserver = null;
  gridModeActive = false;
}
