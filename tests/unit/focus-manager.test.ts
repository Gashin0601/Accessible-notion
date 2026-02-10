import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { focusSidebar, focusMainContent, focusHeader, saveFocus, restoreFocus } from '../../src/content/focus-manager';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';
import { initBlockFocusManager, destroyBlockFocusManager, isNavigateMode } from '../../src/content/block-focus-manager';

function createLandmarks(): void {
  // Sidebar
  const nav = document.createElement('nav');
  nav.classList.add('notion-sidebar-container');
  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');
  const item1 = document.createElement('a');
  item1.setAttribute('role', 'treeitem');
  item1.setAttribute('tabindex', '0');
  item1.textContent = 'ページ1';
  const item2 = document.createElement('a');
  item2.setAttribute('role', 'treeitem');
  item2.setAttribute('tabindex', '-1');
  item2.textContent = 'ページ2';
  tree.appendChild(item1);
  tree.appendChild(item2);
  nav.appendChild(tree);
  document.body.appendChild(nav);

  // Main frame
  const main = document.createElement('main');
  main.classList.add('notion-frame');
  const block1 = document.createElement('div');
  block1.classList.add('notion-selectable');
  block1.setAttribute('data-block-id', 'block-1');
  block1.textContent = 'ブロック1';
  main.appendChild(block1);
  document.body.appendChild(main);

  // Header
  const header = document.createElement('div');
  header.classList.add('notion-topbar');
  const btn = document.createElement('button');
  btn.textContent = 'ボタン';
  header.appendChild(btn);
  document.body.appendChild(header);
}

describe('focus-manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
  });

  afterEach(() => {
    destroyLiveAnnouncer();
  });

  describe('focusSidebar', () => {
    it('focuses the treeitem with tabindex=0', () => {
      createLandmarks();
      focusSidebar();

      const activeItem = document.querySelector('[role="treeitem"][tabindex="0"]');
      expect(document.activeElement).toBe(activeItem);
    });

    it('announces サイドバー', async () => {
      createLandmarks();
      focusSidebar();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('サイドバー');
    });

    it('announces error when sidebar not found', async () => {
      // No sidebar in DOM
      focusSidebar();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('サイドバーが見つかりません');
    });
  });

  describe('focusMainContent', () => {
    beforeEach(() => {
      initBlockFocusManager();
    });

    afterEach(() => {
      destroyBlockFocusManager();
    });

    it('highlights the first block in main frame (virtual cursor)', () => {
      createLandmarks();
      focusMainContent();

      const firstBlock = document.querySelector('.notion-selectable[data-block-id]');
      expect(firstBlock?.classList.contains('accessible-notion-nav-focus')).toBe(true);
      expect(isNavigateMode()).toBe(true);
    });

    it('activates navigate mode', () => {
      createLandmarks();
      focusMainContent();

      expect(isNavigateMode()).toBe(true);
    });

    it('announces block not found when no blocks exist', async () => {
      const main = document.createElement('main');
      main.classList.add('notion-frame');
      document.body.appendChild(main);

      focusMainContent();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('ブロックが見つかりません');
    });

    it('announces block info on focus', async () => {
      createLandmarks();
      focusMainContent();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      // enterNavigateMode announces block type and position
      expect(live?.textContent).toContain('ブロック');
      expect(live?.textContent).toContain('1/1');
    });

    it('announces error when main not found', async () => {
      focusMainContent();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('メインコンテンツが見つかりません');
    });
  });

  describe('focusHeader', () => {
    it('focuses the first interactive element in header', () => {
      createLandmarks();
      focusHeader();

      const btn = document.querySelector('.notion-topbar button');
      expect(document.activeElement).toBe(btn);
    });

    it('announces ヘッダー', async () => {
      createLandmarks();
      focusHeader();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('ヘッダー');
    });

    it('announces error when header not found', async () => {
      focusHeader();

      await new Promise((r) => requestAnimationFrame(r));

      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toBe('ヘッダーが見つかりません');
    });

    it('focuses header element with tabindex when no interactive child', () => {
      const header = document.createElement('div');
      header.classList.add('notion-topbar');
      header.textContent = 'ヘッダーテキスト';
      document.body.appendChild(header);

      focusHeader();

      expect(document.activeElement).toBe(header);
      expect(header.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('saveFocus / restoreFocus', () => {
    it('saves and restores focus to a specific element', () => {
      createLandmarks();
      const btn = document.querySelector('.notion-topbar button') as HTMLElement;
      btn.focus();
      expect(document.activeElement).toBe(btn);

      saveFocus();

      // Move focus elsewhere
      const treeItem = document.querySelector('[role="treeitem"]') as HTMLElement;
      treeItem.focus();
      expect(document.activeElement).toBe(treeItem);

      // Restore
      restoreFocus();
      expect(document.activeElement).toBe(btn);
    });

    it('does not crash when restoring focus to removed element', () => {
      createLandmarks();
      const btn = document.querySelector('.notion-topbar button') as HTMLElement;
      btn.focus();
      saveFocus();

      // Remove the element
      btn.remove();

      // Should not throw
      expect(() => restoreFocus()).not.toThrow();
    });
  });
});
