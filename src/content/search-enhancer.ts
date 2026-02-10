/**
 * F-06: Search Dialog Enhancement
 *
 * Enhances the Ctrl+K search modal with proper ARIA semantics:
 * - Dialog labeling
 * - Listbox role for results
 * - Option role for each result item
 * - Arrow key navigation through results
 * - aria-selected / aria-activedescendant tracking
 * - Result count announcement
 * - Notion highlight tracking (sync our state with Notion's own selection)
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import { announce } from './live-announcer';

const MODULE = 'SearchEnhancer';

let observer: MutationObserver | null = null;
let lastResultCount = -1;
let activeIndex = -1;
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

/** Selectors for finding result items — tries multiple Notion patterns */
const RESULT_ITEM_SELECTORS = [
  '[class*="search-result"]',
  '[class*="result-item"]',
  '[class*="quick-find-menu"] > div > div',
].join(', ');

const RESULT_LIST_SELECTORS = [
  '[class*="search-results"]',
  '[class*="results"]',
  '[class*="quick-find"]',
].join(', ');

/**
 * Get current result items from the active search dialog.
 */
function getResultItems(dialog: HTMLElement): HTMLElement[] {
  const items = dialog.querySelectorAll<HTMLElement>(RESULT_ITEM_SELECTORS);
  return Array.from(items).filter((el) => {
    // Filter out container elements that aren't actual results
    return el.offsetHeight > 0 && el.offsetParent !== null;
  });
}

/**
 * Update aria-selected on all result items and announce the active one.
 */
function setActiveResult(dialog: HTMLElement, items: HTMLElement[], index: number): void {
  // Clear previous selection
  for (const item of items) {
    item.setAttribute('aria-selected', 'false');
  }

  if (index < 0 || index >= items.length) {
    activeIndex = -1;
    return;
  }

  activeIndex = index;
  const active = items[index];
  active.setAttribute('aria-selected', 'true');

  // Set aria-activedescendant on the input
  const input = dialog.querySelector<HTMLElement>('input[type="text"], input:not([type])');
  if (input && active.id) {
    input.setAttribute('aria-activedescendant', active.id);
  }

  // Scroll into view if needed
  active.scrollIntoView({ block: 'nearest' });

  // Announce the item
  const label = active.getAttribute('aria-label') ?? active.textContent?.trim() ?? '';
  if (label) {
    announce(`${label} (${index + 1}/${items.length})`);
  }
}

/**
 * Detect which item Notion has highlighted and sync our aria-selected.
 */
function syncNotionHighlight(dialog: HTMLElement): void {
  const items = getResultItems(dialog);
  if (items.length === 0) return;

  // Notion highlights the active result with a background color style or class
  for (let i = 0; i < items.length; i++) {
    const bg = getComputedStyle(items[i]).backgroundColor;
    // Notion uses a non-white/non-transparent highlight background
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== 'rgb(255, 255, 255)') {
      if (activeIndex !== i) {
        setActiveResult(dialog, items, i);
      }
      return;
    }
  }
}

/**
 * Enhance a search dialog when detected.
 */
function enhanceSearchDialog(dialog: HTMLElement): void {
  if (dialog.hasAttribute(EXTENSION_ATTR)) return;

  // Always set label — overrides modal-enhancer's generic label
  dialog.setAttribute('aria-label', '検索');

  // Find the results container and enhance it
  enhanceResults(dialog);

  // Attach keyboard handler
  attachKeyboardNavigation(dialog);

  dialog.setAttribute(EXTENSION_ATTR, 'search');
  logDebug(MODULE, 'Search dialog enhanced');
}

function enhanceResults(dialog: HTMLElement): void {
  // Notion search results appear in a scrollable list
  const resultsList = dialog.querySelector(RESULT_LIST_SELECTORS);

  if (resultsList && !resultsList.getAttribute('role')) {
    resultsList.setAttribute('role', 'listbox');
    resultsList.setAttribute('aria-label', '検索結果');
  }

  // Each result item
  const items = getResultItems(dialog);

  let count = 0;
  items.forEach((item, idx) => {
    if (!item.getAttribute('role')) {
      item.setAttribute('role', 'option');
    }
    // Ensure each has an ID for aria-activedescendant
    if (!item.id) {
      item.id = `an-search-result-${idx}`;
    }
    if (!item.getAttribute('aria-selected')) {
      item.setAttribute('aria-selected', 'false');
    }
    item.setAttribute('tabindex', '-1');
    count++;

    // Build label from page title in result
    if (!item.getAttribute('aria-label')) {
      const titleEl = item.querySelector('[class*="title"], [class*="page-title"]');
      let title = titleEl?.textContent?.trim();
      // Fallback: extract first meaningful text from the item
      if (!title) {
        const text = item.textContent?.trim() ?? '';
        // Take the first line (before path/breadcrumb info)
        const firstLine = text.split(/\s*[—\n]/)[0]?.trim();
        title = firstLine && firstLine.length < 80 ? firstLine : text.substring(0, 50);
      }
      if (title) {
        item.setAttribute('aria-label', title);
      }
    }
  });

  // Sync with Notion's own highlight
  syncNotionHighlight(dialog);

  // Announce result count if changed
  if (count !== lastResultCount && count > 0) {
    lastResultCount = count;
    announce(`${count}件の結果`);
  } else if (count === 0 && lastResultCount !== 0) {
    lastResultCount = 0;
    announce('結果が見つかりません');
  }
}

