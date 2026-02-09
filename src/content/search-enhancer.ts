/**
 * F-06: Search Dialog Enhancement
 *
 * Enhances the Ctrl+K search modal with proper ARIA semantics:
 * - Dialog labeling
 * - Listbox role for results
 * - Option role for each result item
 * - aria-selected tracking
 * - Result count announcement
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import { announce } from './live-announcer';

const MODULE = 'SearchEnhancer';

let observer: MutationObserver | null = null;
let lastResultCount = -1;

/**
 * Enhance a search dialog when detected.
 */
function enhanceSearchDialog(dialog: HTMLElement): void {
  if (dialog.hasAttribute(EXTENSION_ATTR)) return;

  // Ensure dialog has proper label
  if (!dialog.getAttribute('aria-label')) {
    dialog.setAttribute('aria-label', '検索');
  }

  // Find the results container and enhance it
  enhanceResults(dialog);

  dialog.setAttribute(EXTENSION_ATTR, 'search');
  logDebug(MODULE, 'Search dialog enhanced');
}

function enhanceResults(dialog: HTMLElement): void {
  // Notion search results appear in a scrollable list
  const resultsList = dialog.querySelector(
    '[class*="search-results"], [class*="results"], [class*="quick-find"]',
  );

  if (resultsList && !resultsList.getAttribute('role')) {
    resultsList.setAttribute('role', 'listbox');
    resultsList.setAttribute('aria-label', '検索結果');
  }

  // Each result item
  const items = dialog.querySelectorAll(
    '[class*="search-result"], [class*="result-item"], [class*="quick-find-menu"] > div > div',
  );

  let count = 0;
  items.forEach((item, idx) => {
    if (!item.getAttribute('role')) {
      item.setAttribute('role', 'option');
    }
    item.setAttribute('aria-selected', 'false');
    item.setAttribute('tabindex', '-1');
    count++;

    // Build label from page title in result
    const titleEl = item.querySelector('[class*="title"], [class*="page-title"]');
    const title = titleEl?.textContent?.trim();
    if (title && !item.getAttribute('aria-label')) {
      item.setAttribute('aria-label', title);
    }
  });

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

        if (dialog instanceof HTMLElement) {
          // Check if this looks like a search dialog
          const hasInput = dialog.querySelector('input[type="text"], input:not([type])');
          if (hasInput) {
            enhanceSearchDialog(dialog);
          }
        }
      }
    }

    // Also re-enhance results in existing dialogs (they update dynamically)
    const existingDialog = document.querySelector(`[role="dialog"][${EXTENSION_ATTR}="search"]`);
    if (existingDialog instanceof HTMLElement) {
      enhanceResults(existingDialog);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  logDebug(MODULE, 'Search enhancer initialized');
}

export function destroySearchEnhancer(): void {
  observer?.disconnect();
  observer = null;
  lastResultCount = -1;
}
