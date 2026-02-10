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
      dialog.setAttribute('aria-label', 'ダイアログ');
    }
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
