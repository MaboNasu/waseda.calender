<!--
version: 1.0.0
last_updated: 2026-09-04
source: AI Office 初期整備(constitution.md / README.md より抽出)。Owner確認前の暫定版。
-->

# Service

各項目に、その情報の性質(FACT / OWNER_REPORTED / ASSUMPTION / HYPOTHESIS / STALE /
UNKNOWN)と根拠(source)を付す。AIが新たに一般論を書き足さないこと。

## サービスの目的

**[FACT, source: constitution.md 1条]** 早稲田大学周辺のイベント情報を集約し、
学生等が「今日何がある?」「週末何しよう?」を簡単に発見できるサービス。
単にPVを増やすことではなく、イベントの発見から実際の参加・来場につなげることを重視する。

## 解決したい問題

**[FACT, source: constitution.md 1条]** 学生が「今この瞬間、周辺で何が開催されて
いるか」を簡単に把握できない、という発見性の課題。

## 主要ユーザー

**[FACT, source: events.js のtargetフィールド仕様]** ターゲット区分として
`student`(学生) / `obog`(卒業生等) / `public`(一般) / `applicant`(受験生等)の
4種が定義されている(複数選択可)。

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** 実際の利用者内訳(学生が何%か等)は
計測されていない(`metrics.json`参照)。

## 利用シーン

**[ASSUMPTION, source: constitution.md 1条の例示文言]** 「今日/週末に何があるか
調べる」という利用シーンが想定されているが、実際のユーザー行動ログでの裏付けは
NOT_MEASURED。会議でこの前提を使う場合は推測である旨を明示すること。

## ユーザーに取ってほしい最終行動

**[FACT, source: constitution.md 1条]** イベントへの実際の参加・来場。

## ハブ型サービスとしての位置付け

**[FACT, source: constitution.md 2条]** 個別イベントの単独サイトではなく、
早稲田関連イベントを横断的に集約する「ハブ」として位置付ける。

## サービスとして重視すること

**[FACT, source: constitution.md 2条]**
- 情報量と探しやすさの両方
- スマートフォン利用優先
- 既存UXを壊す大規模変更は慎重に行う
- 運営者(Owner)の手作業を減らす
- 短期PVより継続利用につながる改善
- 実データのない思い込みで施策を決めない

## やらないこと(現時点)

**[FACT, source: README.md「広告枠・スポンサー枠について」]** 広告表示なし
(Google AdSense未導入)。`index.html`には将来の広告枠用コメントのみ残されている。

**[FACT, source: README.md「将来的に追加したい機能」]** チケット販売機能・
有料会員機能・管理画面は、いずれも現時点で未実装(下記「中長期ビジョン」の候補一覧参照)。

## 中長期ビジョン

**[FACT, source: README.md「将来的に追加したい機能(WasePassへの道筋)」]**
サイト名を「WasePass」へ発展させる構想の候補一覧が存在する(実施時期は未定、
**status: planned(候補)であり実施確定ではない**):

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
