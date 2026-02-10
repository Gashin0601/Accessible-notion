import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initBlockFocusManager,
  destroyBlockFocusManager,
  enterNavigateMode,
  navigateNext,
  navigatePrev,
  navigateToFirst,
  navigateToLast,
  navigateToNextHeading,
  navigateToPrevHeading,
  navigateToNextHeadingLevel,
  resetBlockFocusManager,
  getCurrentIndex,
} from '../../src/content/block-focus-manager';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';

/**
 * Create a test DOM with 5 blocks:
 * 0: text-block (editable)
 * 1: header-block (editable, H1)
 * 2: text-block (editable)
 * 3: image-block (NOT editable)
 * 4: sub_header-block (editable, H2)
 */
function createTestDOM(): void {
  const main = document.createElement('main');
  main.classList.add('notion-frame');

  // Block 0: text block with contenteditable
  const block0 = document.createElement('div');
  block0.classList.add('notion-selectable', 'notion-text-block');
  block0.setAttribute('data-block-id', 'block-0');
  const editable0 = document.createElement('div');
  editable0.setAttribute('role', 'textbox');
  editable0.setAttribute('contenteditable', 'true');
  editable0.setAttribute('tabindex', '-1');
  editable0.textContent = '最初のテキスト';
  block0.appendChild(editable0);
  main.appendChild(block0);

  // Block 1: heading 1
  const block1 = document.createElement('div');
  block1.classList.add('notion-selectable', 'notion-header-block');
  block1.setAttribute('data-block-id', 'block-1');
  const editable1 = document.createElement('div');
  editable1.setAttribute('role', 'textbox');
  editable1.setAttribute('contenteditable', 'true');
  editable1.setAttribute('tabindex', '-1');
  editable1.textContent = '見出し1テスト';
  block1.appendChild(editable1);
  main.appendChild(block1);

  // Block 2: another text block
  const block2 = document.createElement('div');
  block2.classList.add('notion-selectable', 'notion-text-block');
  block2.setAttribute('data-block-id', 'block-2');
  const editable2 = document.createElement('div');
  editable2.setAttribute('role', 'textbox');
  editable2.setAttribute('contenteditable', 'true');
  editable2.setAttribute('tabindex', '-1');
  editable2.textContent = '2番目のテキスト';
  block2.appendChild(editable2);
  main.appendChild(block2);

  // Block 3: image block (no contenteditable)
  const block3 = document.createElement('div');
  block3.classList.add('notion-selectable', 'notion-image-block');
  block3.setAttribute('data-block-id', 'block-3');
  block3.textContent = '画像';
  main.appendChild(block3);

  // Block 4: heading 2
  const block4 = document.createElement('div');
  block4.classList.add('notion-selectable', 'notion-sub_header-block');
  block4.setAttribute('data-block-id', 'block-4');
  const editable4 = document.createElement('div');
  editable4.setAttribute('role', 'textbox');
  editable4.setAttribute('contenteditable', 'true');
  editable4.setAttribute('tabindex', '-1');
  editable4.textContent = '見出し2テスト';
  block4.appendChild(editable4);
  main.appendChild(block4);

  document.body.appendChild(main);
}

