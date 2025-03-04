// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// URLをチェックする関数
function isAllowedUrl(urlString) {
  // URLが未定義または空の場合
  if (!urlString || typeof urlString !== 'string') {
    return false;
  }

  try {
    const url = new URL(urlString);
    
    // ローカルファイルの場合
    if (url.protocol === 'file:') {
      return true;
    }

    // 許可するドメインのリスト
    const allowedDomains = [
      'notion.so',
      'localhost',
      '127.0.0.1'
    ];

    const hostname = url.hostname.toLowerCase();
    return allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch (error) {
    console.debug('URL解析エラー:', error);
    return false;
  }
}

// タブ情報を安全に取得する関数
async function safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch (error) {
    console.debug('タブ情報の取得に失敗:', error);
    return null;
  }
}

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // タブ更新以外のイベントは無視
  if (!changeInfo || changeInfo.status !== 'complete') {
    return;
  }

  // 即時実行関数でasync/awaitを使用
  (async () => {
    try {
      // タブ情報の取得
      const currentTab = await safeGetTab(tabId);
      if (!currentTab) {
        return;
      }

      // URLの確認（現在のURLまたは遷移中のURLを使用）
      const tabUrl = currentTab.url || currentTab.pendingUrl;
      if (!isAllowedUrl(tabUrl)) {
        return;
      }

      // content.jsの実行
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    } catch (error) {
      console.error('拡張機能の実行中にエラーが発生しました:', error);
    }
  })();
});

// エラーハンドリング
chrome.runtime.onError.addListener((error) => {
  console.error('拡張機能でエラーが発生しました:', error.message);
}); 