// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// シンプルなURLチェック
function isValidUrl(urlString) {
  console.debug('URLチェック開始:', {
    urlString: urlString,
    type: typeof urlString
  });

  // 基本的な検証
  if (!urlString || typeof urlString !== 'string') {
    console.debug('URLが無効:', {
      reason: '空またはstring型ではない',
      value: urlString
    });
    return false;
  }

  // 単純な文字列チェック
  const isValid = urlString.indexOf('notion.so') !== -1 || 
                 urlString.indexOf('localhost') !== -1 || 
                 urlString.indexOf('127.0.0.1') !== -1 ||
                 urlString.indexOf('file://') === 0;

  console.debug('URL検証結果:', {
    url: urlString,
    isValid: isValid
  });

  return isValid;
}

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.debug('タブ更新イベント:', {
    tabId: tabId,
    changeInfo: changeInfo,
    tab: tab
  });

  // 基本的な検証
  if (!tab) {
    console.debug('タブ情報が存在しません');
    return;
  }

  if (!tabId) {
    console.debug('タブIDが存在しません');
    return;
  }

  if (changeInfo.status !== 'complete') {
    console.debug('ページの読み込みが完了していません:', changeInfo.status);
    return;
  }

  // タブのURLを安全に取得
  const url = tab.url;
  console.debug('タブURL:', {
    url: url,
    tabId: tabId
  });

  if (!url) {
    console.debug('URLが存在しません');
    return;
  }

  // URLの検証
  if (!isValidUrl(url)) {
    console.debug('無効なURL:', url);
    return;
  }

  // content.jsの実行
  console.debug('content.jsを実行します:', {
    tabId: tabId,
    url: url
  });

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }).then(() => {
    console.debug('content.jsの実行に成功しました');
  }).catch((error) => {
    console.error('content.jsの実行に失敗:', error);
  });
});

// エラーハンドリング
chrome.runtime.onError.addListener((error) => {
  console.error('拡張機能エラー:', {
    message: error.message,
    stack: error.stack
  });
}); 