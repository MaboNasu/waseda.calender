<!--
version: 1.1.0
last_updated: 2026-09-05
authoritative_source: this file
review_status: draft_needs_owner_review
-->

# Users

このファイルは「分からないことを明示する」ために存在する。空欄を推測で埋めないこと。
利用者に関する詳しい前提は`service.md`「利用者区分」も参照(重複させず相互参照する)。

分類の意味(混同しないこと):
- **FACT**: 観測された事実
- **POLICY**: Owner/Constitution等によって正式に定められた方針(観測事実ではない)
- **ASSUMPTION**: 検証されていない前提
- **NOT_MEASURED**: そもそも計測の仕組みがない
- **MEASURED_BUT_NOT_AVAILABLE_TO_AI_OFFICE**: GA4等で計測されているが、値がAI Officeに
  連携されていない(Ownerが手動で見れば分かる。`metrics.json`が正本)

## Intended Audience(想定利用者)

**[ASSUMPTION, source: constitution.md 1条の例示文言, NEEDS_OWNER_CONFIRMATION]**
早稲田大学の学生を主な想定読者としてサービス設計されている。サイトの文言・トーンから
読み取れる想定であり、Ownerが正式方針として確認したものではないため、POLICYには
昇格させずASSUMPTIONのままとする。

## Observed Users(実際の利用者)

**metrics.jsonを正本とし、状態を区別する(単一のNOT_MEASUREDでまとめない)。**

### 計測の仕組み自体が存在しない(NOT_MEASURED)

- 実際の利用者の属性内訳(学生/OBOG/一般等)、学年、所属サークル
  — GA4の標準機能・カスタムディメンションいずれにも該当する設定が確認できず、
  そもそも計測する仕組みがない
- 主な利用時間帯・曜日
  — GA4は理論上取得可能だが、`metrics.json`に該当エントリが未整備のため、
  現時点ではNOT_MEASURED扱いとする(将来`metrics.json`に追加する候補)

### 計測されているがAI Officeに値が連携されていない(MEASURED_BUT_NOT_AVAILABLE_TO_AI_OFFICE)

`metrics.json`参照。いずれもGA4で計測基盤はあるが、値はOwnerが手動でGA4を確認する
必要がある(`availability: manual_only`):

- 月間ユニークユーザー数(`metrics.json: monthly_users`。定義自体もUNKNOWN、下記参照)
- 新規/再訪の比率(`metrics.json: new_vs_returning_ratio`)
- 主な流入経路(`metrics.json: social_referrals`はSNS経由の抜粋。流入経路全般は
  GA4の集客レポートで取得可能)
- モバイル/デスクトップの利用比率(`metrics.json: device_category_ratio`)

## Confirmed User Feedback(確認済みのユーザーフィードバック)

**[UNKNOWN]** Ownerから直接共有されたユーザーフィードバックは、現時点で
記録されていない。今後Ownerから得た発言は、日付・引用元を明記した上でここに
`OWNER_REPORTED`として追記する(例:
`[OWNER_REPORTED, verified_date: YYYY-MM-DD] 「...」`)。

## Assumptions(現在使っている推測・前提)

- **[ASSUMPTION]** 「今日/週末に何があるか調べる」という利用シーンが想定されている
  (`service.md`参照)。実データの裏付けはない。
- **[ASSUMPTION]** モバイル利用が主要な利用形態である。**[POLICY, source:
  constitution.md 2条]** モバイル優先はOwnerの正式な方針として明記されているが、
  実際のデバイス別アクセス比率(`metrics.json: device_category_ratio`)は
  `MEASURED_BUT_NOT_AVAILABLE_TO_AI_OFFICE`であり、方針と実測は別物として扱う。

会議でこれらの前提を使う場合は、ASSUMPTIONかPOLICYかを明示すること。

## Open Questions(未解決の問い)

1. 実際の利用者属性(学生比率、学年、所属サークル等)は?
2. リピート利用は発生しているか? 発生している場合、何がきっかけか?
3. イベントを探しても見つからず離脱するケースはどの程度あるか?
4. 団体側(掲載依頼をする側)からのフィードバックで多いものは?
5. GA4のモバイル/デスクトップ比率・新規/再訪比率を、定期的に確認していますか?

(これらは`current-state.md`の「OWNER QUESTIONS」とも一部重複するため、
回答が得られ次第両方を更新すること。)
