/**
 * F-07: Comment / Discussion Enhancement
 *
 * Enhances Notion's comment threads with ARIA semantics:
 * - Comment region labeling
 * - Article role for each comment
 * - Comment input labeling
 * - New comment notifications
 */

import { EXTENSION_ATTR } from '../shared/constants';
import { logDebug } from '../shared/logger';
import { SIDE_PEEK } from './selectors';
import { announce } from './live-announcer';

const MODULE = 'CommentEnhancer';

let observer: MutationObserver | null = null;
let lastCommentCount = 0;

/**
 * Enhance comment threads in the side peek panel.
 */
function enhanceComments(): void {
  const peek = document.querySelector(SIDE_PEEK);
  if (!peek) return;

  // The comment region itself
  if (!peek.getAttribute(EXTENSION_ATTR + '-comments')) {
    const commentSection = peek.querySelector('[class*="discussion"], [class*="comment"]');
    if (commentSection instanceof HTMLElement) {
      commentSection.setAttribute('role', 'region');
      commentSection.setAttribute('aria-label', 'コメント');
      commentSection.setAttribute(EXTENSION_ATTR, 'comments');
    }
  }

  // Individual comments
  const comments = peek.querySelectorAll(
    '[class*="comment-thread"] > div, [class*="discussion-comment"], [class*="comment-row"]',
  );

  let count = 0;
  comments.forEach((comment) => {
    if (comment.hasAttribute(EXTENSION_ATTR)) return;

    comment.setAttribute('role', 'article');
    comment.setAttribute(EXTENSION_ATTR, 'comment');

    // Try to build a label: author + date + excerpt
    const authorEl = comment.querySelector('[class*="author"], [class*="user-name"], [class*="name"]');
    const dateEl = comment.querySelector('[class*="date"], [class*="timestamp"], time');
    const bodyEl = comment.querySelector('[class*="body"], [class*="text"], [class*="content"]');

    const author = authorEl?.textContent?.trim() ?? '';
    const date = dateEl?.textContent?.trim() ?? '';
    const body = bodyEl?.textContent?.trim() ?? '';
    const excerpt = body.length > 40 ? body.slice(0, 40) + '…' : body;

    const parts = [author, date, excerpt].filter(Boolean);
    if (parts.length > 0) {
      comment.setAttribute('aria-label', parts.join(' '));
    }

    count++;
  });

  // Comment input
  const inputs = peek.querySelectorAll<HTMLElement>(
    '[contenteditable="true"], textarea, input[type="text"]',
  );
  for (const input of inputs) {
    if (!input.hasAttribute(EXTENSION_ATTR + '-input')) {
      if (!input.getAttribute('aria-label')) {
        input.setAttribute('aria-label', 'コメントを入力');
      }
      input.setAttribute(EXTENSION_ATTR + '-input', 'true');
    }
  }

  // Announce new comments
  if (count > lastCommentCount && lastCommentCount > 0) {
    announce(`新しいコメントが追加されました (${count}件)`);
  }
  lastCommentCount = count;

  logDebug(MODULE, `Enhanced ${count} comments`);
}

/**
 * Initialize comment enhancer with MutationObserver.
 */
export function initCommentEnhancer(): void {
  // Initial scan
  enhanceComments();

  // Watch for side peek changes
  observer = new MutationObserver(() => {
    enhanceComments();
  });

  const body = document.body;
  observer.observe(body, { childList: true, subtree: true });

  logDebug(MODULE, 'Comment enhancer initialized');
}

export function destroyCommentEnhancer(): void {
  observer?.disconnect();
  observer = null;
  lastCommentCount = 0;
}
