# WasedaCalendar AI Office

Discord上に複数のAI役職(CEO/CTO/Product/Growth/UX-UI/Red Team、+専門役のCFO/法務)を配置し、
議題に対して各役職が意見表明→Red Teamによる検証→(必要な場合のみ)修正のラウンドを経て、
CEO役AIが最終決定するBot。運用ルールは `src/constitution/constitution.md`(Company Constitution)
に定義されており、Owner承認が必要な変更・予算上限・セキュリティルールもすべてそこに従う。

「誰が何を主張し」「Red Teamが何を指摘し」「指摘を受けてどう修正したか」「なぜその決定に至ったか」
という意思決定過程をDiscordスレッド上にそのまま可視化し、機械可読(JSON)・人間可読(Markdown)の
Decision Logとして保存する。

役職ごとに OpenAI / Google Gemini / Groq という異なるプロバイダーを割り当てており、
単一モデルにペルソナを演じさせるだけの構成にはしていない。役職の責務(`src/roles/roleDefinitions.js`)
とモデル割当(`src/roles/modelRouting.js`)は別ファイルに分離されており、モデルだけを
変更したい場合は `modelRouting.js` の該当行を書き換えるだけでよい。

設計の全体像は `/root/.claude/plans/streamed-greeting-pascal.md`(このプロジェクトの承認済み設計案)を参照。

## セットアップ

```bash
cd ai-office
npm install
cp .env.example .env   # 既に .env は用意済みなので通常は不要。値を埋めるだけでよい
```

`.env` に以下を記入する(このファイルは `.gitignore` 済みでコミットされない):

```
DISCORD_BOT_TOKEN=
OPENAI_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
OWNER_DISCORD_USER_ID=
```

`OWNER_DISCORD_USER_ID` は**必須**。Owner承認・却下・保留、続行/再試行/中止の操作は
このユーザーIDからの操作のみ有効になる(Constitution 13条)。自分のDiscordユーザーIDは
Discordの「設定 > 詳細設定 > 開発者モード」をONにした上で、自分のアイコンを右クリックし
「ユーザーIDをコピー」で調べられる。

Discord Developer Portal で、Botに以下の権限を付与しておくこと:
- `applications.commands`(スラッシュコマンド)
- `bot` スコープ + `Manage Webhooks` / `Create Public Threads` / `Send Messages` / `Send Messages in Threads`

## APIキーなしでの動作確認(ドライラン)

Discordトークンや各社APIキーが揃う前でも、会議フロー全体(Triage→意見表明→Red Team→
条件付き修正→承認要否判定→CEO決定)のロジックが壊れていないかはこれで確認できる。
実際のAPI呼び出しやDiscord接続は一切行わない。

```bash
npm run dry-run -- "議題をここに書く(省略可)"
```

`src/providers/mock.js` がダミー応答を返すだけで、料金も発生しない。実行すると
`logs/meetings/` と `logs/decisions/` にモックデータのファイルが生成されるので、
確認後は削除してよい。

## 起動

```bash
npm start
```

起動時にグローバルスラッシュコマンド(`/meeting`)を自動登録する(初回反映まで最大1時間程度かかることがある)。
即座に反映確認したい場合は個別に登録スクリプトを実行してもよい:

```bash
npm run register-commands
```

## 使い方(Discord上)

- `/meeting start topic:<議題>` — 会議スレッドを新規作成して開始
- `/meeting status` — 進行中の会議の状況(フェーズ・Owner承認待ちの有無)を表示
- `/meeting decision` — そのスレッドの最終決定(Decision Log要約)を再表示
- `/meeting cost` — この会議・当月累計のAPI利用コストを表示
- `/meeting cancel` — 進行中の会議を中断

同一・類似の議題について直近の決定が既にある場合は、重複会議を避けるため
既存の決定を提示して再実行の確認を挟む。概算コストが `COST_CONFIRM_THRESHOLD_USD`
(既定 $0.5)を超える場合も、開始前に確認ボタンが出る。

Owner承認が必要と判定された決定には承認/却下/保留ボタンが付き、
`OWNER_DISCORD_USER_ID` 以外のクリックは無効になる。プロバイダー障害で
重要な会議がブロックされた場合は、続行/再試行/中止ボタンが出る。

## 予算・上限(Constitution 8条)

- `MONTHLY_BUDGET_USD`(既定 $5) — 月間の総利用上限
- `OPENAI_MONTHLY_BUDGET_USD`(既定 $3) — OpenAIのみの別枠上限(唯一の主要有料コンポーネントのため)
- `MAX_COST_PER_MEETING_USD`(既定 $1) — 1会議あたりの上限。超過すると会議を強制中断する
- `DAILY_MEETING_LIMIT`(既定5回) — 1日あたりに開始できる会議の最大回数

いずれかを超過すると新規会議の開始を拒否する。無料プロバイダー(Gemini/Groq)の
障害時に、有料のOpenAIへ黙ってフォールバックする処理は意図的に実装していない。

