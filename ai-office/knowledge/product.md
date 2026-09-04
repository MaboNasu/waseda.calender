<!--
version: 1.0.0
last_updated: 2026-09-04
source: AI Office 初期整備。リポジトリのファイル構成・CLAUDE.mdより確認。Owner確認前の暫定版。
-->

# Product

**重要**: 以下 `status: implemented` の機能は既に存在する。Product/Growth/UX-UI/CEOは
これらを「新機能」として再提案しないこと(改善提案は可)。`status: planned`は
候補に過ぎず実施確定ではない。

## 実装済み機能(status: implemented)

すべて **[FACT, source: リポジトリのファイル構成 + CLAUDE.md]**。

| 機能 | 現在の挙動・目的 | 既知の制約 | 関連データ |
|---|---|---|---|
| トップページ・カレンダー表示 | イベントをカレンダー形式で一覧表示 | 学事日程/サークルイベントの2レンダリング経路(script.js + 生成スクリプト)を手動同期 | `events.js` |
| 学事日程/サークルイベント切替 | `scope`フィールド(schedule/circle)で大枠フィルタ | scopeを省略すると既定でcircle扱い | `events.js` |
| イベント詳細ページ | クライアント側(`event.html`+`event-page.js`)と静的生成(`event/evt-*.html`)の二重構成 | 両方を都度更新する必要あり(片方だけ直すと表示不整合) | `events.js`, `event-page.js`, `generate-event-pages.js` |
| 団体一覧・団体詳細 | 504団体(公認サークル482+体育各部22)を一覧・検索・詳細表示 | `nameKana`は機械変換で不正確な場合あり、`genre`はキーワード推定 | `organizations.js` |
| 「掲載中」バッジ | 手動フラグではなく、紐づくイベントの有無から自動判定 | - | `organizations-page.js` |
| マイページ(お気に入り/フォロー) | Firebase Auth(Googleサインイン)+ Firestoreでライブ管理 | 認証は別Firebaseプロジェクト(wasedacalendar-login) | `firebase-init.js`, `mypage.js` |
| リアクション/いいね機能 | Firestoreでライブ集計、`events.js`の静的`reactions`は初期シード値のフォールバックのみ | ライブ値はAI Officeから直接参照できない(`metrics.json`参照) | `firebase-init.js` |
| お問い合わせ・掲載依頼フォーム | 自前フォーム(Google Apps Script Web App宛て送信)。既存団体のトークン再認証編集フローも含む | - | `contact.html`, `contact.js`, `gas/contactForm.gs` |
| PWAインストール対応 | ホーム画面追加等 | - | `pwa-install.js`, `service-worker.js`, `assets/manifest.json` |
| SNS投稿用画像生成(訪問者向け) | イベントモーダルの「投稿用画像を生成」ボタン、1080×1080正方形 | - | `image-generator.js` |
| イベント別OGPカード画像 | 1200×630、SNSシェア時に表示。無い場合は汎用OGP画像にフォールバック | 全イベント分は揃っていない(手動/半自動生成のため) | `x-post-images/`, `generate-event-pages.js`のogImageFor() |
| サイトマップ自動生成 | events.js/organizations.js変更後のpush時にGitHub Actionsで自動再生成 | ローカルでの事前確認は手動実行が必要 | `generate-sitemap.js`, `.github/workflows/generate-static-pages.yml` |
| ソースサイト変更検知 | 追跡対象約58件を毎晩(JST 03:00)機械的ハッシュ差分検知 | 内容の解釈・反映判断は自動化されておらず人手(コスト理由で意図的) | `scripts/check-sources.js`, `scripts/sources.json` |
| Google Analytics(GA4) | 全ページに計装済み(測定ID: G-F4NHVEBKTK) | 現在値・レポートはAI Officeに自動連携されていない | `index.html`等 |
| ステータスページ | サイト稼働状況の表示 | - | `status.html`, `status.js` |
| X(Twitter)自動投稿 | 詳細は`growth.md`参照 | - | - |

## 未実装・検討候補(status: planned)

**[FACT, source: README.md「将来的に追加したい機能」]** 詳細は`service.md`の
「中長期ビジョン」参照。広告枠(AdSense)、管理画面、Googleフォーム/スプレッドシート/
カレンダー連携、DB本格移行、チケット販売、WasePass会員機能。いずれも実施時期未定。

## 過去に実装したが廃止した機能(status: deprecated)

**[UNKNOWN]** 現時点で記録されているものはない。今後Decision Logで「廃止」判断が
出た場合はここに追記し、理由はDecision Log側を参照する形にする(理由の二重管理を避ける)。

## 現在検討中の機能(status: experiment)

**[UNKNOWN]** 現時点でExperiment Log(`logs/experiments/`)に登録されているものはない。
