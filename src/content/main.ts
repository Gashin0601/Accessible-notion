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
import { scanAndEnhance, enhanceBlock, enhanceTextbox, enhanceImage, enhanceInlineLinks } from './aria-injector';
import { initTreeEnhancer, enhanceTreeItems, destroyTreeEnhancer } from './tree-enhancer';
import { resetBlockNavigation } from './block-navigator';
import { initKeyboardHandler, updateShortcuts, destroyKeyboardHandler } from './keyboard-handler';
import { focusMainContent } from './focus-manager';
import { scanAndEnhanceTables, destroyTableEnhancer } from './table-enhancer';
import { initSearchEnhancer, destroySearchEnhancer } from './search-enhancer';
import { initCommentEnhancer, destroyCommentEnhancer } from './comment-enhancer';
import { initModalEnhancer, destroyModalEnhancer } from './modal-enhancer';
import { initPopupEnhancer, destroyPopupEnhancer } from './popup-enhancer';
import { BLOCK_SELECTABLE, TEXTBOX, SIDEBAR_NAV, TREE_ITEM, MAIN_FRAME } from './selectors';

const MODULE = 'Main';

let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };
let mainObserver: MutationObserver | null = null;
let lastUrl = location.href;

/** Flag set when Enter is pressed on a sidebar treeitem, cleared after page change */
let sidebarNavigationPending = false;

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

    // 9. Popup / menu enhancement (slash commands, mentions, etc.)
    initPopupEnhancer();

    // 10. Main landmarks & skip navigation
    enhanceMainLandmarks();

    // 11. Topbar landmark enhancement
    enhanceTopbar();

    // 12. Side peek enhancement
    enhanceSidePeek();

    // 13. Home page & inbox panel enhancement
    enhanceHomePage();
    enhanceInboxPanel();

    // 14. Start DOM observer for ongoing changes
    startObserver();

    // 15. Settings change listener
    onSettingsChanged(handleSettingsChange);

    // 16. SPA navigation detection
    startNavigationDetection();

    // 17. Sidebar Enter key detection for auto-focus after page navigation
    startSidebarEnterDetection();

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

  // Re-enhance topbar/breadcrumb if they were re-rendered
  enhanceTopbar();

  // Side peek may have opened
  enhanceSidePeek();

  // Home page or inbox may need enhancement
  enhanceHomePage();
  enhanceInboxPanel();

  // DB toolbar buttons
  enhanceDBToolbarButtons();
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

/**
 * Detect Enter key on sidebar treeitems to set auto-focus flag.
 * Only when the user explicitly presses Enter to open a page
 * should focus move to the main content after navigation.
 */
function startSidebarEnterDetection(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (!target?.closest(SIDEBAR_NAV)) return;
    if (!target.closest(TREE_ITEM) && !target.matches(TREE_ITEM)) return;
    sidebarNavigationPending = true;
    logDebug(MODULE, 'Sidebar Enter detected — will auto-focus main content after navigation');
  }, true);
}

function handlePageChange(): void {
  // Capture and clear the sidebar navigation flag
  const shouldFocusMain = sidebarNavigationPending;
  sidebarNavigationPending = false;

  // Announce loading state for screen readers
  announce('ページを読み込み中…');

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

    enhanceTopbar();
    enhanceSidePeek();
    enhanceHomePage();
    enhanceInboxPanel();
    enhanceDBToolbarButtons();

    // Extract page title for announcement
    const titleEl = document.querySelector('.notion-page-block h1, [class*="page-title"]');
    const title = titleEl?.textContent?.trim();
    if (title) {
      announce(`${title} を開きました`);
    }

    // Auto-focus main content only when user explicitly pressed Enter
    // on a sidebar treeitem to navigate to a page
    if (shouldFocusMain) {
      setTimeout(() => focusMainContent(), 300);
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
  destroyPopupEnhancer();
  destroyLiveAnnouncer();

  // Remove skip nav link
  document.getElementById('an-skip-nav')?.remove();

  // Remove all injected attributes
  const enhanced = document.querySelectorAll(`[${EXTENSION_ATTR}]`);
  for (const el of enhanced) {
    el.removeAttribute(EXTENSION_ATTR);
  }

  logInfo(MODULE, 'Extension disabled and cleaned up');
}

/** Request DOMLock protection for an element's ARIA attributes */
function protect(el: Element): void {
  el.dispatchEvent(new CustomEvent('accessible-notion-protect', { bubbles: false }));
}

// ─── Skip navigation & main landmark ─────────────────────────
function enhanceMainLandmarks(): void {
  // Ensure main frame has role="main"
  const mainFrame = document.querySelector<HTMLElement>('main.notion-frame');
  if (mainFrame && !mainFrame.getAttribute('aria-label')) {
    mainFrame.setAttribute('aria-label', 'メインコンテンツ');
    protect(mainFrame);
  }

  // Create skip navigation link if not exists
  if (!document.getElementById('an-skip-nav')) {
    const skipLink = document.createElement('a');
    skipLink.id = 'an-skip-nav';
    skipLink.href = '#';
    skipLink.textContent = 'メインコンテンツにスキップ';
    skipLink.setAttribute('style',
      'position:fixed;top:-100px;left:0;z-index:100000;' +
      'background:#2383e2;color:#fff;padding:8px 16px;font-size:14px;' +
      'text-decoration:none;border-radius:0 0 4px 0;' +
      'transition:top 0.2s ease-in-out;');
    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '0';
    });
    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-100px';
    });
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      focusMainContent();
    });
    document.body.prepend(skipLink);
    logDebug(MODULE, 'Skip navigation link added');
  }

  // Enhance page content area with region role
  const pageContent = document.querySelector<HTMLElement>('.notion-page-content');
  if (pageContent && !pageContent.getAttribute('role')) {
    pageContent.setAttribute('role', 'region');
    pageContent.setAttribute('aria-label', 'ページコンテンツ');
    protect(pageContent);
  }
}

