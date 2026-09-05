<!--
version: 1.3.0
last_updated: 2026-09-05
authoritative_source: this file
review_status: owner_reviewed_v1
-->

# Growth

**重要な区別**(metrics.jsonの`measurement`/`availability`/`value_status`と揃える):

- `NOT_MEASURED`: そもそも計測の仕組みが存在しない
- `VALUE_NOT_AVAILABLE_TO_AI_OFFICE`: GA4等で計測されているが、AI Officeに値が
  連携されておらず、Ownerが手動確認すれば分かる(=metrics.jsonの`manual_only`相当)
- `NOT_EVALUATED`: データ(ログ・件数等)自体は存在するが、施策の効果検証(比較・
  分析)がまだ行われていない

`STATUS`は「仕組みが稼働しているか」だけを示す。上記いずれであっても、
STATUSが`running`だからといって「効果があった」とは絶対に解釈しないこと。

## SEO(技術的な対策そのもの)

- STATUS: `running` **[FACT, source: generate-event-pages.js / generate-sitemap.js]**
  sitemap.xmlの自動生成、イベントページへの構造化データ(schema.org/Event)埋め込みが
  実装されている。
- EVIDENCE: `NOT_EVALUATED`(sitemap/構造化データが実際にGoogleに正しく認識されて
  いるかどうか自体、Search Console等で検証された記録がない。効果は下記
  Organic Searchを参照)
- RESULT: `NOT_EVALUATED`
- HYPOTHESIS: `UNKNOWN`

## Organic Search(自然検索の成果、SEOとは別軸)

- SEARCH_CONSOLE_STATUS: **[OWNER_REPORTED, verified_date: 2026-09-05]**
  「導入している気がするけど使い方が分からない」とのこと。導入有無自体が
  Owner自身も確信を持てておらず、実質的に活用はされていない状態
  (`owner_uncertain_not_actively_used`)。
- 検索順位・掲載状況: `UNKNOWN`(Search Consoleが実際に使われていないため未確認)
- 自然検索経由の流入数: `VALUE_NOT_AVAILABLE_TO_AI_OFFICE`(GA4の集客レポートに
  Organic Searchチャネルとして標準的に含まれるはずのデータだが、AI Officeに
  連携されておらずOwner確認が必要)
- RESULT: `NOT_EVALUATED`

## Analytics / GA4(計装基盤そのもの)

- STATUS: `running`(計装のみ) **[FACT, source: 全ページのgtag導入、複数のカスタム
  イベント実装(event_view, event_link_click, org_view, recommendation_*等)]**
- EVIDENCE: `VALUE_NOT_AVAILABLE_TO_AI_OFFICE`(GA4は稼働しておりデータ自体は
  存在するはずだが、AI Officeへの自動連携がなく、現在値はOwnerがダッシュボードで
  確認する必要がある。詳細は`metrics.json`)
- RESULT: `VALUE_NOT_AVAILABLE_TO_AI_OFFICE`
- **[OWNER_REPORTED, verified_date: 2026-09-05]** Ownerはダッシュボードを能動的に
  定期確認してはいないが、「たまにメールが届くからその内容は見てる」とのこと
  (GA4の自動メールレポートを受動的に見る程度)。「これら(指標の定期確認)を
  AIにしてほしい」との要望あり(`current-state.md`「Ownerの意向」参照)。

## X(Twitter)自動投稿

- AUTOMATION_STATUS: `running` **[FACT, source: 自動投稿関連の環境変数・ワーク
  フロー、および定期的な投稿ログコミット履歴の存在]**
- OPERATION_STATUS: `running`(自動化されている前提であれば運用実態もrunningと
  みなせるが、実際に投稿内容の企画・監視をOwnerが行っているかは`NEEDS_OWNER_CONFIRMATION`)
- EVIDENCE: 投稿ログ自体は存在する(`NOT_MEASURED`ではない)が、フォロワー増加・
  クリック率・サイト流入への寄与についての比較検証は`NOT_EVALUATED`。GA4の
  Organic Search以外の参照(social)経路データが投稿と紐づけて分析された記録もない
- RESULT: `NOT_EVALUATED`
- HYPOTHESIS: `UNKNOWN`

## Instagram

- AUTOMATION_STATUS: **[OWNER_REPORTED, verified_date: 2026-09-05]** 手動投稿
  (自動投稿の仕組みはコード上も存在せず、Owner自身も「無料で自動化するやり方が
  分からない」と回答。自動化への関心はある)。
- OPERATION_STATUS: `running`(手動運用中)
- EVIDENCE: `NOT_EVALUATED`
- RESULT: `NOT_EVALUATED`

## OGP(SNSシェア時の見た目)

- STATUS: `running` **[FACT, source: x-post-images/ファイル実測、
  generate-event-pages.jsのogImageFor()]** 公開中の全248件中245件(98.8%)に
  イベント別OGP画像が存在し、残り3件は汎用OGP画像にフォールバックする
  (2026-09-05実測、`event-supply.json`参照)。
- EVIDENCE: シェアボタンのクリック数自体はGA4カスタムイベント
  (`event_share_line`/`event_share_x`等、product.md参照)で`VALUE_NOT_AVAILABLE_TO_AI_OFFICE`
  だが、「OGP画像の有無がシェア率・クリック率に影響したか」という比較評価は
  `NOT_EVALUATED`(そもそも欠落画像が3件のみのため比較群も乏しい)。
- RESULT: `NOT_EVALUATED`
- HYPOTHESIS: `UNKNOWN`

## その他の流入施策

- STATUS: `UNKNOWN` / `NEEDS_OWNER_CONFIRMATION`