function fireKey(key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

function getBlock(id: string): HTMLElement {
  return document.querySelector(`[data-block-id="${id}"]`) as HTMLElement;
}

describe('block-focus-manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
    createTestDOM();
    initBlockFocusManager();
  });

  afterEach(() => {
    destroyBlockFocusManager();
    destroyLiveAnnouncer();
  });

  // ─── enterNavigateMode ─────────────────────────────────────

  describe('enterNavigateMode', () => {
    it('focuses the first block by default', () => {
      enterNavigateMode();
      expect(document.activeElement).toBe(getBlock('block-0'));
      expect(getCurrentIndex()).toBe(0);
    });

    it('focuses a specific block by index', () => {
      enterNavigateMode(2);
      expect(document.activeElement).toBe(getBlock('block-2'));
      expect(getCurrentIndex()).toBe(2);
    });

    it('sets tabindex="0" on the focused block', () => {
      enterNavigateMode();
      expect(getBlock('block-0').getAttribute('tabindex')).toBe('0');
    });

    it('clamps to last block if index too high', () => {
      enterNavigateMode(100);
      expect(document.activeElement).toBe(getBlock('block-4'));
      expect(getCurrentIndex()).toBe(4);
    });

    it('clamps to first block if index negative', () => {
      enterNavigateMode(-5);
      expect(document.activeElement).toBe(getBlock('block-0'));
      expect(getCurrentIndex()).toBe(0);
    });

    it('announces block type and position', async () => {
      enterNavigateMode();
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('テキストブロック');
      expect(live?.textContent).toContain('最初のテキスト');
      expect(live?.textContent).toContain('1/5');
    });

    it('announces heading type correctly', async () => {
      enterNavigateMode(1);
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('見出し1');
      expect(live?.textContent).toContain('2/5');
    });

    it('announces when no blocks found', async () => {
      // Remove main frame — need to destroy+reinit live announcer since innerHTML clears it
      destroyLiveAnnouncer();
      document.body.innerHTML = '';
      initLiveAnnouncer();
      enterNavigateMode();
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('ブロックが見つかりません');
    });
  });

  // ─── Arrow key navigation ──────────────────────────────────

  describe('arrow key navigation', () => {
    it('ArrowDown moves to next block', () => {
      enterNavigateMode(0);
      fireKey('ArrowDown');
      expect(document.activeElement).toBe(getBlock('block-1'));
      expect(getCurrentIndex()).toBe(1);
    });

    it('ArrowUp moves to previous block', () => {
      enterNavigateMode(2);
      fireKey('ArrowUp');
      expect(document.activeElement).toBe(getBlock('block-1'));
      expect(getCurrentIndex()).toBe(1);
    });

    it('multiple ArrowDown moves sequentially', () => {
      enterNavigateMode(0);
      fireKey('ArrowDown');
      fireKey('ArrowDown');
      fireKey('ArrowDown');
      expect(document.activeElement).toBe(getBlock('block-3'));
      expect(getCurrentIndex()).toBe(3);
    });

    it('ArrowDown at last block announces boundary', async () => {
      enterNavigateMode(4);
      fireKey('ArrowDown');
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('最後のブロック');
    });

    it('ArrowUp at first block announces boundary', async () => {
      enterNavigateMode(0);
      fireKey('ArrowUp');
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('最初のブロック');
    });

    it('ArrowDown sets tabindex correctly (roving)', () => {
      enterNavigateMode(0);
      expect(getBlock('block-0').getAttribute('tabindex')).toBe('0');

      fireKey('ArrowDown');
      expect(getBlock('block-0').getAttribute('tabindex')).toBe('-1');
      expect(getBlock('block-1').getAttribute('tabindex')).toBe('0');
    });

    it('preventDefault is called on ArrowDown', () => {
      enterNavigateMode(0);
      const event = fireKey('ArrowDown');
      expect(event.defaultPrevented).toBe(true);
    });

    it('preventDefault is called on ArrowUp', () => {
      enterNavigateMode(1);
      const event = fireKey('ArrowUp');
      expect(event.defaultPrevented).toBe(true);
    });

    it('ignores ArrowDown when focus is not on a block', () => {
      // Focus is not on any block
      const event = fireKey('ArrowDown');
      expect(event.defaultPrevented).toBe(false);
    });
  });

  // ─── Enter / Escape mode switching ─────────────────────────

  describe('Enter / Escape mode switching', () => {
    it('Enter focuses the contenteditable inside the block', () => {
      enterNavigateMode(0);
      fireKey('Enter');
      const editable = getBlock('block-0').querySelector('[contenteditable="true"]');
      expect(document.activeElement).toBe(editable);
    });

    it('Enter preventDefault is called', () => {
      enterNavigateMode(0);
      const event = fireKey('Enter');
      expect(event.defaultPrevented).toBe(true);
    });

    it('Escape from contenteditable returns to block container', () => {
      enterNavigateMode(0);
      // Enter edit mode
      fireKey('Enter');
      const editable = getBlock('block-0').querySelector('[contenteditable="true"]') as HTMLElement;
      expect(document.activeElement).toBe(editable);

      // Press Escape
      fireKey('Escape');
      expect(document.activeElement).toBe(getBlock('block-0'));
    });

    it('Escape from contenteditable announces navigate mode', async () => {
      enterNavigateMode(0);
      fireKey('Enter');
      fireKey('Escape');
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('ナビゲートモード');
    });

    it('Enter on non-editable block announces error', async () => {
      enterNavigateMode(3); // image block
      fireKey('Enter');
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('編集できません');
    });

    it('Escape is not intercepted when overlay is open', () => {
      enterNavigateMode(0);
      fireKey('Enter');

      // Create a mock overlay
      const overlay = document.createElement('div');
      overlay.classList.add('notion-overlay-container');
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      const editable = getBlock('block-0').querySelector('[contenteditable="true"]') as HTMLElement;
      expect(document.activeElement).toBe(editable);

      // Escape should NOT be intercepted
      const event = fireKey('Escape');
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(editable); // Still in contenteditable

      overlay.remove();
    });

    it('after Escape, arrow keys work for navigation', () => {
      enterNavigateMode(1);
      // Enter edit mode
      fireKey('Enter');
      // Return to navigate mode
      fireKey('Escape');
      expect(document.activeElement).toBe(getBlock('block-1'));

      // Arrow down should work
      fireKey('ArrowDown');
      expect(document.activeElement).toBe(getBlock('block-2'));
    });
  });

  // ─── navigateNext / navigatePrev ───────────────────────────

  describe('navigateNext / navigatePrev', () => {
    it('navigateNext moves to next block', () => {
      enterNavigateMode(0);
      navigateNext();
      expect(getCurrentIndex()).toBe(1);
      expect(document.activeElement).toBe(getBlock('block-1'));
    });

    it('navigatePrev moves to previous block', () => {
      enterNavigateMode(2);
      navigatePrev();
      expect(getCurrentIndex()).toBe(1);
      expect(document.activeElement).toBe(getBlock('block-1'));
    });

    it('navigateNext enters navigate mode if index is -1', () => {
      expect(getCurrentIndex()).toBe(-1);
      navigateNext();
      expect(getCurrentIndex()).toBe(0);
      expect(document.activeElement).toBe(getBlock('block-0'));
    });

    it('navigatePrev enters navigate mode if index is -1', () => {
      expect(getCurrentIndex()).toBe(-1);
      navigatePrev();
      expect(getCurrentIndex()).toBe(0);
    });

    it('navigateNext at last block announces boundary', async () => {
      enterNavigateMode(4);
      navigateNext();
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('最後のブロック');
    });

    it('navigatePrev at first block announces boundary', async () => {
      enterNavigateMode(0);
      navigatePrev();
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('最初のブロック');
    });
  });

  // ─── Heading navigation ────────────────────────────────────

  describe('heading navigation', () => {
    it('navigateToNextHeading finds next heading', () => {
      enterNavigateMode(0);
      navigateToNextHeading();
      expect(getCurrentIndex()).toBe(1); // header-block
    });

    it('navigateToNextHeading skips non-heading blocks', () => {
      enterNavigateMode(2);
      navigateToNextHeading();
      expect(getCurrentIndex()).toBe(4); // sub_header-block
    });

    it('navigateToNextHeading announces when no heading found', async () => {
      enterNavigateMode(4);
      navigateToNextHeading();
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('次の見出しがありません');
    });

    it('navigateToPrevHeading finds previous heading', () => {
      enterNavigateMode(3);
      navigateToPrevHeading();
      expect(getCurrentIndex()).toBe(1); // header-block
    });

    it('navigateToPrevHeading announces when no heading found', async () => {
      // Start at block 1 (heading). Block 0 before it is text, no heading found.
      enterNavigateMode(1);
      navigateToPrevHeading();
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('前の見出しがありません');
    });

    it('navigateToNextHeadingLevel(1) finds H1', () => {
      enterNavigateMode(0);
      navigateToNextHeadingLevel(1);
      expect(getCurrentIndex()).toBe(1); // header-block (H1)
    });

    it('navigateToNextHeadingLevel(2) finds H2', () => {
      enterNavigateMode(0);
      navigateToNextHeadingLevel(2);
      expect(getCurrentIndex()).toBe(4); // sub_header-block (H2)
    });

    it('navigateToNextHeadingLevel(3) announces when none found', async () => {
      enterNavigateMode(0);
      navigateToNextHeadingLevel(3);
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('次の見出し3がありません');
    });
  });

  // ─── First / Last block ────────────────────────────────────

  describe('first / last block', () => {
    it('navigateToFirst focuses first block', () => {
      enterNavigateMode(3);
      navigateToFirst();
      expect(getCurrentIndex()).toBe(0);
      expect(document.activeElement).toBe(getBlock('block-0'));
    });

    it('navigateToLast focuses last block', () => {
      enterNavigateMode(0);
      navigateToLast();
      expect(getCurrentIndex()).toBe(4);
      expect(document.activeElement).toBe(getBlock('block-4'));
    });
  });

  // ─── Reset ─────────────────────────────────────────────────

  describe('resetBlockFocusManager', () => {
    it('resets the current index', () => {
      enterNavigateMode(3);
      expect(getCurrentIndex()).toBe(3);
      resetBlockFocusManager();
      expect(getCurrentIndex()).toBe(-1);
    });
  });

  // ─── destroyBlockFocusManager ──────────────────────────────

  describe('destroyBlockFocusManager', () => {
    it('removes keyboard listener', () => {
      enterNavigateMode(0);
      destroyBlockFocusManager();

      // Arrow keys should no longer be intercepted
      const event = fireKey('ArrowDown');
      expect(event.defaultPrevented).toBe(false);
    });

    it('resets index to -1', () => {
      enterNavigateMode(2);
      destroyBlockFocusManager();
      expect(getCurrentIndex()).toBe(-1);
    });
  });

  // ─── Modifier key guards ──────────────────────────────────

  describe('modifier key guards', () => {
    it('ignores Alt+ArrowDown', () => {
      enterNavigateMode(0);
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      // Should not have moved (Alt is held)
      expect(getCurrentIndex()).toBe(0);
    });

    it('ignores Ctrl+ArrowDown', () => {
      enterNavigateMode(0);
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(getCurrentIndex()).toBe(0);
    });

    it('ignores Shift+ArrowDown (Notion block selection)', () => {
      enterNavigateMode(0);
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(getCurrentIndex()).toBe(0);
    });
  });

  // ─── Focus tracking via focusin ────────────────────────────

  describe('focusin tracking', () => {
    it('updates index when block receives focus', () => {
      const block2 = getBlock('block-2');
      block2.setAttribute('tabindex', '-1');
      block2.focus();

      // Dispatch focusin to simulate the event
      const event = new FocusEvent('focusin', { bubbles: true });
      block2.dispatchEvent(event);

      expect(getCurrentIndex()).toBe(2);
    });
  });
});
