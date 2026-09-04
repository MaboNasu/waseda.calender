<!--
version: 1.0.0
last_updated: 2026-09-04
authoritative_source: this file
review_status: draft_needs_owner_review
-->

# Users

このファイルは「分からないことを明示する」ために存在する。空欄を推測で埋めないこと。
利用者に関する詳しい前提は`service.md`「利用者区分」も参照(重複させず相互参照する)。

## Intended Audience(想定利用者)

**[ASSUMPTION, source: constitution.md 1条の例示文言]** 早稲田大学の学生を主な
想定読者としてサービス設計されている。サイトの文言・トーンから読み取れる想定であり、
実測による裏付けではない。

## Observed Users(実際の利用者、実測データ)

**[NOT_MEASURED]** 以下はすべて未計測(`metrics.json`参照、GA4は導入済みだが
AI Officeへの自動連携なし):

- 実際の利用者の年齢層・所属(学生/OBOG/一般等の内訳)
- 月間ユニークユーザー数
- 新規/再訪の比率
- 主な流入経路
- 主な利用時間帯・曜日
- モバイル/デスクトップの利用比率

## Confirmed User Feedback(確認済みのユーザーフィードバック)

**[UNKNOWN]** Ownerから直接共有されたユーザーフィードバックは、現時点で
記録されていない。今後Ownerから得た発言は、日付・引用元を明記した上でここに
`OWNER_REPORTED`として追記する(例:
`[OWNER_REPORTED, verified_date: YYYY-MM-DD] 「...」`)。

## Assumptions(現在使っている推測・前提)

- **[ASSUMPTION]** 「今日/週末に何があるか調べる」という利用シーンが想定されている
  (`service.md`参照)。実データの裏付けはない。
- **[ASSUMPTION]** モバイル利用が主要な利用形態である(`constitution.md`の
  方針・技術的な320/375/390px確認要件から)。実際のデバイス別アクセス比率は
  `NOT_MEASURED`。

会議でこれらの前提を使う場合は、必ず「推測である」旨を明示すること。

## Open Questions(未解決の問い)

1. 実際の利用者属性(学生比率、学年、所属サークル等)は?
2. リピート利用は発生しているか? 発生している場合、何がきっかけか?
3. イベントを探しても見つからず離脱するケースはどの程度あるか?
4. 団体側(掲載依頼をする側)からのフィードバックで多いものは?
5. モバイル/デスクトップの利用比率は実際どうなっているか?

(これらは`current-state.md`の「OWNER QUESTIONS」とも一部重複するため、
回答が得られ次第両方を更新すること。)
