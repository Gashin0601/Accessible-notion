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

  // Share dialog
  if (text.includes('共有') || text.includes('Share') || text.includes('リンクをコピー') || text.includes('Copy link')) {
    return 'share';
  }
  // Settings dialog
  if (text.includes('設定') || text.includes('Settings') || text.includes('Preferences')) {
    return 'settings';
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
  switch (type) {
    case 'share':
      enhanceShareDialog(dialog);
      break;
    case 'date-picker':
      enhanceDatePicker(dialog);
      break;
  }
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

function enhanceDatePicker(dialog: HTMLElement): void {
  // Date picker has a calendar grid, today button, month navigation
  const calGrid = dialog.querySelector<HTMLElement>('.notion-calendar, [class*="calendar-view"], table');
  if (calGrid) {
    calGrid.setAttribute('role', 'grid');
    calGrid.setAttribute('aria-label', 'カレンダー');

    // Day cells
    const cells = calGrid.querySelectorAll<HTMLElement>('td, [class*="day"]');
    cells.forEach((cell) => {
      if (!cell.getAttribute('role')) {
        cell.setAttribute('role', 'gridcell');
      }
      // Make focusable
      if (!cell.hasAttribute('tabindex')) {
        cell.setAttribute('tabindex', '-1');
      }
    });
  }

  // Navigation buttons (prev/next month)
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
      }
    }
  });

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
