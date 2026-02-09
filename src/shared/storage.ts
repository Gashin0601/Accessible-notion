import { DEFAULT_SETTINGS, type ExtensionSettings } from './constants';

/** Load settings from chrome.storage.local, falling back to defaults */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.local.get('settings');
    if (result.settings) {
      return { ...DEFAULT_SETTINGS, ...result.settings };
    }
  } catch {
    // Storage unavailable (e.g. in tests) — use defaults
  }
  return { ...DEFAULT_SETTINGS };
}

/** Save settings to chrome.storage.local */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

/** Listen for settings changes */
export function onSettingsChanged(
  callback: (newSettings: ExtensionSettings) => void,
): void {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings?.newValue) {
      callback({ ...DEFAULT_SETTINGS, ...changes.settings.newValue });
    }
  });
}
