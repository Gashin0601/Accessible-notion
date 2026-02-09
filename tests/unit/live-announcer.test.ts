import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initLiveAnnouncer, announce, destroyLiveAnnouncer } from '../../src/content/live-announcer';
import { LIVE_REGION_ATTR } from '../../src/shared/constants';

describe('live-announcer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
  });

  afterEach(() => {
    destroyLiveAnnouncer();
  });

  it('creates polite and assertive live regions', () => {
    const polite = document.querySelector(`[${LIVE_REGION_ATTR}="polite"]`);
    const assertive = document.querySelector(`[${LIVE_REGION_ATTR}="assertive"]`);

    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    expect(polite?.getAttribute('aria-live')).toBe('polite');
    expect(assertive?.getAttribute('aria-live')).toBe('assertive');
    expect(polite?.getAttribute('aria-atomic')).toBe('true');
  });

  it('live regions are visually hidden', () => {
    const polite = document.querySelector(`[${LIVE_REGION_ATTR}="polite"]`) as HTMLElement;
    expect(polite.style.position).toBe('absolute');
    expect(polite.style.width).toBe('1px');
    expect(polite.style.height).toBe('1px');
    expect(polite.style.overflow).toBe('hidden');
  });

  it('does not create duplicate regions on repeated init', () => {
    initLiveAnnouncer(); // second call
    const regions = document.querySelectorAll(`[${LIVE_REGION_ATTR}]`);
    expect(regions.length).toBe(2); // polite + assertive
  });

  it('announces polite messages', async () => {
    announce('テスト通知');

    // rAF is needed for the text to be set
    await new Promise(resolve => requestAnimationFrame(resolve));

    const polite = document.querySelector(`[${LIVE_REGION_ATTR}="polite"]`);
    expect(polite?.textContent).toBe('テスト通知');
  });

  it('announces assertive messages', async () => {
    announce('エラー通知', 'assertive');

    await new Promise(resolve => requestAnimationFrame(resolve));

    const assertive = document.querySelector(`[${LIVE_REGION_ATTR}="assertive"]`);
    expect(assertive?.textContent).toBe('エラー通知');
  });

  it('removes regions on destroy', () => {
    destroyLiveAnnouncer();
    const regions = document.querySelectorAll(`[${LIVE_REGION_ATTR}]`);
    expect(regions.length).toBe(0);
  });
});
