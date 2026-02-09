# CLAUDE.md — Accessible Notion プロジェクト指示書

> このファイルは Claude Code がプロジェクトで作業する際のルール・規約・ワークフローを定義する。
> すべての作業はこのファイルに従うこと。

---

## 1. プロジェクト概要

- **名前**: accessible-notion
- **目的**: Notion Web をスクリーンリーダー対応にする Chrome 拡張機能
- **設計ドキュメント**: `DOCUMENTATION.md`（実装・テスト・運用の唯一の起点）
- **リポジトリ**: GitHub プライベートリポジトリ `Gashin0601/accessible-notion`

---

## 2. コミットルール

### 2.1 必ずコミットするタイミング

以下のタイミングで **必ず** コミットすること。作業をコミットせずに放置してはならない。

1. **ファイルの新規作成・編集が完了したとき** — 即座にコミット
2. **機能の実装が1単位完了したとき** — 動作する最小単位でコミット
3. **バグ修正が完了したとき** — 修正ごとに1コミット
4. **ドキュメントの更新をしたとき** — ドキュメント変更は独立したコミット
5. **設定ファイル・ビルド設定の変更をしたとき** — 独立したコミット
6. **テストの追加・修正をしたとき** — テスト変更は独立したコミット
7. **セッション終了前** — 未コミットの変更がある場合は必ずコミットしてからセッションを終える

### 2.2 コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/) に従う。

```
<type>(<scope>): <description>

[optional body]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**type の種類:**

| type | 用途 |
|---|---|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | コードの意味に影響しない変更（空白、フォーマット等） |
| `refactor` | バグ修正でも機能追加でもないコード変更 |
| `test` | テストの追加・修正 |
| `chore` | ビルドプロセス、補助ツール、ライブラリの変更 |
| `perf` | パフォーマンス改善 |
| `ci` | CI/CD 設定の変更 |

**scope の例:** `sidebar`, `block-nav`, `aria-injector`, `db-table`, `options`, `build`, `docs`

**例:**

```
feat(sidebar): add roving tabindex to page tree navigation

Implement arrow key navigation for sidebar treeitem elements
following WAI-ARIA APG Tree View pattern.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### 2.3 コミット粒度

- **1コミット = 1論理変更** を厳守する
- 複数の無関係な変更を1コミットにまとめない
- ファイル単位ではなく **変更の意図** 単位でコミットする
- `git add -A` は使わない。変更ファイルを個別に `git add` する

### 2.4 プッシュルール

- コミット後は **必ず `git push` する**（ローカルに溜めない）
- force push (`git push --force`) は **禁止**（`--force-with-lease` のみ許可、かつユーザー確認必須）
- `main` ブランチへの直接プッシュは許可（個人プロジェクトのため）。ただし機能単位のブランチ運用を推奨

---

## 3. Claude in Chrome のフル活用

### 3.1 基本方針

Claude in Chrome（ブラウザ自動操作ツール）を **最大限活用** してテスト・検証・デバッグを行うこと。手動で確認する前に、まず Claude in Chrome で自動確認を試みる。

### 3.2 活用すべきシーン

| シーン | 具体的な操作 |
|---|---|
| **DOM 構造の調査** | Notion を開いて `read_page` / `javascript_tool` で DOM を直接確認 |
| **ARIA 属性の検証** | 拡張インストール後に `javascript_tool` で `getAttribute('role')` 等を確認 |
| **拡張の動作確認** | `chrome://extensions` で拡張をロードし、Notion で動作を検証 |
| **スクリーンショット** | 操作前後の `screenshot` で視覚的な変化を記録 |
| **キーボード操作テスト** | `computer` ツールの `key` アクションでショートカットキーをテスト |
| **フォーカス確認** | `javascript_tool` で `document.activeElement` を確認 |
| **コンソールログ確認** | `read_console_messages` で拡張のデバッグログを確認 |
| **ネットワーク確認** | `read_network_requests` で不正な外部通信がないことを確認 |
| **GIF 記録** | テスト操作を `gif_creator` で記録し、検証エビデンスを残す |

### 3.3 拡張の自動ロード・テストフロー

以下のフローを標準的なテスト手順として使用する。

#### ステップ 1: 拡張のビルド

```bash
# プロジェクトルートで
npm run build
```

#### ステップ 2: Chrome に拡張をロード（Claude in Chrome で自動化）

1. `tabs_context_mcp` でタブ情報を取得
2. `navigate` で `chrome://extensions` に移動
3. 「デベロッパーモード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」で `dist/` フォルダを指定
5. 拡張が正常にロードされたことを確認

#### ステップ 3: Notion で動作検証

1. `tabs_create_mcp` で新しいタブを作成
2. `navigate` で Notion の検証用ページに移動
3. `read_page` で ARIA 属性が注入されていることを確認
4. `computer` ツールでキーボード操作をテスト
5. `javascript_tool` でフォーカス位置、aria 属性値を検証
6. `read_console_messages` で拡張のログを確認
7. 問題があれば `screenshot` でエビデンスを取得

#### ステップ 4: 結果の記録

1. テスト結果を `gif_creator` で GIF として保存（重要な操作フローの場合）
2. 問題発見時は Issue を作成するか DOCUMENTATION.md の該当箇所を更新

### 3.4 Chrome in Chrome で確認すべき定型チェック

