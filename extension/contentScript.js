// Notion Accessibility Content Script
(() => {
  console.log('[Notion Accessibility Enhancer] 拡張機能が読み込まれました');

  // 対象ノード（Notionアプリのルート要素）を取得
  const appNode = document.getElementById('notion-app') || document.body;
  console.log('[Notion Accessibility Enhancer] ターゲットノード:', appNode);

  // 指定した要素にrole属性やラベルを付与する関数
  function enhanceElement(el) {
    // 既にボタン(role="button")の場合はスキップ（ラベル調整は後で）
    if (el.getAttribute('role') && el.getAttribute('role') !== 'button') return;
    // 編集可能なコンテンツは除外（ボタンではないため）
    if (el.isContentEditable) return;
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)) return;

    // ボタンとして認識されていなければroleを追加
    if (!el.hasAttribute('role')) {
      el.setAttribute('role', 'button');
      console.log('[Notion Accessibility Enhancer] role="button"を設定:', el);
      // キーボードでEnter/Space押下時にクリックと同じ動作を行う
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          ev.stopPropagation();
          el.click();
        }
      });
    }

    // アクセシブルネーム（aria-label）を設定
    // 既にaria-labelやaria-labelledbyがあればそのまま利用
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) {
      // 「touch」としか書かれていないラベルは修正
      const name = el.getAttribute('aria-label') || '';
      if (name.toLowerCase() === 'touch') {
        el.setAttribute('aria-label', 'Button');
        console.log('[Notion Accessibility Enhancer] "touch"ラベルを修正:', el);
      }
      return;
    }
    // 要素内のテキストから名前を取得（記号のみの場合は無効とみなす）
    const text = el.innerText || "";
    if (text.trim() && /[A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF]/.test(text)) {
      // テキストに英数字か日本語が含まれていればそのまま名前に
      return; // visibleなテキストをラベルとして利用
    }
    // 子<img>のaltテキストをラベルに利用
    const img = el.querySelector('img[alt]');
    if (img && img.alt.trim()) {
      el.setAttribute('aria-label', img.alt.trim());
      console.log('[Notion Accessibility Enhancer] img altからラベル設定:', el, img.alt.trim());
      return;
    }
    // 子<svg><title>からラベルを取得
    const titleTag = el.querySelector('svg title');
    if (titleTag && titleTag.textContent.trim()) {
      el.setAttribute('aria-label', titleTag.textContent.trim());
      console.log('[Notion Accessibility Enhancer] SVGタイトルからラベル設定:', el, titleTag.textContent.trim());
      return;
    }
    // 他に名前情報がない場合、汎用的なラベルを設定
    el.setAttribute('aria-label', 'Button');
    console.log('[Notion Accessibility Enhancer] 汎用ラベルを設定:', el);
  }

  // 初期ロード時に既存の対象要素を修正
  const initialElements = appNode.querySelectorAll('[tabindex]');
  console.log(`[Notion Accessibility Enhancer] 初期要素数: ${initialElements.length}`);
  initialElements.forEach(enhanceElement);

  // DOM変更監視：新しく追加された要素にも適用
  const observer = new MutationObserver((mutations) => {
    let addedCount = 0;
    for (const m of mutations) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          // 新規追加ノード自身およびその子孫の該当要素に対し適用
          if (node.matches('[tabindex]')) {
            enhanceElement(node);
            addedCount++;
          }
          const childElements = node.querySelectorAll && node.querySelectorAll('[tabindex]');
          if (childElements) {
            childElements.forEach(enhanceElement);
            addedCount += childElements.length;
          }
        });
      } else if (m.type === 'attributes') {
        const node = m.target;
        if (node instanceof HTMLElement && m.attributeName === 'aria-label') {
          // aria-labelが動的に変更された場合も「touch」なら修正
          const label = node.getAttribute('aria-label') || '';
          if (label.toLowerCase() === 'touch') {
            node.setAttribute('aria-label', 'Button');
            console.log('[Notion Accessibility Enhancer] 動的ラベル"touch"を修正:', node);
          }
        }
      }
    }
    if (addedCount > 0) {
      console.log(`[Notion Accessibility Enhancer] 新たに${addedCount}個の要素を処理しました`);
    }
  });
  observer.observe(appNode, { childList: true, subtree: true, attributes: true });
  console.log('[Notion Accessibility Enhancer] MutationObserverが開始されました');
})(); 