// ─── Side peek (page preview) enhancement ────────────────────
function enhanceSidePeek(): void {
  const peek = document.querySelector<HTMLElement>('.notion-peek-renderer');
  if (!peek || peek.hasAttribute(EXTENSION_ATTR + '-peek')) return;

  peek.setAttribute('role', 'complementary');
  peek.setAttribute('aria-label', 'サイドピーク');

  // Try to find the page title within the peek
  const title = peek.querySelector<HTMLElement>(
    '.notion-page-block h1, [class*="page-title"], [placeholder*="Untitled"], [placeholder*="無題"]',
  );
  const titleText = title?.textContent?.trim();
  if (titleText) {
    peek.setAttribute('aria-label', `サイドピーク: ${titleText}`);
  }

  // Make the peek region focusable
  if (!peek.hasAttribute('tabindex')) {
    peek.setAttribute('tabindex', '-1');
  }

  // Enhance close button
  const closeBtn = peek.querySelector<HTMLElement>('[class*="close"], [aria-label*="Close"]');
  if (closeBtn && !closeBtn.getAttribute('aria-label')) {
    closeBtn.setAttribute('aria-label', '閉じる');
  }

  peek.setAttribute(EXTENSION_ATTR + '-peek', 'true');
  protect(peek);
  logDebug(MODULE, 'Side peek enhanced:', titleText ?? 'untitled');
}

// ─── Topbar / breadcrumb enhancement ────────────────────────
function enhanceTopbar(): void {
  // Add banner role to topbar
  const topbar = document.querySelector<HTMLElement>('.notion-topbar');
  if (topbar && !topbar.getAttribute('role')) {
    topbar.setAttribute('role', 'banner');
    topbar.setAttribute('aria-label', 'ページヘッダー');
    protect(topbar);
    logDebug(MODULE, 'Topbar enhanced with role=banner');
  }

  // Add breadcrumb navigation semantics
  const breadcrumb = document.querySelector<HTMLElement>('.shadow-cursor-breadcrumb, .notion-topbar-breadcrumb');
  if (breadcrumb) {
    if (!breadcrumb.getAttribute('role')) {
      breadcrumb.setAttribute('role', 'navigation');
      breadcrumb.setAttribute('aria-label', 'パンくずリスト');
      protect(breadcrumb);
    }

    // Mark breadcrumb links with proper semantics
    const links = breadcrumb.querySelectorAll<HTMLElement>('a, [role="button"]');
    links.forEach((link, idx) => {
      const text = link.textContent?.trim();
      if (text && !link.getAttribute('aria-label')) {
        link.setAttribute('aria-label', text);
        protect(link);
      }
      // Mark the last breadcrumb as current page
      if (idx === links.length - 1) {
        link.setAttribute('aria-current', 'page');
        protect(link);
      }
    });

    logDebug(MODULE, `Breadcrumb enhanced: ${links.length} items`);
  }

  // Label topbar buttons that lack aria-label
  enhanceTopbarButtons(topbar);

  // Enhance sidebar sections with labels
  enhanceSidebarSections();
}

