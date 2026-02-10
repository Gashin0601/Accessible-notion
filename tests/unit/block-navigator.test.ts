import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  nextBlock,
  prevBlock,
  announceCurrentBlock,
  announceHeadingOutline,
  nextHeading,
  prevHeading,
  nextHeadingLevel,
  firstBlock,
  lastBlock,
  resetBlockNavigation,
  getCurrentBlockIndex,
} from '../../src/content/block-navigator';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';

function createBlock(type: string, text: string): HTMLElement {
  const block = document.createElement('div');
  block.classList.add('notion-selectable', `notion-${type}`);
  block.setAttribute('data-block-id', `block-${Math.random().toString(36).slice(2)}`);
  block.textContent = text;
  return block;
}

function createPage(): void {
  const main = document.createElement('main');
  main.classList.add('notion-frame');

  main.appendChild(createBlock('header-block', '見出し1'));
  main.appendChild(createBlock('text-block', 'テキスト1'));
  main.appendChild(createBlock('text-block', 'テキスト2'));
  main.appendChild(createBlock('sub_header-block', '見出し2'));
  main.appendChild(createBlock('text-block', 'テキスト3'));
  main.appendChild(createBlock('sub_sub_header-block', '見出し3'));
  main.appendChild(createBlock('divider-block', ''));

  document.body.appendChild(main);
}

describe('block-navigator', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
    resetBlockNavigation();
    createPage();
  });

  afterEach(() => {
    destroyLiveAnnouncer();
  });

  describe('nextBlock / prevBlock', () => {
    it('starts at first block', () => {
      nextBlock();
      expect(getCurrentBlockIndex()).toBe(0);
    });

    it('moves to next block', () => {
      nextBlock();
      nextBlock();
      expect(getCurrentBlockIndex()).toBe(1);
    });

    it('moves to previous block', () => {
      nextBlock();
      nextBlock();
      nextBlock();
      prevBlock();
      expect(getCurrentBlockIndex()).toBe(1);
    });

    it('does not go below 0', () => {
      nextBlock(); // index 0
      prevBlock(); // should stay at 0
      expect(getCurrentBlockIndex()).toBe(0);
    });
  });

  describe('firstBlock / lastBlock', () => {
    it('jumps to first block', () => {
      nextBlock();
      nextBlock();
      nextBlock();
      firstBlock();
      expect(getCurrentBlockIndex()).toBe(0);
    });

    it('jumps to last block', () => {
      lastBlock();
      expect(getCurrentBlockIndex()).toBe(6);
    });
  });

  describe('heading navigation', () => {
    it('nextHeading finds the first heading', () => {
      nextHeading();
      expect(getCurrentBlockIndex()).toBe(0); // header-block
    });

    it('nextHeading from header-block finds sub_header-block', () => {
      nextBlock(); // index 0 (header-block)
      nextHeading();
      expect(getCurrentBlockIndex()).toBe(3); // sub_header-block
    });

    it('prevHeading from last block finds sub_sub_header-block', () => {
      lastBlock(); // index 6
      prevHeading();
      expect(getCurrentBlockIndex()).toBe(5); // sub_sub_header-block
    });

    it('nextHeadingLevel(1) finds only H1', () => {
      nextHeadingLevel(1);
      expect(getCurrentBlockIndex()).toBe(0);
    });

    it('nextHeadingLevel(2) finds only H2', () => {
      nextHeadingLevel(2);
      expect(getCurrentBlockIndex()).toBe(3);
    });

    it('nextHeadingLevel(3) finds only H3', () => {
      nextHeadingLevel(3);
      expect(getCurrentBlockIndex()).toBe(5);
    });
  });

  describe('announceHeadingOutline', () => {
    it('announces heading structure', async () => {
      announceHeadingOutline();
      // announce uses requestAnimationFrame, so we need to wait
      await new Promise((r) => requestAnimationFrame(r));
      const live = document.querySelector('[aria-live="polite"]');
      expect(live?.textContent).toContain('見出し構造');
    });
  });

  describe('announceCurrentBlock', () => {
    it('announces block when focused on a block', () => {
      const blocks = document.querySelectorAll<HTMLElement>('div.notion-selectable[data-block-id]');
      blocks[0].setAttribute('tabindex', '-1');
      blocks[0].focus();
      announceCurrentBlock();
      expect(getCurrentBlockIndex()).toBe(0);
    });
  });

  describe('resetBlockNavigation', () => {
    it('resets to -1', () => {
      nextBlock();
      expect(getCurrentBlockIndex()).toBe(0);
      resetBlockNavigation();
      expect(getCurrentBlockIndex()).toBe(-1);
    });
  });
});
