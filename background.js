// 拡張機能のインストール時やアップデート時に実行
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Accessibility Enhancer がインストールされました');
});

// Notionのドメインをチェックする関数
function isNotionUrl(urlString) {
  try {
    if (!urlString) return false;
    const url = new URL(urlString);
    return url.hostname.endsWith('notion.so');
  } catch {
    return false;
  }
}

// タブが更新されたときの処理
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 完了ステータスでない場合は処理しない
  if (changeInfo.status !== 'complete') return;

  try {
    // タブ情報の取得を試みる
    const currentTab = await chrome.tabs.get(tabId);
    if (!currentTab) return;

    // URLの確認
    const tabUrl = currentTab.url || currentTab.pendingUrl;
    if (!isNotionUrl(tabUrl)) return;

    // content.jsの実行
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (error) {
    console.error('拡張機能の実行中にエラーが発生しました:', error);
  }
});

// エラーハンドリング
chrome.runtime.onError.addListener((error) => {
  console.error('拡張機能でエラーが発生しました:', error.message);
}); 