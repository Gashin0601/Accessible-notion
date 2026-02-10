/**
 * Popup / Menu Enhancement
 *
 * Enhances dynamic popup menus that Notion renders:
 * - Slash command menu (/) — listbox with grouped options
 * - Mention menu (@) — listbox with user/page suggestions
 * - Page link menu ([[) — listbox with page suggestions
 * - Block action menu (⋮) — menu with menuitems
 * - Color picker — radiogroup with color options
 * - Turn-into menu — listbox with block type options
 *
 * Strategy:
 *   Notion already provides some ARIA roles (role="listbox", role="option",
 *   role="dialog") but is missing key attributes for screen reader usability:
 *   - aria-label on listbox
 *   - aria-selected on options (highlight tracking)
 *   - aria-activedescendant on the input/listbox
 *   - role="group" + aria-label on category sections
 *   - Proper dialog labels for different popup types
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import { announce } from './live-announcer';

const MODULE = 'PopupEnhancer';

let observer: MutationObserver | null = null;
let highlightSyncTimer: ReturnType<typeof setInterval> | null = null;

/** Marker attribute for processed popups */
const POPUP_MARKER = EXTENSION_ATTR + '-popup';

/** Detect popup type from its content */
type PopupType = 'slash-command' | 'mention' | 'turn-into' | 'color-picker' | 'block-action' | 'generic';

/**
 * Determine what kind of popup this dialog is.
 */
function detectPopupType(dialog: HTMLElement): PopupType {
  const listbox = dialog.querySelector('[role="listbox"]');

  if (listbox) {
    const text = listbox.textContent ?? '';

    // Slash command menu: has block type options like テキスト, 見出し
    if (text.includes('テキスト') && (text.includes('見出し') || text.includes('Heading'))) {
      return 'slash-command';
    }

    // Turn-into menu: has block type options but triggered from block menu
    if (text.includes('テキスト') && text.includes('トグル')) {
      return 'turn-into';
    }

    // Color/background picker
    if (text.includes('デフォルト') && (text.includes('グレー') || text.includes('ブラウン'))) {
      return 'color-picker';
    }
  }

  // Block action menu: has menu with items like 削除, 複製
  const menuItems = dialog.querySelectorAll('[role="menuitem"]');
  if (menuItems.length > 0) {
    return 'block-action';
  }

  // Mention: has listbox with person/page entries
  if (listbox) {
    const options = listbox.querySelectorAll('[role="option"]');
    if (options.length > 0) {
      return 'mention';
    }
  }

  return 'generic';
}

/**
 * Get the appropriate label for a popup dialog based on its type.
 */
function getPopupLabel(type: PopupType): string {
  switch (type) {
    case 'slash-command': return 'スラッシュコマンド';
    case 'mention': return 'メンション';
    case 'turn-into': return 'ブロックタイプ変更';
    case 'color-picker': return 'カラーピッカー';
    case 'block-action': return 'ブロック操作';
    case 'generic': return 'メニュー';
  }
}

/**
 * Enhance a popup dialog that contains a listbox (slash commands, mentions, etc.)
 */
function enhanceListboxPopup(dialog: HTMLElement, type: PopupType): void {
  const label = getPopupLabel(type);

  // Improve dialog label
  dialog.setAttribute('aria-label', label);

  const listbox = dialog.querySelector<HTMLElement>('[role="listbox"]');
  if (!listbox) return;

  // Set aria-label on listbox
  if (!listbox.getAttribute('aria-label')) {
    listbox.setAttribute('aria-label', label);
  }

  // Enhance category groups within the listbox
  enhanceCategoryGroups(listbox, type);

  // Enhance individual options
  enhanceOptions(listbox);

  // Start tracking highlighted option
  startHighlightSync(dialog, listbox);

  // Announce popup
  const options = listbox.querySelectorAll('[role="option"]');
  announce(`${label} ${options.length}件`);

  logDebug(MODULE, `Enhanced ${type} popup: ${options.length} options`);
}

/**
 * Add role="group" and aria-label to category sections within the listbox.
 * Notion groups slash command items under category headers (基本, Notion AI, etc.)
 */
function enhanceCategoryGroups(listbox: HTMLElement, type: PopupType): void {
  // Category groups are direct children of listbox that contain multiple options
  const groups = Array.from(listbox.children);

  for (const group of groups) {
    if (!(group instanceof HTMLElement)) continue;

    const options = group.querySelectorAll('[role="option"]');
    if (options.length === 0) continue;

    // First child that's not an option is usually the category header
    const firstChild = group.children[0];
    if (!firstChild) continue;

    const headerText = firstChild.querySelector('[role="option"]')
      ? null  // First child IS an option, no separate header
      : firstChild.textContent?.trim();

    if (headerText && !group.getAttribute('role')) {
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', headerText);
    }
  }
}

