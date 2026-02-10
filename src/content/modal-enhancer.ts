/**
 * Modal / Dialog Enhancement
 *
 * Ensures proper focus trapping, labeling, and Escape-to-close
 * for all Notion modals and dialogs.
 * Also handles toast notifications.
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import { saveFocus, restoreFocus } from './focus-manager';
import { announce } from './live-announcer';

const MODULE = 'ModalEnhancer';

let observer: MutationObserver | null = null;

/** Request DOMLock protection for an element's ARIA attributes */
function protect(el: Element): void {
  el.dispatchEvent(new CustomEvent('accessible-notion-protect', { bubbles: false }));
}

/** Selector for focusable elements within a dialog */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

let focusTrapHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * Set up focus trap within a dialog: Tab wraps within focusable elements.
 */
function setupFocusTrap(dialog: HTMLElement): void {
  removeFocusTrap();

  focusTrapHandler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    if (!document.contains(dialog)) {
      removeFocusTrap();
      return;
    }

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => {
      // Check visibility: not display:none, not visibility:hidden
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: wrap to last if on first
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: wrap to first if on last
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', focusTrapHandler, true);
}

function removeFocusTrap(): void {
  if (focusTrapHandler) {
    document.removeEventListener('keydown', focusTrapHandler, true);
    focusTrapHandler = null;
  }
}

/**
 * Detect dialog type for more specific labeling.
 */
function detectDialogType(dialog: HTMLElement): string {
  const text = dialog.textContent ?? '';

  // Settings dialog (check first — settings contains many other keywords)
  if (dialog.querySelector('[id^="settings-tab-"]') || dialog.querySelector('[role="tablist"][aria-orientation="vertical"]')) {
    return 'settings';
  }
  // Trash dialog (check by search input placeholder)
  const trashInput = dialog.querySelector('input[placeholder*="ゴミ箱"], input[placeholder*="trash" i]');
  if (trashInput) {
    return 'trash';
  }
  // Page options menu (contains Serif/Mono font options + actions) — NOT a share dialog
  const listbox = dialog.querySelector('[role="listbox"]');
  const lbText = listbox?.textContent ?? '';
  if (lbText.includes('Serif') && lbText.includes('Mono') && lbText.includes('リンクをコピー')) {
    return 'generic'; // Let popup-enhancer handle as 'page-options'
  }
  // Share dialog
  if (text.includes('共有') || text.includes('Share') || text.includes('リンクをコピー') || text.includes('Copy link')) {
    return 'share';
  }
  // Import/Export dialog
  if (text.includes('インポート') || text.includes('エクスポート') || text.includes('Import') || text.includes('Export')) {
    return 'import-export';
  }
  // Template dialog
  if (text.includes('テンプレート') || text.includes('Template')) {
    return 'template';
  }
  // Date picker dialog (contains calendar grid)
  if (dialog.querySelector('.notion-calendar, [class*="calendar"]') || (text.includes('今日') && text.includes('明日'))) {
    return 'date-picker';
  }
  // Properties dialog
  if (text.includes('プロパティ') || text.includes('Properties') || text.includes('Property type')) {
    return 'properties';
  }

  return 'generic';
}

/**
 * Get specific label for dialog type.
 */
function getDialogLabel(type: string): string {
  switch (type) {
    case 'share': return '共有';
    case 'settings': return '設定';
    case 'trash': return 'ゴミ箱';
    case 'import-export': return 'インポート/エクスポート';
    case 'template': return 'テンプレート';
    case 'date-picker': return '日付選択';
    case 'properties': return 'プロパティ設定';
    default: return '';
  }
}

/**
 * Enhance specific dialog types with deeper ARIA semantics.
 */
function enhanceDialogByType(dialog: HTMLElement, type: string): void {
  logDebug(MODULE, 'Dialog type detected:', type);
  switch (type) {
    case 'share':
      enhanceShareDialog(dialog);
      break;
    case 'settings':
      enhanceSettingsDialog(dialog);
      break;
    case 'trash':
      enhanceTrashDialog(dialog);
      break;
    case 'date-picker':
      enhanceDatePicker(dialog);
      break;
  }
  // Generic: label any unlabeled switches inside dialogs
  enhanceSwitchesInContainer(dialog);
}

function enhanceShareDialog(dialog: HTMLElement): void {
  // Share dialog has: copy link button, user list, permission dropdowns
  const inputs = dialog.querySelectorAll<HTMLElement>('input');
  inputs.forEach((input) => {
    if (!input.getAttribute('aria-label')) {
      const placeholder = input.getAttribute('placeholder') ?? '';
      if (placeholder.includes('メール') || placeholder.includes('email') || placeholder.includes('ユーザー')) {
        input.setAttribute('aria-label', 'ユーザーまたはメールを追加');
      } else if (placeholder) {
        input.setAttribute('aria-label', placeholder);
      }
    }
  });

  // Permission dropdowns
  const dropdowns = dialog.querySelectorAll<HTMLElement>('[role="button"]');
  dropdowns.forEach((btn) => {
    const text = btn.textContent?.trim() ?? '';
    if ((text.includes('編集') || text.includes('閲覧') || text.includes('フルアクセス') || text.includes('can edit') || text.includes('can view')) && !btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', `アクセス権限: ${text}`);
      btn.setAttribute('aria-haspopup', 'listbox');
    }
  });

  logDebug(MODULE, 'Enhanced share dialog');
}

function enhanceSettingsDialog(dialog: HTMLElement): void {
  // Settings dialog content may be re-rendered by React after the dialog appears.
  // Apply enhancements with increasing delays to catch late-rendered content.
  applySettingsEnhancements(dialog);
  setTimeout(() => applySettingsEnhancements(dialog), 500);
  setTimeout(() => applySettingsEnhancements(dialog), 1500);

  // Also observe mutations within the dialog to catch React re-renders
  let settingsDebounce: ReturnType<typeof setTimeout> | null = null;
  const settingsObserver = new MutationObserver(() => {
    if (!document.contains(dialog)) {
      settingsObserver.disconnect();
      return;
    }
    if (settingsDebounce) clearTimeout(settingsDebounce);
    settingsDebounce = setTimeout(() => applySettingsEnhancements(dialog), 200);
  });
  settingsObserver.observe(dialog, { childList: true, subtree: true });

  // Clean up observer when dialog is removed
  const cleanupObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node === dialog || (node instanceof HTMLElement && node.contains(dialog))) {
          settingsObserver.disconnect();
          cleanupObserver.disconnect();
          return;
        }
      }
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });
}

