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
