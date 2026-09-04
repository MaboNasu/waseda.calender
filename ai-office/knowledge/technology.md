<!--
version: 1.0.0
last_updated: 2026-09-04
source: AI Office 初期整備。CLAUDE.mdより抽出・要約(重複管理を避けるため詳細はCLAUDE.md本体を参照)。
-->

# Technology

**このファイルは要約。最新かつ詳細な技術情報は必ず `../CLAUDE.md`(サイト本体)を
参照すること。** 内容が食い違う場合はCLAUDE.mdを優先する(このファイルは古くなりうる)。

すべて **[FACT, source: CLAUDE.md]**、理由が判明しているものは付記する。

## フロントエンド

フレームワーク・バンドラーなし。素のHTML/CSS/JavaScript、ビルドステップなし。
**理由**: 非エンジニアのOwnerでも把握・編集しやすいシンプルな構成を維持するため。

## データ

`events.js`(`const EVENTS = [...]`)と`organizations.js`(`const ORGANIZATIONS = [...]`、
504団体)の2つのJS配列がsource of truth。データベースではなくファイル直書き。

## 静的生成

`generate-event-pages.js` / `generate-org-pages.js` / `generate-sitemap.js`が
`event/*.html` / `org/*.html` / `sitemap.xml`を生成する。events.js/organizations.js
編集のたびに再実行が必要(出力ディレクトリを毎回全消去して再構築する仕様)。

## 二重レンダリング(重要な技術的注意点)

同じ内容を「クライアント側(script.js等、ブラウザで実行時に描画)」と
「Node側(生成スクリプト、ビルド時に静的HTML生成)」の2箇所で独立に実装している。
**理由**: JSを実行しないクローラー/リンクプレビューボットにも正しい内容を見せるため。
片方だけ修正すると表示不整合が起きる既知のリスクがある。

## アセットバージョニング

全HTMLファイルの`<script src>`/`<link>`に`?v=N`形式のキャッシュバスティングが
付与されており、共有アセットを変更する際は全ファイルで一括置換+バージョン番号の
更新が必要。単一の定義箇所は存在しない。

## Git/GitHub・ホスティング

GitHub Pagesでホスティング。ビルドステップなし(リポジトリの内容がそのまま配信される)。

## GitHub Actions(自動化)

- `check-sources.yml`: 毎晩(JST 03:00)ソースサイトの変更検知、`sources.json`を
  更新してmainに直接コミット、変更があればIssueを作成
- `generate-static-pages.yml`: events.js/organizations.jsのpush時に静的ページと
  sitemapを自動再生成

## 認証・データ保存

Firebase Auth(Googleサインインのみ)を使用。ただし別のFirebaseプロジェクト
(`wasedacalendar-login`)であり、サイト運営用のGCPプロジェクトとは別。
Firestoreがライブのリアクション/お気に入り/フォロー状態を管理し、
events.js側の静的`reactions`フィールドは新規イベントの初期シード値としてのみ機能する。

## 外部API

- Google Apps Script Web App(問い合わせフォーム送信・団体の再認証編集フロー)
- X(Twitter) API(自動投稿、詳細は`growth.md`)

## 技術的制約

- Node依存を持たない方針(このAI Officeサブプロジェクトがリポジトリ初のnpm依存)
- OGP画像生成にnode-canvas/Puppeteer等の重い依存を意図的に避けている
  (ブラウザ経由の手動/半自動生成に留めている)
- 外部の有料LLM APIを、サイト本体のソースチェック自動化には使わない方針
  (コスト理由で明示的に却下済み。AI Office自体は別プロジェクトとして別途運用)

## 既知の技術負債

- 二重レンダリングの手動同期漏れリスク
- `organizations.js`の`nameKana`(機械かな変換、誤読の可能性)、`genre`
  (キーワード推定、誤分類の可能性)
- 過去のデータインシデント事例: 類似大学名の取り違え、令和→西暦の誤変換
  (いずれも「不明な情報は不明と明記する」方針が生まれた背景)