function applySettingsEnhancements(dialog: HTMLElement): void {
  // 1. Label the tablist (sidebar navigation)
  const tablist = dialog.querySelector<HTMLElement>('[role="tablist"]');
  logDebug(MODULE, 'Settings tablist found:', !!tablist, 'label:', tablist?.getAttribute('aria-label'));
  if (tablist && !tablist.getAttribute('aria-label')) {
    tablist.setAttribute('aria-label', '設定カテゴリ');
    protect(tablist);
    logDebug(MODULE, 'Settings tablist labeled');
  }

  // 2. Group section headings in the sidebar
  // Notion renders category labels (アカウント, ワークスペース, etc.) as plain divs
  const sectionLabels = [
    'アカウント', 'ワークスペース', '機能', 'インテグレーション', '管理者', 'アクセスと請求',
    'Account', 'Workspace', 'Features', 'Integrations', 'Admin', 'Access & Billing',
  ];

  if (tablist) {
    const allEls = tablist.querySelectorAll<HTMLElement>('*');
    for (const el of allEls) {
      const text = el.textContent?.trim();
      if (!text || el.children.length > 0) continue;
      if (!sectionLabels.includes(text)) continue;

      // This is a section heading — find the parent container that holds the tabs below it
      let groupContainer = el.parentElement;
      // Walk up to find a div that contains both the heading text and tab elements
      for (let i = 0; i < 3; i++) {
        if (!groupContainer) break;
        const hasTabs = groupContainer.querySelector('[role="tab"]');
        if (hasTabs && groupContainer !== tablist) break;
        groupContainer = groupContainer.parentElement;
      }

      if (groupContainer && groupContainer !== tablist && !groupContainer.getAttribute('role')) {
        groupContainer.setAttribute('role', 'group');
        groupContainer.setAttribute('aria-label', text);
        protect(groupContainer);
      }
    }
  }

  // 3. Label dropdown buttons that lack aria-label
  const dropdowns = dialog.querySelectorAll<HTMLElement>('div[role="button"][aria-haspopup]');
  for (const btn of dropdowns) {
    if (btn.getAttribute('aria-label')) continue;
    const text = btn.textContent?.trim() ?? '';
    if (!text) continue;

    // Try to find the setting label nearby (typically in a sibling or parent)
    const parent = btn.closest<HTMLElement>('[style]');
    if (!parent) {
      btn.setAttribute('aria-label', text);
      protect(btn);
      continue;
    }

    // Look for label text in preceding siblings or parent
    const allText = parent.textContent?.trim() ?? '';
    // The label is the parent text minus the button text
    const labelText = allText.replace(text, '').trim();
    if (labelText && labelText.length < 40) {
      btn.setAttribute('aria-label', `${labelText}: ${text}`);
    } else {
      btn.setAttribute('aria-label', text);
    }
    protect(btn);
  }

  // 4. Enhance content headings in the settings panel
  const tabpanel = dialog.querySelector<HTMLElement>('[role="tabpanel"]');
  if (tabpanel) {
    // Find bold/large text that serve as section headings
    const allEls = tabpanel.querySelectorAll<HTMLElement>('*');
    for (const el of allEls) {
      if (el.children.length > 0) continue;
      const text = el.textContent?.trim();
      if (!text || text.length > 40) continue;

      const style = getComputedStyle(el);
      const fw = parseInt(style.fontWeight);
      const fs = parseFloat(style.fontSize);

      // Section headers: bold and large (>=16px, weight >= 600)
      if (fw >= 600 && fs >= 16 && !el.getAttribute('role')) {
        el.setAttribute('role', 'heading');
        el.setAttribute('aria-level', '2');
        protect(el);
      }
      // Sub-section headers: semi-bold and medium (>=14px, weight >= 500)
      else if (fw >= 500 && fs >= 14 && fs < 16 && !el.getAttribute('role')
        && el.tagName === 'DIV' && el.parentElement?.querySelector('[role="switch"], [role="button"][aria-haspopup]')) {
        el.setAttribute('role', 'heading');
        el.setAttribute('aria-level', '3');
        protect(el);
      }
    }
  }

  // 5. Enhance close button
  const closeBtn = Array.from(dialog.querySelectorAll<HTMLElement>('[role="button"], button')).find(b => {
    const text = b.textContent?.trim();
    return !text && b.querySelector('svg');
  });
  if (closeBtn && !closeBtn.getAttribute('aria-label')) {
    closeBtn.setAttribute('aria-label', '閉じる');
    protect(closeBtn);
  }

  logDebug(MODULE, 'Enhanced settings dialog');
}

