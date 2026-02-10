# DOCUMENTATION.md — Accessible Notion Chrome Extension

> **ステータス**: Draft v0.2（2026-02-10）
> **最終更新者**: Tech Lead + Claude
> **本ドキュメントの位置づけ**: 実装・テスト・運用の唯一の起点。後続作業はすべてこのファイルから開始する。

---

## 目次

1. [Overview](#1-overview)
2. [Accessibility Principles](#2-accessibility-principles)
3. [Target Platforms](#3-target-platforms)
4. [Notion UI Inventory](#4-notion-ui-inventory)
5. [Interaction & Keyboard Model](#5-interaction--keyboard-model)
6. [DOM/ARIA Strategy](#6-domaria-strategy)
7. [Architecture](#7-architecture)
8. [Feature Specs](#8-feature-specs)
9. [Test Plan](#9-test-plan)
10. [Risk & Mitigation](#10-risk--mitigation)
11. [Telemetry / Debug](#11-telemetry--debug)
12. [Roadmap](#12-roadmap)
13. [Open Questions](#13-open-questions)

---

## 1. Overview

### 1.1 目的

Notion Web（notion.so）をスクリーンリーダー（以下 SR）で実用的に操作できるようにする Chrome 拡張機能を開発する。Notion 本体のコードは改修できない前提で、DOM 注入・ARIA 属性付与・キーボード操作の補完・フォーカス制御・読み上げ最適化を拡張側で実現する。

### 1.2 非目的

以下は本プロジェクトのスコープ外とする。

- Notion デスクトップアプリ（Electron）への対応
- Notion モバイルアプリへの対応
- ロービジョン向けのカラーテーマ・フォント変更（将来的に検討するが MVP 外）
- Notion API を使ったデータ取得・操作（拡張は DOM 操作のみ）
- Notion 以外のサービスへの汎用化

### 1.3 想定ユーザー

| ユーザー層 | 主な SR | 利用シーン |
|---|---|---|
| 全盲ユーザー | NVDA / JAWS（Windows）、VoiceOver（macOS） | ページ閲覧、編集、DB 操作、検索、コメント |
| 弱視ユーザー | 同上 + 拡大鏡併用 | SR と画面の両方を使い分け |
| 運動障害ユーザー | 同上 + 音声入力等 | キーボードのみで全操作 |
| 支援技術の検証担当者 | 各種 SR | QA・アクセシビリティ監査 |

### 1.4 成功条件

1. NVDA + Chrome で Notion のページ閲覧・ブロック編集・ページツリー移動が可能になる
2. 全機能について、受け入れ基準（AC）を満たす検証結果が得られる
3. SR ユーザーが拡張のインストールから操作開始まで 5 分以内に到達できる
4. Notion の DOM 変更に対して 1 週間以内に追従できる保守体制がある

---

## 2. Accessibility Principles

### 2.1 WCAG 準拠方針

本拡張が追加する機能は WCAG 2.2 Level AA に準拠することを目標とする。Notion 本体の不適合を完全に修正することは不可能だが、拡張が介入できる範囲で以下の原則を守る。

- **1.1 代替テキスト**: `alt` 属性が欠落した画像に仮テキストまたはユーザー設定ラベルを付与
- **1.3 適応可能**: セマンティックな role/aria-* を注入し、構造を SR に伝達
- **2.1 キーボード操作可能**: すべての機能にキーボードアクセスを提供
- **2.4 ナビゲーション可能**: ランドマーク、見出し階層、スキップリンクを補完
- **4.1 互換性**: ARIA Authoring Practices Guide（APG）に準拠したパターンを使用

### 2.2 ARIA 設計原則

1. **No ARIA is better than bad ARIA**: Notion が既に正しく実装している箇所には手を加えない
2. **First rule of ARIA**: ネイティブ HTML 要素で表現可能な場合は role 属性より HTML 要素を優先する（ただし Notion の DOM を書き換えるのは困難なため、role 付与が主な手段となる）
3. **Second rule of ARIA**: ネイティブセマンティクスを上書きしない（例: `<h1>` に `role="textbox"` が既にある場合、それを除去せず `aria-label` を補完する）
4. **すべてのインタラクティブ要素にアクセシブル名を付ける**: `aria-label` または `aria-labelledby` を使用
5. **状態変化を通知する**: `aria-expanded`, `aria-selected`, `aria-current`, `aria-live` を適切に管理

### 2.3 キーボード操作の原則

- Tab/Shift+Tab はランドマーク間移動に使う（ブロック単位の移動は別のキーに割り当て）
- 矢印キーはウィジェット内部のナビゲーション（ツリー、グリッド、メニュー）
- Enter はアクティベーション・編集開始
- Escape は編集終了・モーダル閉じ・元のコンテキストに戻る
- フォーカストラップはモーダル/ダイアログのみ。それ以外ではフォーカスは自由に移動可能

### 2.4 フォーカス制御の原則

1. フォーカスの現在位置を常に視覚・プログラムの両方で明示する
2. コンテキスト切替（モーダル開閉、ページ遷移）時はフォーカスを適切な要素に移す
3. フォーカスが失われる操作（要素の削除等）では直前の兄弟要素または親にフォーカスを退避

### 2.5 読み上げ最適化の原則

- 冗長な読み上げを避ける（装飾アイコン・空 div は `aria-hidden="true"` で隠す）
- ブロックタイプの読み上げ: 「見出し1 ブロック: テキスト内容」のように、タイプとコンテンツを分けて伝える
- `aria-roledescription` でカスタムロール名を提供（例: `aria-roledescription="テキストブロック"`）
- ライブリージョンの多用を避け、ユーザーアクションに対する応答のみ通知する

---

## 3. Target Platforms

### 3.1 ブラウザ

| ブラウザ | 優先度 | 備考 |
|---|---|---|
| Google Chrome（最新安定版） | 必須 | Manifest V3。メインターゲット |
| Microsoft Edge（Chromium） | 推奨 | Chrome 互換。動作確認のみ |
| Firefox | 将来 | WebExtension API 差分あり。MVP 外 |
| Safari | 対象外 | 拡張 API が異なる |

### 3.2 Notion の対象画面

| 画面・機能 | MVP | Beta | v1 |
|---|---|---|---|
| ページ閲覧（テキスト、見出し、リスト、トグル） | Yes | Yes | Yes |
| ブロック編集（テキスト入力、書式設定） | Yes | Yes | Yes |
| ページツリー（サイドバー） | Yes | Yes | Yes |
| 検索（Ctrl+K） | -- | Yes | Yes |
| データベース: テーブルビュー | -- | Yes | Yes |
| データベース: ボードビュー | -- | -- | Yes |
| データベース: カレンダービュー | -- | -- | Yes |
| データベース: ギャラリービュー | -- | -- | Yes |
| コメント・ディスカッション | -- | Yes | Yes |
| メンション（@ユーザー、@ページ） | -- | Yes | Yes |
| 共有・権限設定 | -- | -- | Yes |
| インポート / エクスポート | -- | -- | Yes |
| 設定画面 | -- | -- | Yes |
| モーダル / ダイアログ | -- | Yes | Yes |
| トースト通知 | -- | Yes | Yes |
| インライン DB・リンクド DB | -- | -- | Yes |

### 3.3 スクリーンリーダー別の差分方針

| SR | OS | 優先度 | 既知の差分 |
|---|---|---|---|
| NVDA | Windows | 必須（最優先） | 仮想バッファモードとフォーカスモードの切替が鍵。`contenteditable` 内ナビゲーションが壊れている。`role="application"` の使用を慎重に検討 |
| JAWS | Windows | 推奨 | NVDA と概ね同じだが、Forms Mode の自動切替ロジックが異なる。`aria-roledescription` のサポートを確認する |
| VoiceOver | macOS | 推奨 | Web ローターの見出し/リンク/ランドマーク一覧を活用。`aria-label` の読み上げ順に注意 |
| VoiceOver | iOS | 将来 | タッチ操作前提。MVP 外 |
| TalkBack | Android | 将来 | MVP 外 |

**SR 差分への対応方針:**

1. まず NVDA + Chrome で全機能を実装・検証する
2. JAWS/VoiceOver で壊れる箇所のみ、SR 検出ロジックで分岐する
3. SR 検出は User-Agent ではなく、実際の動作テストで判断する（SR 検出は技術的に困難なため、拡張の設定画面で使用 SR を選択させる）

---

## 4. Notion UI Inventory

### 4.1 現状の DOM/ARIA 実装状況

Notion は 2023 年末に基本的なアクセシビリティ改善を実施しているが、SR での実用には大きなギャップが残る。

#### 4.1.1 既に実装されているもの（拡張が壊さないように注意）

| 要素 | CSS セレクタ / Role | 現在の ARIA | 評価 |
|---|---|---|---|
| サイドバー | `nav.notion-sidebar-container` | `aria-label="サイドバー"` | 良好 |
| ページツリー | `[role="tree"]`, `[role="treeitem"]` | `aria-expanded` | 部分的（後述） |
| スキップリンク | `a[href="#main"]` | テキスト: "コンテンツにスキップ" | 良好 |
| メインコンテンツ | `main.notion-frame` | ランドマーク | 良好 |
| ヘッダー | `header` / `[role="banner"]` | ランドマーク | 良好 |
| サイドピーク | `div.notion-peek-renderer` | `role="region"`, `aria-label` | 良好 |
| リサイズハンドル | `[role="separator"]` | `aria-orientation`, `aria-valuemin/max/now`, `aria-label` | 良好 |
| ライブリージョン | `[role="status"]`, `[role="alert"]` | `aria-live`, `aria-atomic` | 良好 |
| 装飾アイコン | SVG / img | `aria-hidden="true"`（145要素） | 良好 |

#### 4.1.2 課題仮説マップ

以下に、Notion の主要コンポーネントごとの課題を整理する。深刻度は S（致命的: 機能が使えない）、A（重大: 大幅な回避策が必要）、B（中程度: 不便だが使える）、C（軽微: 改善が望ましい）で分類。

| # | コンポーネント | セレクタ候補 | 課題 | 深刻度 | 備考 |
|---|---|---|---|---|---|
| I-01 | ページツリー（treeitem） | `[role="treeitem"]` | `aria-selected` 未設定: 現在のページが SR に伝わらない | S | `aria-level` も未設定でネスト深度不明 |
| I-02 | ページツリー（treeitem） | `[role="treeitem"]` | treeitem の `aria-label` がボタンテキストと混在 | A | 「削除、名前の変更など...」が名前に含まれる |
| I-03 | ページツリー（キーボード） | `[role="tree"]` | Roving tabindex 未実装: Tab で全項目を辿る必要がある | S | 矢印キーナビゲーションがない |
| I-04 | ブロックコンテナ | `div.notion-selectable` | role なし、aria-label なし: ブロック種別が SR に伝わらない | S | 114 個以上の `data-block-id` 要素 |
| I-05 | テキストボックス | `[role="textbox"][contenteditable]` | `aria-label` なし: placeholder のみ（"見出し1" 等） | A | placeholder は信頼性の低いアクセシブル名ソース |
| I-06 | contenteditable | `[contenteditable="true"]` | NVDA の仮想バッファで内部ナビゲーション不能 | S | 矢印キー、行単位読みが壊れる |
| I-07 | トグルブロック | `[role="note"]` | `aria-expanded` 未設定、`aria-label` なし | A | 開閉状態が伝わらない |
| I-08 | カラムレイアウト | `div.notion-column_list-block` | role なし: レイアウト構造が SR に不可視 | B | 2カラム以上のレイアウト |
| I-09 | DB テーブルビュー | `div.notion-collection_view-block` | `role="table"/"grid"` なし: テーブル構造が SR に不可視 | S | row/cell/columnheader すべて欠落 |
| I-10 | DB ボードビュー | `div.notion-collection_view-block` | カンバン構造が SR に不可視 | S | ドラッグ&ドロップ依存 |
| I-11 | DB カレンダービュー | `div.notion-collection_view-block` | グリッド/日付構造が不可視 | S | 日付ナビゲーション不能 |
| I-12 | 画像の alt | `img` | 10/17（59%）の画像に alt テキストなし | A | |
| I-13 | ホバー依存 UI | ブロックドラッグハンドル、"+" ボタン | マウスホバーでのみ表示・フォーカス可能 | S | キーボードユーザーはアクセス不可 |
| I-14 | パンくずリスト | ヘッダー内 | `role="navigation"` / `aria-label="breadcrumb"` なし | B | |
| I-15 | 検索モーダル | Ctrl+K で起動 | ダイアログのフォーカス管理・結果一覧の読み上げ要検証 | A | |
| I-16 | コメントパネル | サイドピーク内 | コメント一覧のリスト構造・読み上げ順序が不明 | A | |
| I-17 | メンション | インライン要素 | @ユーザー/@ページの読み上げ・選択方法が不明 | A | |
| I-18 | モーダル全般 | 各種ダイアログ | フォーカストラップ・Escape 閉じ・復帰先の検証が必要 | A | 2023 年改善あり |
| I-19 | トースト通知 | `[role="status"]` / `[role="alert"]` | 実装済みだが通知タイミングと内容の精度が不明 | B | |
| I-20 | 共有ダイアログ | モーダル | 権限設定のラジオ/チェックボックスの状態通知が不明 | A | |
| I-21 | スラッシュコマンド | "/" 入力で起動 | メニューの role・aria-activedescendant の検証が必要 | A | キーボード入力は可能 |
| I-22 | インラインツールバー | テキスト選択時に表示 | ホバー/選択依存。SR での操作性が不明 | A | |
| I-23 | tabindex 過多 | 160 個の `tabindex="0"` | Tab 移動が非常に冗長 | A | スキップ機構がスキップリンク 1 つだけ |

---

## 5. Interaction & Keyboard Model

### 5.1 拡張が提供するショートカット

拡張は Notion のネイティブショートカットと衝突しないキーバインドを提供する。プレフィックスとして `Alt+Shift` を使用する（仮。設定で変更可能）。

| ショートカット | 機能 | コンテキスト |
|---|---|---|
| `Alt+Shift+S` | サイドバーにフォーカス移動 | どこからでも |
| `Alt+Shift+M` | メインコンテンツにフォーカス移動 | どこからでも |
| `Alt+Shift+H` | ヘッダー（パンくず）にフォーカス移動 | どこからでも |
| `Alt+Shift+B` | 現在のブロック情報を読み上げ | メインコンテンツ内 |
| `Alt+Shift+T` | ブロックタイプ一覧を読み上げ（現在ページの見出し構造） | メインコンテンツ内 |
| `Alt+Shift+N` | 次のブロックへ移動 | メインコンテンツ内 |
| `Alt+Shift+P` | 前のブロックへ移動 | メインコンテンツ内 |
| `Alt+Shift+D` | DB ビューのナビゲーションモード開始 | DB ビュー内 |
| `Alt+Shift+L` | ランドマーク一覧をポップアップ表示 | どこからでも |
| `Alt+Shift+/` | 拡張のヘルプ・ショートカット一覧 | どこからでも |

### 5.2 フォーカス移動規則

```
[スキップリンク] → [ヘッダー/パンくず] → [サイドバー] → [メインコンテンツ]
                                                              ↓
                                                    [ブロック1] → [ブロック2] → ...
                                                              ↓（Enter で編集モード）
                                                    [contenteditable 内]
                                                              ↓（Escape で編集終了）
                                                    [ブロック N に戻る]
```

**ブロック間移動:**

1. メインコンテンツにフォーカスがあるとき、上下矢印キーでブロック間を移動
2. 各ブロックのフォーカス時に、ブロックタイプとコンテンツの冒頭を読み上げ
3. Enter で編集モードに入り、Escape で抜ける（Notion ネイティブの挙動を活用）

**ツリービュー（サイドバー）:**

1. サイドバーにフォーカスしたら、上下矢印キーで treeitem 間を移動（roving tabindex を注入）
2. 右矢印キーで展開、左矢印キーで折りたたみ
3. Enter でページを開く
4. Home/End で先頭/末尾に移動

**DB テーブルビュー:**

1. `Alt+Shift+D` でグリッドナビゲーションモードに入る
2. 矢印キーでセル間を移動
3. 各セルのフォーカス時に「列名: 値」を読み上げ
4. Enter でセル編集、Escape で終了
5. Ctrl+Home/End でテーブルの先頭/末尾に移動

### 5.3 読み上げの粒度

| レベル | 読み上げ内容 | 例 |
|---|---|---|
| ランドマーク | ランドマーク名 | 「メインコンテンツ」「サイドバー ナビゲーション」 |
| ブロック（フォーカス時） | ブロックタイプ + コンテンツ冒頭 50 文字 | 「見出し2 ブロック: プロジェクト概要」 |
| ブロック（編集モード） | テキスト全文 + 書式情報 | 「太字 開始 重要 太字 終了 なテキスト」 |
| DB セル | 列名 + 値 | 「ステータス: 進行中」 |
| ツリー項目 | ページ名 + 展開状態 + 階層 | 「レベル2 プロジェクトA 折りたたみ」 |

---

## 6. DOM/ARIA Strategy

### 6.1 全体方針

```
Notion DOM → MutationObserver で監視 → 拡張の ARIA Injector が属性/要素を注入 → SR が読み取り
```

1. **content script** が Notion ページの DOM を監視
2. セレクタベースで対象要素を特定し、ARIA 属性を追加・修正
3. Notion の DOM 更新（SPA のページ遷移、ブロック追加等）に MutationObserver で追従
4. Shadow DOM は Notion が使用していないため対応不要（要再検証）

### 6.2 コンポーネント別 ARIA 注入戦略

#### 6.2.1 ページツリー（サイドバー）

**現状:** `role="tree"` / `role="treeitem"` / `aria-expanded` は存在。

**注入する属性:**

| 属性 | 値の決定方法 |
|---|---|
| `aria-selected="true/false"` | 現在の URL のパス or `notion-selectable` のハイライト状態から判定 |
| `aria-level="N"` | DOM のネスト深度（親 treeitem からの深さ）を算出 |
| `aria-label` | 子要素からページ名テキストのみを抽出し、ボタンテキスト（「削除、名前の変更など...」）を除外 |
| `tabindex` | Roving tabindex パターン: 現在選択中の項目のみ `tabindex="0"`、他は `tabindex="-1"` |

**キーボードイベント注入:**

- `keydown` リスナーで矢印キー・Home/End を処理
- `aria-activedescendant` は使わず、実際にフォーカスを移動する方式（roving tabindex）

#### 6.2.2 ブロックコンテナ

**現状:** `div.notion-selectable.notion-[type]-block` に role なし。

**注入する属性:**

| ブロックタイプ（CSS クラス） | 付与する role | aria-label / aria-roledescription |
|---|---|---|
| `notion-text-block` | `group` | `aria-roledescription="テキストブロック"` |
| `notion-header-block` | `group` | `aria-roledescription="見出し1ブロック"` |
| `notion-sub_header-block` | `group` | `aria-roledescription="見出し2ブロック"` |
| `notion-sub_sub_header-block` | `group` | `aria-roledescription="見出し3ブロック"` |
| `notion-bulleted_list-block` | `group` | `aria-roledescription="箇条書きブロック"` |
| `notion-numbered_list-block` | `group` | `aria-roledescription="番号付きリストブロック"` |
| `notion-to_do-block` | `group` | `aria-roledescription="チェックボックスブロック"` + `aria-checked` |
| `notion-toggle-block` | `group` | `aria-roledescription="トグルブロック"` + `aria-expanded` |
| `notion-callout-block` | `note` | `aria-roledescription="コールアウトブロック"` |
| `notion-quote-block` | `blockquote`（HTML 要素で可能なら） | `aria-roledescription="引用ブロック"` |
| `notion-code-block` | `group` | `aria-roledescription="コードブロック"` + `aria-label="言語: [lang]"` |
| `notion-image-block` | `figure` | `aria-label` にユーザー設定のキャプション or "画像" |
| `notion-divider-block` | `separator` | -- |
| `notion-page-block` | `link` | `aria-roledescription="ページリンク"` |
| `notion-collection_view-block` | 下記 6.2.4 参照 | -- |
| `notion-column_list-block` | `group` | `aria-roledescription="カラムレイアウト"` + `aria-label="N列"` |
| `notion-column-block` | `group` | `aria-roledescription="カラム"` + `aria-label="N列目"` |

#### 6.2.3 contenteditable 領域

**現状:** `role="textbox"` + `aria-multiline="true"` + `contenteditable="true"` だが `aria-label` なし。NVDA で内部ナビゲーション不能。

**戦略:**

1. **aria-label を追加**: ブロックタイプ + テキスト冒頭（例: `aria-label="見出し1: プロジェクト概要"`）
2. **NVDA の仮想バッファ問題への対処**: 以下の案を検証する（未確定。Open Questions 参照）

   - 案A: `role="application"` で囲み、拡張側でキーイベントをハンドリング → リスク: 仮想バッファが完全に無効になり、他のナビゲーションにも影響
   - 案B: 編集モード中のみ `role="application"` を付与し、Escape 時に除去 → 有望だが遷移のタイミングに注意
   - 案C: `aria-readonly` を活用し、閲覧モードと編集モードを明示的に切り替え
   - 案D: 読み上げ用の隠しテキスト（`aria-live` リージョン）にブロック内容をミラーリング → パフォーマンスリスク

3. **placeholder を aria-label で上書き**: `[role="textbox"]` に対し、内部テキストから `aria-label` を動的生成

#### 6.2.4 DB テーブルビュー

**現状:** `div.notion-collection_view-block` に role なし。セル・行・列すべて generic div。

**注入戦略:**

```
notion-collection_view-block
  → role="table" (or "grid" if editable)
  → aria-label="DB名: ビュー名"
  → aria-rowcount, aria-colcount

  ヘッダー行
    → role="row"
    → 各列ヘッダー → role="columnheader" + aria-sort (ソート時)

  データ行
    → role="row" + aria-rowindex
    → 各セル → role="cell" (table) or "gridcell" (grid)
              → aria-colindex
              → aria-label="列名: 値"
```

**課題:**

- Notion はスクロール時に DOM から行を削除・追加する仮想スクロールを使用している可能性が高い → `aria-rowcount` で全体数を伝え、`aria-rowindex` で位置を示す
- セルの値は多様（テキスト、セレクト、マルチセレクト、日付、チェック等）→ プロパティタイプごとにフォーマッタを用意

#### 6.2.5 ホバー依存 UI の対策

**現状:** ブロックのドラッグハンドル、"+" ボタン等はマウスホバーでのみ出現。

**戦略:**

1. CSS で `opacity` / `visibility` / `display` を上書きし、常時表示にする（ユーザー設定でオン/オフ可能）
2. または SR 向けの代替操作を提供: `Alt+Shift+A` でブロックアクションメニューを開く

### 6.3 MutationObserver 方針

```javascript
// 監視対象
const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    // 子要素の追加・削除
    if (mutation.type === 'childList') {
      processAddedNodes(mutation.addedNodes);
    }
    // 属性変更（aria-expanded 等の状態変化追従）
    if (mutation.type === 'attributes') {
      processAttributeChange(mutation);
    }
  }
});

// 監視設定
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'aria-expanded', 'aria-hidden', 'style']
});
```

**パフォーマンス対策:**

1. `requestIdleCallback` でバッチ処理（DOM 変更が頻繁な場合）
2. デバウンス: 同一要素への連続変更は 100ms でまとめる
3. セレクタのキャッシュ: querySelector の結果を WeakMap で保持
4. 監視範囲: `document.body` 全体ではなく、Notion のメインコンテナに限定可能か検証

### 6.4 DOMLock バイパス（実装済み）

**問題:** Notion の DOMLock（ContentEditableVoid / MaybeContentEditable）は、メインフレーム内の contenteditable 領域で MutationObserver を使い、拡張が注入した ARIA 属性を即座にリバートする。サイドバー（19ブロック）は影響なし。メインフレーム（95ブロック）の全属性が失われる。

**解決策:** `chrome.scripting.executeScript({ world: 'MAIN' })` で DOM ブリッジをページの MAIN ワールドに注入。ブリッジは `Element.prototype.setAttribute/removeAttribute` をパッチし、保護対象要素の ARIA 属性変更を無視する。

**アーキテクチャ:**
1. Service Worker が `chrome.scripting.executeScript` でブリッジコードを MAIN ワールドに注入
2. Content Script（Isolated World）が ARIA 属性を設定し、`accessible-notion-protect` CustomEvent を発火
3. MAIN ワールドのブリッジが CustomEvent をキャッチし、対象要素を WeakSet に登録
4. DOMLock が revert を試みると、パッチされた `setAttribute/removeAttribute` がブロック
5. Content Script の `setAttribute` 呼び出しは Isolated World なのでパッチの影響を受けない

**結果:** 114/114 ブロック（サイドバー19 + メインフレーム95）が正常に強化される。

### 6.5 Shadow DOM の扱い

Notion は Shadow DOM を使用していない（確認済み）。もし使用された場合:

1. `chrome.dom.openOrClosedShadowRoot()` API で Shadow Root を取得
2. Shadow Root 内に別の MutationObserver を設置
3. open Shadow DOM であれば content script から直接アクセス可能

---

## 7. Architecture

### 7.1 拡張構成

```
accessible-notion/
  src/
    manifest.json          # Manifest V3 (permissions: storage, management, scripting, webNavigation)
    content/
      main.ts              # エントリポイント。DOM 監視開始・モジュール初期化
      aria-injector.ts     # ARIA 属性注入ロジック (role, aria-label, aria-level 等)
      keyboard-handler.ts  # カスタムキーボードショートカット (Alt+Shift+*)
      focus-manager.ts     # フォーカス制御 (ランドマーク間移動、保存/復元)
      block-navigator.ts   # ブロック間ナビゲーション (次/前、見出しジャンプ、先頭/末尾)
      tree-enhancer.ts     # サイドバーツリー強化 (roving tabindex、タイプアヘッド)
      table-enhancer.ts    # DB テーブルビュー強化 (grid ARIA、矢印キーナビ、仮想スクロール)
      search-enhancer.ts   # 検索ダイアログ強化 (listbox/option、結果数読み上げ)
      comment-enhancer.ts  # コメント強化 (article ロール、Alt+J/K ナビ)
      modal-enhancer.ts    # モーダル/ダイアログ強化 (フォーカストラップ、トースト)
      live-announcer.ts    # aria-live による読み上げ通知
      dom-bridge.ts        # MAIN ワールド注入スクリプト (DOMLock バイパス)
      selectors.ts         # Notion DOM セレクタ定義（一元管理、28+ ブロックタイプ）
    background/
      service-worker.ts    # 拡張ライフサイクル + DOM ブリッジ注入
    shared/
      storage.ts           # chrome.storage ラッパー
      constants.ts         # 定数・設定型定義
      logger.ts            # デバッグログ
    _locales/
      ja/messages.json
      en/messages.json
    icons/                 # 拡張アイコン
  tests/
    unit/                  # Vitest ユニットテスト (53テスト)
  dist/                    # esbuild ビルド出力
  esbuild.config.mjs       # ビルド設定
    unit/                # 単体テスト
    e2e/                 # Playwright E2E テスト
  docs/                  # 追加ドキュメント（必要時）
```

### 7.2 manifest.json（ドラフト）

```json
{
  "manifest_version": 3,
  "name": "Accessible Notion",
  "version": "0.1.0",
  "description": "Notionをスクリーンリーダーに対応させるChrome拡張機能",
  "permissions": [
    "storage"
  ],
  "content_scripts": [
    {
      "matches": ["https://www.notion.so/*", "https://notion.so/*"],
      "js": ["src/content/main.js"],
      "css": ["src/content/styles.css"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "src/background/service-worker.js"
  },
  "options_page": "src/options/options.html",
  "icons": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  },
  "default_locale": "ja"
}
```

### 7.3 権限の最小化

| 権限 | 用途 | 必要性 |
|---|---|---|
| `storage` | ユーザー設定の保存 | 必須 |
| `activeTab` | 現在のタブのみにアクセス | 不要（content_scripts の matches で制限） |
| `tabs` | 不要 | 使用しない |
| `host_permissions` | 不要 | content_scripts の matches で代替 |

**データ方針:**

- 拡張はユーザーのNotionデータを一切読み取らない（DOM構造のみ操作）
- 外部サーバーへの通信は一切行わない
- `chrome.storage.local` に保存するのは設定値のみ（SR種別、ショートカットカスタマイズ、有効/無効フラグ等）

### 7.4 ビルドシステム

| ツール | 用途 |
|---|---|
| TypeScript | 型安全性 |
| esbuild or Vite | バンドル（高速ビルド） |
| ESLint + Prettier | コード品質 |
| Vitest | 単体テスト |
| Playwright | E2E テスト |

### 7.5 メッセージパッシング

```
content script ←→ background (service worker)
    ↕
options page ←→ background (service worker)
```

| メッセージ | 方向 | 用途 |
|---|---|---|
| `GET_SETTINGS` | content → background | 設定読み込み |
| `UPDATE_SETTINGS` | options → background | 設定変更 |
| `SETTINGS_CHANGED` | background → content | 設定変更通知 |
| `LOG_EVENT` | content → background | デバッグログ |

---

## 8. Feature Specs

### 8.1 F-01: サイドバーツリーの強化

**目的:** サイドバーのページツリーを SR で実用的にナビゲートできるようにする。

**仕様:**

1. 全 `[role="treeitem"]` に `aria-level` を付与（ネスト深度を算出）
2. 全 `[role="treeitem"]` に `aria-selected` を付与（現在ページ = `true`、他 = `false`）
3. `aria-label` をクリーンアップ（ページ名のみに整形）
4. Roving tabindex パターンを実装（矢印キー上下で項目移動、左右で展開/折りたたみ）
5. Home/End キーで先頭/末尾に移動
6. 文字キーで先頭一致検索（type-ahead）

**受け入れ基準（AC）:**

- [ ] AC-01: NVDA + Chrome でサイドバーにフォーカスし、下矢印キーを押すと次の treeitem に移動し、「ページ名、レベル N、折りたたみ」と読み上げられる
- [ ] AC-02: 右矢印キーで折りたたまれた項目を展開すると「展開」と読み上げられ、子項目が表示される
- [ ] AC-03: 左矢印キーで展開された項目を折りたたむと「折りたたみ」と読み上げられる
- [ ] AC-04: 現在開いているページの treeitem にフォーカスすると「選択済み」が読み上げに含まれる
- [ ] AC-05: Enter でページを開くとメインコンテンツにフォーカスが移動する
- [ ] AC-06: Home キーでツリーの最初の項目、End キーで最後の項目に移動する

**実装メモ:**

- `aria-level` は `.notion-sidebar-container` 内の treeitem のネスト構造から算出
- `aria-selected` は URL の pathname と treeitem 内の `<a>` の href を比較して判定
- roving tabindex の実装は WAI-ARIA APG Tree View パターンに従う

**テスト手順:**

1. 検証用の Notion ワークスペースに 3 階層のネストされたページツリーを作成
2. NVDA を起動し、Chrome で Notion を開く
3. `Alt+Shift+S` でサイドバーにフォーカス
4. 各 AC を順番に確認

---

### 8.2 F-02: ブロックナビゲーション

**目的:** メインコンテンツ内のブロックを SR で1つずつ移動・識別できるようにする。

**仕様:**

1. `div.notion-selectable` にブロックタイプに応じた `role` と `aria-roledescription` を付与
2. ブロック間移動のキーボードショートカットを提供（`Alt+Shift+N` / `Alt+Shift+P`）
3. ブロックにフォーカスした時、タイプとコンテンツ冒頭を読み上げ
4. ブロック一覧（見出し構造）を `Alt+Shift+T` で読み上げ

**受け入れ基準（AC）:**

- [ ] AC-01: `Alt+Shift+N` で次のブロックに移動し、「テキストブロック: [冒頭テキスト]」のように読み上げられる
- [ ] AC-02: `Alt+Shift+P` で前のブロックに移動する
- [ ] AC-03: 見出しブロックでは「見出し1ブロック: [タイトル]」と読み上げられる
- [ ] AC-04: トグルブロックでは展開状態が「折りたたみ」または「展開」として読み上げられる
- [ ] AC-05: `Alt+Shift+T` で現在ページの見出し構造が一覧読み上げされる
- [ ] AC-06: Enter でブロックの編集モードに入り、Escape で抜けられる

**実装メモ:**

- ブロックタイプの判定は CSS クラス `notion-[type]-block` のパターンマッチで行う
- `selectors.ts` にブロックタイプの正規表現マップを定義
- フォーカス移動は `element.focus()` + `aria-live` リージョンへの通知の二段構え

**テスト手順:**

1. 検証用ページに見出し1/2/3、テキスト、箇条書き、トグル、コールアウト、コード、引用、画像、区切り線を含むページを作成
2. NVDA + Chrome で開き、`Alt+Shift+M` でメインコンテンツにフォーカス
3. 各ブロックタイプを `Alt+Shift+N` で移動しながら読み上げを確認

---

### 8.3 F-03: contenteditable の読み上げ改善

**目的:** ブロック内のテキストを SR で読み上げ・ナビゲーション可能にする。

**仕様:**

1. `[role="textbox"]` に `aria-label` を動的付与（ブロックタイプ + テキスト冒頭）
2. 編集モード中のテキスト変更を `aria-live` で通知（デバウンス付き）
3. NVDA の仮想バッファ問題への対処（方式は検証後に確定。6.2.3 参照）

**受け入れ基準（AC）:**

- [ ] AC-01: テキストブロックにフォーカスすると、ブロック内のテキスト全文が読み上げられる
- [ ] AC-02: Enter で編集モードに入った後、文字入力すると入力した文字が読み上げられる
- [ ] AC-03: Escape で編集モードを終了すると、ブロックレベルに戻り「テキストブロック: [更新後テキスト]」と読み上げられる
- [ ] AC-04: 空のブロック（プレースホルダーのみ）ではプレースホルダーテキストが読み上げられる

**実装メモ:**

- `aria-label` はブロックの `textContent` から生成。50文字を超える場合は truncate + 「...以下省略」
- ライブリージョンへのミラーリングは `input` イベントを 300ms デバウンスして反映

**テスト手順:**

1. 複数のテキストブロック（空・短文・長文・書式付き）を含むページを準備
2. NVDA + Chrome で各ブロックの読み上げを確認
3. 編集モードに入り、文字入力・削除・書式変更を行い、読み上げを確認

---

### 8.4 F-04: DB テーブルビューのグリッドナビゲーション

**目的:** データベースのテーブルビューを SR でテーブルとして認識・ナビゲートできるようにする。

**仕様:**

1. `notion-collection_view-block` に `role="grid"` と `aria-label` を付与
2. ヘッダー行に `role="row"` + 子要素に `role="columnheader"` を付与
3. データ行に `role="row"` + `aria-rowindex` を付与
4. 各セルに `role="gridcell"` + `aria-colindex` + `aria-label="列名: 値"` を付与
5. `aria-rowcount` / `aria-colcount` を設定
6. 矢印キーでセル間移動（`Alt+Shift+D` でグリッドモード開始）
7. Ctrl+Home/End でテーブルの先頭/末尾に移動

**受け入れ基準（AC）:**

- [ ] AC-01: DB テーブルにフォーカスすると「[DB名] テーブル [行数]行 [列数]列」と読み上げられる
- [ ] AC-02: `Alt+Shift+D` でグリッドナビゲーションモードに入ると最初のセルにフォーカスが移動する
- [ ] AC-03: 右矢印キーで次の列、左矢印キーで前の列に移動し「[列名]: [値]」と読み上げられる
- [ ] AC-04: 下矢印キーで次の行に移動し、現在の列の値が読み上げられる
- [ ] AC-05: ヘッダー行に移動すると「列ヘッダー: [列名]」と読み上げられる
- [ ] AC-06: Escape でグリッドナビゲーションモードを終了する

**実装メモ:**

- Notion の仮想スクロールに対応: DOM にない行は `aria-rowcount` で全体数を示す
- セルの値はプロパティタイプ（テキスト、セレクト、日付、チェックボックス等）ごとにフォーマット
- DB 名はヘッダー領域のタイトル要素から取得

**テスト手順:**

1. 検証用ワークスペースに 5 列以上・10 行以上のテーブルビュー DB を作成（テキスト、セレクト、日付、チェックボックス、数値列を含む）
2. NVDA + Chrome でページを開き、DB テーブルに移動
3. グリッドモードに入り、各方向の矢印キー移動と読み上げを確認
4. 仮想スクロール境界（画面外の行に移動）での挙動を確認

---

### 8.5 F-05: ライブアナウンサー

**目的:** ユーザーアクションに対するフィードバックを SR で確実に読み上げる。

**仕様:**

1. ページ下部に非表示の `aria-live="polite"` リージョンを注入
2. ブロック移動、モード切替、設定変更等のイベントでテキストを更新
3. 重要な通知（エラー等）は `aria-live="assertive"` で即時読み上げ

**受け入れ基準（AC）:**

- [ ] AC-01: ブロック間移動時に「[ブロックタイプ]: [冒頭テキスト]」がポライトリージョンで読み上げられる
- [ ] AC-02: ページ遷移時に「[ページ名] を開きました」がポライトリージョンで読み上げられる
- [ ] AC-03: エラー発生時に「エラー: [メッセージ]」がアサーティブリージョンで即時読み上げられる
- [ ] AC-04: Notion のネイティブトースト通知がライブリージョン経由で読み上げられる

**実装メモ:**

- Notion 既存の `[role="status"]` / `[role="alert"]` と重複しないように、拡張独自のリージョンを追加
- テキスト更新後に一定時間で空文字に戻す（同じテキストの再通知を可能にするため）

**テスト手順:**

1. NVDA + Chrome で Notion を開く
2. 各種操作（ブロック移動、ページ遷移、設定変更）を実行し、読み上げを確認
3. Notion のトースト通知（コピー成功等）が読み上げられることを確認

---

### 8.6 F-06: 検索ダイアログの強化

**目的:** Ctrl+K で起動する検索モーダルを SR で操作可能にする。

**仕様:**

1. ダイアログに `aria-label="検索"` を付与（未設定の場合）
2. 検索結果リストに `role="listbox"` を付与
3. 各結果に `role="option"` + `aria-selected` を付与
4. フォーカストラップを確認（Notion が実装済みなら補完不要）
5. 結果数を `aria-live` で通知

**受け入れ基準（AC）:**

- [ ] AC-01: Ctrl+K で検索ダイアログが開き、「検索 ダイアログ」と読み上げられ、検索入力にフォーカスが移動する
- [ ] AC-02: 検索文字入力後、結果が更新されると「N件の結果」と読み上げられる
- [ ] AC-03: 上下矢印キーで結果を移動すると「[ページ名]」が読み上げられる
- [ ] AC-04: Enter で選択したページが開き、フォーカスがメインコンテンツに移動する
- [ ] AC-05: Escape でダイアログが閉じ、元のフォーカス位置に戻る

**実装メモ:**

- 検索ダイアログの DOM 構造は動的に生成されるため、MutationObserver で検出
- Notion が `role="dialog"` を既に付与している場合はそれを活用

**テスト手順:**

1. 検証用ワークスペースに 10 ページ以上を用意
2. NVDA + Chrome で Ctrl+K を押し、検索ワードを入力
3. 結果の読み上げ・矢印キー移動・Enter 選択・Escape 閉じを確認

---

### 8.7 F-07: コメント・ディスカッションの読み上げ

**目的:** ページ内のコメントスレッドを SR で閲覧・投稿できるようにする。

**仕様:**

1. コメントパネルに `aria-label="コメント"` を付与
2. 各コメントスレッドに `role="article"` を付与（投稿者名・日時・本文を含む）
3. コメント入力欄に `aria-label="コメントを入力"` を付与

**受け入れ基準（AC）:**

- [ ] AC-01: コメントパネルを開くと「コメント リージョン」と読み上げられる
- [ ] AC-02: 各コメントにフォーカスすると「[投稿者名] [日時] [本文冒頭]」が読み上げられる
- [ ] AC-03: コメント入力欄にフォーカスすると「コメントを入力 テキストボックス」と読み上げられる
- [ ] AC-04: 新しいコメントが追加されたとき、ライブリージョンで通知される

**実装メモ:**

- コメントパネルは `notion-peek-renderer` 内に表示される
- 新規コメントの検出は MutationObserver で行う

**テスト手順:**

1. 検証用ページに既存のコメントスレッド（3 件以上）を用意
2. NVDA + Chrome でコメントパネルを開き、各コメントの読み上げを確認
3. 新規コメントを投稿し、読み上げを確認

---

### 8.8 F-08: 設定画面（Options Page）

**目的:** 拡張の動作をユーザーが自分の SR 環境に合わせて調整できるようにする。

**仕様:**

1. 使用 SR の選択（NVDA / JAWS / VoiceOver / その他）
2. ショートカットキーのカスタマイズ
3. 読み上げの冗長度（最小 / 標準 / 詳細）
4. 各機能の有効/無効トグル
5. 言語設定（日本語 / 英語）
6. ホバー依存 UI の常時表示オン/オフ

**受け入れ基準（AC）:**

- [ ] AC-01: 設定画面がSRで完全にナビゲート可能（見出し、フォーム要素すべてにラベルあり）
- [ ] AC-02: SR 選択を変更し保存すると、即座に Notion タブに反映される
- [ ] AC-03: ショートカットキーを変更すると、次のキー操作から新しいバインドが有効になる
- [ ] AC-04: 冗長度を変更すると、読み上げの詳細さが変わる

**実装メモ:**

- options page 自体が WCAG 2.2 AA に完全準拠していること
- `chrome.storage.local` に設定を保存
- `chrome.storage.onChanged` で content script に通知

**テスト手順:**

1. 拡張の設定画面を開く
2. NVDA + Chrome で全設定項目を操作・保存
3. Notion タブに切り替えて設定が反映されていることを確認

---

## 9. Test Plan

### 9.1 検証環境の準備

#### 9.1.1 Notion ワークスペース（検証用）

以下の構成で検証用ワークスペースを作成する。

**ページツリー構造:**

```
検証ワークスペース/
  ページA（テキスト・見出しのみ）
  ページB（全ブロックタイプ）
    サブページB-1
      サブサブページB-1-1
    サブページB-2
  ページC（DB テスト用）
    テーブルビュー DB（5列 x 20行）
    ボードビュー DB
    カレンダービュー DB
  ページD（コメントテスト用）
    3件以上のコメントスレッド
  ページE（メンション・リンクテスト用）
    @ユーザーメンション
    @ページメンション
    外部リンク
  ページF（空ページ）
  ページG（長文ページ: 50ブロック以上）
```

**DB テーブルの列構成:**

| 列名 | プロパティタイプ |
|---|---|
| タスク名 | タイトル |
| ステータス | セレクト（未着手 / 進行中 / 完了） |
| 担当者 | ユーザー |
| 期限 | 日付 |
| 完了 | チェックボックス |
| 優先度 | セレクト（高 / 中 / 低） |
| 見積もり | 数値 |

#### 9.1.2 テスト用ブロック構成（ページB）

以下のブロックタイプを含むページを作成:

1. 見出し1
2. テキスト（通常テキスト）
3. テキスト（太字、イタリック、下線、取り消し線を含む）
4. 見出し2
5. 箇条書きリスト（3項目）
6. 番号付きリスト（3項目）
7. チェックボックスリスト（チェック済み・未済を含む）
8. 見出し3
9. トグルブロック（展開/折りたたみ）
10. コールアウトブロック
11. 引用ブロック
12. コードブロック（JavaScript）
13. 区切り線
14. 画像（キャプション付き）
15. 画像（キャプションなし）
16. 2カラムレイアウト
17. ページリンクブロック
18. 埋め込みブロック（YouTube等）

### 9.2 SR 別テストマトリクス

各機能 x 各 SR の組み合わせでテストを実施する。

| 機能 | NVDA + Chrome | JAWS + Chrome | VoiceOver + Chrome | 優先度 |
|---|---|---|---|---|
| F-01: サイドバーツリー | MVP | Beta | Beta | 高 |
| F-02: ブロックナビゲーション | MVP | Beta | Beta | 高 |
| F-03: contenteditable 読み上げ | MVP | Beta | Beta | 高 |
| F-04: DB テーブルグリッド | Beta | v1 | v1 | 中 |
| F-05: ライブアナウンサー | MVP | Beta | Beta | 高 |
| F-06: 検索ダイアログ | Beta | v1 | v1 | 中 |
| F-07: コメント読み上げ | Beta | v1 | v1 | 中 |
| F-08: 設定画面 | MVP | Beta | Beta | 高 |

### 9.3 手動テスト手順テンプレート

各テストケースは以下のフォーマットで記録する。

```markdown
## テストケース: [TC-ID] [タイトル]

- 前提条件: [必要な状態]
- SR: [使用するSR]
- ブラウザ: [バージョン]
- 拡張バージョン: [バージョン]

### 手順

1. [操作1]
2. [操作2]
3. ...

### 期待結果

- [読み上げ内容 / フォーカス位置 / 表示状態]

### 実際の結果

- [ ] Pass / Fail
- 読み上げ内容: [実際の読み上げ]
- 備考: [差分や気づき]
```

### 9.4 自動テスト方針

#### 9.4.1 単体テスト（Vitest）

- `aria-injector.ts` の各関数: 入力 DOM → 出力 ARIA 属性の正しさ
- `selectors.ts`: セレクタが想定要素にマッチするか
- `keyboard-handler.ts`: キーイベントのディスパッチ
- `focus-manager.ts`: フォーカス移動ロジック

テスト環境は jsdom を使用し、Notion の DOM 構造をモックする。

#### 9.4.2 E2E テスト（Playwright）

- Playwright で Chrome + 拡張をロードし、Notion にアクセス
- DOM の ARIA 属性が正しく注入されているかをアサート
- キーボード操作でフォーカスが正しく移動するかをアサート

**注意:** Playwright は SR の読み上げを直接テストできない。ARIA 属性の正しさのみを自動テストし、実際の読み上げは手動テストで確認する。

#### 9.4.3 アクセシビリティ自動チェック

- `@axe-core/playwright` を E2E テストに組み込み、WCAG 2.2 AA 違反を自動検出
- 拡張の options page に対しても axe-core チェックを実行

### 9.5 回帰テストの自動化

Notion の DOM 変更を検出するための仕組み:

1. **DOM スナップショットテスト**: 主要コンポーネントの DOM 構造をスナップショットとして保存し、変更を検出
2. **セレクタ検証テスト**: `selectors.ts` の全セレクタが実際の Notion ページでマッチするかを定期実行
3. **CI パイプライン**: PR ごとにユニットテスト + axe-core チェックを実行

---

## 10. Risk & Mitigation

### 10.1 リスク一覧

| # | リスク | 影響度 | 発生確率 | 緩和策 |
|---|---|---|---|---|
| R-01 | Notion の DOM 構造が予告なく変更される | 高 | 高 | セレクタを `selectors.ts` に一元管理。セレクタ検証の定期実行（週次）。フォールバック処理の実装 |
| R-02 | MutationObserver のパフォーマンス問題 | 中 | 中 | デバウンス、`requestIdleCallback`、監視範囲の限定。大量 DOM 変更時のスロットリング |
| R-03 | Notion のネイティブキーショートカットとの競合 | 中 | 中 | `Alt+Shift` プレフィックスで回避。設定画面でカスタマイズ可能に |
| R-04 | SR ごとの読み上げ差異 | 中 | 高 | NVDA を最優先で実装。SR 選択設定で分岐ロジックを用意 |
| R-05 | contenteditable 内のナビゲーション問題が解決できない | 高 | 中 | 複数のアプローチ（6.2.3 の案A〜D）を検証。最悪の場合、読み取り専用の代替 UI を提供 |
| R-06 | Chrome 拡張の Manifest V3 制限 | 低 | 低 | content script + service worker で完結する設計。Web Request API は不使用 |
| R-07 | Notion がアクセシビリティを大幅改善し、拡張と競合する | 低 | 低 | 拡張の各機能を個別にオン/オフ可能に。Notion が改善した箇所は拡張を無効化 |
| R-08 | ユーザーの Notion データが意図せず露出する | 高 | 低 | DOM 操作のみ。外部通信なし。`storage` 権限のみ。コードレビューで確認 |
| R-09 | 拡張が Notion のパフォーマンスを低下させる | 中 | 中 | パフォーマンスプロファイリング。ユーザーが重い機能を個別にオフにできる設定 |
| R-10 | Notion の CSP（Content Security Policy）で拡張のコードが制限される | 中 | 低 | Manifest V3 の content script は CSP の影響を受けにくいが、要検証 |

### 10.2 セキュリティ方針

1. 拡張は notion.so / www.notion.so のみで動作（manifest の matches で制限）
2. 外部サーバーへの通信は一切行わない
3. ユーザーの Notion コンテンツを保存・送信しない
4. `chrome.storage.local` に保存するのは設定値のみ
5. 拡張のコードはすべてオープンソースとして公開

### 10.3 プライバシー方針

1. 拡張が読み取る DOM 情報は ARIA 属性の注入に必要な最小限（要素のクラス名、テキストコンテンツ、属性値）
2. テレメトリデータは収集しない（11章の方針参照）
3. ユーザーが拡張を無効化すると、注入した ARIA 属性はすべて除去される

---

## 11. Telemetry / Debug

### 11.1 テレメトリ方針

**外部送信は一切行わない。** 以下はすべてローカルのみ。

### 11.2 デバッグログ

1. 拡張内部のログは `console.debug()` で出力（通常は非表示。DevTools で確認可能）
2. ログレベル: `error` / `warn` / `info` / `debug`
3. 設定画面で「デバッグモード」をオンにすると `debug` レベルのログが有効になる
4. ログフォーマット: `[AccessibleNotion][モジュール名] メッセージ`

```
[AccessibleNotion][AriaInjector] ブロック追加検出: notion-header-block (data-block-id: abc123)
[AccessibleNotion][FocusManager] フォーカス移動: サイドバー → メインコンテンツ
[AccessibleNotion][KeyboardHandler] ショートカット検出: Alt+Shift+N
```

### 11.3 問題報告の仕組み

1. 設定画面に「問題を報告」ボタンを設置
2. ボタンを押すと以下の情報を収集し、クリップボードにコピーする（外部送信はしない）:
   - 拡張バージョン
   - Chrome バージョン
   - OS 情報（navigator.userAgent）
   - 使用 SR（設定値）
   - 有効な機能フラグ
   - 直近のエラーログ（最大 50 行。ユーザー確認後にコピー）
3. ユーザーはコピーした情報を GitHub Issues に貼り付けて報告する

**注意:** 問題報告にはNotionのコンテンツは一切含めない。DOM 構造やテキストは除外する。

### 11.4 セレクタ破損の検出

Notion の DOM 変更で拡張のセレクタが壊れた場合:

1. content script 起動時にコアセレクタの存在チェックを実行
2. セレクタが見つからない場合、`aria-live="assertive"` で「Accessible Notion: 一部の機能が動作していません。Notion の更新により互換性の問題が発生した可能性があります」と通知
3. エラーログに詳細を記録

---

## 12. Roadmap

### 12.1 フェーズ定義

| フェーズ | 期間（目安） | 目標 |
|---|---|---|
| MVP | 4-6 週間 | NVDA + Chrome で「ページ閲覧・ブロック移動・サイドバー操作」が可能 |
| Beta | 4-6 週間 | 検索・DB テーブル・コメント対応。JAWS/VoiceOver 基本動作 |
| v1.0 | 4-6 週間 | DB 全ビュー・メンション・モーダル対応。3 SR で全機能動作 |

### 12.2 MVP（Minimum Viable Product）

**目標:** NVDA + Chrome で Notion の基本操作が可能。

**含まれる機能:**

1. F-01: サイドバーツリーの強化
2. F-02: ブロックナビゲーション
3. F-03: contenteditable の読み上げ改善
4. F-05: ライブアナウンサー
5. F-08: 設定画面（基本設定のみ）

**マイルストーン:**

- [x] M-01: プロジェクトセットアップ（ビルド、テスト、CI） ✅ esbuild + Vitest + TypeScript
- [x] M-02: selectors.ts の作成と Notion DOM マッピング完了 ✅ 28+ ブロックタイプ対応
- [x] M-03: F-01（サイドバー）実装 ✅ roving tabindex、矢印キー、タイプアヘッド検索
- [x] M-04: F-02（ブロックナビゲーション）実装 ✅ Alt+Shift+N/P、見出しジャンプ(J/K/1/2/3)、先頭末尾(Home/End)
- [ ] M-05: F-03（contenteditable）実装 — NVDA 仮想バッファ問題の調査中
- [x] M-06: F-05（ライブアナウンサー）実装 ✅ polite/assertive リージョン
- [ ] M-07: F-08（設定画面）実装 — 未着手
- [ ] M-08: MVP 統合テスト完了
- [ ] M-09: Chrome Web Store に限定公開（テスター向け）

### 12.3 Beta

**目標:** 主要な SR で主要機能が動作。外部テスターからフィードバック収集。

**追加機能:**

1. F-04: DB テーブルグリッドナビゲーション
2. F-06: 検索ダイアログの強化
3. F-07: コメント・ディスカッションの読み上げ
4. モーダル/ダイアログのフォーカス管理強化
5. トースト通知の読み上げ改善

**マイルストーン:**

- [x] M-10: F-04（DB テーブル）基本実装 ✅ grid/row/cell ARIA、矢印キーナビ、仮想スクロール対応
- [x] M-11: F-06（検索）基本実装 ✅ listbox/option ロール、Notion ハイライト同期、結果数読み上げ
- [x] M-12: F-07（コメント）基本実装 ✅ article ロール、Alt+J/K ナビ、新規コメント通知
- [x] M-10b: モーダル強化 ✅ フォーカストラップ、トースト読み上げ
- [ ] M-13: JAWS テスト・差分対応
- [ ] M-14: VoiceOver テスト・差分対応
- [ ] M-15: Beta 版公開・フィードバック収集

### 12.4 v1.0

**目標:** 全機能が 3 SR で動作。Chrome Web Store に一般公開。

**追加機能:**

1. DB ボード/カレンダー/ギャラリービュー
2. メンション（@ユーザー、@ページ）
3. 共有・権限設定画面
4. インポート/エクスポート画面
5. 設定画面（全機能）
6. インライン DB・リンクド DB

---

## 13. Open Questions

### 13.1 未確定事項リスト

| # | 質問 | 影響する機能 | 調査方法 | ステータス |
|---|---|---|---|---|
| Q-01 | NVDA の仮想バッファ問題に対する最適なアプローチはどれか（6.2.3 の案A〜D） | F-03 | NVDA + Chrome で各案のプロトタイプを作成し検証。NVDA のフォーカスモード/ブラウズモード切替を実測 | 未着手 |
| Q-02 | Notion は Shadow DOM を使用しているか | 全機能 | Chrome DevTools で全要素を調査。`document.querySelectorAll('*')` で Shadow Root の有無を確認 | **確認済み: 不使用** |
| Q-03 | Notion の仮想スクロール実装の詳細（何行分の DOM を保持するか、スクロールイベントの発火タイミング） | F-04 | 大量行の DB で DOM 要素数を監視。IntersectionObserver のログを取得 | **対応済み: MutationObserver で動的行を再強化** |
| Q-04 | `aria-roledescription` の JAWS / VoiceOver でのサポート状況 | F-02, F-04 | 各 SR で `aria-roledescription` 付きの要素を読み上げテスト | 未着手 |
| Q-05 | Notion がキーボードイベントを preventDefault しているキーの一覧 | F-01, F-02, F-04 | 全キーバインドを試行し、拡張のハンドラーに到達するか確認。Notion のキーボードショートカット一覧と照合 | 未着手 |
| Q-06 | Notion の SPA 遷移時に DOM がどの程度再構築されるか（全面 or 差分） | 全機能 | MutationObserver で遷移時の mutations 数・範囲を計測 | **対応済み: URL ポーリング + 800ms 遅延 rescan** |
| Q-07 | 検索ダイアログ（Ctrl+K）の DOM 構造の詳細 | F-06 | DevTools で実際のダイアログ DOM を調査 | **対応済み: role=dialog 検出 + listbox/option 注入** |
| Q-08 | コメントパネルの DOM 構造の詳細 | F-07 | DevTools で実際のコメント DOM を調査 | **対応済み: side-peek 内の comment 検出** |
| Q-09 | `Alt+Shift` プレフィックスが他の主要拡張やOS機能と競合しないか | 全機能 | Windows / macOS で `Alt+Shift` の既存割り当てを調査。特に IME 切替との競合 | 未着手 |
| Q-10 | Notion のアップデート頻度と DOM 変更の傾向 | 保守計画 | Notion のリリースノートを過去 6 ヶ月分調査。DOM スナップショットの差分を追跡 | 未着手 |
| Q-11 | Chrome Web Store の審査でアクセシビリティ拡張に特有の要件があるか | リリース | Chrome Web Store のポリシードキュメントを調査 | 未着手 |
| Q-12 | NVDA アドオンとして実装した方が効果的な機能はあるか（Chrome 拡張の限界） | アーキテクチャ | NVDA アドオン API の調査。Chrome 拡張でカバーできない SR 制御があるか確認 | 未着手 |
| Q-13 | `role="application"` を使用した場合、NVDA のブラウズモードショートカット（H, T, K 等）が無効化されることの影響 | F-03 | プロトタイプで実測。ユーザーテストで受容性を確認 | 未着手 |

### 13.2 調査の優先順位

以下の順序で未確定事項を解消する（MVP ブロッカーを最優先）:

1. **Q-01**: contenteditable の方針確定（MVP の成否を左右する最重要項目）
2. **Q-05**: キーボードイベントの到達性（ショートカット設計に直結）
3. **Q-09**: `Alt+Shift` プレフィックスの競合確認（IME 切替との競合は致命的）
4. **Q-02**: Shadow DOM の有無確認
5. **Q-06**: SPA 遷移の DOM 再構築パターン
6. **Q-03**: 仮想スクロールの実装詳細
7. **Q-04**: `aria-roledescription` のサポート状況
8. 残りの項目

---

## 付録 A: 参考資料

| 資料 | URL | 備考 |
|---|---|---|
| WAI-ARIA Authoring Practices Guide | https://www.w3.org/WAI/ARIA/apg/ | ウィジェットパターンの実装参考 |
| WCAG 2.2 | https://www.w3.org/TR/WCAG22/ | 準拠目標 |
| Chrome Extensions Manifest V3 | https://developer.chrome.com/docs/extensions/mv3/ | 拡張 API リファレンス |
| NVDA User Guide | https://www.nvaccess.org/files/nvda/documentation/userGuide.html | SR の動作理解 |
| Notion Keyboard Shortcuts | https://www.notion.so/help/keyboard-shortcuts | 競合回避のためのリファレンス |
| James Scholes: Notion Accessibility Observations | https://gist.github.com/jscholes/bcecd80563791864c8bcc262bdbb668b | 課題分析の元データ |
| IXD@Pratt: Assessing the Accessibility of Notion | https://ixd.prattsi.org/2024/12/assessing-the-accessibility-of-notion/ | 学術的な評価 |

## 付録 B: 用語集

| 用語 | 定義 |
|---|---|
| SR（Screen Reader） | スクリーンリーダー。画面内容を音声で読み上げるソフトウェア |
| 仮想バッファ | NVDA/JAWS が Web ページの DOM を解析して構築する内部表現。矢印キーで行単位の移動が可能 |
| ブラウズモード | SR がキーボード入力をナビゲーションに使うモード（H で見出し移動等） |
| フォーカスモード | SR がキーボード入力をそのままアプリに渡すモード（フォーム入力等） |
| Roving tabindex | ウィジェット内の1要素のみ `tabindex="0"` にし、他を `tabindex="-1"` にするフォーカス管理パターン |
| ライブリージョン | `aria-live` 属性が設定された領域。内容が変更されると SR が自動的に読み上げる |
| contenteditable | HTML 要素を直接編集可能にするブラウザ API。Notion のエディタの基盤技術 |
| APG | ARIA Authoring Practices Guide。ARIA パターンの実装ガイドライン |

---

> **次のアクション:**
> 1. Q-01: contenteditable の NVDA 仮想バッファ問題の調査・解決（MVP 最大のブロッカー）
> 2. Q-05: Notion の preventDefault キー調査（ショートカット競合の確認）
> 3. Q-09: Alt+Shift プレフィックスの IME 競合確認
> 4. 設定画面（F-08）の実装
> 5. NVDA での実機テスト（全機能の統合検証）
