<!--
version: 1.2.0
last_updated: 2026-09-05
authoritative_source: ../CLAUDE.md (this file is a summary/pointer; if content conflicts, CLAUDE.md wins)
last_synced: 2026-09-04
review_status: owner_reviewed_v1
-->

# Technology

**このファイルは要約。AI OfficeからCLAUDE.mdへアクセスできない状況でも最低限判断
できるよう、この1ファイルだけで完結する情報量を持たせている。** ただし内容が
食い違う場合はCLAUDE.md本体を優先する(`last_synced`より後にCLAUDE.mdが更新されて
いれば、このファイルは古い可能性がある)。

特記なき項目はすべて **[FACT, source: CLAUDE.md、および実コード確認(2026-09-04)]**。
意図的な設計判断(観測事実ではなく方針)には個別に**[POLICY]**を付す。理由が
判明しているものは付記する。

## フロントエンド

フレームワーク・バンドラーなし。素のHTML/CSS/JavaScript。**正確な表現**: Node.js
スクリプト自体は多数使用している(静的ページ生成・サイトマップ生成・ソース監視等、
下記参照)が、**サイト本体(フロントエンドの配信物)は外部npmパッケージへの依存を
持たない**方針、という意味。「Node依存を持たない」という表現は誤解を招くため使わない。
**理由**: 非エンジニアのOwnerでも把握・編集しやすいシンプルな構成を維持するため。

## データ

`events.js`(`const EVENTS = [...]`)と`organizations.js`(`const ORGANIZATIONS = [...]`、
504団体)の2つのJS配列がsource of truth。データベースではなくファイル直書き。

## ビルド・デプロイの区別(重要)

- **GitHub Pages配信そのもの**: フレームワークのビルドステップは無い。リポジトリの
  内容がそのまま配信される。
- **一方で**、`events.js`/`organizations.js`を変更した際には、`event/*.html` /
  `org/*.html` / `sitemap.xml`を再生成する**静的HTML生成工程が別途存在する**
  (下記「静的生成」参照)。これは「デプロイ時のビルド」ではなく「データ変更時に
  実行する生成スクリプト」であり、pushをトリガーにGitHub Actionsが自動実行するが、
  ローカルで事前確認したい場合は手動実行が必要。
  この2つ(配信のビルドレスと、データ変更時の生成工程)を混同しないこと。

## 静的生成

`generate-event-pages.js` / `generate-org-pages.js` / `generate-sitemap.js`が
`event/*.html` / `org/*.html` / `sitemap.xml`を生成する。出力ディレクトリを毎回
全消去して再構築する仕様のため、events.js/organizations.js編集のたびに再実行が必要。

## URL構造(実コード確認済み、2026-09-04)

イベント・団体の個別ページには2つの経路がある。混同しないこと。

| 区分 | URL形式 | 実体 |
|---|---|---|
| `canonical_public_url` / `seo_canonical` | `https://wasedacalendar.com/event/{id}.html`<br>`https://wasedacalendar.com/org/{id}.html` | **[FACT, source: `<link rel="canonical">`タグ(generate-event-pages.js/generate-org-pages.js)、`script.js`のbuildEventPageUrl()、sitemap.xml実データ]** SNSシェア・パーマリンク・sitemap.xml・JSON-LD等、外部に見せるURLは常にこちら |
| `generated_static_route` | 同上 | `generate-event-pages.js`/`generate-org-pages.js`が生成する静的プリレンダリング済みファイル。crawler/リンクプレビューボット向け |
| `client_side_route` / `legacy_route` | `event.html?id=X`<br>`org.html?id=X` | **[FACT, source: org-page.js コメント「旧形式(org.html?id=A-001)は後方互換のため引き続きクエリパラメータを優先的に見る」]** 後方互換のためのみ存在する旧形式。新規リンクの発行には使われていない(sitemap.xml内に`?id=`形式は0件) |

## Git/GitHub・ホスティング

GitHub Pagesでホスティング。

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
- Google Analytics 4(計装のみ、詳細は`metrics.json`)

## 技術的制約(すべてPOLICY: 意図的な決定であり、偶然そうなっているのではない)

- **[POLICY]** サイト本体は外部npmパッケージへの依存を意図的に持たない
  (このAI Officeサブプロジェクトがリポジトリ初のnpm依存)
- **[POLICY]** OGP画像生成にnode-canvas/Puppeteer等の重い依存を意図的に避けている
  (ブラウザ経由の手動/半自動生成に留めている)
- **[POLICY]** 外部の有料LLM APIを、サイト本体のソースチェック自動化には使わない
  (コスト理由で明示的に却下済み。AI Office自体は別プロジェクトとして別途運用)

## 既知の技術負債

- 二重レンダリングの手動同期漏れリスク
- `organizations.js`の`nameKana`(機械かな変換、誤読の可能性)、`genre`
  (キーワード推定、誤分類の可能性)
- 過去のデータインシデント事例: 類似大学名の取り違え、令和→西暦の誤変換
  (いずれも「不明な情報は不明と明記する」方針が生まれた背景)