function enhanceTrashDialog(dialog: HTMLElement): void {
  // Fix label (Notion sets aria-label="検索" by default)
  dialog.setAttribute('aria-label', 'ゴミ箱');

  // Label search input
  const searchInput = dialog.querySelector<HTMLInputElement>('input');
  if (searchInput && !searchInput.getAttribute('aria-label')) {
    searchInput.setAttribute('aria-label', searchInput.getAttribute('placeholder') ?? 'ゴミ箱の中を検索');
  }

  // Label filter dropdown buttons (最終更新者, 場所, チームスペース)
  const filterBtns = dialog.querySelectorAll<HTMLElement>('div[role="button"][aria-haspopup="listbox"]');
  for (const btn of filterBtns) {
    if (btn.getAttribute('aria-label')) continue;
    const text = btn.textContent?.trim();
    if (text) {
      btn.setAttribute('aria-label', `フィルター: ${text}`);
    }
  }

  // Label the scroller as a list of trash items
  const scroller = dialog.querySelector<HTMLElement>('.notion-scroller');
  if (scroller && !scroller.getAttribute('aria-label')) {
    scroller.setAttribute('role', 'list');
    scroller.setAttribute('aria-label', 'ゴミ箱のページ一覧');
  }

  logDebug(MODULE, 'Enhanced trash dialog');
}