function enhanceTopbarButtons(topbar: HTMLElement): void {
  const buttons = topbar.querySelectorAll<HTMLElement>('[role="button"]');
  for (const btn of buttons) {
    if (btn.getAttribute('aria-label')) continue;
    const text = btn.textContent?.trim() ?? '';
    if (!text) continue;

    // "N日前 編集" / "N分前 編集" / "N時間前 編集" — last edited info
    if (/\d+[日時分秒]前\s*編集|ago\s*edited/i.test(text)) {
      btn.setAttribute('aria-label', `最終更新: ${text}`);
      protect(btn);
    }
  }
}

function enhanceSidebarSections(): void {
  const sidebar = document.querySelector<HTMLElement>('nav.notion-sidebar-container');
  if (!sidebar) return;

  // Find section headers — they're buttons/divs with font-weight: 500/600
  // Notion organizes sidebar into sections: お気に入り, チームスペース, シェア, プライベート
  const sectionLabels = ['お気に入り', 'チームスペース', 'シェア', 'プライベート', 'Favorites', 'Teamspaces', 'Shared', 'Private'];

  for (const label of sectionLabels) {
    // Find the section header element
    const walker = document.createTreeWalker(sidebar, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement;
        const text = el.textContent?.trim();
        // Match exact text (not descendants with long text)
        if (text === label && el.children.length <= 2) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });

    const headerEl = walker.nextNode() as HTMLElement | null;
    if (!headerEl) continue;

    // Find the section container — typically the parent or grandparent
    // that contains both the header and the tree items
    let section = headerEl.parentElement;
    // Walk up to find a container that includes tree items
    for (let i = 0; i < 3; i++) {
      if (!section) break;
      if (section.querySelector('[role="treeitem"]')) break;
      section = section.parentElement;
    }

    if (section && !section.getAttribute('aria-label')) {
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', label);
      protect(section);
    }
  }

  logDebug(MODULE, 'Sidebar sections enhanced');
}

// ─── DB toolbar button enhancement ──────────────────────────
function enhanceDBToolbarButtons(): void {
  const dbBlocks = document.querySelectorAll<HTMLElement>('.notion-collection_view-block');
  for (const db of dbBlocks) {
    const buttons = db.querySelectorAll<HTMLElement>('div[role="button"]');
    for (const btn of buttons) {
      if (btn.getAttribute('aria-label')) continue;
      const text = btn.textContent?.trim() ?? '';
      const rect = btn.getBoundingClientRect();

      // Skip large or invisible elements
      if (rect.height > 35 || rect.height < 15 || rect.width > 200) continue;

      // "新規" button
      if (text === '新規' || text === 'New') {
        btn.setAttribute('aria-label', '新規ページを作成');
      }
      // "他N件" button (more views)
      else if (/^他\d+件$/.test(text) || /^\+\d+/.test(text)) {
        btn.setAttribute('aria-label', `${text} — 他のビューを表示`);
      }
    }
  }
}

