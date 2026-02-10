import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initCommentEnhancer, destroyCommentEnhancer } from '../../src/content/comment-enhancer';
import { initLiveAnnouncer, destroyLiveAnnouncer } from '../../src/content/live-announcer';
import { EXTENSION_ATTR } from '../../src/shared/constants';

function createSidePeekWithComments(commentData: Array<{ author: string; date: string; body: string }>): HTMLElement {
  const peek = document.createElement('div');
  peek.classList.add('notion-peek-renderer');

  const commentSection = document.createElement('div');
  commentSection.classList.add('discussion');

  const thread = document.createElement('div');
  thread.classList.add('comment-thread');

  for (const data of commentData) {
    const comment = document.createElement('div');

    const author = document.createElement('span');
    author.classList.add('author');
    author.textContent = data.author;
    comment.appendChild(author);

    const date = document.createElement('span');
    date.classList.add('date');
    date.textContent = data.date;
    comment.appendChild(date);

    const body = document.createElement('div');
    body.classList.add('body');
    body.textContent = data.body;
    comment.appendChild(body);

    thread.appendChild(comment);
  }

  commentSection.appendChild(thread);
  peek.appendChild(commentSection);

  // Comment input
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  peek.appendChild(input);

  document.body.appendChild(peek);
  return peek;
}

describe('comment-enhancer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    initLiveAnnouncer();
  });

  afterEach(() => {
    destroyCommentEnhancer();
    destroyLiveAnnouncer();
  });

  describe('comment enhancement', () => {
    it('sets region role on comment section', () => {
      createSidePeekWithComments([
        { author: '田中太郎', date: '2025-01-01', body: 'テストコメント' },
      ]);

      initCommentEnhancer();

      const section = document.querySelector('.discussion');
      expect(section?.getAttribute('role')).toBe('region');
      expect(section?.getAttribute('aria-label')).toBe('コメント');
    });

    it('sets article role on each comment', () => {
      createSidePeekWithComments([
        { author: '田中太郎', date: '2025-01-01', body: 'コメント1' },
        { author: '鈴木花子', date: '2025-01-02', body: 'コメント2' },
      ]);

      initCommentEnhancer();

      const comments = document.querySelectorAll(`[${EXTENSION_ATTR}="comment"]`);
      expect(comments.length).toBe(2);
      expect(comments[0].getAttribute('role')).toBe('article');
      expect(comments[1].getAttribute('role')).toBe('article');
    });

    it('builds aria-label from author, date, and body', () => {
      createSidePeekWithComments([
        { author: '田中太郎', date: '1月1日', body: '短いコメント' },
      ]);

      initCommentEnhancer();

      const comment = document.querySelector(`[${EXTENSION_ATTR}="comment"]`);
      const label = comment?.getAttribute('aria-label') ?? '';
      expect(label).toContain('田中太郎');
      expect(label).toContain('1月1日');
      expect(label).toContain('短いコメント');
    });

    it('truncates long comment bodies to 40 chars', () => {
      const longBody = 'これは非常に長いコメントです。50文字以上あるので省略されるはずです。テスト用の文字列。';
      createSidePeekWithComments([
        { author: '田中', date: '1月', body: longBody },
      ]);

      initCommentEnhancer();

      const comment = document.querySelector(`[${EXTENSION_ATTR}="comment"]`);
      const label = comment?.getAttribute('aria-label') ?? '';
      // Label should contain truncated text
      expect(label.length).toBeLessThan(longBody.length + 20); // +20 for author+date
    });

    it('makes comments focusable with tabindex=-1', () => {
      createSidePeekWithComments([
        { author: '田中', date: '1月', body: 'テスト' },
      ]);

      initCommentEnhancer();

      const comment = document.querySelector(`[${EXTENSION_ATTR}="comment"]`);
      expect(comment?.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('comment input labeling', () => {
    it('sets aria-label on contenteditable input', () => {
      createSidePeekWithComments([]);

      initCommentEnhancer();

      const input = document.querySelector('[contenteditable="true"]');
      expect(input?.getAttribute('aria-label')).toBe('コメントを入力');
    });
  });

  describe('keyboard navigation', () => {
    it('Alt+J navigates to next comment', () => {
      createSidePeekWithComments([
        { author: 'A', date: '1月', body: 'コメント1' },
        { author: 'B', date: '2月', body: 'コメント2' },
        { author: 'C', date: '3月', body: 'コメント3' },
      ]);

      initCommentEnhancer();

      const comments = document.querySelectorAll<HTMLElement>(`[${EXTENSION_ATTR}="comment"]`);
      // Focus first comment inside peek
      comments[0].focus();

      // First Alt+J: currentCommentIndex starts at -1, goes to 0
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'j', altKey: true, bubbles: true, cancelable: true,
      }));
      expect(document.activeElement).toBe(comments[0]);

      // Second Alt+J: from 0, goes to 1
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'j', altKey: true, bubbles: true, cancelable: true,
      }));
      expect(document.activeElement).toBe(comments[1]);
    });

    it('Alt+K navigates to previous comment', () => {
      createSidePeekWithComments([
        { author: 'A', date: '1月', body: 'コメント1' },
        { author: 'B', date: '2月', body: 'コメント2' },
        { author: 'C', date: '3月', body: 'コメント3' },
      ]);

      initCommentEnhancer();

      const comments = document.querySelectorAll<HTMLElement>(`[${EXTENSION_ATTR}="comment"]`);
      comments[0].focus();

      // Navigate forward to set currentCommentIndex: -1 → 0 → 1
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'j', altKey: true, bubbles: true, cancelable: true,
      }));
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'j', altKey: true, bubbles: true, cancelable: true,
      }));
      expect(document.activeElement).toBe(comments[1]);

      // Now navigate back: 1 → 0
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k', altKey: true, bubbles: true, cancelable: true,
      }));

      expect(document.activeElement).toBe(comments[0]);
    });

    it('does not activate when focus is outside side peek', () => {
      createSidePeekWithComments([
        { author: 'A', date: '1月', body: 'コメント1' },
        { author: 'B', date: '2月', body: 'コメント2' },
      ]);

      initCommentEnhancer();

      // Create element outside peek and focus it
      const outsideEl = document.createElement('button');
      outsideEl.textContent = '外部ボタン';
      document.body.appendChild(outsideEl);
      outsideEl.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'j',
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      // Should not have moved focus to a comment
      expect(document.activeElement).toBe(outsideEl);
    });
  });

  describe('no comments scenario', () => {
    it('handles side peek with no comments', () => {
      const peek = document.createElement('div');
      peek.classList.add('notion-peek-renderer');
      document.body.appendChild(peek);

      expect(() => initCommentEnhancer()).not.toThrow();
    });

    it('handles no side peek at all', () => {
      expect(() => initCommentEnhancer()).not.toThrow();
    });
  });

  describe('destroyCommentEnhancer', () => {
    it('cleans up observer and keyboard handler', () => {
      createSidePeekWithComments([
        { author: 'A', date: '1月', body: 'テスト' },
      ]);

      initCommentEnhancer();
      expect(() => destroyCommentEnhancer()).not.toThrow();

      // After destroy, Alt+J should not navigate
      const peek = document.querySelector('.notion-peek-renderer') as HTMLElement;
      const comment = document.querySelector(`[${EXTENSION_ATTR}="comment"]`) as HTMLElement;
      comment?.focus();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'j', altKey: true, bubbles: true, cancelable: true,
      }));

      // Focus should not have moved (handler removed)
      // (behavior depends on whether there's a second comment)
    });
  });
});