/**
 * Label unlabeled switches by finding adjacent label text.
 * Covers: page options (フォントを縮小, 左右の余白を縮小, ページをロック),
 * date picker (終了日, 時間を含む), and settings switches.
 */
function enhanceSwitchesInContainer(container: HTMLElement): void {
  const switches = container.querySelectorAll<HTMLElement>('[role="switch"]');
  for (const sw of switches) {
    if (sw.getAttribute('aria-label') || sw.getAttribute('aria-labelledby')) continue;

    // Ensure aria-checked reflects the visual state
    if (!sw.hasAttribute('aria-checked')) {
      // Determine checked state from background color or class
      const bg = getComputedStyle(sw).backgroundColor;
      const isChecked = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
        && !bg.includes('55, 55, 55') && !bg.includes('rgba(0, 0, 0');
      sw.setAttribute('aria-checked', String(!!isChecked));
    }

    // Find label text: look for adjacent text in the parent element
    const parent = sw.parentElement;
    if (!parent) continue;

    // Text children in the same row, excluding the switch itself
    const siblings = Array.from(parent.children);
    let labelText = '';
    for (const sib of siblings) {
      if (sib === sw) continue;
      if (!(sib instanceof HTMLElement)) continue;
      const text = sib.textContent?.trim();
      if (text && text.length < 30 && !text.includes('›')) {
        labelText = text;
        break;
      }
    }

    // Walk up if label not found at sibling level
    if (!labelText && parent.parentElement) {
      const grandSiblings = Array.from(parent.parentElement.children);
      for (const gsib of grandSiblings) {
        if (gsib.contains(sw)) continue;
        if (!(gsib instanceof HTMLElement)) continue;
        const text = gsib.textContent?.trim();
        if (text && text.length < 30) {
          labelText = text;
          break;
        }
      }
    }

    if (labelText) {
      sw.setAttribute('aria-label', labelText);
    }
  }
}

function enhanceDatePicker(dialog: HTMLElement): void {
  // Label the date input
  const dateInput = dialog.querySelector<HTMLInputElement>('input');
  if (dateInput && !dateInput.getAttribute('aria-label')) {
    dateInput.setAttribute('aria-label', '日付を入力');
  }

  // Date picker has a calendar grid, today button, month navigation
  const calGrid = dialog.querySelector<HTMLElement>('.notion-calendar, [class*="calendar-view"], table, [role="grid"]');
  if (calGrid && !calGrid.getAttribute('aria-label')) {
    if (!calGrid.getAttribute('role')) calGrid.setAttribute('role', 'grid');
    calGrid.setAttribute('aria-label', 'カレンダー');
  }

  // Navigation buttons (prev/next month, today)
  const navButtons = dialog.querySelectorAll<HTMLElement>('button, [role="button"]');
  navButtons.forEach((btn) => {
    const text = btn.textContent?.trim() ?? '';
    if (!btn.getAttribute('aria-label')) {
      if (text === '今日' || text === 'Today') {
        btn.setAttribute('aria-label', '今日');
      } else if (text === '明日' || text === 'Tomorrow') {
        btn.setAttribute('aria-label', '明日');
      } else if (text === '昨日' || text === 'Yesterday') {
        btn.setAttribute('aria-label', '昨日');
      } else if (text === '<' || text === '‹' || text === '＜') {
        btn.setAttribute('aria-label', '前の月');
      } else if (text === '>' || text === '›' || text === '＞') {
        btn.setAttribute('aria-label', '次の月');
      } else if (text === 'クリア' || text === 'Clear') {
        btn.setAttribute('aria-label', '日付をクリア');
      }
    }
  });

  // Switches are handled by enhanceSwitchesInContainer (called from enhanceDialogByType)

  logDebug(MODULE, 'Enhanced date picker dialog');
}

