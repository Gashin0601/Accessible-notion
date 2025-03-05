// Notion Accessibility Content Script
(() => {
  console.log('[Notion Accessibility Enhancer] 拡張機能が読み込まれました');

  // デバッグモード（本番環境ではfalseに設定）
  const DEBUG = false;

  // 設定
  const CONFIG = {
    // スキャン間隔（ミリ秒）
    scanInterval: 10000,
    // 初期スキャン遅延（ミリ秒）
    initialScanDelay: 1000,
    // 再試行間隔（ミリ秒）
    retryDelay: 2000,
    // 最大再試行回数
    maxRetries: 5
  };

  // ログ出力関数（デバッグモード時のみ出力）
  function debugLog(...args) {
    if (DEBUG) {
      console.log('[Notion Accessibility Enhancer]', ...args);
    }
  }

  // エラーログ出力関数（常に出力）
  function errorLog(...args) {
    console.error('[Notion Accessibility Enhancer]', ...args);
  }

  // テーマの検出
  const isDarkMode = document.body.classList.contains('dark');
  debugLog('テーマ検出:', isDarkMode ? 'ダークモード' : 'ライトモード');

  // 対象ノード（Notionアプリのルート要素）を取得する関数
  function getTargetNode() {
    // 優先順位付きで複数の候補を試す
    const selectors = [
      '#notion-app',
      '.notion-app-inner',
      '.notion-frame',
      'body'
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) {
        debugLog(`ターゲットノード(${selector})を検出しました`);
        return node;
      }
    }
    
    // 最終的にはbodyを返す
    debugLog('ターゲットノードを検出できなかったため、bodyを使用します');
    return document.body;
  }

  // 初期ローディングUI要素を処理する関数
  function enhanceLoadingUI() {
    // ローディングスピナー
    const spinner = document.querySelector('#initial-loading-spinner');
    if (spinner) {
      // 既に適切なaria属性がある場合は処理しない
      if (!spinner.querySelector('[role="progressbar"][aria-live="polite"]')) {
        const progressElem = spinner.querySelector('.spinner');
        if (progressElem) {
          progressElem.setAttribute('role', 'progressbar');
          progressElem.setAttribute('aria-live', 'polite');
          progressElem.setAttribute('aria-busy', 'true');
          progressElem.setAttribute('aria-label', '読み込み中');
          debugLog('ローディングスピナーを強化しました');
        }
      }
    }

    // スケルトンローダー
    const skeleton = document.querySelector('#skeleton');
    if (skeleton) {
      if (!skeleton.hasAttribute('role')) {
        skeleton.setAttribute('role', 'progressbar');
        skeleton.setAttribute('aria-label', 'ページ読み込み中');
        skeleton.setAttribute('aria-valuetext', 'Loading...');
        debugLog('スケルトンローダーを強化しました');
      }
    }
  }

  // 要素の種類や状態に基づいて適切なラベルを推測する関数
  function guessElementLabel(el) {
    // CSSクラスに基づく推測
    if (el.classList.contains('notion-record-icon')) {
      return 'アイコン';
    }
    
    if (el.classList.contains('notion-page-block')) {
      return 'ページ';
    }
    
    if (el.classList.contains('notion-collection_view-block')) {
      return 'データベース';
    }
    
    if (el.classList.contains('notion-add-new-page-button')) {
      return '新規ページ追加';
    }
    
    if (el.classList.contains('notion-sidebar-item')) {
      return 'サイドバー項目';
    }

    if (el.classList.contains('notion-topbar-more-button')) {
      return 'その他のオプション';
    }

    if (el.classList.contains('notion-search-button')) {
      return '検索';
    }

    if (el.classList.contains('notion-activity-section-button')) {
      return 'アクティビティ';
    }

    if (el.classList.contains('notion-user-menu-button')) {
      return 'ユーザーメニュー';
    }
    
    // 子要素に基づく推測
    if (el.querySelector('.notion-page-icon')) {
      return 'ページ';
    }
    
    if (el.querySelector('.notion-collection-item')) {
      return 'コレクション項目';
    }

    // data属性に基づく推測
    if (el.hasAttribute('data-block-id')) {
      return 'ブロック';
    }

    // フォールバック
    return 'ボタン';
  }

  // 要素のアリアロールを決定する関数
  function determineAriaRole(el) {
    // 既にロールがある場合はそれを維持
    if (el.getAttribute('role')) {
      return el.getAttribute('role');
    }
    
    // タグに基づくロールの推測
    const tag = el.tagName.toLowerCase();
    if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) {
      return null; // これらのタグは暗黙的なロールを持つ
    }
    
    // クラスに基づくロールの推測
    if (el.classList.contains('notion-page-block')) {
      return 'article';
    }
    
    if (el.classList.contains('notion-collection_view-block')) {
      return 'region';
    }
    
    if (el.classList.contains('notion-sidebar')) {
      return 'navigation';
    }
    
    // その他はボタンとして処理
    return 'button';
  }

  // Notionの特定の要素タイプを検出（これらはDOMLockがかかっている可能性がある）
  function shouldSkipElement(el) {
    // 以下のクラスの組み合わせを持つ要素はスキップ
    const skipPatterns = [
      // メンショントークン - 警告ログに表示されていた要素
      ['notion-page-mention-token', 'notion-text-mention-token', 'notion-focusable-token', 'notion-enable-hover'],
      // その他スキップすべき要素のパターン
      ['notion-selectable', 'notion-text-block'],
      ['notion-focusable', 'notion-page-block'],
      ['notion-selectable', 'notion-collection_view-block'],
      ['notion-token-operator'],
      ['notion-sub-header-view']
    ];
    
    // いずれかのパターンに完全一致する場合はスキップ
    for (const pattern of skipPatterns) {
      let matchesAll = true;
      for (const className of pattern) {
        if (!el.classList.contains(className)) {
          matchesAll = false;
          break;
        }
      }
      if (matchesAll) {
        debugLog('DOMLock対象の要素をスキップします', el);
        return true;
      }
    }
    
    // DOMLock警告の原因となる特殊なケース
    // data-content-editable-voidを持つ要素はNotion内部でDOMLockが適用される
    if (el.hasAttribute('data-content-editable-void') || 
        el.closest('[data-content-editable-void]') ||
        el.closest('[contenteditable="true"]')) {
      debugLog('編集可能領域内の要素をスキップします', el);
      return true;
    }
    
    return false;
  }

  // 指定した要素にrole属性やラベルを付与する関数
  function enhanceElement(el) {
    try {
      // 既に適切なroleがある場合はスキップ
      if (el.getAttribute('role') && el.getAttribute('role') !== 'button') return;
      
      // 編集可能なコンテンツは除外（ボタンではないため）
      if (el.isContentEditable) return;
      
      // ネイティブフォーム要素は除外
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName)) return;
      
      // 処理済みの要素はスキップ（パフォーマンス向上）
      if (el.hasAttribute('data-a11y-enhanced')) return;
      
      // 非表示要素はスキップ
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return;
      }
      
      // Notionの特定要素はスキップ（DOMLock対策）
      if (shouldSkipElement(el)) return;
      
      // 処理済みマークを付ける
      el.setAttribute('data-a11y-enhanced', 'true');
      
      // 適切なロールを決定して設定
      const role = determineAriaRole(el);
      if (role && !el.hasAttribute('role')) {
        el.setAttribute('role', role);
        debugLog(`${role}ロールを設定:`, el);
      }
      
      // ボタンへのキーボードイベントリスナー追加
      if (role === 'button' && !el.getAttribute('data-a11y-keyboard')) {
        el.setAttribute('data-a11y-keyboard', 'true');
        el.setAttribute('tabindex', el.getAttribute('tabindex') || '0');
        
        el.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            ev.stopPropagation();
            el.click();
            debugLog('キーボードイベントでクリック実行:', el);
          }
        });
      }
      
      // アクセシブルネーム（aria-label）を設定
      // 既にaria-labelやaria-labelledbyがあればそのまま利用
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) {
        // 「touch」としか書かれていないラベルは修正
        const name = el.getAttribute('aria-label') || '';
        if (name.toLowerCase() === 'touch' || name === 'Button' || name === '') {
          const betterLabel = guessElementLabel(el);
          el.setAttribute('aria-label', betterLabel);
          debugLog('ラベルを改善:', el, betterLabel);
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
        debugLog('img altからラベル設定:', el, img.alt.trim());
        return;
      }
      
      // 子<svg><title>からラベルを取得
      const titleTag = el.querySelector('svg title');
      if (titleTag && titleTag.textContent.trim()) {
        el.setAttribute('aria-label', titleTag.textContent.trim());
        debugLog('SVGタイトルからラベル設定:', el, titleTag.textContent.trim());
        return;
      }
      
      // 他に名前情報がない場合、要素の種類に基づいたラベルを設定
      const contextualLabel = guessElementLabel(el);
      el.setAttribute('aria-label', contextualLabel);
      debugLog('コンテキストラベルを設定:', el, contextualLabel);
    } catch (error) {
      errorLog('要素の強化中にエラーが発生しました', error, el);
    }
  }

  // クリック可能な要素を検出する関数
  function findClickableElements() {
    try {
      const appNode = getTargetNode();
      
      // Notionの特定要素をスキップするセレクタを追加
      const skipPatterns = [
        '.notion-page-mention-token.notion-text-mention-token.notion-focusable-token',
        '.notion-selectable.notion-text-block',
        '.notion-focusable.notion-page-block',
        '[data-content-editable-void]',
        '[contenteditable="true"]'
      ].join(', ');
      
      // 新しいNotionのUIをサポートするためのセレクタを拡張
      const selectors = [
        // tabindex属性を持つ要素
        `[tabindex]:not([data-a11y-enhanced]):not(${skipPatterns})`,
        
        // Notionの基本的なUIコンポーネント
        `div[role="button"]:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `div.clickable:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `div[data-click-id]:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `div.notion-selectable:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `div.notion-page-block:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `div.notion-collection_view-block:not([data-a11y-enhanced]):not(${skipPatterns})`,
        
        // Notionの特定のクラスを持つ要素
        `.notion-focusable:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-sidebar-item:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-record-icon:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-token-operator:not([data-a11y-enhanced]):not(${skipPatterns})`,
        
        // 新しいNotionのUIコンポーネント
        `.notion-topbar-button:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-sidebar-button:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-add-new-page-button:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-search-button:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-user-menu-button:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-activity-section-button:not([data-a11y-enhanced]):not(${skipPatterns})`,
        `.notion-help-button:not([data-a11y-enhanced]):not(${skipPatterns})`,
        
        // スケルトンUI要素
        `#skeleton .startup-shimmer:not([data-a11y-enhanced])`
      ].join(', ');
      
      const elements = appNode.querySelectorAll(selectors);
      debugLog(`検出された要素: ${elements.length}個`);
      
      // 各要素に対して処理を適用
      let processedCount = 0;
      elements.forEach(el => {
        if (!shouldSkipElement(el)) {
          enhanceElement(el);
          processedCount++;
        }
      });
      
      // 処理した要素数を返す（デバッグ用）
      debugLog(`実際に処理された要素: ${processedCount}個`);
      return processedCount;
    } catch (error) {
      errorLog('要素検出中にエラーが発生しました', error);
      return 0;
    }
  }

  // ローディングUI要素を強化
  enhanceLoadingUI();
  
  // 初期スキャンの実行
  let retryCount = 0;
  function initialScan() {
    const appNode = getTargetNode();
    if (!appNode || appNode === document.body) {
      // ターゲットノードが見つからない場合は再試行
      retryCount++;
      if (retryCount <= CONFIG.maxRetries) {
        debugLog(`ターゲットノードが見つかりません。${retryCount}回目の再試行...`);
        setTimeout(initialScan, CONFIG.retryDelay);
      } else {
        debugLog('最大再試行回数に達しました。bodyをターゲットとして使用します。');
        const initialElements = document.body.querySelectorAll('[tabindex]');
        debugLog(`初期要素数: ${initialElements.length}`);
        initialElements.forEach(el => {
          if (!shouldSkipElement(el)) {
            enhanceElement(el);
          }
        });
      }
      return;
    }
    
    const initialElements = appNode.querySelectorAll('[tabindex]');
    debugLog(`初期要素数: ${initialElements.length}`);
    let processedCount = 0;
    initialElements.forEach(el => {
      if (!shouldSkipElement(el)) {
        enhanceElement(el);
        processedCount++;
      }
    });
    debugLog(`初期スキャンで${processedCount}個の要素を処理しました`);
    
    // 初期スキャン完了後に完全スキャンを実行
    setTimeout(findClickableElements, CONFIG.initialScanDelay);
  }
  
  // 初期スキャンを開始
  initialScan();

  // ページ読み込み完了後に再スキャン
  window.addEventListener('load', () => {
    debugLog('ページ読み込み完了、要素を再スキャンします');
    setTimeout(findClickableElements, CONFIG.initialScanDelay);
    setTimeout(findClickableElements, CONFIG.initialScanDelay * 3); // 遅延読み込み要素のため
  });

  // DOMの準備完了時にもスキャン
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      debugLog('DOM読み込み完了、要素を再スキャンします');
      setTimeout(findClickableElements, CONFIG.initialScanDelay);
    });
  }

  // パフォーマンス向上のためのデバウンス関数
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  // DOM変更監視：新しく追加された要素にも適用
  const observer = new MutationObserver(debounce((mutations) => {
    try {
      let addedCount = 0;
      
      // 変更が多い場合はバッチ処理（パフォーマンス向上）
      const elementsToProcess = new Set();
      
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(node => {
            if (!(node instanceof HTMLElement)) return;
            
            // スキップすべき要素は処理しない
            if (shouldSkipElement(node)) return;
            
            // 新規追加ノード自身を処理対象に追加
            if (node.matches && (
                node.matches('[tabindex]:not([data-a11y-enhanced])') || 
                node.matches('.notion-focusable:not([data-a11y-enhanced])') ||
                node.matches('div[role="button"]:not([data-a11y-enhanced])'))) {
              elementsToProcess.add(node);
            }
            
            // 子孫要素を処理対象に追加
            if (node.querySelectorAll) {
              try {
                const childSelectors = [
                  '[tabindex]:not([data-a11y-enhanced])',
                  'div[role="button"]:not([data-a11y-enhanced])',
                  'div.clickable:not([data-a11y-enhanced])',
                  'div[data-click-id]:not([data-a11y-enhanced])',
                  '.notion-focusable:not([data-a11y-enhanced])',
                  '.notion-topbar-button:not([data-a11y-enhanced])',
                  '.notion-sidebar-button:not([data-a11y-enhanced])'
                ].join(', ');
                
                const childElements = node.querySelectorAll(childSelectors);
                childElements.forEach(el => {
                  if (!shouldSkipElement(el)) {
                    elementsToProcess.add(el);
                  }
                });
              } catch (err) {
                errorLog('子要素の選択中にエラーが発生しました', err);
              }
            }
          });
        } else if (m.type === 'attributes') {
          const node = m.target;
          if (node instanceof HTMLElement) {
            // スキップすべき要素は処理しない
            if (shouldSkipElement(node)) return;
            
            // aria-labelが動的に変更された場合の処理
            if (m.attributeName === 'aria-label') {
              const label = node.getAttribute('aria-label') || '';
              if (label.toLowerCase() === 'touch' || label === 'Button' || label === '') {
                const betterLabel = guessElementLabel(node);
                node.setAttribute('aria-label', betterLabel);
                debugLog('動的ラベルを改善:', node, betterLabel);
              }
            }
            
            // tabindexが追加された場合の処理
            if (m.attributeName === 'tabindex' && !node.hasAttribute('data-a11y-enhanced')) {
              elementsToProcess.add(node);
            }
          }
        }
      }
      
      // 収集した要素を一括処理
      elementsToProcess.forEach(el => {
        enhanceElement(el);
        addedCount++;
      });
      
      if (addedCount > 0 && DEBUG) {
        console.log(`[Notion Accessibility Enhancer] 新たに${addedCount}個の要素を処理しました`);
      }
    } catch (error) {
      errorLog('MutationObserver処理中にエラーが発生しました', error);
    }
  }, 200)); // 200msのデバウンス
  
  // ローディングUI要素を含めたすべてのターゲットを監視
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'tabindex', 'role'] });
  debugLog('MutationObserverが開始されました');

  // 定期的に再スキャン
  setInterval(() => {
    try {
      const processed = findClickableElements();
      if (processed > 0 && DEBUG) {
        console.log(`[Notion Accessibility Enhancer] 定期スキャンで${processed}個の要素を処理しました`);
      }
      
      // ローディングUI要素も定期的に強化
      enhanceLoadingUI();
    } catch (error) {
      errorLog('定期スキャン中にエラーが発生しました', error);
    }
  }, CONFIG.scanInterval);
  
  // 拡張機能が正常に動作していることをユーザーに通知
  console.log('[Notion Accessibility Enhancer] アクセシビリティ拡張機能が正常に動作しています');
})(); 