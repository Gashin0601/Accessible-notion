/**
 * Background Service Worker
 *
 * Handles extension lifecycle and settings management.
 * Includes dev-mode hot reload: polls for file changes and reloads.
 */

import { DEFAULT_SETTINGS } from '../shared/constants';

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const result = await chrome.storage.local.get('settings');
    if (!result.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
      console.log('[AccessibleNotion] Default settings initialized');
    }
  }
});

// Relay settings changes to content scripts
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    console.log('[AccessibleNotion] Settings changed');
  }
});

// ─── DOM Bridge Injection ────────────────────────────────────
// Inject the DOM bridge into Notion pages' MAIN world to prevent
// DOMLock from reverting our ARIA attributes.
// Uses chrome.scripting.executeScript which bypasses CSP.

/** The bridge code to inject into the page's main world */
function domBridgeCode() {
  const PROTECTED = new Set([
    'role','aria-label','aria-roledescription','aria-expanded',
    'aria-checked','aria-selected','aria-level','aria-describedby',
    'aria-owns','aria-modal','aria-live','aria-atomic','aria-relevant',
    'tabindex','data-accessible-notion','alt',
  ]);
  const _prot: WeakSet<Element> = new WeakSet();
  const _origSet = Element.prototype.setAttribute;
  const _origRem = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function(n: string) {
    if (_prot.has(this) && PROTECTED.has(n)) return;
    return _origRem.call(this, n);
  };
  Element.prototype.setAttribute = function(n: string, v: string) {
    if (_prot.has(this) && PROTECTED.has(n)) return;
    return _origSet.call(this, n, v);
  };
  document.addEventListener('accessible-notion-protect', (e: Event) => {
    if (e.target instanceof Element) _prot.add(e.target);
  }, true);
  document.addEventListener('accessible-notion-unprotect', (e: Event) => {
    if (e.target instanceof Element) _prot.delete(e.target);
  }, true);
  console.log('[AccessibleNotion] DOM bridge loaded via scripting API');
}

async function injectBridgeIntoTab(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: domBridgeCode,
      world: 'MAIN' as chrome.scripting.ExecutionWorld,
    });
    console.log(`[AccessibleNotion] Bridge injected into tab ${tabId}`);
  } catch (err) {
    console.log(`[AccessibleNotion] Bridge injection failed for tab ${tabId}:`, err);
  }
}

// Inject bridge when content script requests it
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'inject-dom-bridge' && sender.tab?.id) {
    injectBridgeIntoTab(sender.tab.id);
  }
});

// Also inject on navigation to Notion pages
chrome.webNavigation?.onCommitted?.addListener(
  (details) => {
    if (details.frameId === 0) {
      injectBridgeIntoTab(details.tabId);
    }
  },
  { url: [{ hostEquals: 'www.notion.so' }, { hostSuffix: '.notion.site' }] },
);

// ─── Guide Page ──────────────────────────────────────────────
// Open the guide page when the extension icon is clicked.

chrome.action?.onClicked?.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('guide/guide.html') });
});

// ─── Dev Hot Reload ──────────────────────────────────────────
// In dev mode, watch for build timestamp changes and auto-reload.
// esbuild writes dist/reload.txt with Date.now() on each build.
// Only runs for "development" (unpacked) extensions.

// After extension reload, re-inject content scripts into existing Notion tabs
async function reloadNotionTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://www.notion.so/*', 'https://*.notion.site/*'],
    });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.reload(tab.id);
        console.log(`[AccessibleNotion] Reloaded Notion tab ${tab.id}`);
      }
    }
  } catch (err) {
    console.log('[AccessibleNotion] Failed to reload Notion tabs:', err);
  }
}

// On extension update (after chrome.runtime.reload()), reload Notion tabs
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update') {
    // Small delay to ensure service worker is fully initialized
    setTimeout(() => reloadNotionTabs(), 500);
  }
});

(async () => {
  try {
    const self = await chrome.management.getSelf();
    if (self.installType !== 'development') return;

    console.log('[AccessibleNotion] Dev mode — hot reload enabled (timestamp polling)');

    let lastTimestamp = '';

    async function readTimestamp(): Promise<string> {
      try {
        const url = chrome.runtime.getURL('reload.txt');
        const response = await fetch(url, { cache: 'no-store' });
        return await response.text();
      } catch {
        return '';
      }
    }

    // Get initial timestamp
    lastTimestamp = await readTimestamp();

    // Poll every 1.5 seconds
    setInterval(async () => {
      try {
        const current = await readTimestamp();
        if (current && current !== lastTimestamp && lastTimestamp !== '') {
          console.log('[AccessibleNotion] Build change detected, reloading extension...');
          chrome.runtime.reload();
        }
        lastTimestamp = current;
      } catch {
        // Ignore polling errors
      }
    }, 1500);
  } catch {
    // chrome.management may not be available
  }
})();
