<!--
version: 1.3.0
last_updated: 2026-09-05
authoritative_source: this file (Owner-maintained; expected to change faster than other knowledge files)
review_status: owner_reviewed_v1
-->

# Current State (AI社員向けCurrent Brief)

**このファイルは他のKnowledgeより早く陳腐化する前提。`last_updated`が古い場合は
会議中に「要再確認」と明記すること。**

## 現在の最重要課題

**[OWNER_REPORTED, verified_date: 2026-09-05]** アクセス数の少なさ、認知の低さ。
(`users.md`の「リピート利用」に関するOwner発言「リピートされる前のアクセスが
少ない」とも整合する認識)

## 現在の優先順位

**[OWNER_REPORTED, verified_date: 2026-09-05]**
1. 認知してもらうこと
2. アクセスしてもらうこと
3. 掲載側(サークル・団体)にも利用してもらうこと

## イベント供給状況(実測スナップショット)

**[FACT, source: `knowledge/event-supply.json`(2026-09-04生成)]** 詳細な内訳
(カテゴリ別・対象別・料金区分別・7日/30日以内の件数等)は`event-supply.json`を参照。
概要: 全期間の総レコード数248件(学事日程42件/サークルイベント206件、過去含む)、
今後30日以内に開催予定は52件、掲載団体504団体。「現在の供給量」として扱うのは
248件ではなく今後30日/7日の件数(`event-supply.json`の`upcoming_events`参照)。

これらは手動生成のスナップショットであり、自動更新されない(将来の自動更新候補、
`event-supply.json`のメタデータ参照)。

## プロダクト上の主要課題

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** 未確認。

## Growth上の主要課題

**[FACT, source: growth.md]** 各施策の効果測定(EVIDENCE)がすべて`NOT_MEASURED`
である点が構造的な課題として存在する。

## 技術上の主要課題

**[FACT, source: technology.md]** 二重レンダリングの手動同期、
organizations.jsのnameKana/genreの精度、が既知の技術的課題として存在する。

## 現在進行中の施策

**[FACT, source: `ai-office/`ディレクトリおよびgitコミット履歴(このリポジトリ自体)]**
AI Office(このDiscord Bot)自体の構築・ガバナンス整備・Knowledge Base整備が
現在進行中。

## 現在検討中の施策

**[UNKNOWN]** `logs/experiments/`に登録されているものは現時点でなし。

## Ownerの意向(自動化への期待)

**[OWNER_REPORTED, verified_date: 2026-09-05]** GA4のダッシュボード等を
Owner自身は定期的に確認しておらず、「これら(指標の定期確認)をAIにしてほしい」
との明確な要望があった。Knowledge Retrieval/自動化を実装する段階で、
GA4データの定期取得・要約をAI Office側で巻き取ることを検討候補とする
(現時点では未実装、V1のスコープ外)。

---

## OWNER QUESTIONS(Ownerへの確認事項)

2026-09-05にOwnerから回答を得たため、以下は解決済み(回答内容は
`current-state.md`本文・`constraints.md`「運用負荷」・`growth.md`・`service.md`
「Non-goals」「中長期ビジョン」・`users.md`にそれぞれ反映済み)。

- ~~現在の最重要課題~~ → 反映済み(本文参照)
- ~~直近の優先順位~~ → 反映済み(本文参照)
- ~~運用にかけている時間~~ → `constraints.md`参照
- ~~Instagram運用実態~~ → `growth.md`参照
- ~~Search Console利用状況~~ → `growth.md`参照
- ~~GA4確認頻度~~ → `growth.md`・上記「Ownerの意向」参照
- ~~WasePassビジョンへの着手予定~~ → `service.md`参照
- ~~Non-goal宣言の有無~~ → `service.md`参照

新たな未確認事項が生じた場合は、このセクションに追記すること。
