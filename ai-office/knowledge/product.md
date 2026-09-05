<!--
version: 1.2.0
last_updated: 2026-09-05
authoritative_source: this file (derived from repository source; re-verify against code if stale)
review_status: owner_reviewed_v1
-->

# Product

**status語彙**: `implemented`(実装済み) / `backlog_candidate`(未実施の候補、実施確定ではない) /
`experiment`(Experiment Log登録済みで検証中) / `deprecated`(廃止済み、Decision Log参照)。

**重要**: `status: implemented`の機能をProduct/Growth/UX-UI/CEOが「新機能」として
再提案しないこと(改善提案は可)。

## 実装済み機能(status: implemented)

すべて **[FACT, source: リポジトリのファイル構成 + CLAUDE.md + 実コード確認(2026-09-04)]**。

| 機能 | 現在の挙動・目的 | 既知の制約 | 関連データ/ファイル |
|---|---|---|---|
| トップページ・カレンダー表示 | イベントをカレンダー形式で一覧表示 | 二重レンダリング(technology.md参照) | `events.js`, `script.js` |
| 学事日程/サークルイベント切替 | `scope`(schedule/circle)で大枠フィルタ | scope省略時は既定でcircle扱い | `events.js` |
| **検索・絞り込みパネル** | カテゴリ/対象者/場所/参加費/キーワードで詳細絞り込み | 絞り込み操作自体のGA4カスタムイベントは無い(`metrics.json`参照) | `script.js`(絞り込みイベントリスナー節) |
| **今週開催(7日間ウィンドウ)** | 「今日から7日間」を今週開催として表示(暦週の月曜始まりではない) | - | `script.js` |
| **おすすめ(レコメンド)機能** | 質問形式(診断クイズ)でイベントを推薦、結果クリック・表示をGA4カスタムイベントで計測 | - | `recommendation.js` |
| **リアクションランキング** | トップページに「気になる/行きたい/参加予定」の3種類のランキングを表示。並び替え(件数順/開催日が近い順/開催日が新しい順)に対応、0件のイベントも表示対象 | ランキング用の値はFirestoreのライブ集計に依存 | README.md「リアクションランキングについて」 |
| イベント詳細ページ | クライアント側(`event.html`+`event-page.js`)と静的生成(`event/evt-*.html`)の二重構成、canonicalは常に`event/{id}.html`(URL構造の詳細はtechnology.md参照) | 両方を都度更新する必要あり | `events.js`, `event-page.js`, `generate-event-pages.js` |
| **関連イベント導線** | イベント詳細ページに関連イベントを表示、クリックをGA4カスタムイベントで計測 | - | `event-page.js`(event_related_click) |
| 団体一覧・団体詳細 | 504団体(公認サークル482+体育各部22)を一覧・検索・詳細表示 | `nameKana`は機械変換で不正確な場合あり、`genre`はキーワード推定 | `organizations.js` |
| 「掲載中」バッジ | 手動フラグではなく、紐づくイベントの有無から自動判定。`isEventRelatedToOrg()`が①`orgId`一致、②団体側`relatedEventIds`一致、③主催団体名(`organizer`)の完全一致、のいずれかで紐づけを成立させる(2026-09-05コード確認)。コード内コメントに「events.js側はorgIdがほとんど未設定で、代わりに主催団体名を自由記述のorganizerに入れている実態がある」と明記されており、実際の紐づけは主に③のorganizer名一致に依存している | `orgId`を持つイベントは全期間248件中1件のみだが、①に依存しない設計のため判定の実効性はこの数値だけからは判断できない(`event-supply.json`参照) | `organizations-page.js`(isEventRelatedToOrg) |
| マイページ(お気に入り/フォロー) | Firebase Auth(Googleサインイン)+ Firestoreでライブ管理 | 認証は別Firebaseプロジェクト(wasedacalendar-login) | `firebase-init.js`, `mypage.js` |
| リアクション/いいね機能 | Firestoreでライブ集計、`events.js`の静的`reactions`は初期シード値のフォールバックのみ | 集計値はAI Officeから直接参照できない(`metrics.json`参照) | `firebase-init.js` |
| お問い合わせ・掲載依頼フォーム | 自前フォーム(Google Apps Script Web App宛て送信)。既存団体のトークン再認証編集フローも含む | - | `contact.html`, `contact.js`, `gas/contactForm.gs` |
| PWAインストール対応 | ホーム画面追加等 | - | `pwa-install.js`, `service-worker.js` |
| SNS投稿用画像生成(訪問者向け) | イベントモーダルの「投稿用画像を生成」ボタン、1080×1080正方形 | - | `image-generator.js` |
| イベント別OGPカード画像 | 1200×630、SNSシェア時に表示。無い場合は汎用OGP画像にフォールバック | 実測(2026-09-05): 公開中248件中245件(98.8%)に`x-post-images/{id}.png`が存在、残り3件のみ汎用画像にフォールバック。これとは別に、schema.org構造化データ用`imageUrl`フィールドは0件(こちらは別の仕組み、混同注意) | `x-post-images/`, `generate-event-pages.js` |
| サイトマップ自動生成 | events.js/organizations.js変更後のpush時にGitHub Actionsで自動再生成 | ローカルでの事前確認は手動実行が必要 | `generate-sitemap.js`, `.github/workflows/generate-static-pages.yml` |
| ソースサイト変更検知 | 追跡対象約58件を毎晩(JST 03:00)機械的ハッシュ差分検知 | 内容の解釈・反映判断は自動化されておらず人手(コスト理由で意図的) | `scripts/check-sources.js`, `scripts/sources.json` |
| Google Analytics(GA4) | 全ページに計装済み(測定ID: G-F4NHVEBKTK)、複数のカスタムイベントも実装済み | 詳細は`metrics.json` | `index.html`等 |
| ステータスページ | サイト稼働状況の表示 | - | `status.html`, `status.js` |
| X(Twitter)自動投稿 | 詳細は`growth.md`参照 | - | - |

## 未実装・検討候補(status: backlog_candidate)

**[FACT, source: README.md「将来的に追加したい機能」]** 詳細は`service.md`の
「中長期ビジョン」参照。広告枠(AdSense)、管理画面、Googleフォーム/スプレッドシート/
カレンダー連携、DB本格移行、チケット販売、WasePass会員機能。いずれも実施時期未定。

## 過去に実装したが廃止した機能(status: deprecated)

**[UNKNOWN]** 現時点で記録されているものはない。今後Decision Logで「廃止」判断が
出た場合はここに追記し、理由はDecision Log側を参照する形にする(理由の二重管理を避ける)。

## 現在検討中の機能(status: experiment)

**[UNKNOWN]** 現時点で`logs/experiments/`に登録されているものはない。
