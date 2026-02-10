import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanAndEnhanceTables, enhanceTableView, enterGridMode, destroyTableEnhancer } from '../../src/content/table-enhancer';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';
import { EXTENSION_ATTR } from '../../src/shared/constants';

/**
 * Build a mock Notion table view DOM structure.
 *
 * Notion table DOM (2026-02):
 *   .notion-collection_view-block
 *     > .notion-table-view
 *       > div
 *         > .notion-table-view-header-row
 *           > div (gutter)
 *           > div (cells wrapper) > div (inner) > div* (header cells)
 *         > .notion-collection-item[data-block-id]* (data rows)
 *           > .notion-table-view-row > div (inner) > div* (row cells)
 */
function createTableView(rows: string[][], headerNames: string[]): HTMLElement {
  const cvBlock = document.createElement('div');
  cvBlock.classList.add('notion-selectable', 'notion-collection_view-block');
  cvBlock.setAttribute('data-block-id', 'cv-block-1');

  const tableView = document.createElement('div');
  tableView.classList.add('notion-table-view');

  // Header row
  const headerRow = document.createElement('div');
  headerRow.classList.add('notion-table-view-header-row');

  const gutter = document.createElement('div'); // gutter div
  const cellsWrapper = document.createElement('div');
  const innerWrapper = document.createElement('div');

  for (const name of headerNames) {
    const headerCell = document.createElement('div');
    headerCell.textContent = name;
    // Mock offsetWidth > 0 for non-gutter cells
    Object.defineProperty(headerCell, 'offsetWidth', { value: 100, configurable: true });
    innerWrapper.appendChild(headerCell);
  }

  cellsWrapper.appendChild(innerWrapper);
  headerRow.appendChild(gutter);
  headerRow.appendChild(cellsWrapper);
  tableView.appendChild(headerRow);

  // Data rows
  for (let r = 0; r < rows.length; r++) {
    const rowEl = document.createElement('div');
    rowEl.classList.add('notion-page-block', 'notion-collection-item');
    rowEl.setAttribute('data-block-id', `row-${r}`);

    const tvRow = document.createElement('div');
    tvRow.classList.add('notion-table-view-row');
    const rowInner = document.createElement('div');

    for (let c = 0; c < rows[r].length; c++) {
      const cell = document.createElement('div');
      cell.textContent = rows[r][c];
      // Mock offsetWidth > 0 for real cells
      Object.defineProperty(cell, 'offsetWidth', { value: 100, configurable: true });
      rowInner.appendChild(cell);
    }

    tvRow.appendChild(rowInner);
    rowEl.appendChild(tvRow);
    tableView.appendChild(rowEl);
  }

  cvBlock.appendChild(tableView);
  document.body.appendChild(cvBlock);
  return cvBlock;
}

function createBoardView(): HTMLElement {
  const cvBlock = document.createElement('div');
  cvBlock.classList.add('notion-selectable', 'notion-collection_view-block');
  cvBlock.setAttribute('data-block-id', 'cv-board-1');

  const boardView = document.createElement('div');
  boardView.classList.add('notion-board-view');

  // Create 2 groups
  for (let g = 0; g < 2; g++) {
    const group = document.createElement('div');
    group.classList.add('notion-board-group');

    const header = document.createElement('div');
    header.classList.add('notion-board-group-header');
    header.textContent = `グループ${g + 1}`;
    group.appendChild(header);

    // Add cards
    for (let c = 0; c < 3; c++) {
      const card = document.createElement('div');
      card.classList.add('notion-collection-item');
      card.textContent = `カード${g * 3 + c + 1}`;
      group.appendChild(card);
    }

    boardView.appendChild(group);
  }

  cvBlock.appendChild(boardView);
  document.body.appendChild(cvBlock);
  return cvBlock;
}

