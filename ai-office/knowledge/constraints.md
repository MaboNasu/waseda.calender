<!--
version: 1.1.0
last_updated: 2026-09-04
authoritative_source: this file (references CLAUDE.md / README.md / constitution.md for cited facts)
review_status: draft_needs_owner_review
-->

# Constraints

AI社員が現実離れした提案をしないための制約。**Owner承認が必要な領域そのものは
`constitution.md` 5条が正本のため、ここでは複製しない。**

## Ownerの運営体制

**[FACT, source: CLAUDE.md / README.md]** Owner1名による運営。非エンジニア
(README.mdはOwner向けの日常コンテンツ編集手順書として書かれている)。コード変更は
Claude Code経由で行う。

## 予算・低コスト志向

**[FACT, source: CLAUDE.md 内「Content pipeline」節]** サイト本体(source-check等)は、
コスト理由で外部有料LLM APIを使わない方針が明示的に採用されている(過去に検討の上、
明示的に却下された判断)。

**[FACT, source: CLAUDE.md]** ホスティングはGitHub Pages、認証・DBはFirebase無料枠
中心。

**[FACT, source: このAI Office自体のconstitution.md 8条]** AI Office(このDiscord Bot)
自体には別途、月間予算上限・1会議あたりコスト上限・OpenAI別枠予算が定義されている。
サイト本体の予算とは別軸。

## 運用負荷

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** Ownerが実際にどの作業にどれだけの時間を
かけているか(イベント追加頻度、問い合わせ対応頻度等)は未確認。

## 既存アーキテクチャ・変更を慎重にすべき領域

**[FACT, source: technology.md / CLAUDE.md]** ビルドレス方針・二重レンダリング構成
(technology.md参照)は変更に慎重を要する。

**[FACT, source: CLAUDE.md「Conventions」]**
- 既存のURL構造(`event.html?id=X`等)
- モバイル表示(320/375/390px幅での確認が必須、モバイルが主要な利用形態のため)
- データが不明・未検証な場合は推測せず「不明」と明記する
  (過去のインシデント: 類似大学名の取り違え、令和→西暦の誤変換をそのまま公開してしまった事例あり)

## 現在の開発/運営上の制約

**[UNKNOWN / NEEDS_OWNER_CONFIRMATION]** 現在の最優先事項・使える時間・
今後数ヶ月の開発リソースの見込みは未確認(`current-state.md`で追跡する想定だが、
初期状態ではUNKNOWN)。
