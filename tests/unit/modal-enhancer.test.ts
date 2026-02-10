import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initModalEnhancer, destroyModalEnhancer } from '../../src/content/modal-enhancer';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';

describe('modal-enhancer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
    initModalEnhancer();
  });

  afterEach(() => {
    destroyModalEnhancer();
    destroyLiveAnnouncer();
  });

  it('enhances a dialog with aria-modal and aria-label', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const title = document.createElement('h2');
    title.textContent = 'テスト設定';
    dialog.appendChild(title);
    document.body.appendChild(dialog);

    // Wait for MutationObserver
    await new Promise((r) => setTimeout(r, 50));

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('テスト設定');
  });

  it('sets default label when no title found', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    await new Promise((r) => setTimeout(r, 50));

    expect(dialog.getAttribute('aria-label')).toBe('ダイアログ');
  });

  it('auto-focuses first interactive element', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const input = document.createElement('input');
    input.type = 'text';
    dialog.appendChild(input);
    document.body.appendChild(dialog);

    // Wait for MutationObserver + setTimeout in enhanceDialog
    await new Promise((r) => setTimeout(r, 200));

    expect(document.activeElement).toBe(input);
  });

  it('focus trap wraps Tab at end of dialog', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    const btn1 = document.createElement('button');
    btn1.textContent = 'Button 1';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Button 2';
    dialog.appendChild(btn1);
    dialog.appendChild(btn2);
    document.body.appendChild(dialog);

    await new Promise((r) => setTimeout(r, 200));

    // Focus last element
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    // Simulate Tab key
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tabEvent);

    // Should wrap to first element
    expect(document.activeElement).toBe(btn1);
  });

  it('focus trap wraps Shift+Tab at start of dialog', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    const btn1 = document.createElement('button');
    btn1.textContent = 'Button 1';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Button 2';
    dialog.appendChild(btn1);
    dialog.appendChild(btn2);
    document.body.appendChild(dialog);

    await new Promise((r) => setTimeout(r, 200));

    // Focus first element
    btn1.focus();
    expect(document.activeElement).toBe(btn1);

    // Simulate Shift+Tab
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tabEvent);

    // Should wrap to last element
    expect(document.activeElement).toBe(btn2);
  });

  it('announces toast notifications', async () => {
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.textContent = '保存しました';
    document.body.appendChild(toast);

    await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => requestAnimationFrame(r));

    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('保存しました');
  });
});
