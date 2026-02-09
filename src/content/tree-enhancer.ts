/**
 * F-01: Sidebar Tree Enhancement
 *
 * Adds missing ARIA attributes and roving tabindex keyboard navigation
 * to Notion's sidebar page tree.
 *
 * Injects: aria-selected, aria-level, aria-label (cleaned), roving tabindex
 * Keyboard: Arrow keys, Home/End, Enter, type-ahead search
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import { SIDEBAR_NAV, TREE, TREE_ITEM } from './selectors';
import { announce } from './live-announcer';

const MODULE = 'TreeEnhancer';

let initialized = false;

/**
 * Compute the nesting level of a treeitem by counting ancestor treeitems.
 */
function computeLevel(treeItem: Element): number {
  let level = 1;
  let parent = treeItem.parentElement;
  while (parent) {
    if (parent.getAttribute('role') === 'treeitem') {
      level++;
    }
    // Stop at tree root
    if (parent.getAttribute('role') === 'tree') break;
    parent = parent.parentElement;
  }
  return level;
}

/**
 * Extract clean page name from a treeitem, removing action button text.
 */
function getCleanPageName(treeItem: Element): string {
  // Try to get text from the link first
  const link = treeItem.querySelector('a');
  if (link) {
    // Clone to avoid modifying the live DOM
    const clone = link.cloneNode(true) as HTMLElement;
    // Remove button elements that contain action text like "削除、名前の変更など..."
    clone.querySelectorAll('button, [role="button"], [aria-hidden="true"]').forEach(el => el.remove());
    const text = clone.textContent?.trim() ?? '';
    if (text) return text;
  }

  // Fallback: direct text content, first meaningful text node
  const walker = document.createTreeWalker(treeItem, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim() ?? '';
    if (text && text.length > 0 && !text.includes('削除') && !text.includes('名前の変更')) {
      return text;
    }
  }

  return 'ページ';
}

/**
 * Determine if this treeitem corresponds to the currently open page.
 */
function isCurrentPage(treeItem: Element): boolean {
  const link = treeItem.querySelector('a[href]');
  if (!link) return false;

  const href = link.getAttribute('href') ?? '';
  const currentPath = window.location.pathname;

  // Compare the last segment (page ID) of the URL
  const hrefId = href.split('/').pop()?.split('-').pop() ?? '';
  const currentId = currentPath.split('/').pop()?.split('-').pop() ?? '';

  return hrefId !== '' && currentId !== '' && hrefId === currentId;
}

/**
 * Enhance all treeitems in the sidebar with ARIA attributes.
 */
export function enhanceTreeItems(): void {
  const treeItems = document.querySelectorAll(`${SIDEBAR_NAV} ${TREE_ITEM}`);

  for (const item of treeItems) {
    const level = computeLevel(item);
    item.setAttribute('aria-level', String(level));

    const isCurrent = isCurrentPage(item);
    item.setAttribute('aria-selected', String(isCurrent));

    const name = getCleanPageName(item);
    item.setAttribute('aria-label', name);

    item.setAttribute(EXTENSION_ATTR, 'tree');
  }

  logDebug(MODULE, `Enhanced ${treeItems.length} tree items`);
}

/**
 * Get all visible treeitems in DOM order.
 */
