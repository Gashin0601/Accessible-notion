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

// ─── Dev Hot Reload ──────────────────────────────────────────
// In dev mode (non-minified builds), watch for file changes and auto-reload.
// This uses chrome.management API to detect the extension's own install type.
// Only runs for "development" (unpacked) extensions.
(async () => {
  try {
    const self = await chrome.management.getSelf();
    if (self.installType !== 'development') return;

    console.log('[AccessibleNotion] Dev mode detected — hot reload enabled');

    const POLL_INTERVAL = 1000; // 1 second

    // Fetch modification timestamps of key files
    const filesToWatch = [
      'content/main.js',
      'background/service-worker.js',
      'manifest.json',
    ];

    let lastTimestamps: Record<string, string> = {};

    async function getTimestamps(): Promise<Record<string, string>> {
      const timestamps: Record<string, string> = {};
      for (const file of filesToWatch) {
        try {
          const url = chrome.runtime.getURL(file);
          const response = await fetch(url, { method: 'HEAD' });
          // Use content-length as a proxy for change detection
          // (last-modified is not reliable for extension files)
          timestamps[file] = response.headers.get('content-length') ?? '';
        } catch {
          timestamps[file] = '';
        }
      }
      return timestamps;
    }

    // Get initial timestamps
    lastTimestamps = await getTimestamps();

    // Poll for changes
    setInterval(async () => {
      try {
        const current = await getTimestamps();
        const changed = filesToWatch.some(
          (f) => current[f] !== lastTimestamps[f] && lastTimestamps[f] !== '',
        );

        if (changed) {
          console.log('[AccessibleNotion] File change detected, reloading...');
          chrome.runtime.reload();
        }

        lastTimestamps = current;
      } catch {
        // Ignore errors during polling
      }
    }, POLL_INTERVAL);
  } catch {
    // chrome.management may not be available
  }
})();
