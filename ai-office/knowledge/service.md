<!--
version: 1.2.0
last_updated: 2026-09-05
authoritative_source: this file (references constitution.md / README.md for cited facts)
review_status: draft_needs_owner_review
-->

# Service

各項目に、その情報の性質(FACT / POLICY / OWNER_REPORTED / ASSUMPTION / HYPOTHESIS /
STALE / UNKNOWN)と根拠(source)を付す。AIが新たに一般論を書き足さないこと。

**POLICY**とは、観測事実ではなく、Owner/Constitution/Decision Log等によって
正式に定められたサービス方針・運営方針・意思決定原則を指す。FACTと混同しないこと。

## サービスの目的

**[POLICY, source: constitution.md 1条]** 早稲田大学周辺のイベント情報を集約し、
学生等が「今日何がある?」「週末何しよう?」を簡単に発見できるサービス。
単にPVを増やすことではなく、イベントの発見から実際の参加・来場につなげることを重視する。

## 解決したい問題

**[POLICY, source: constitution.md 1条]** 学生が「今この瞬間、周辺で何が開催されて
いるか」を簡単に把握できない、という課題認識を前提として事業を設計している
(実際の離脱率・検索失敗率等で検証された事実ではなく、Constitutionが定める
前提・方針として扱う)。

## 利用者区分(3つを明確に分離する)

利用者に関する情報は性質が異なる3種類を混同しないこと。詳細・実測データの追跡は
`users.md`が本体で、ここは概要のみ。

### Intended Audience(想定利用者)

**[ASSUMPTION, source: constitution.md 1条の例示文言]** 早稲田大学の学生を主な
想定読者としてサービス設計されている(サイトの文言・トーンから読み取れる想定であり、
実測による裏付けではない)。

### Event Eligibility(イベント参加対象区分)

**[FACT, source: events.js のtargetフィールド仕様]** これは「そのイベントに誰が
参加できるか」を表す入力データ区分であり、**サイト利用者の属性ではない**。
`student`(学生) / `obog`(卒業生等) / `public`(一般) / `applicant`(受験生等)の
4種(複数選択可)。実測(2026-09-04時点、`event-supply.json`参照):
student 245件 / public 206件 / obog 203件 / applicant 2件(重複計上あり)。

### Observed Users(実際の利用者)

**[NOT_MEASURED]** 実際にサイトを利用しているユーザーの属性内訳は計測されていない。
GA4は導入済みだが、ユーザー属性レポートはAI Officeに連携されていない
(`metrics.json`参照)。

## ユーザーに取ってほしい最終行動

**[POLICY, source: constitution.md 1条]** イベントへの実際の参加・来場。

## ハブ型サービスとしての位置付け

**[POLICY, source: constitution.md 2条]** 個別イベントの単独サイトではなく、
早稲田関連イベントを横断的に集約する「ハブ」として位置付ける。

## サービスとして重視すること

**[POLICY, source: constitution.md 2条]**
- 情報量と探しやすさの両方
- スマートフォン利用優先
- 既存UXを壊す大規模変更は慎重に行う
- 運営者(Owner)の手作業を減らす
- 短期PVより継続利用につながる改善
- 実データのない思い込みで施策を決めない

## 現在提供していない機能

**[FACT, source: README.md「広告枠・スポンサー枠について」「将来的に追加したい機能」]**
以下は現時点で未実装(実装候補一覧は下記「中長期ビジョン」参照):
広告表示(Google AdSense未導入)、チケット販売機能、有料会員機能、管理画面。

**重要**: これは「恒久的にやらない」というNon-goal宣言ではなく、単に
「現時点で存在しない」という実装状況を述べているに過ぎない。

## Non-goals(恒久的にやらないと決定されたこと)

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** Ownerが明示的に「これは恒久的にやらない」
と決定した項目は、現時点で確認できていない。上記「現在提供していない機能」は
将来実装される可能性がある候補(下記ビジョン表参照)であり、Non-goalとは異なる。

## 中長期ビジョン

**[FACT, source: README.md「将来的に追加したい機能(WasePassへの道筋)」]**
サイト名を「WasePass」へ発展させる構想の候補一覧が存在する(実施時期は未定、
**status: backlog_candidate であり実施確定ではない**):

| 機能 | 難易度 |
|---|---|
| Googleフォーム連携 | 低 |
| Googleスプレッドシート連携 | 中 |
| 管理画面 | 中 |
| Googleカレンダー連携 | 中 |
| Instagram/X連携強化 | 中 |
| データベース本格移行(Supabase/PostgreSQL) | 高 |
| チケット販売(Stripe) | 高 |
| WasePass会員機能(認証+サブスク) | 高 |
| Google AdSense | 低(審査・ポリシー対応は別途必要) |

会議でこれらに触れる際は「候補として存在する」以上の実施確度を持たせないこと。

## 競合・代替手段

**[UNKNOWN]** 明示的な競合調査は行われていない。Growth議題で必要になった場合は
その都度調査し、常設のKnowledge Baseとしては保守しない(調査結果はDecision Log/
Experiment Logに残す)。
