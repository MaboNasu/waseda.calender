<!--
version: 1.1.0
last_updated: 2026-09-04
authoritative_source: this file
review_status: draft_needs_owner_review
-->

# Growth

**重要な区別**: `STATUS`は「仕組みが稼働しているか」だけを示す。`EVIDENCE`が
`NOT_MEASURED`の場合、STATUSが`running`であっても「効果があった」とは絶対に
解釈しないこと(施策の実施と効果確認を混同しない)。

## SEO(技術的な対策そのもの)

- STATUS: `running` **[FACT, source: generate-event-pages.js / generate-sitemap.js]**
  sitemap.xmlの自動生成、イベントページへの構造化データ(schema.org/Event)埋め込みが
  実装されている。
- EVIDENCE: `NOT_MEASURED`
- RESULT: `NOT_MEASURED`
- HYPOTHESIS: `UNKNOWN`

## Organic Search(自然検索の成果、SEOとは別軸)

**[点10対応: SEO施策の実施と自然検索の成果は別]**

- SEARCH_CONSOLE_STATUS: `UNKNOWN`(Google Search Consoleの導入・利用状況は
  コードから確認できない。sitemap.xml自体は存在するが、Search Consoleへの
  submit状況は別問題)
- EVIDENCE: `NOT_MEASURED`(検索順位・自然検索経由の流入数)
- RESULT: `NOT_MEASURED`

## Analytics / GA4(計装基盤そのもの)

- STATUS: `running`(計装のみ) **[FACT, source: 全ページのgtag導入、複数のカスタム
  イベント実装(event_view, event_link_click, org_view, recommendation_*等)]**
- EVIDENCE: `NOT_MEASURED`(GA4上のレポート・現在値はAI Officeに自動連携されておらず、
  現在値はOwnerがダッシュボードで確認する必要がある。詳細は`metrics.json`)
- RESULT: `NOT_MEASURED`

## X(Twitter)自動投稿

- AUTOMATION_STATUS: `running` **[FACT, source: 自動投稿関連の環境変数・ワーク
  フロー、および定期的な投稿ログコミット履歴の存在]**
- OPERATION_STATUS: `running`(自動化されている前提であれば運用実態もrunningと
  みなせるが、実際に投稿内容の企画・監視をOwnerが行っているかは`NEEDS_OWNER_CONFIRMATION`)
- EVIDENCE: `NOT_MEASURED`(投稿ログ自体は残るが、フォロワー増加・クリック率・
  流入への寄与は未確認)
- RESULT: `NOT_MEASURED`
- HYPOTHESIS: `UNKNOWN`

## Instagram

**[点11対応: 自動化の有無と運用実態を分離]**

- AUTOMATION_STATUS: `not_found_in_code`(自動投稿の仕組みはリポジトリ内のコードから
  確認できない)
- OPERATION_STATUS: `NEEDS_OWNER_CONFIRMATION`(手動で運用している可能性を排除
  できないため、コードで確認できないことをもって「運用していない」と断定しない)
- EVIDENCE: N/A
- RESULT: N/A

## OGP(SNSシェア時の見た目)

- STATUS: `running` **[FACT, source: x-post-images/, generate-event-pages.jsの
  ogImageFor()]** イベント別OGP画像(未生成の場合は汎用画像にフォールバック)
- EVIDENCE: `NOT_MEASURED`(OGP改善によるシェア率・クリック率の変化は未確認)
- RESULT: `NOT_MEASURED`
- HYPOTHESIS: `UNKNOWN`

## その他の流入施策

- STATUS: `UNKNOWN` / `NEEDS_OWNER_CONFIRMATION`
