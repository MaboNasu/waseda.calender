<!--
version: 1.3.0
last_updated: 2026-09-05
authoritative_source: this file
review_status: owner_reviewed_v1
-->

# Users

このファイルは「分からないことを明示する」ために存在する。空欄を推測で埋めないこと。
利用者に関する詳しい前提は`service.md`「利用者区分」も参照(重複させず相互参照する)。

分類の意味(混同しないこと):
- **FACT**: 観測された事実
- **POLICY**: Owner/Constitution等によって正式に定められた方針(観測事実ではない)
- **ASSUMPTION**: 検証されていない前提
- **NOT_MEASURED**: そもそも計測の仕組みがない
- **VALUE_NOT_AVAILABLE_TO_AI_OFFICE**: GA4等で計測されているが、値がAI Officeに
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

### 計測されているがAI Officeに値が連携されていない(VALUE_NOT_AVAILABLE_TO_AI_OFFICE)

`metrics.json`が正本。いずれもGA4で計測基盤はあるが、値はOwnerが手動でGA4を確認する
必要がある(`availability: manual_only`):

- 月間ユニークユーザー数(`metrics.json: monthly_users`。定義自体もUNKNOWN、下記参照)
- 新規/再訪の比率(`metrics.json: new_vs_returning_ratio`)
- 主な流入経路(`metrics.json: social_referrals`はSNS経由の抜粋。流入経路全般は
  GA4の集客レポートで取得可能)
- モバイル/デスクトップの利用比率(`metrics.json: device_category_ratio`)
- **主な利用時間帯・曜日**(`metrics.json: usage_timing_pattern`)— GA4の標準的な
  日時ディメンションから理論上取得可能なため、2026-09-05にNOT_MEASUREDから
  こちらへ移動(以前の版はNOT_MEASURED[=計測の仕組みがない]としていたが、
  「理論上取得可能」という記述と矛盾していたため訂正)

### Ownerの体感(データ計測ではなく主観的な認識、2026-09-05回答)

- **[OWNER_REPORTED, verified_date: 2026-09-05]** 実際の利用者属性は
  「まだわからない、インスタのフォロワー欄でしか把握できない」とのこと。
  体系的な計測手段は持っていない。
- **[OWNER_REPORTED, verified_date: 2026-09-05]** リピート利用の発生有無は
  「分からない」が、「リピートされる前のアクセスが少ない」という認識
  (`current-state.md`の「現在の最重要課題」= アクセス数の少なさ、とも整合)。
- **[OWNER_REPORTED, verified_date: 2026-09-05]** イベントを探しても見つからず
  離脱するケースは「あまりないと思う」との体感(データによる裏付けではない)。

## Confirmed User Feedback(確認済みのユーザーフィードバック)

**[OWNER_REPORTED, verified_date: 2026-09-05]** 掲載依頼を行った団体からの
接触はこれまでに1件のみで、その団体からの内容面のフィードバックは特にない、
とのこと。

## Assumptions(現在使っている推測・前提)

- **[ASSUMPTION]** 「今日/週末に何があるか調べる」という利用シーンが想定されている
  (`service.md`参照)。実データの裏付けはない。
- **[ASSUMPTION]** モバイル利用が主要な利用形態である。**[POLICY, source:
  constitution.md 2条]** モバイル優先はOwnerの正式な方針として明記されているが、
  実際のデバイス別アクセス比率(`metrics.json: device_category_ratio`)は
  `VALUE_NOT_AVAILABLE_TO_AI_OFFICE`であり、方針と実測は別物として扱う。

会議でこれらの前提を使う場合は、ASSUMPTIONかPOLICYかを明示すること。

## Open Questions(未解決の問い)

2026-09-05にOwnerから回答を得たため、上記5問は解決済み(回答は本ファイル内に
反映済み)。新たな未解決事項が生じた場合はここに追記すること。