function createListView(): HTMLElement {
  const cvBlock = document.createElement('div');
  cvBlock.classList.add('notion-selectable', 'notion-collection_view-block');
  cvBlock.setAttribute('data-block-id', 'cv-list-1');

  const listView = document.createElement('div');
  listView.classList.add('notion-list-view');

  for (let i = 0; i < 4; i++) {
    const item = document.createElement('div');
    item.classList.add('notion-collection-item');
    item.textContent = `リスト項目${i + 1}`;
    listView.appendChild(item);
  }

  cvBlock.appendChild(listView);
  document.body.appendChild(cvBlock);
  return cvBlock;
}

function createGalleryView(): HTMLElement {
  const cvBlock = document.createElement('div');
  cvBlock.classList.add('notion-selectable', 'notion-collection_view-block');
  cvBlock.setAttribute('data-block-id', 'cv-gallery-1');

  const galleryView = document.createElement('div');
  galleryView.classList.add('notion-gallery-view');

  for (let i = 0; i < 3; i++) {
    const card = document.createElement('div');
    card.classList.add('notion-collection-item');
    card.textContent = `ギャラリー${i + 1}`;
    galleryView.appendChild(card);
  }

  cvBlock.appendChild(galleryView);
  document.body.appendChild(cvBlock);
  return cvBlock;
}