// ─── Home page enhancement ──────────────────────────────────
function enhanceHomePage(): void {
  // Only run on the home page (identified by URL or content)
  const homeHeader = document.querySelector<HTMLElement>('.notion-home-page, [class*="home-page"]');
  // Alternative detection: look for the home content sections
  const mainFrame = document.querySelector<HTMLElement>(MAIN_FRAME);
  if (!mainFrame) return;

  // Check if already enhanced
  if (mainFrame.hasAttribute(EXTENSION_ATTR + '-home')) return;

  // Look for home page section headers
  const sectionNames = ['最近のアクセス', '今後のイベント', 'マイタスク', 'Recent', 'Upcoming events', 'My tasks'];
  const allSpans = mainFrame.querySelectorAll<HTMLElement>('span, div');
  let homeDetected = false;

  for (const el of allSpans) {
    const text = el.textContent?.trim();
    if (!text || el.children.length > 0) continue;
    if (!sectionNames.includes(text)) continue;

    homeDetected = true;

    // Add heading role to section headers
    if (!el.getAttribute('role')) {
      el.setAttribute('role', 'heading');
      el.setAttribute('aria-level', '2');
      protect(el);
    }

    // Find and enhance the section container
    let sectionContainer = el.parentElement;
    for (let i = 0; i < 4; i++) {
      if (!sectionContainer) break;
      // A section container typically has significant height and width
      const rect = sectionContainer.getBoundingClientRect();
      if (rect.height > 100 && rect.width > 300) break;
      sectionContainer = sectionContainer.parentElement;
    }

    if (sectionContainer && !sectionContainer.getAttribute('role')) {
      sectionContainer.setAttribute('role', 'region');
      sectionContainer.setAttribute('aria-label', text);
      protect(sectionContainer);
    }
  }

  if (!homeDetected) return;

  // Enhance page cards in "最近のアクセス"
  const pageLinks = mainFrame.querySelectorAll<HTMLAnchorElement>('a[role="link"]');
  for (const link of pageLinks) {
    if (link.getAttribute('aria-label')) continue;

    // Extract page title from the card
    // Notion card structure: children[0]=cover/icon, children[1]=info container
    // Info container has grandchildren: [0]=title div, [1]=date div
    const titleEl = link.querySelector<HTMLElement>('[class*="title"], [class*="name"]');
    let title = titleEl?.textContent?.trim();

    if (!title) {
      // Try DOM structure: second child's first grandchild is the title
      const infoContainer = link.children[1] as HTMLElement | undefined;
      if (infoContainer?.children.length >= 2) {
        title = (infoContainer.children[0] as HTMLElement).textContent?.trim();
      }
    }

    if (!title) {
      // Final fallback: strip date suffix from full text
      const fullText = link.textContent?.trim() ?? '';
      const datePattern = /\d+(?:時間|日|分|秒|か月)前$|\d{4}年\d+月\d+日$|\d+月\d+日$|\d{4}\/\d+\/\d+$/;
      const cleaned = fullText.replace(datePattern, '').trim();
      if (cleaned && cleaned.length < 60 && cleaned !== fullText) {
        title = cleaned;
      }
    }

    if (title) {
      link.setAttribute('aria-label', title);
    }
  }

  // Label icon-only buttons (carousel arrows, expand, add)
  const svgButtonLabels: Record<string, string> = {
    arrowChevronLeftSmall: '前へスクロール',
    arrowChevronRightSmall: '次へスクロール',
    arrowChevronSingleLeftFillSmall: '前へスクロール',
    arrowChevronSingleRightFillSmall: '次へスクロール',
    arrowDiagonalUpRightSmall: '開く',
    plusFillSmall: '追加',
  };
  const iconBtns = mainFrame.querySelectorAll<HTMLElement>('[role="button"]');
  for (const btn of iconBtns) {
    if (btn.getAttribute('aria-label')) continue;
    if (btn.textContent?.trim()) continue;
    const svg = btn.querySelector('svg');
    if (!svg) continue;
    const cls = svg.getAttribute('class') ?? '';
    for (const token of cls.split(/\s+/)) {
      if (token in svgButtonLabels) {
        btn.setAttribute('aria-label', svgButtonLabels[token]);
        break;
      }
    }
  }

  mainFrame.setAttribute(EXTENSION_ATTR + '-home', 'true');
  logDebug(MODULE, 'Home page enhanced');
}

// ─── Inbox panel enhancement ────────────────────────────────
function enhanceInboxPanel(): void {
  // Find the inbox panel — it's a side panel with "受信トレイ" header
  const allRegions = document.querySelectorAll<HTMLElement>('[role="region"]');
  for (const region of allRegions) {
    // Skip already labeled regions
    if (region.getAttribute('aria-label')) continue;
    if (region.hasAttribute(EXTENSION_ATTR + '-inbox')) continue;

    // Check if this is the inbox panel
    const rect = region.getBoundingClientRect();
    if (rect.width < 200 || rect.width > 500 || rect.height < 300) continue;

    // Look for "受信トレイ" text inside
    const headerEl = Array.from(region.querySelectorAll<HTMLElement>('*')).find(el =>
      (el.textContent?.trim() === '受信トレイ' || el.textContent?.trim() === 'Inbox')
      && el.children.length === 0
    );
    if (!headerEl) continue;

    // Found the inbox panel
    region.setAttribute('aria-label', '受信トレイ');
    protect(region);

    // Make the header a proper heading
    if (!headerEl.getAttribute('role')) {
      headerEl.setAttribute('role', 'heading');
      headerEl.setAttribute('aria-level', '1');
    }

    // Find and enhance notification items
    const notifItems = region.querySelectorAll<HTMLElement>('div[role="button"]');
    let notifCount = 0;
    for (const item of notifItems) {
      const text = item.textContent?.trim() ?? '';
      // Skip small icon buttons (they already have labels)
      if (item.getAttribute('aria-label')) continue;
      const itemRect = item.getBoundingClientRect();
      if (itemRect.width < 200) continue;

      // This is likely a notification item
      if (text.length > 10 && !item.getAttribute('aria-label')) {
        // Extract meaningful label from notification text
        const label = text.substring(0, 60) + (text.length > 60 ? '…' : '');
        item.setAttribute('aria-label', label);
        notifCount++;
      }
    }

    region.setAttribute(EXTENSION_ATTR + '-inbox', 'true');
    logDebug(MODULE, `Inbox panel enhanced: ${notifCount} notifications`);
    break;
  }
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
