/**
 * DOM Bridge — injected into the PAGE's main JavaScript world.
 *
 * Notion uses a system called DOMLock / ContentEditableVoid / MaybeContentEditable
 * that monitors DOM mutations via MutationObserver and reverts any unauthorized
 * attribute changes on elements inside contenteditable regions.
 *
 * This script patches Element.prototype.setAttribute and removeAttribute
 * in the main world to prevent Notion's DOMLock from reverting the ARIA
 * attributes injected by our extension's content script (which runs in
 * Chrome's isolated world and uses native DOM APIs that bypass this patch).
 *
 * Flow:
 * 1. Content script (isolated world) sets attributes → native DOM API → DOM updated
 * 2. Content script dispatches 'accessible-notion-protect' event on the element
 * 3. This bridge receives the event, adds element to protected set
 * 4. DOMLock's MutationObserver fires (microtask) → calls patched methods → BLOCKED
 *
 * Since MutationObserver callbacks are microtasks that fire after synchronous code,
 * step 3 always completes before step 4.
 */
(() => {
  'use strict';

  /** Attribute names that our extension injects and must be protected from DOMLock */
  const PROTECTED_ATTRS = new Set([
    'role',
    'aria-label',
    'aria-roledescription',
    'aria-expanded',
    'aria-checked',
    'aria-selected',
    'aria-level',
    'aria-describedby',
    'aria-owns',
    'aria-modal',
    'aria-live',
    'aria-atomic',
    'aria-relevant',
    'tabindex',
    'data-accessible-notion',
    'alt',
  ]);

  /**
   * WeakSet of elements that have been enhanced by our extension.
   * Only these elements have their ARIA attributes protected from DOMLock reverts.
   */
  const protectedElements: WeakSet<Element> = new WeakSet();

  // Save original methods
  const origSetAttribute = Element.prototype.setAttribute;
  const origRemoveAttribute = Element.prototype.removeAttribute;

  /**
   * Patched removeAttribute — blocks DOMLock from removing our ARIA attributes.
   * Content script calls go through native API (isolated world) and bypass this.
   */
  Element.prototype.removeAttribute = function (name: string) {
    if (protectedElements.has(this) && PROTECTED_ATTRS.has(name)) {
      return; // Block DOMLock revert
    }
    return origRemoveAttribute.call(this, name);
  };

  /**
   * Patched setAttribute — blocks DOMLock from overwriting our ARIA attributes.
   * Content script calls go through native API (isolated world) and bypass this.
   */
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (protectedElements.has(this) && PROTECTED_ATTRS.has(name)) {
      return; // Block DOMLock revert
    }
    return origSetAttribute.call(this, name, value);
  };

  /**
   * Listen for protection requests from the content script.
   * CustomEvents dispatched in the isolated world propagate through the shared DOM
   * and are visible in the main world. e.target gives the correct element reference.
   */
  document.addEventListener(
    'accessible-notion-protect',
    (e: Event) => {
      if (e.target instanceof Element) {
        protectedElements.add(e.target);
      }
    },
    true,
  );

  /**
   * Listen for unprotection requests (teardown / extension disabled).
   */
  document.addEventListener(
    'accessible-notion-unprotect',
    (e: Event) => {
      if (e.target instanceof Element) {
        protectedElements.delete(e.target);
      }
    },
    true,
  );

  // eslint-disable-next-line no-console
  console.log('[AccessibleNotion] DOM bridge loaded — DOMLock protection active');
})();