/**
 * Ensure all options have aria-selected and proper labels.
 */
function enhanceOptions(listbox: HTMLElement): void {
  const options = listbox.querySelectorAll<HTMLElement>('[role="option"]');

  options.forEach((opt, idx) => {
    // Ensure aria-selected is set (default false)
    if (!opt.hasAttribute('aria-selected')) {
      opt.setAttribute('aria-selected', 'false');
    }

    // Ensure each has an ID for aria-activedescendant
    if (!opt.id) {
      opt.id = `an-popup-opt-${idx}`;
    }

    // Build aria-label from visible text if not already set
    if (!opt.getAttribute('aria-label')) {
      const text = extractOptionLabel(opt);
      if (text) {
        opt.setAttribute('aria-label', text);
      }
    }
  });
}

/**
 * Extract a meaningful label from an option element.
 * Notion option items may have an icon, title text, and shortcut hint.
 */
function extractOptionLabel(opt: HTMLElement): string {
  // Try to find the main text (skip icon areas, shortcut hints)
  const children = Array.from(opt.children);

  if (children.length === 0) {
    return opt.textContent?.trim() ?? '';
  }

  // For slash commands: usually has icon div + text div + shortcut div
  // The text is typically in the second child or a child with text
  const texts: string[] = [];
  for (const child of children) {
    if (!(child instanceof HTMLElement)) continue;

    // Skip tiny elements (likely icons or spacers)
    if (child.offsetWidth < 20 && child.offsetHeight < 20) continue;

    const text = child.textContent?.trim();
    if (text) {
      texts.push(text);
    }
  }

  return texts.join(' ') || opt.textContent?.trim() || '';
}

/**
 * Track which option is visually highlighted and sync aria-selected.
 * Notion highlights options with background-color changes.
 */
function startHighlightSync(dialog: HTMLElement, listbox: HTMLElement): void {
  stopHighlightSync();

  let lastHighlightedId = '';

  const sync = () => {
    if (!document.contains(dialog)) {
      stopHighlightSync();
      return;
    }

    const options = listbox.querySelectorAll<HTMLElement>('[role="option"]');
    let highlightedIdx = -1;

    for (let i = 0; i < options.length; i++) {
      const bg = getComputedStyle(options[i]).backgroundColor;
      // Notion highlights with a subtle non-transparent background
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        highlightedIdx = i;
        break;
      }
    }

    // Update aria-selected
    for (let i = 0; i < options.length; i++) {
      const shouldSelect = i === highlightedIdx;
      const current = options[i].getAttribute('aria-selected');
      if ((current === 'true') !== shouldSelect) {
        options[i].setAttribute('aria-selected', String(shouldSelect));
      }
    }

    // Set aria-activedescendant on listbox
    if (highlightedIdx >= 0) {
      const highlightedOpt = options[highlightedIdx];
      if (highlightedOpt.id !== lastHighlightedId) {
        lastHighlightedId = highlightedOpt.id;
        listbox.setAttribute('aria-activedescendant', highlightedOpt.id);

        // Announce the newly highlighted item
        const label = highlightedOpt.getAttribute('aria-label')
          ?? highlightedOpt.textContent?.trim() ?? '';
        if (label) {
          announce(label);
        }
      }
    }
  };

  // Run immediately and then on an interval
  sync();
  highlightSyncTimer = setInterval(sync, 100);
}

function stopHighlightSync(): void {
  if (highlightSyncTimer) {
    clearInterval(highlightSyncTimer);
    highlightSyncTimer = null;
  }
}

/**
 * Enhance a block action menu (⋮ menu with options like Delete, Duplicate, etc.)
 */
function enhanceBlockActionMenu(dialog: HTMLElement): void {
  dialog.setAttribute('aria-label', 'ブロック操作');

  const menuItems = dialog.querySelectorAll<HTMLElement>('[role="menuitem"]');
  menuItems.forEach((item) => {
    if (!item.getAttribute('aria-label')) {
      const text = item.textContent?.trim();
      if (text) {
        item.setAttribute('aria-label', text);
      }
    }
  });

  announce(`ブロック操作 ${menuItems.length}件`);
  logDebug(MODULE, `Enhanced block action menu: ${menuItems.length} items`);
}

