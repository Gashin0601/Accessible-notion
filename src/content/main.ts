/**
 * Accessible Notion — Content Script Entry Point
 *
 * Initializes all enhancement modules based on user settings.
 * Monitors DOM changes via MutationObserver to keep enhancements
 * in sync with Notion's dynamic SPA updates.
 */

import { DEFAULT_SETTINGS, EXTENSION_ATTR, type ExtensionSettings } from '../shared/constants';
import { logDebug, logError, logInfo, setDebugMode } from '../shared/logger';
import { loadSettings, onSettingsChanged } from '../shared/storage';

import { initLiveAnnouncer, announce, destroyLiveAnnouncer } from './live-announcer';
import { scanAndEnhance, enhanceBlock, enhanceTextbox, enhanceImage } from './aria-injector';
import { initTreeEnhancer, enhanceTreeItems, destroyTreeEnhancer } from './tree-enhancer';
import { resetBlockNavigation } from './block-navigator';
import { initKeyboardHandler, updateShortcuts, destroyKeyboardHandler } from './keyboard-handler';
import { focusMainContent } from './focus-manager';
import { scanAndEnhanceTables, destroyTableEnhancer } from './table-enhancer';
import { initSearchEnhancer, destroySearchEnhancer } from './search-enhancer';
import { initCommentEnhancer, destroyCommentEnhancer } from './comment-enhancer';
import { initModalEnhancer, destroyModalEnhancer } from './modal-enhancer';
import { BLOCK_SELECTABLE, TEXTBOX, SIDEBAR_NAV, TREE_ITEM } from './selectors';

const MODULE = 'Main';

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let mainObserver: MutationObserver | null = null;
let lastUrl = location.href;

/**
 * Request the service worker to inject the DOM bridge into the page's MAIN world.
 * Uses chrome.scripting.executeScript which bypasses CSP restrictions.
 */
async function requestBridgeInjection(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'inject-dom-bridge' });
    logDebug(MODULE, 'DOM bridge injection requested');
    // Small delay to ensure bridge is active before we start enhancing
    await new Promise((r) => setTimeout(r, 50));
  } catch (err) {
    logError(MODULE, 'Failed to request bridge injection:', err);
  }
}

/**
 * Initialize all modules.
 */
async function init(): Promise<void> {
  try {
    settings = await loadSettings();
    setDebugMode(settings.debugMode);

    logInfo(MODULE, `Accessible Notion v0.1.0 starting (SR: ${settings.screenReader})`);

    if (!settings.enabled) {
      logInfo(MODULE, 'Extension is disabled in settings');
      return;
    }

    // 1. Live announcer (needed by all other modules)
    initLiveAnnouncer();

    // 2. ARIA injection pass
    scanAndEnhance();

    // 3. Sidebar tree (F-01)
    if (settings.features.sidebarTree) {
      initTreeEnhancer();
    }

    // 4. Keyboard shortcuts
    initKeyboardHandler(settings);

    // 5. DB table enhancement (F-04)
    if (settings.features.dbTableGrid) {
      scanAndEnhanceTables();
    }

    // 6. Search dialog (F-06)
    if (settings.features.searchDialog) {
      initSearchEnhancer();
    }

    // 7. Comments (F-07)
    if (settings.features.comments) {
      initCommentEnhancer();
    }

    // 8. Modal / dialog enhancement
    initModalEnhancer();

    // 9. Start DOM observer for ongoing changes
    startObserver();

    // 10. Settings change listener
    onSettingsChanged(handleSettingsChange);

    // 11. SPA navigation detection
    startNavigationDetection();

    logInfo(MODULE, 'Initialization complete');
    announce('Accessible Notion が有効です');

    // Re-scan after delays to catch late-rendered content
    setTimeout(() => scanAndEnhance(), 2000);
    setTimeout(() => {
      scanAndEnhance();
      if (settings.features.sidebarTree) enhanceTreeItems();
      if (settings.features.dbTableGrid) scanAndEnhanceTables();
    }, 5000);

  } catch (error) {
    logError(MODULE, 'Initialization failed:', error);
  }
}

/**
 * MutationObserver for ongoing DOM changes.
 */
function startObserver(): void {
  if (mainObserver) return;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  mainObserver = new MutationObserver((mutations) => {
    // Debounce to batch rapid DOM changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processNewNodes(mutations);
    }, 150);
  });

  mainObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-expanded', 'aria-hidden', 'style'],
  });

  logDebug(MODULE, 'MutationObserver started');
}