コード変更後、以下のチェックを毎回実行すること。

```javascript
// 1. 拡張がエラーなくロードされているか
// chrome://extensions で赤いエラーバッジがないことを確認

// 2. content script が Notion に注入されているか
// Notion タブで以下を実行
document.querySelector('[data-accessible-notion]') !== null

// 3. ARIA 属性が注入されているか（例: サイドバー）
document.querySelectorAll('[role="treeitem"][aria-level]').length > 0

// 4. ライブリージョンが存在するか
document.querySelector('[data-accessible-notion-live]') !== null

// 5. コンソールにエラーがないか
// read_console_messages でエラーパターンをフィルタ

// 6. 外部通信がないか
// read_network_requests で notion.so 以外へのリクエストがないことを確認
```

---

## 4. 開発ワークフロー

### 4.1 機能実装フロー

```
1. DOCUMENTATION.md の Feature Spec を確認
2. ブランチを作成（推奨: feat/<feature-name>）
3. 実装
4. ユニットテスト作成・実行
5. ビルド
6. Claude in Chrome で拡張をロード・動作確認
7. 受け入れ基準（AC）を1つずつ検証
8. コミット・プッシュ
9. 全 AC を満たしたらマージ
```

### 4.2 バグ修正フロー

```
1. Claude in Chrome で問題を再現・スクリーンショット取得
2. ブランチを作成（推奨: fix/<bug-description>）
3. 修正
4. Claude in Chrome で修正確認
5. コミット・プッシュ
```

### 4.3 ドキュメント更新フロー

```
1. DOCUMENTATION.md または CLAUDE.md を更新
2. 独立したコミット（type: docs）
3. プッシュ
```

---

## 5. コーディング規約

### 5.1 言語・フレームワーク

- **TypeScript** 厳格モード（`strict: true`）
- **Manifest V3** の Chrome Extensions API
- **esbuild** or **Vite** でバンドル

### 5.2 ファイル構成

`DOCUMENTATION.md` の 7.1 節に定義されたディレクトリ構造に従う。

### 5.3 セレクタ管理

- Notion の DOM セレクタは **すべて `src/content/selectors.ts` に一元管理** する
- セレクタをコード中にハードコードしてはならない
- セレクタ変更時は `selectors.ts` のみを修正し、他のファイルは影響を受けないようにする

```typescript
// Good
import { SELECTORS } from './selectors';
document.querySelectorAll(SELECTORS.TREE_ITEM);

// Bad
document.querySelectorAll('[role="treeitem"]');
```

### 5.4 ARIA 属性の付与ルール

- 拡張が注入した要素・属性には `data-accessible-notion` 属性を付与し、識別可能にする
- Notion が既に付与している正しい ARIA 属性は上書きしない
- `aria-label` の値にはユーザーコンテンツの冒頭50文字までを含めてよい（それ以上は省略）

### 5.5 エラーハンドリング

- content script のトップレベルで `try-catch` で囲む（拡張のエラーで Notion が壊れないように）
- エラーは `console.error('[AccessibleNotion]', error)` でログ出力
- ユーザーへの通知が必要なエラーは `aria-live="assertive"` リージョンで読み上げ

---

## 6. セキュリティ・プライバシー

- 外部サーバーへの通信は **一切禁止**
- ユーザーの Notion コンテンツを `chrome.storage` に保存しない
- `permissions` は `storage` のみ。追加権限が必要な場合はユーザー確認必須
- コードレビュー時にネットワークリクエストの有無を必ず確認

---

## 7. テスト要件

### 7.1 ユニットテスト

- `Vitest` を使用
- カバレッジ目標: 80% 以上（`src/content/` 配下）
- テストファイルは `tests/unit/` に配置

### 7.2 E2E テスト

- `Playwright` を使用
- `@axe-core/playwright` でアクセシビリティ自動チェック
- テストファイルは `tests/e2e/` に配置

### 7.3 Claude in Chrome テスト

- 実装完了後は必ず Claude in Chrome で Notion 上の動作確認を行う
- 手動 SR テスト（NVDA）は人間が実施。Claude in Chrome は DOM/ARIA の正しさを検証する役割

---

## 8. ブランチ戦略

- `main`: 安定版。常にビルド可能な状態を維持
- `feat/<name>`: 機能開発ブランチ
- `fix/<name>`: バグ修正ブランチ
- `docs/<name>`: ドキュメント更新ブランチ

個人プロジェクトのため、`main` への直接コミットも許可するが、機能単位のブランチ運用を推奨する。

---

## 9. 依存関係管理

- `package.json` の依存関係は最小限に保つ
- 新しいパッケージの追加時は用途と必要性をコミットメッセージに記載
- セキュリティ脆弱性のあるパッケージは即時更新

---

## 10. 重要なリマインダー

1. **毎回コミットすること** — 変更をローカルに溜めない
2. **Claude in Chrome をフル活用すること** — DOM 確認、ARIA 検証、キーボードテスト、スクリーンショット、GIF 記録
3. **DOCUMENTATION.md が正（single source of truth）** — 実装はドキュメントに従う。ドキュメントと実装が乖離したらドキュメントを先に更新する
4. **セレクタは selectors.ts に一元管理** — ハードコード禁止
5. **外部通信禁止** — ネットワークリクエストを追加しない
6. **拡張のエラーで Notion を壊さない** — 防御的プログラミング