/**
 * Enhance a color picker popup.
 */
function enhanceColorPicker(dialog: HTMLElement): void {
  dialog.setAttribute('aria-label', 'カラーピッカー');

  const listbox = dialog.querySelector<HTMLElement>('[role="listbox"]');
  if (listbox) {
    listbox.setAttribute('aria-label', 'カラーオプション');

    // Enhance options with color names
    const options = listbox.querySelectorAll<HTMLElement>('[role="option"]');
    options.forEach((opt) => {
      if (!opt.getAttribute('aria-label')) {
        const text = opt.textContent?.trim();
        if (text) {
          opt.setAttribute('aria-label', text);
        }
      }
    });

    startHighlightSync(dialog, listbox);
  }

  announce(`カラーピッカー`);
  logDebug(MODULE, 'Enhanced color picker');
}

/**
 * Main enhancement entry point for a newly detected dialog.
 * Skips dialogs already handled by search-enhancer or modal-enhancer for non-popup cases.
 */
function enhancePopup(dialog: HTMLElement): void {
  // Skip if already processed
  if (dialog.hasAttribute(POPUP_MARKER)) return;

  // Skip search dialogs (handled by search-enhancer)
  if (dialog.getAttribute(EXTENSION_ATTR) === 'search') return;

  // Detect popup type
  const type = detectPopupType(dialog);

  switch (type) {
    case 'slash-command':
    case 'mention':
    case 'turn-into':
      enhanceListboxPopup(dialog, type);
      break;
    case 'block-action':
      enhanceBlockActionMenu(dialog);
      break;
    case 'color-picker':
      enhanceColorPicker(dialog);
      break;
    case 'generic':
      enhanceGenericPopup(dialog);
      break;
  }

  dialog.setAttribute(POPUP_MARKER, type);
}

/**
 * Generic popup enhancement — at minimum, improve the dialog label.
 */
function enhanceGenericPopup(dialog: HTMLElement): void {
  // Only override if still the default label from modal-enhancer
  const currentLabel = dialog.getAttribute('aria-label');
  if (currentLabel === 'ダイアログ') {
    // Try to infer label from content
    const heading = dialog.querySelector('h1, h2, h3, [class*="title"]');
    const headingText = heading?.textContent?.trim();
    if (headingText) {
      dialog.setAttribute('aria-label', headingText);
    }
  }

  const listbox = dialog.querySelector<HTMLElement>('[role="listbox"]');
  if (listbox) {
    enhanceOptions(listbox);
    startHighlightSync(dialog, listbox);
  }
}

/**
 * Handle dialog removal — clean up sync timers.
 */
function handlePopupRemoved(dialog: HTMLElement): void {
  stopHighlightSync();
  logDebug(MODULE, `Popup closed: ${dialog.getAttribute(POPUP_MARKER)}`);
}

/**
 * Re-enhance options when the popup content changes (e.g., typing filters slash commands).
 */
function reEnhanceActivePopup(): void {
  const popup = document.querySelector<HTMLElement>(`[${POPUP_MARKER}]`);
  if (!popup) return;

  const listbox = popup.querySelector<HTMLElement>('[role="listbox"]');
  if (!listbox) return;

  // Re-enhance new options that may have appeared after filtering
  enhanceOptions(listbox);
  enhanceCategoryGroups(listbox, popup.getAttribute(POPUP_MARKER) as PopupType ?? 'generic');
}

export function initPopupEnhancer(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Added nodes — look for new dialogs
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        if (node.matches('[role="dialog"]')) {
          // Delay slightly to let Notion finish rendering the popup content
          setTimeout(() => enhancePopup(node), 50);
        }
        const dialogs = node.querySelectorAll<HTMLElement>('[role="dialog"]');
        dialogs.forEach((d) => setTimeout(() => enhancePopup(d), 50));
      }

      // Removed nodes — detect popup closure
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(`[${POPUP_MARKER}]`)) {
          handlePopupRemoved(node);
        }
        const popups = node.querySelectorAll<HTMLElement>(`[${POPUP_MARKER}]`);
        popups.forEach(handlePopupRemoved);
      }
    }

    // Debounced re-enhancement for content changes within active popups
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(reEnhanceActivePopup, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  logDebug(MODULE, 'Popup enhancer initialized');
}

export function destroyPopupEnhancer(): void {
  observer?.disconnect();
  observer = null;
  stopHighlightSync();
}
