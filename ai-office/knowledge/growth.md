<!--
version: 1.0.0
last_updated: 2026-09-04
source: AI Office 初期整備。リポジトリ内の自動化設定より確認。Owner確認前の暫定版。
-->

# Growth

**重要な区別**: `STATUS`は「仕組みが稼働しているか」だけを示す。`EVIDENCE`が
`NOT_MEASURED`の場合、STATUSが`running`であっても「効果があった」とは絶対に
解釈しないこと(施策の実施と効果確認を混同しない)。

## SEO

- STATUS: `running` **[FACT, source: generate-event-pages.js / generate-sitemap.js]**
  sitemap.xmlの自動生成、イベントページへの構造化データ(schema.org/Event)埋め込みが
  実装されている。
- EVIDENCE: `NOT_MEASURED`(検索順位・自然検索流入数の確認結果なし)
- RESULT: `NOT_MEASURED`
- HYPOTHESIS: `UNKNOWN`(現在検証中の仮説なし)

## X(Twitter)自動投稿

- STATUS: `running` **[FACT, source: 自動投稿関連の環境変数・ワークフロー、および
  X投稿ログの定期コミット履歴の存在]**
- EVIDENCE: `NOT_MEASURED`(投稿ログ自体は残るが、フォロワー増加・クリック率・
  流入への寄与は未確認)
- RESULT: `NOT_MEASURED`
- HYPOTHESIS: `UNKNOWN`

## Instagram

- STATUS: `UNKNOWN` / `NEEDS_OWNER_CONFIRMATION`(コード上、自動投稿の仕組みは
  確認できていない)
- EVIDENCE: N/A
- RESULT: N/A
- HYPOTHESIS: `UNKNOWN`

## OGP(SNSシェア時の見た目)

- STATUS: `running` **[FACT, source: x-post-images/, generate-event-pages.jsの
  ogImageFor()]** イベント別OGP画像(未生成の場合は汎用画像にフォールバック)
- EVIDENCE: `NOT_MEASURED`(OGP改善によるシェア率・クリック率の変化は未確認)
- RESULT: `NOT_MEASURED`
- HYPOTHESIS: `UNKNOWN`

## Google検索(自然検索・GA4計装)

- STATUS: `running`(計装のみ) **[FACT, source: Google Analytics(GA4)導入済み]**
- EVIDENCE: `NOT_MEASURED`(GA4上のレポートはAI Officeに自動連携されておらず、
  現在値はOwnerがダッシュボードで確認する必要がある)
- RESULT: `NOT_MEASURED`
- HYPOTHESIS: `UNKNOWN`

## その他の流入施策

- STATUS: `UNKNOWN` / `NEEDS_OWNER_CONFIRMATION`