function processNewNodes(mutations: MutationRecord[]): void {
  const processedBlocks = new Set<Element>();

  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Blocks
        if (node.matches(BLOCK_SELECTABLE) && !processedBlocks.has(node)) {
          enhanceBlock(node);
          processedBlocks.add(node);
        }

        const blocks = node.querySelectorAll(BLOCK_SELECTABLE);
        for (const block of blocks) {
          if (!processedBlocks.has(block)) {
            enhanceBlock(block);
            processedBlocks.add(block);
          }
        }

        // Textboxes
        if (node.matches(TEXTBOX)) enhanceTextbox(node);
        const textboxes = node.querySelectorAll(TEXTBOX);
        for (const tb of textboxes) enhanceTextbox(tb);

        // Images
        if (node instanceof HTMLImageElement) enhanceImage(node);
        const imgs = node.querySelectorAll<HTMLImageElement>('img');
        for (const img of imgs) enhanceImage(img);

        // Tree items
        if (node.matches(TREE_ITEM) || node.querySelector(TREE_ITEM)) {
          enhanceTreeItems();
        }
      }
    }

    // Attribute changes (e.g. toggle expand/collapse)
    if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
      const target = mutation.target;
      if (target.matches(BLOCK_SELECTABLE) && !target.hasAttribute(EXTENSION_ATTR)) {
        enhanceBlock(target);
      }
    }
  }
}

/**
 * Detect SPA navigation (URL changes without page reload).
 */
function startNavigationDetection(): void {
  // Use a simple polling approach since Notion doesn't fire popstate reliably
  setInterval(() => {
    if (location.href !== lastUrl) {
      logDebug(MODULE, `Navigation detected: ${lastUrl} → ${location.href}`);
      lastUrl = location.href;
      handlePageChange();
    }
  }, 1000);
}

function handlePageChange(): void {
  // Re-run enhancement on page change
  resetBlockNavigation();

  // Small delay to let Notion finish rendering
  setTimeout(() => {
    scanAndEnhance();

    if (settings.features.sidebarTree) {
      enhanceTreeItems();
    }
    if (settings.features.dbTableGrid) {
      scanAndEnhanceTables();
    }

    // Extract page title for announcement
    const titleEl = document.querySelector('.notion-page-block h1, [class*="page-title"]');
    const title = titleEl?.textContent?.trim();
    if (title) {
      announce(`${title} を開きました`);
    }
  }, 800);
}

function handleSettingsChange(newSettings: ExtensionSettings): void {
  const prevEnabled = settings.enabled;
  settings = newSettings;
  setDebugMode(settings.debugMode);

  if (!settings.enabled && prevEnabled) {
    // Disable — tear down everything
    teardown();
    return;
  }

  if (settings.enabled && !prevEnabled) {
    // Re-enable
    init();
    return;
  }

  // Update shortcuts
  updateShortcuts(settings.shortcuts);

  logDebug(MODULE, 'Settings updated');
}

function teardown(): void {
  mainObserver?.disconnect();
  mainObserver = null;
  destroyTreeEnhancer();
  destroyKeyboardHandler();
  destroyTableEnhancer();
  destroySearchEnhancer();
  destroyCommentEnhancer();
  destroyModalEnhancer();
  destroyLiveAnnouncer();

  // Remove all injected attributes
  const enhanced = document.querySelectorAll(`[${EXTENSION_ATTR}]`);
  for (const el of enhanced) {
    el.removeAttribute(EXTENSION_ATTR);
  }

  logInfo(MODULE, 'Extension disabled and cleaned up');
}

// ─── Selector health check ──────────────────────────────────
function selectorHealthCheck(): void {
  const checks = [
    { name: 'Notion App', selector: '#notion-app' },
    { name: 'Main Frame', selector: 'main.notion-frame' },
    { name: 'Sidebar', selector: SIDEBAR_NAV },
  ];

  let failures = 0;
  for (const check of checks) {
    if (!document.querySelector(check.selector)) {
      logError(MODULE, `Selector health check FAILED: ${check.name} (${check.selector})`);
      failures++;
    }
  }

  if (failures > 0) {
    announce(
      'Accessible Notion: 一部の機能が動作していません。Notion の更新により互換性の問題が発生した可能性があります',
      'assertive',
    );
  }
}

// ─── Bootstrap ──────────────────────────────────────────────
(async () => {
  // Request DOM bridge injection into MAIN world (prevents DOMLock attribute reverts)
  await requestBridgeInjection();

  // Wait for Notion app to be ready
  const waitForApp = (retries = 10): Promise<void> => {
    return new Promise((resolve) => {
      const check = (remaining: number) => {
        if (document.querySelector('#notion-app .notion-app-inner') || remaining <= 0) {
          resolve();
          return;
        }
        setTimeout(() => check(remaining - 1), 500);
      };
      check(retries);
    });
  };

  await waitForApp();
  selectorHealthCheck();
  await init();
})();