/**
 * Enhance a dialog element with focus management and labeling.
 */
function enhanceDialog(dialog: HTMLElement): void {
  if (dialog.hasAttribute(EXTENSION_ATTR + '-modal')) return;

  // Ensure it has role="dialog" (Notion usually sets this)
  if (!dialog.getAttribute('role')) {
    dialog.setAttribute('role', 'dialog');
  }

  // Try to find a title for aria-label
  if (!dialog.getAttribute('aria-label') && !dialog.getAttribute('aria-labelledby')) {
    const titleEl = dialog.querySelector(
      'h1, h2, h3, [class*="title"], [class*="header"] > span',
    );
    if (titleEl?.textContent?.trim()) {
      dialog.setAttribute('aria-label', titleEl.textContent.trim());
    } else {
      // No title element found — use type detection as fallback
      const dialogType = detectDialogType(dialog);
      const specificLabel = getDialogLabel(dialogType);
      dialog.setAttribute('aria-label', specificLabel || 'ダイアログ');
    }
  }

  // Apply type-specific enhancements regardless of label source
  const dialogType = detectDialogType(dialog);
  enhanceDialogByType(dialog, dialogType);

  // If type was 'generic', the dialog content may not be rendered yet.
  // Re-detect after React populates the dialog.
  if (dialogType === 'generic') {
    setTimeout(() => {
      const newType = detectDialogType(dialog);
      if (newType !== 'generic') {
        logDebug(MODULE, 'Re-detected dialog type:', newType);
        enhanceDialogByType(dialog, newType);
        // Update label if we now have a better one
        const specificLabel = getDialogLabel(newType);
        if (specificLabel) {
          dialog.setAttribute('aria-label', specificLabel);
        }
      }
    }, 500);
  }

  // Set aria-modal
  dialog.setAttribute('aria-modal', 'true');

  // Save focus for restoration
  saveFocus();

  // Set up focus trap
  setupFocusTrap(dialog);

  // Auto-focus the first interactive element
  setTimeout(() => {
    const focusTarget = dialog.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, button, [tabindex="0"]',
    );
    if (focusTarget) {
      focusTarget.focus();
    }
  }, 100);

  // Announce dialog
  const label = dialog.getAttribute('aria-label') ?? 'ダイアログ';
  announce(`${label} ダイアログ`);

  dialog.setAttribute(EXTENSION_ATTR + '-modal', 'true');
  logDebug(MODULE, 'Dialog enhanced:', label);
}

/**
 * Handle dialog removal — restore focus and clean up trap.
 */
function handleDialogRemoved(): void {
  removeFocusTrap();
  restoreFocus();
  logDebug(MODULE, 'Dialog closed, focus restored');
}

/**
 * Enhance toast notifications.
 */
function enhanceToast(toast: HTMLElement): void {
  if (toast.hasAttribute(EXTENSION_ATTR + '-toast')) return;

  const text = toast.textContent?.trim() ?? '';
  if (text) {
    // Notion already has aria-live regions, but we announce via our own as backup
    announce(text);
  }

  toast.setAttribute(EXTENSION_ATTR + '-toast', 'true');
  logDebug(MODULE, 'Toast announced:', text);
}

export function initModalEnhancer(): void {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Added nodes — look for dialogs and toasts
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Dialogs
        if (node.matches('[role="dialog"]')) {
          enhanceDialog(node);
        }
        const dialogs = node.querySelectorAll<HTMLElement>('[role="dialog"]');
        dialogs.forEach(enhanceDialog);

        // Toasts
        if (node.matches('[role="status"], [role="alert"]')) {
          enhanceToast(node);
        }
        const toasts = node.querySelectorAll<HTMLElement>('[role="status"], [role="alert"]');
        toasts.forEach(enhanceToast);
      }

      // Removed nodes — detect dialog closure
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(`[role="dialog"][${EXTENSION_ATTR}-modal]`)) {
          handleDialogRemoved();
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  logDebug(MODULE, 'Modal enhancer initialized');
}

export function destroyModalEnhancer(): void {
  observer?.disconnect();
  observer = null;
  removeFocusTrap();
}
