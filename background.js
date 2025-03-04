// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// URLをチェックする関数
function isAllowedUrl(urlString) {
  // 無効なURLの早期リターン
  if (!urlString || typeof urlString !== 'string') {
    console.debug('無効なURL:', urlString);
    return false;
  }

  // URLが chrome-extension:// で始まる場合は無視
  if (urlString.startsWith('chrome-extension://')) {
    return false;
  }

  try {
    const url = new URL(urlString);
    
    // プロトコルチェック
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) {
      console.debug('未対応のプロトコル:', url.protocol);
      return false;
    }

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
    const isAllowed = allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );

    console.debug('URLチェック結果:', {
      url: urlString,
      hostname: hostname,
      isAllowed: isAllowed
    });

    return isAllowed;
  } catch (error) {
    console.debug('URL解析エラー:', error);
    return false;
  }
}

// タブ情報を安全に取得する関数
async function safeGetTab(tabId) {
  if (typeof tabId !== 'number') {
    console.debug('無効なタブID:', tabId);
    return null;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      console.debug('タブが見つかりません:', tabId);
      return null;
    }
    return tab;
  } catch (error) {
    console.debug('タブ情報の取得に失敗:', error);
    return null;
  }
}

// content.jsを安全に実行する関数
async function safeExecuteScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    console.debug('content.jsを実行しました:', tabId);
    return true;
  } catch (error) {
    console.error('スクリプトの実行に失敗:', error);
    return false;
  }
}

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 無効な引数のチェック
  if (!tabId || !changeInfo) {
    console.debug('無効な引数:', { tabId, changeInfo });
    return;
  }

  // タブ更新以外のイベントは無視
  if (changeInfo.status !== 'complete') {
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
      console.debug('処理対象URL:', tabUrl);

      if (!isAllowedUrl(tabUrl)) {
        console.debug('対象外のURL:', tabUrl);
        return;
      }

      // content.jsの実行
      await safeExecuteScript(tabId);
    } catch (error) {
      console.error('拡張機能の実行中にエラーが発生しました:', error);
    }
  })();
});

// エラーハンドリング
chrome.runtime.onError.addListener((error) => {
  console.error('拡張機能でエラーが発生しました:', error.message);
}); 