## ログ・Decision Logの場所

- `logs/meetings/<meetingId>.json` — 会議ごとの完全な構造化トランスクリプト(発言・Red Teamの指摘・修正・決定)
- `logs/decisions/<日付>_<議題スラッグ>.md` — 人間可読のDecision Log(Constitution 11条の必須14項目)
- `logs/usage/<YYYY-MM>.jsonl` — API呼び出し1件ごとのトークン数・推定コスト(月次)

いずれもリポジトリにはコミットしない(`.gitignore` で除外済み)。Bot稼働ホスト上のディスクに蓄積される。

料金単価は `src/cost/pricing.json` で手動管理している。プロバイダー側の値下げ/値上げがあれば
この1ファイルを更新するだけでよい。Groqの `openai/gpt-oss-120b` は無料枠内であれば実質0円だが、
単価は暫定値なので実際の請求と乖離がないか定期的に確認すること。

## セキュリティ(Constitution 13条)

プロンプト送信前(`src/providers/index.js`)・ログ保存前(`src/storage/transcriptStore.js`)・
Discord投稿前(`src/discord/threadRenderer.js`)の3箇所で、APIキー/Tokenらしき文字列を
`src/security/secretGuard.js` が機械的に検知し、該当する場合は動作をブロック(プロンプト送信・
API呼び出し)または該当箇所を `[REDACTED:種別]` に置換(ログ・Discord投稿)する。

## Constitutionの変更について

`src/constitution/constitution.md` は先頭にバージョンヘッダー(`version: X.Y.Z`)を持つ。
Constitution本体・承認ルール・Owner認証・予算上限・秘密情報保護・モデル割当の基本方針・
本番Botの権限スコープ・AI Office自身の自動実行権限、これらへの変更はConstitution 5-4条により
常にOwner承認が必須(AIが自分自身の統治ルールを自動で緩和することはできない)。

## 常時稼働させる方法

discord.jsはGateway常時接続が必要なため、サーバーレスではなく常駐プロセスとして動かす。

- 推奨: Oracle Cloud Infrastructure の Always Free枠などの無料の常時稼働VM上で
  `pm2 start src/index.js --name ai-office` のようにプロセスマネージャ配下に置く
  (クラッシュ時に自動再起動させるため)。
- 既存のVPSがあれば `systemd` サービス化してもよい。
- ローカルPCでの実行は動作確認用途にとどめる(PCがオフラインの間はBotも停止する)。

## ディレクトリ構成

```
src/
  index.js                Botエントリポイント(Gateway接続・コマンドハンドリング・Owner承認ボタン)
  constitution/            constitution.md(憲法本体)+ バージョン読み取り
  discord/                 スラッシュコマンド定義・登録・Webhook経由の役職別投稿
  providers/               OpenAI/Gemini/Groqの共通インターフェース実装(+モック)
  roles/                   役職の責務(roleDefinitions.js)とモデル割当(modelRouting.js)を分離
  approval/                Owner承認カテゴリの機械スキャン・Owner認証・承認/続行ボタン
  security/                秘密情報(APIキー等)の検知・redact
  orchestrator/             Round0(triage)・会議フロー本体(meeting.js)・プロンプト組み立て(rounds.js)・フェーズ定数(phases.js)
  knowledge/                retrieval.js: 役職×議題キーワードでknowledge/配下のファイルを選び、各役職の
                             プロンプトに前置するbriefingを組み立てる(ベクトルDB/RAGは使わない)
  cost/                    料金単価表・使用量トラッカー・予算ガード
  storage/                 会議トランスクリプト(JSON)とDecision Log(Markdown、検索用インデックス付き)の保存/読み出し
knowledge/                 Waseda Calendarに関するKnowledge Base本体(service/product/technology/
                            constraints/growth/current-state/users.md、metrics/event-supply.json)
logs/                      実行時に生成される会議ログ・Decision Log・Experiment Log・使用量ログ(gitignore対象)
```

## Knowledge Retrieval

会議のRound0(triage)以降、各役職のプロンプトには`src/knowledge/retrieval.js`が
組み立てたbriefingが自動的に前置される。追加のLLM呼び出しは発生しない
(コードによるキーワードマッチ+文字bigram類似度検索のみ)。

- 全役職共通で`knowledge/current-state.md`を常に読む
- 役職ごとに固定の「常に読むファイル」がある(例: CTOは`technology.md`+`constraints.md`)
- 議題テキストが役職ごとのキーワード辞書に一致した場合のみ、追加ファイルを読む
- `logs/decisions/_index.json`(Decision Log保存時に自動追記)を議題テキストと
  比較し、類似する過去の決定があれば「関連する過去の決定」として渡す
- 各ファイルの`last_updated`が`KNOWLEDGE_STALE_DAYS`(既定90日、`.env`で調整可)を
  超えていれば、鮮度警告を自動的に付記する
