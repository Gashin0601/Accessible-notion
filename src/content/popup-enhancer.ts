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

// ─── Inline Toolbar Enhancement ─────────────────────────────
/**
 * Notion inline toolbar button label map.
 * Keys are SVG path identifiers or text content for matching.
 */
const TOOLBAR_BUTTON_LABELS: Record<string, string> = {
  '文章を改善する': 'AIで文章を改善する',
  'AIに依頼': 'AIに依頼',
  'コメント': 'コメント',
  'リンク': 'リンク',
};

/** SVG icon heuristics for toolbar buttons (by viewBox or path characteristics) */
const TOOLBAR_ICON_LABELS: Array<{ test: (svg: SVGElement) => boolean; label: string }> = [
  { test: (svg) => svg.innerHTML.includes('M') && svg.innerHTML.includes('font-weight') || false, label: '太字 (Ctrl+B)' },
  { test: (svg) => svg.innerHTML.includes('font-style: italic') || false, label: 'イタリック (Ctrl+I)' },
  { test: (svg) => svg.innerHTML.includes('text-decoration: line-through') || false, label: '取り消し線 (Ctrl+Shift+S)' },
  { test: (svg) => svg.innerHTML.includes('underline') || false, label: '下線 (Ctrl+U)' },
  { test: (svg) => svg.innerHTML.includes('code') || false, label: 'コード (Ctrl+E)' },
];

/**
 * Enhance the inline text formatting toolbar (.notion-text-action-menu).
 */
function enhanceInlineToolbar(toolbar: HTMLElement): void {
  if (toolbar.hasAttribute(POPUP_MARKER)) return;

  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'テキスト書式設定ツールバー');

  // Find button container — it's nested ~2 levels deep and has the most children
  const buttonContainer = findButtonContainer(toolbar);
  if (!buttonContainer) return;

  for (let i = 0; i < buttonContainer.children.length; i++) {
    const child = buttonContainer.children[i] as HTMLElement;
    if (!child) continue;

    const rect = child.getBoundingClientRect();

    // Skip separators (width <= 2)
    if (rect.width <= 2) continue;

    // Skip hidden elements (data-popup-origin with 0 size)
    if (rect.width === 0 && rect.height === 0) continue;

    const text = child.textContent?.trim() ?? '';
    const role = child.getAttribute('role');

    // Ensure role="button" for interactive elements
    if (!role && rect.width > 20) {
      child.setAttribute('role', 'button');
      child.setAttribute('tabindex', '0');
    }

    // Add aria-label if missing
    if (!child.getAttribute('aria-label')) {
      // Try text-based label
      if (text && TOOLBAR_BUTTON_LABELS[text]) {
        child.setAttribute('aria-label', TOOLBAR_BUTTON_LABELS[text]);
      } else if (text && text.length < 30) {
        child.setAttribute('aria-label', text);
      } else {
        // Try SVG-based label (icon buttons)
        const svg = child.querySelector('svg');
        if (svg) {
          const iconLabel = guessIconLabel(child, i, buttonContainer);
          if (iconLabel) {
            child.setAttribute('aria-label', iconLabel);
          }
        }
      }
    }
  }

  toolbar.setAttribute(POPUP_MARKER, 'toolbar');
  logDebug(MODULE, 'Enhanced inline toolbar');
}

/**
 * Guess the label for an icon-only toolbar button based on position and content.
 * Position-based since Notion's toolbar follows a consistent order.
 */
function guessIconLabel(button: HTMLElement, index: number, container: HTMLElement): string {
  // Count visible buttons (non-separator, non-hidden) up to this index
  let visibleIdx = 0;
  for (let i = 0; i < index; i++) {
    const child = container.children[i] as HTMLElement;
    if (!child) continue;
    const r = child.getBoundingClientRect();
    if (r.width > 2 && r.width > 0 && r.height > 0) visibleIdx++;
  }

  // Check if button has aria-haspopup or dropdown indicator
  const hasPopup = button.getAttribute('aria-haspopup') || button.querySelector('[class*="chevron"], [class*="arrow"]');

  // Look for distinctive text content
  const text = button.textContent?.trim();
  if (text) {
    if (text === 'A') return 'テキストカラー';
    if (text.includes('⋮') || text === '...') return 'その他のオプション';
  }

  // Font style buttons are typically icon-only SVG buttons
  // Order after AI/comment/separator buttons
  const iconLabels = [
    '太字',
    'イタリック',
    '下線',
    '取り消し線',
    'コード',
    'リンク',
    'テキストカラー',
    'その他',
  ];

  // Icon buttons start after the text-labeled buttons and separators
  // This is a fallback — position-based guessing
  if (visibleIdx >= 3 && visibleIdx - 3 < iconLabels.length) {
    return iconLabels[visibleIdx - 3];
  }

  return '書式ボタン';
}