/**
 * Attach keyboard navigation to the search dialog.
 * Notion already handles Up/Down for visual highlighting, so we add aria-selected
 * tracking and announcements. We listen on capture phase to read Notion's state
 * after it processes the keys.
 */
function attachKeyboardNavigation(dialog: HTMLElement): void {
  if (keydownHandler) return;

  keydownHandler = (e: KeyboardEvent) => {
    // Only handle if the search dialog is still in the DOM
    if (!document.contains(dialog)) {
      detachKeyboardNavigation();
      return;
    }

    const items = getResultItems(dialog);
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown': {
        // Let Notion handle the actual navigation, then sync after a tick
        setTimeout(() => syncNotionHighlight(dialog), 50);
        break;
      }
      case 'ArrowUp': {
        setTimeout(() => syncNotionHighlight(dialog), 50);
        break;
      }
      case 'Enter': {
        // Notion handles the actual navigation to the page
        // We just announce what was selected
        if (activeIndex >= 0 && activeIndex < items.length) {
          const label = items[activeIndex].getAttribute('aria-label') ?? '';
          if (label) {
            announce(`${label} を開きます`);
          }
        }
        break;
      }
    }
  };

  // Use capture phase to fire after Notion processes
  document.addEventListener('keydown', keydownHandler, false);
  logDebug(MODULE, 'Keyboard navigation attached');
}

function detachKeyboardNavigation(): void {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, false);
    keydownHandler = null;
  }
  activeIndex = -1;
}

/**
 * Determine if a dialog is the Notion search dialog (Cmd+K / Ctrl+K).
 * Avoids false positives on page options menu, trash dialog, settings, etc.
 */
function isSearchDialog(dialog: HTMLElement): boolean {
  // Must have a text input
  const input = dialog.querySelector<HTMLInputElement>('input[type="text"], input:not([type])');
  if (!input) return false;

  // Check for Notion search-specific indicators
  const hasSearchClass = !!dialog.querySelector('.notion-search-input, [class*="quick-find"]');
  if (hasSearchClass) return true;

  // Check placeholder text: Notion search uses various patterns
  // e.g. "検索...", "Search...", "XXX's Workspaceを検索、または質問 ...", "Search XXX..."
  const placeholder = input.getAttribute('placeholder') ?? '';
  const isSearchPlaceholder = /^検索|^Search/i.test(placeholder)
    || placeholder.includes('を検索') || placeholder.includes('Search Notion')
    || placeholder.includes('Notion を検索');
  if (!isSearchPlaceholder) return false;

  // Exclude dialogs that have other distinctive features (listbox with Serif, tablist, etc.)
  const listbox = dialog.querySelector('[role="listbox"]');
  if (listbox?.textContent?.includes('Serif')) return false;
  if (dialog.querySelector('[role="tablist"]')) return false;
  if (dialog.querySelector('input[placeholder*="ゴミ箱"]')) return false;

  return true;
}

/**
 * Watch for search dialog opening/closing and result updates.
 */
export function initSearchEnhancer(): void {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Check if a dialog was added
        const dialog = node.matches('[role="dialog"]')
          ? node
          : node.querySelector('[role="dialog"]');

        if (dialog instanceof HTMLElement && isSearchDialog(dialog)) {
          enhanceSearchDialog(dialog);
        }

        // Also check if a node was added INSIDE an existing dialog
        // (e.g., input field rendered after dialog container appears)
        const parentDialog = node.closest?.('[role="dialog"]');
        if (parentDialog instanceof HTMLElement && !parentDialog.hasAttribute(EXTENSION_ATTR)
            && isSearchDialog(parentDialog)) {
          enhanceSearchDialog(parentDialog);
        }
      }

      // Detect dialog removal → clean up
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(`[role="dialog"][${EXTENSION_ATTR}="search"]`)) {
          detachKeyboardNavigation();
          lastResultCount = -1;
          logDebug(MODULE, 'Search dialog closed');
        }
      }
    }

    // Also re-enhance results in existing dialogs (they update dynamically)
    const existingDialog = document.querySelector<HTMLElement>(`[role="dialog"][${EXTENSION_ATTR}="search"]`);
    if (existingDialog) {
      enhanceResults(existingDialog);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  logDebug(MODULE, 'Search enhancer initialized');
}

export function destroySearchEnhancer(): void {
  observer?.disconnect();
  observer = null;
  detachKeyboardNavigation();
  lastResultCount = -1;
}
