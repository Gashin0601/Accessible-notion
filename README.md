# Notion Accessibility Enhancer

Notion をスクリーンリーダーやキーボードでより使いやすくするための Chrome 拡張機能です。

## 機能

- クリック可能な要素に適切な ARIA ロールとラベルを追加
- キーボード操作のサポート（Enter キーと Space キーでクリック動作）
- 不適切なアクセシビリティラベルの修正
- 動的に追加される要素への自動的な対応

## インストール方法

1. このリポジトリをクローンまたはダウンロード

```bash
git clone https://github.com/yourusername/notion-accessibility-enhancer.git
```

2. Chrome 拡張機能の管理ページを開く

   - Chrome ブラウザで `chrome://extensions` を開く
   - 右上の「デベロッパーモード」をオンにする

3. 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `extension`フォルダを選択

## 使用方法

インストール後、Notion のページを開くと自動的にアクセシビリティの改善が適用されます。

- クリック可能な要素がボタンとして認識されるようになります
- キーボードでの操作が改善されます
- スクリーンリーダーでの読み上げが改善されます

## 開発者向け情報

### ファイル構成

```
.
├── extension/           # Chrome拡張機能本体
│   ├── icons/          # アイコンファイル
│   ├── manifest.json   # 拡張機能の設定
│   ├── contentScript.js # メインスクリプト
│   └── convert-icon.js # アイコン変換スクリプト
├── node_modules/       # npm依存関係
├── .gitignore         # Git除外設定
├── package.json       # npm設定
└── package-lock.json  # npm依存関係のロック
```

### ビルド方法

このプロジェクトは特別なビルド手順を必要としません。

## ライセンス

MIT License

## 貢献について

バグ報告や機能改善の提案は、GitHub の Issue や Pull Request でお願いします。