function findButtonContainer(toolbar: HTMLElement): HTMLElement | null {
  // Find the deepest element with the most children (the button row)
  let best: HTMLElement | null = null;
  let bestCount = 0;

  function walk(el: HTMLElement, depth: number): void {
    if (depth > 5) return;
    if (el.children.length > bestCount) {
      bestCount = el.children.length;
      best = el;
    }
    for (const child of el.children) {
      if (child instanceof HTMLElement) walk(child, depth + 1);
    }
  }

  walk(toolbar, 0);
  return bestCount >= 5 ? best : null;
}

// ─── DB Filter/Sort Enhancement ─────────────────────────────
/**
 * Enhance filter/sort popups that Notion renders in dialogs.
 * These popups contain property selectors, operator selectors, and value inputs.
 */
function enhanceFilterSortPopup(dialog: HTMLElement): void {
  // Filter popups have "フィルター" or "Filter" in their content
  const text = dialog.textContent ?? '';
  const isFilter = text.includes('フィルター') || text.includes('Filter');
  const isSort = text.includes('並べ替え') || text.includes('Sort');

  if (!isFilter && !isSort) return;

  const label = isFilter ? 'フィルター設定' : '並べ替え設定';
  dialog.setAttribute('aria-label', label);

  // Enhance select/dropdown controls within the filter
  const selects = dialog.querySelectorAll<HTMLElement>('[role="button"], [role="combobox"]');
  selects.forEach((sel) => {
    if (!sel.getAttribute('aria-label')) {
      const text = sel.textContent?.trim();
      if (text) sel.setAttribute('aria-label', text);
    }
  });

  // Enhance input fields
  const inputs = dialog.querySelectorAll<HTMLElement>('input, [contenteditable="true"]');
  inputs.forEach((input) => {
    if (!input.getAttribute('aria-label')) {
      const placeholder = input.getAttribute('placeholder');
      if (placeholder) {
        input.setAttribute('aria-label', placeholder);
      } else {
        input.setAttribute('aria-label', 'フィルター値');
      }
    }
  });

  // Enhance remove buttons
  const removeButtons = dialog.querySelectorAll<HTMLElement>('[role="button"]');
  removeButtons.forEach((btn) => {
    const text = btn.textContent?.trim();
    if (text === '×' || text === '✕' || btn.querySelector('svg')) {
      if (!btn.getAttribute('aria-label')) {
        // Check if it looks like a close/remove button
        const rect = btn.getBoundingClientRect();
        if (rect.width < 30 && rect.height < 30) {
          btn.setAttribute('aria-label', 'フィルターを削除');
        }
      }
    }
  });

  logDebug(MODULE, `Enhanced ${label} popup`);
}

export function initPopupEnhancer(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Added nodes — look for new dialogs and toolbars
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Inline toolbar
        if (node.matches('.notion-text-action-menu')) {
          setTimeout(() => enhanceInlineToolbar(node), 50);
        }
        const toolbars = node.querySelectorAll<HTMLElement>('.notion-text-action-menu');
        toolbars.forEach((t) => setTimeout(() => enhanceInlineToolbar(t), 50));

        // Dialogs
        if (node.matches('[role="dialog"]')) {
          setTimeout(() => {
            enhancePopup(node);
            enhanceFilterSortPopup(node);
          }, 50);
        }
        const dialogs = node.querySelectorAll<HTMLElement>('[role="dialog"]');
        dialogs.forEach((d) => setTimeout(() => {
          enhancePopup(d);
          enhanceFilterSortPopup(d);
        }, 50));
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
