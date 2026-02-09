/**
 * F-05: Live Announcer
 *
 * Provides aria-live regions for screen reader announcements.
 * Polite region for navigation feedback, assertive for errors.
 */

import { EXTENSION_ATTR, LIVE_REGION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';

const MODULE = 'LiveAnnouncer';

let politeRegion: HTMLElement | null = null;
let assertiveRegion: HTMLElement | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function createRegion(politeness: 'polite' | 'assertive'): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.setAttribute(EXTENSION_ATTR, 'live-announcer');
  el.setAttribute(LIVE_REGION_ATTR, politeness);
  // Visually hidden but available to SR
  Object.assign(el.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  return el;
}

export function initLiveAnnouncer(): void {
  if (politeRegion) return; // already initialized

  politeRegion = createRegion('polite');
  assertiveRegion = createRegion('assertive');
  document.body.appendChild(politeRegion);
  document.body.appendChild(assertiveRegion);

  logDebug(MODULE, 'Live announcer regions injected');
}

/**
 * Announce a message to screen readers via aria-live region.
 * @param message Text to announce
 * @param priority 'polite' (default) or 'assertive'
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const region = priority === 'assertive' ? assertiveRegion : politeRegion;
  if (!region) {
    logDebug(MODULE, 'Live region not initialized, skipping announcement:', message);
    return;
  }

  // Clear previous content first so same-text announcements re-trigger
  region.textContent = '';

  if (clearTimer) {
    clearTimeout(clearTimer);
  }

  // Use rAF to ensure the empty state is processed by the browser
  requestAnimationFrame(() => {
    region.textContent = message;
    logDebug(MODULE, `Announced (${priority}):`, message);
  });

  // Clear after 5s to allow re-announcement of same text
  clearTimer = setTimeout(() => {
    if (region) region.textContent = '';
    clearTimer = null;
  }, 5000);
}

export function destroyLiveAnnouncer(): void {
  politeRegion?.remove();
  assertiveRegion?.remove();
  politeRegion = null;
  assertiveRegion = null;
  if (clearTimer) clearTimeout(clearTimer);
}
