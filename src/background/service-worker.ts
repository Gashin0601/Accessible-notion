/**
 * Background Service Worker
 *
 * Handles extension lifecycle and settings management.
 * Minimal — most logic lives in the content script.
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
    // Content scripts listen via chrome.storage.onChanged directly
    console.log('[AccessibleNotion] Settings changed');
  }
});
