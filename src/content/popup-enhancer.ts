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
type PopupType = 'slash-command' | 'mention' | 'turn-into' | 'color-picker' | 'block-action' | 'ai-panel' | 'property-editor' | 'link-preview' | 'emoji-picker' | 'generic';

/**
 * Determine what kind of popup this dialog is.
 */
function detectPopupType(dialog: HTMLElement): PopupType {
  const listbox = dialog.querySelector('[role="listbox"]');
  const text = dialog.textContent ?? '';

  if (listbox) {
    const lbText = listbox.textContent ?? '';

    // Slash command menu: has block type options like テキスト, 見出し
    if (lbText.includes('テキスト') && (lbText.includes('見出し') || lbText.includes('Heading'))) {
      return 'slash-command';
    }

    // Turn-into menu: has block type options but triggered from block menu
    if (lbText.includes('テキスト') && lbText.includes('トグル')) {
      return 'turn-into';
    }

    // Color/background picker
    if (lbText.includes('デフォルト') && (lbText.includes('グレー') || lbText.includes('ブラウン'))) {
      return 'color-picker';
    }
  }

  // Notion AI panel: has AI-specific content
  if (text.includes('AIに依頼') || text.includes('Ask AI')
    || text.includes('文章を改善する') || text.includes('Improve writing')
    || dialog.querySelector('[class*="ai-action"], [class*="notion-ai"]')) {
    return 'ai-panel';
  }

  // Property editor: has property type or config elements
  if (text.includes('プロパティの編集') || text.includes('Edit property')
    || text.includes('プロパティタイプ') || text.includes('Property type')
    || (dialog.querySelector('[class*="property"]') && dialog.querySelector('input, select, [role="combobox"]'))) {
    return 'property-editor';
  }

  // Emoji picker
  if (dialog.querySelector('[class*="emoji-picker"], [class*="emoji-grid"]')
    || (text.includes('スマイリーと人々') || text.includes('Smileys'))) {
    return 'emoji-picker';
  }

  // Link preview/page preview popup
  if (dialog.querySelector('[class*="link-preview"], [class*="page-preview"]')
    || dialog.querySelector('[class*="bookmark-info"]')) {
    return 'link-preview';
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
    case 'ai-panel': return 'Notion AI';
    case 'property-editor': return 'プロパティ編集';
    case 'link-preview': return 'リンクプレビュー';
    case 'emoji-picker': return '絵文字ピッカー';
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
    case 'ai-panel':
      enhanceAIPanel(dialog);
      break;
    case 'property-editor':
      enhancePropertyEditor(dialog);
      break;
    case 'emoji-picker':
      enhanceEmojiPicker(dialog);
      break;
    case 'link-preview':
      enhanceLinkPreview(dialog);
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
 * SVG class → aria-label map for Notion inline toolbar icon buttons.
 * Based on observed DOM: each toolbar button contains an SVG whose class name
 * uniquely identifies the action.
 */
const SVG_CLASS_LABELS: Record<string, string> = {
  magicWand:                  'AIで文章を改善する',
  commentFilled:              'コメント',
  commentPencil:              '提案を編集',
  emojiFacePlus:              'リアクション',
  textBoldSmall:              '太字 (Ctrl+B)',
  textItalicSmall:            'イタリック (Ctrl+I)',
  textUnderlineSmall:         '下線 (Ctrl+U)',
  textStrikethroughSmall:     '取り消し線 (Ctrl+Shift+S)',
  codeSmall:                  'コード (Ctrl+E)',
  squareRootSmall:            '数式',
  linkSmall:                  'リンク (Ctrl+K)',
  ellipsisSmall:              'その他のオプション',
  arrowChevronSingleDownSmall: '',  // dropdown indicator — label comes from text content
};

/** Text content → aria-label for text-based toolbar buttons */
const TOOLBAR_TEXT_LABELS: Record<string, string> = {
  '文章を改善する': 'AIで文章を改善する',
  'AIに依頼':       'AIに依頼',
  'コメント':       'コメント',
};

/**
 * Enhance the inline text formatting toolbar (.notion-text-action-menu).
 *
 * Strategy: Find all role="button" elements within the toolbar (they may be
 * direct children of the button container OR nested inside zero-width wrapper
 * divs like data-popup-origin). Label each by its SVG class name.
 */
function enhanceInlineToolbar(toolbar: HTMLElement): void {
  if (toolbar.hasAttribute(POPUP_MARKER)) return;

  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'テキスト書式設定ツールバー');

  // Find ALL role="button" elements in the toolbar (they can be at any nesting depth)
  const buttons = toolbar.querySelectorAll<HTMLElement>('[role="button"]');

  for (const btn of buttons) {
    const rect = btn.getBoundingClientRect();

    // Skip zero-size (truly hidden) buttons
    if (rect.width === 0 && rect.height === 0) continue;

    const text = btn.textContent?.trim() ?? '';

    // Skip if already properly labeled (override Notion's wrong "説明" fallback)
    const existing = btn.getAttribute('aria-label');
    if (existing && existing !== '説明' && existing !== '書式ボタン'
      && existing !== 'コメントを書く') continue;

    // 1) SVG class-based matching (most reliable for icon buttons)
    const svg = btn.querySelector('svg');
    const svgLabel = svg ? getSvgLabel(svg) : null;
    if (svgLabel) {
      btn.setAttribute('aria-label', svgLabel);
      continue;
    }

    // 2) Text-based matching for labeled buttons
    if (text && TOOLBAR_TEXT_LABELS[text]) {
      btn.setAttribute('aria-label', TOOLBAR_TEXT_LABELS[text]);
      continue;
    }

    // 3) Dropdown with text (e.g. "テキスト" block type selector, "A" color picker)
    if (btn.getAttribute('aria-haspopup') === 'dialog' && text) {
      if (text === 'A' || (text.length <= 2 && text.includes('A'))) {
        btn.setAttribute('aria-label', 'テキストカラー');
      } else {
        btn.setAttribute('aria-label', `ブロックタイプ: ${text}`);
      }
      continue;
    }

    // 4) Short text content as label
    if (text && text.length < 30) {
      btn.setAttribute('aria-label', text);
      continue;
    }
  }

  toolbar.setAttribute(POPUP_MARKER, 'toolbar');
  logDebug(MODULE, 'Enhanced inline toolbar');
}

/**
 * Extract label from an SVG element by matching its class name.
 */
function getSvgLabel(svg: SVGElement): string | null {
  const cls = svg.getAttribute('class') ?? '';
  // Class names may include multiple classes; check each token
  for (const token of cls.split(/\s+/)) {
    if (token in SVG_CLASS_LABELS) {
      const label = SVG_CLASS_LABELS[token];
      return label || null;  // empty string means "skip — use text instead"
    }
  }
  return null;
}


// ─── AI Panel Enhancement ────────────────────────────────────
/**
 * Enhance the Notion AI action panel (triggered by "AIに依頼" or space key).
 * Contains AI action options like summarize, translate, improve writing, etc.
 */
function enhanceAIPanel(dialog: HTMLElement): void {
  dialog.setAttribute('aria-label', 'Notion AI');

  // AI action buttons
  const buttons = dialog.querySelectorAll<HTMLElement>('[role="button"], [role="menuitem"]');
  buttons.forEach((btn) => {
    if (!btn.getAttribute('aria-label')) {
      const text = btn.textContent?.trim();
      if (text && text.length < 60) {
        btn.setAttribute('aria-label', text);
      }
    }
  });

  // AI input area
  const inputs = dialog.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea, input');
  inputs.forEach((input) => {
    if (!input.getAttribute('aria-label')) {
      const placeholder = input.getAttribute('placeholder') ?? '';
      input.setAttribute('aria-label', placeholder || 'AIへの指示を入力');
    }
  });

  // AI-generated content area
  const contentArea = dialog.querySelector<HTMLElement>('[class*="ai-response"], [class*="ai-content"]');
  if (contentArea && !contentArea.getAttribute('role')) {
    contentArea.setAttribute('role', 'region');
    contentArea.setAttribute('aria-label', 'AI生成コンテンツ');
    contentArea.setAttribute('aria-live', 'polite');
  }

  const listbox = dialog.querySelector<HTMLElement>('[role="listbox"]');
  if (listbox) {
    enhanceOptions(listbox);
    startHighlightSync(dialog, listbox);
  }

  announce('Notion AI');
  logDebug(MODULE, 'Enhanced AI panel');
}

// ─── Property Editor Enhancement ─────────────────────────────
/**
 * Enhance property editor popups (DB column config, cell editor, etc.)
 */
function enhancePropertyEditor(dialog: HTMLElement): void {
  dialog.setAttribute('aria-label', 'プロパティ編集');

  // Property name input
  const nameInput = dialog.querySelector<HTMLElement>('input[type="text"], [contenteditable="true"]');
  if (nameInput && !nameInput.getAttribute('aria-label')) {
    const placeholder = nameInput.getAttribute('placeholder') ?? '';
    nameInput.setAttribute('aria-label', placeholder || 'プロパティ名');
  }

  // Property type selector
  const typeSelector = dialog.querySelector<HTMLElement>('[role="button"], [role="combobox"]');
  if (typeSelector && !typeSelector.getAttribute('aria-label')) {
    const text = typeSelector.textContent?.trim() ?? '';
    if (text) {
      typeSelector.setAttribute('aria-label', `プロパティタイプ: ${text}`);
    }
  }

  // Select options (for select/multi-select properties)
  const options = dialog.querySelectorAll<HTMLElement>('[role="option"]');
  options.forEach((opt) => {
    if (!opt.getAttribute('aria-label')) {
      const text = opt.textContent?.trim();
      if (text) opt.setAttribute('aria-label', text);
    }
  });

  // Tag/chip elements (selected options)
  const tags = dialog.querySelectorAll<HTMLElement>('[class*="tag"], [class*="chip"], [class*="option"]');
  tags.forEach((tag) => {
    if (!tag.getAttribute('role')) {
      const text = tag.textContent?.trim();
      if (text && text.length < 40) {
        tag.setAttribute('role', 'status');
        tag.setAttribute('aria-label', text);
      }
    }
  });

  const listbox = dialog.querySelector<HTMLElement>('[role="listbox"]');
  if (listbox) {
    enhanceOptions(listbox);
    startHighlightSync(dialog, listbox);
  }

  announce('プロパティ編集');
  logDebug(MODULE, 'Enhanced property editor');
}

// ─── Emoji Picker Enhancement ────────────────────────────────
/**
 * Enhance the emoji picker popup.
 */
function enhanceEmojiPicker(dialog: HTMLElement): void {
  dialog.setAttribute('aria-label', '絵文字ピッカー');

  // Search input
  const searchInput = dialog.querySelector<HTMLElement>('input');
  if (searchInput && !searchInput.getAttribute('aria-label')) {
    searchInput.setAttribute('aria-label', '絵文字を検索');
  }

  // Emoji category tabs
  const tabs = dialog.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs.forEach((tab) => {
    if (!tab.getAttribute('aria-label')) {
      const text = tab.textContent?.trim() || tab.getAttribute('title') || '';
      if (text) tab.setAttribute('aria-label', text);
    }
  });

  // Emoji grid cells
  const emojiButtons = dialog.querySelectorAll<HTMLElement>('[role="button"]');
  emojiButtons.forEach((btn) => {
    if (!btn.getAttribute('aria-label')) {
      const emoji = btn.textContent?.trim();
      const title = btn.getAttribute('title') ?? '';
      if (title) {
        btn.setAttribute('aria-label', `${emoji} ${title}`);
      } else if (emoji && emoji.length <= 4) {
        btn.setAttribute('aria-label', emoji);
      }
    }
  });

  announce('絵文字ピッカー');
  logDebug(MODULE, 'Enhanced emoji picker');
}

// ─── Link Preview Enhancement ────────────────────────────────
/**
 * Enhance link/page preview popup.
 */
function enhanceLinkPreview(dialog: HTMLElement): void {
  const title = dialog.querySelector<HTMLElement>('[class*="title"], h1, h2, h3');
  const titleText = title?.textContent?.trim() ?? '';
  const url = dialog.querySelector<HTMLAnchorElement>('a[href]')?.href ?? '';

  let label = 'リンクプレビュー';
  if (titleText) {
    label = `リンクプレビュー: ${titleText}`;
  } else if (url) {
    try {
      label = `リンクプレビュー: ${new URL(url).hostname}`;
    } catch { /* ignore */ }
  }

  dialog.setAttribute('aria-label', label);
  logDebug(MODULE, 'Enhanced link preview');
}

// ─── DB Filter/Sort Enhancement ─────────────────────────────
/**
 * Enhance filter/sort popups that Notion renders in dialogs.
 * These popups contain property selectors, operator selectors, and value inputs.
 */
function enhanceFilterSortPopup(dialog: HTMLElement): void {
  // Skip search dialogs (handled by search-enhancer)
  if (dialog.getAttribute(EXTENSION_ATTR) === 'search') return;

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
