<!--
version: 1.3.0
last_updated: 2026-09-05
authoritative_source: this file (references CLAUDE.md / README.md / constitution.md for cited facts)
review_status: owner_reviewed_v1
-->

# Constraints

AI社員が現実離れした提案をしないための制約。**Owner承認が必要な領域そのものは
`constitution.md` 5条が正本のため、ここでは複製しない。**

分類の意味: **FACT**=観測事実 / **POLICY**=Owner・Constitution等が正式に定めた方針
(観測事実ではない) / **UNKNOWN**=未確認。混同しないこと。

## Ownerの運営体制

**[FACT, source: CLAUDE.md / README.md]** Owner1名による運営。非エンジニア
(README.mdはOwner向けの日常コンテンツ編集手順書として書かれている)。コード変更は
Claude Code経由で行う。

## 予算・低コスト志向

**[POLICY, source: CLAUDE.md 内「Content pipeline」節]** サイト本体(source-check等)は、
コスト理由で外部有料LLM APIを使わない方針が明示的に採用されている(過去に検討の上、
明示的に却下された判断)。

**[FACT, source: CLAUDE.md]** ホスティングはGitHub Pages、認証・DBはFirebase無料枠
中心。

**[POLICY, source: このAI Office自体のconstitution.md 8条]** AI Office(このDiscord Bot)
自体には別途、月間予算上限・1会議あたりコスト上限・OpenAI別枠予算が定義されている。
サイト本体の予算とは別軸。

## 運用負荷

**[OWNER_REPORTED, verified_date: 2026-09-05]** 「暇な時間は結構割いている。
1日1時間くらいの日もあれば2〜3時間の日もある」とのこと。作業内容の内訳
(イベント追加/問い合わせ対応/SNS投稿等の時間配分)までは未確認。

## 既存アーキテクチャ・変更を慎重にすべき領域

**[FACT, source: technology.md / CLAUDE.md]** ビルドレス方針・二重レンダリング構成
(technology.md参照)が現在のアーキテクチャである。

### URL構造(technology.mdと整合、混同禁止)

**[FACT, source: technology.md「URL構造」節、実コード・sitemap.xml確認済み]**

- `canonical_public_url`(正式な公開URL): `event/{id}.html` / `org/{id}.html`
  (静的プリレンダリング版。SNSシェア・sitemap.xml・JSON-LD等、外部に見せるURLは
  常にこちら)
- `legacy_route`(後方互換のみ): `event.html?id=X` / `org.html?id=X`
  (旧形式。新規リンクの発行には使われていない、sitemap.xml内に`?id=`形式は0件)

**[POLICY]** 新規に生成するリンク・OGP・共有URLでは`legacy_route`を使わないこと。
`canonical_public_url`の構造(URLパス形式そのもの)を変更することは、
Constitution 5-1条の`url_structure_change`(Owner承認必須カテゴリ)に該当するため、
慎重に扱うこと(`legacy_route`を後方互換として残すか廃止するかの判断も同様)。

### その他の慎重に扱うべき点

**[POLICY, source: CLAUDE.md「Conventions」]**
- モバイル表示(320/375/390px幅での確認が必須、モバイルが主要な利用形態のため)
- データが不明・未検証な場合は推測せず「不明」と明記する
  (過去のインシデント: 類似大学名の取り違え、令和→西暦の誤変換をそのまま公開してしまった事例あり)

## 現在の開発/運営上の制約

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** 現在の最優先事項・使える時間・
今後数ヶ月の開発リソースの見込みは未確認(`current-state.md`で追跡する想定だが、
初期状態ではUNKNOWN)。