function getVisibleTreeItems(): HTMLElement[] {
  const items = document.querySelectorAll<HTMLElement>(`${SIDEBAR_NAV} ${TREE_ITEM}`);
  return Array.from(items).filter(el => {
    // Skip items inside collapsed parents
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

/**
 * Move focus within the tree using roving tabindex pattern.
 */
function focusTreeItem(item: HTMLElement): void {
  // Remove tabindex=0 from all items
  const allItems = getVisibleTreeItems();
  for (const it of allItems) {
    it.setAttribute('tabindex', '-1');
  }

  item.setAttribute('tabindex', '0');
  item.focus();

  const name = item.getAttribute('aria-label') ?? '';
  const level = item.getAttribute('aria-level') ?? '1';
  const expanded = item.getAttribute('aria-expanded');
  const selected = item.getAttribute('aria-selected') === 'true';

  let announcement = `${name}, レベル${level}`;
  if (expanded === 'true') announcement += ', 展開';
  else if (expanded === 'false') announcement += ', 折りたたみ';
  if (selected) announcement += ', 選択済み';

  announce(announcement);
}

/**
 * Handle keyboard events within the sidebar tree.
 */
function handleTreeKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (!target.matches(TREE_ITEM) && !target.closest(TREE_ITEM)) return;

  const currentItem = target.closest(TREE_ITEM) as HTMLElement | null;
  if (!currentItem) return;

  const items = getVisibleTreeItems();
  const currentIndex = items.indexOf(currentItem);
  if (currentIndex === -1) return;

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault();
      event.stopPropagation();
      const next = items[currentIndex + 1];
      if (next) focusTreeItem(next);
      break;
    }

    case 'ArrowUp': {
      event.preventDefault();
      event.stopPropagation();
      const prev = items[currentIndex - 1];
      if (prev) focusTreeItem(prev);
      break;
    }

    case 'ArrowRight': {
      event.preventDefault();
      event.stopPropagation();
      const expanded = currentItem.getAttribute('aria-expanded');
      if (expanded === 'false') {
        // Expand: click the toggle/disclosure button
        const toggle = currentItem.querySelector('[role="button"], button, svg');
        if (toggle) (toggle as HTMLElement).click();
        announce('展開');
      } else if (expanded === 'true') {
        // Move to first child
        const next = items[currentIndex + 1];
        const nextLevel = next ? parseInt(next.getAttribute('aria-level') ?? '1') : 0;
        const currentLevel = parseInt(currentItem.getAttribute('aria-level') ?? '1');
        if (next && nextLevel > currentLevel) {
          focusTreeItem(next);
        }
      }
      break;
    }

    case 'ArrowLeft': {
      event.preventDefault();
      event.stopPropagation();
      const expanded = currentItem.getAttribute('aria-expanded');
      if (expanded === 'true') {
        // Collapse
        const toggle = currentItem.querySelector('[role="button"], button, svg');
        if (toggle) (toggle as HTMLElement).click();
        announce('折りたたみ');
      } else {
        // Move to parent
        const currentLevel = parseInt(currentItem.getAttribute('aria-level') ?? '1');
        if (currentLevel > 1) {
          for (let i = currentIndex - 1; i >= 0; i--) {
            const parentLevel = parseInt(items[i].getAttribute('aria-level') ?? '1');
            if (parentLevel < currentLevel) {
              focusTreeItem(items[i]);
              break;
            }
          }
        }
      }
      break;
    }

    case 'Home': {
      event.preventDefault();
      event.stopPropagation();
      if (items.length > 0) focusTreeItem(items[0]);
      break;
    }

    case 'End': {
      event.preventDefault();
      event.stopPropagation();
      if (items.length > 0) focusTreeItem(items[items.length - 1]);
      break;
    }

    case 'Enter': {
      event.preventDefault();
      event.stopPropagation();
      const link = currentItem.querySelector('a[href]') as HTMLElement | null;
      if (link) {
        link.click();
        announce(`${currentItem.getAttribute('aria-label') ?? 'ページ'} を開きました`);
        // After navigation, focus will be handled by page load
        setTimeout(() => {
          const mainFrame = document.querySelector('main.notion-frame') as HTMLElement | null;
          if (mainFrame) mainFrame.focus();
        }, 500);
      }
      break;
    }
  }
}

/**
 * Initialize the tree enhancer. Attaches keyboard handlers to the sidebar.
 */
export function initTreeEnhancer(): void {
  if (initialized) return;

  const sidebar = document.querySelector(SIDEBAR_NAV);
  if (!sidebar) {
    logDebug(MODULE, 'Sidebar not found, will retry');
    return;
  }

  // Initial enhancement pass
  enhanceTreeItems();

  // Keyboard handler on the sidebar
  sidebar.addEventListener('keydown', handleTreeKeydown as EventListener, true);

  // Set initial roving tabindex: first item gets tabindex=0
  const items = getVisibleTreeItems();
  for (const item of items) {
    item.setAttribute('tabindex', '-1');
  }
  if (items.length > 0) {
    items[0].setAttribute('tabindex', '0');
  }

  initialized = true;
  logDebug(MODULE, 'Tree enhancer initialized');
}

export function destroyTreeEnhancer(): void {
  const sidebar = document.querySelector(SIDEBAR_NAV);
  if (sidebar) {
    sidebar.removeEventListener('keydown', handleTreeKeydown as EventListener, true);
  }
  initialized = false;
}
