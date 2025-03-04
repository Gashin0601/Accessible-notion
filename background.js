// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    // タブとURLの存在確認
    if (!tab || !changeInfo || changeInfo.status !== 'complete') {
      return;
    }

    // URLの安全なチェック
    const url = tab.url || tab.pendingUrl;
    if (!url) {
      return;
    }

    // notion.soドメインのチェック
    if (url.toLowerCase().indexOf('notion.so') === -1) {
      return;
    }

    // スクリプトの実行
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    }).catch(error => {
      console.error('スクリプトの実行中にエラーが発生しました:', error);
    });
  } catch (error) {
    console.error('タブの処理中にエラーが発生しました:', error);
  }
});

// エラーハンドリング
chrome.runtime.onError.addListener((error) => {
  console.error('拡張機能でエラーが発生しました:', error.message);
}); 