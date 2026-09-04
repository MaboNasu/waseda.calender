<!--
version: 1.0.0
last_updated: 2026-09-04
source: AI Office 初期整備。他ファイルより更新頻度が高い前提。定期的な見直しが必要。
-->

# Current State (AI社員向けCurrent Brief)

**このファイルは他のKnowledgeより早く陳腐化する前提。`last_updated`が古い場合は
会議中に「要再確認」と明記すること。**

## 現在の最重要課題

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** 未確認。Ownerに確認が必要。

## 現在の優先順位

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** 未確認。

## イベント供給状況(実測スナップショット)

**[FACT, source: events.js 直接カウント、2026-09-04時点]**
- 総イベント数: 248件
- 内訳: `scope: "schedule"`(学事日程)42件 / `scope: "circle"`(サークルイベント)206件

**[FACT, source: organizations.js 冒頭コメント]**
- 掲載団体数: 504団体(公認サークル482 + 体育各部22)

これらは手動カウントのスナップショットであり、自動更新されない
(将来的に自動生成の仕組みを検討する余地あり、`event-supply`関連の課題として
Product/Growthが議論する場合はこの点に留意)。

## プロダクト上の主要課題

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** 未確認。

## Growth上の主要課題

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** `growth.md`の通り、各施策の効果測定
(EVIDENCE)がすべて`NOT_MEASURED`である点が構造的な課題として存在する
**[FACT, source: growth.md]**。

## 技術上の主要課題

**[FACT, source: technology.md]** 二重レンダリングの手動同期、
organizations.jsのnameKana/genreの精度、が既知の技術的課題として存在する。

## 現在進行中の施策

**[FACT, source: この会話自体]** AI Office(このDiscord Bot)自体の構築・
ガバナンス整備・Knowledge Base整備が現在進行中。

## 現在検討中の施策

**[UNKNOWN]** `logs/experiments/`に登録されているものは現時点でなし。