describe('table-enhancer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
  });

  afterEach(() => {
    destroyTableEnhancer();
    destroyLiveAnnouncer();
  });

  describe('enhanceTableView', () => {
    it('sets grid role on the table view element', () => {
      const container = createTableView(
        [['Alice', '25'], ['Bob', '30']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      const grid = container.querySelector('.notion-table-view');
      expect(grid?.getAttribute('role')).toBe('grid');
    });

    it('sets aria-roledescription as データベーステーブル', () => {
      const container = createTableView(
        [['Alice', '25']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      const grid = container.querySelector('.notion-table-view');
      expect(grid?.getAttribute('aria-roledescription')).toBe('データベーステーブル');
    });

    it('sets aria-rowcount and aria-colcount', () => {
      const container = createTableView(
        [['Alice', '25'], ['Bob', '30'], ['Charlie', '35']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      const grid = container.querySelector('.notion-table-view');
      expect(grid?.getAttribute('aria-rowcount')).toBe('4'); // 3 data + 1 header
      expect(grid?.getAttribute('aria-colcount')).toBe('2');
    });

    it('sets row role and aria-rowindex on header', () => {
      const container = createTableView(
        [['Alice', '25']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      const headerRow = container.querySelector('.notion-table-view-header-row');
      expect(headerRow?.getAttribute('role')).toBe('row');
      expect(headerRow?.getAttribute('aria-rowindex')).toBe('1');
    });

    it('sets columnheader role on header cells', () => {
      const container = createTableView(
        [['Alice', '25']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      const headerCells = container.querySelectorAll('[role="columnheader"]');
      expect(headerCells.length).toBe(2);
      expect(headerCells[0].getAttribute('aria-colindex')).toBe('1');
      expect(headerCells[1].getAttribute('aria-colindex')).toBe('2');
      expect(headerCells[0].getAttribute('aria-label')).toBe('名前');
      expect(headerCells[1].getAttribute('aria-label')).toBe('年齢');
    });

    it('sets row role on data rows with correct aria-rowindex', () => {
      const container = createTableView(
        [['Alice', '25'], ['Bob', '30']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      const dataRows = container.querySelectorAll('.notion-collection-item');
      expect(dataRows[0].getAttribute('role')).toBe('row');
      expect(dataRows[0].getAttribute('aria-rowindex')).toBe('2');
      expect(dataRows[1].getAttribute('role')).toBe('row');
      expect(dataRows[1].getAttribute('aria-rowindex')).toBe('3');
    });

    it('sets gridcell role on data cells with labels', () => {
      const container = createTableView(
        [['Alice', '25']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      const cells = container.querySelectorAll('[role="gridcell"]');
      expect(cells.length).toBe(2);
      expect(cells[0].getAttribute('aria-label')).toBe('名前: Alice');
      expect(cells[1].getAttribute('aria-label')).toBe('年齢: 25');
      expect(cells[0].getAttribute('tabindex')).toBe('-1');
    });

    it('marks container with EXTENSION_ATTR=table', () => {
      const container = createTableView(
        [['Alice', '25']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);

      expect(container.getAttribute(EXTENSION_ATTR)).toBe('table');
    });

    it('does not re-enhance already enhanced tables', () => {
      const container = createTableView(
        [['Alice', '25']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);
      const grid = container.querySelector('.notion-table-view');
      grid?.setAttribute('aria-label', 'Modified');

      enhanceTableView(container); // Should be no-op

      expect(grid?.getAttribute('aria-label')).toBe('Modified');
    });
  });

  describe('board view', () => {
    it('enhances board view with group roles', () => {
      const container = createBoardView();
      scanAndEnhanceTables();

      const boardView = container.querySelector('.notion-board-view');
      expect(boardView?.getAttribute('role')).toBe('region');
      expect(boardView?.getAttribute('aria-roledescription')).toBe('カンバンボード');
    });

    it('sets group role and labels on board groups', () => {
      const container = createBoardView();
      scanAndEnhanceTables();

      const groups = container.querySelectorAll('.notion-board-group');
      expect(groups[0].getAttribute('role')).toBe('group');
      expect(groups[0].getAttribute('aria-label')).toBe('グループ1');
      expect(groups[1].getAttribute('aria-label')).toBe('グループ2');
    });

    it('sets article role on board cards', () => {
      createBoardView();
      scanAndEnhanceTables();

      const cards = document.querySelectorAll('.notion-collection-item');
      for (const card of cards) {
        expect(card.getAttribute('role')).toBe('article');
        expect(card.getAttribute('tabindex')).toBe('-1');
      }
    });
  });

  describe('list view', () => {
    it('enhances list view with list/listitem roles', () => {
      createListView();
      scanAndEnhanceTables();

      const listView = document.querySelector('.notion-list-view');
      expect(listView?.getAttribute('role')).toBe('list');
      expect(listView?.getAttribute('aria-roledescription')).toBe('データベースリスト');

      const items = document.querySelectorAll('.notion-collection-item');
      for (const item of items) {
        expect(item.getAttribute('role')).toBe('listitem');
      }
    });
  });

  describe('gallery view', () => {
    it('enhances gallery view with grid role', () => {
      createGalleryView();
      scanAndEnhanceTables();

      const galleryView = document.querySelector('.notion-gallery-view');
      expect(galleryView?.getAttribute('role')).toBe('grid');
      expect(galleryView?.getAttribute('aria-roledescription')).toBe('ギャラリー');
    });
  });

  describe('scanAndEnhanceTables', () => {
    it('enhances all collection views on the page', () => {
      createTableView([['A', '1']], ['名前', '値']);
      createBoardView();

      scanAndEnhanceTables();

      const grids = document.querySelectorAll('[role="grid"]');
      expect(grids.length).toBe(1); // table

      const regions = document.querySelectorAll('[role="region"]');
      expect(regions.length).toBeGreaterThanOrEqual(1); // board
    });
  });

  describe('grid mode', () => {
    it('enters grid mode and focuses first cell', () => {
      const container = createTableView(
        [['Alice', '25'], ['Bob', '30']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);
      enterGridMode();

      const cells = container.querySelectorAll('[role="gridcell"]');
      expect(document.activeElement).toBe(cells[0]);
    });

    it('announces grid mode start', async () => {
      const container = createTableView(
        [['Alice', '25']],
        ['名前', '年齢'],
      );

      enhanceTableView(container);
      enterGridMode();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('グリッドモード開始');
    });

    it('announces when no table is found', async () => {
      // No table in DOM
      enterGridMode();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('データベーステーブルが見つかりません');
    });
  });

  describe('destroyTableEnhancer', () => {
    it('cleans up without error', () => {
      createTableView([['A', '1']], ['名前']);
      scanAndEnhanceTables();
      expect(() => destroyTableEnhancer()).not.toThrow();
    });
  });
});
