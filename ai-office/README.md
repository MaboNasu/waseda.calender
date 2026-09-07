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
  `pm2 start ecosystem.config.cjs` のようにプロセスマネージャ配下に置く
  (クラッシュ時に自動再起動させるため)。
- 既存のVPSがあれば `systemd` サービス化してもよい。
- ローカルPCでの実行は、PCがオフラインの間はBotも停止するという制約が残る
  (下記の「Windows PCでの自動更新」を使えば、起動している間の運用は自動化できる)。

## Windows PCでの自動更新(git pushするだけでBotへ反映される)

`scripts/windows/` に、Windows PC上でBotを動かす場合の自動更新の仕組みを用意している。
これを使うと、コードの変更をpushした後の「git pull → npm install → 再起動」を
人が手で行う必要がなくなる。

**初回セットアップ(1回だけ、PowerShellで実行)**:
```powershell
cd ai-office\scripts\windows
powershell -ExecutionPolicy Bypass -File .\setup-auto-update.ps1
```

これで以下が行われる。
1. `pm2`(プロセスマネージャ)をインストールし、pm2管理下でBotを起動(`ecosystem.config.cjs`)
2. **5分ごとに**GitHubの変更を確認し、変更があれば
   `git pull` → `npm install` → 構文チェック(`node --check`) → `pm2 restart` を自動実行する
   タスク(`AIOffice-AutoUpdate`)をタスクスケジューラに登録
3. PCログオン時に自動でBotを起動する設定(スタートアップフォルダに`ai-office-resume.bat`を配置し、
   `pm2 resurrect`を実行する)。`schtasks`の`/sc onlogon`は環境によって権限不足で
   失敗することがあるため、より単純なこの方式を採用している。

構文チェックに失敗した場合(壊れたコードがpushされた場合)は、再起動を中止し、
現在動いているBotをそのまま動かし続ける安全策が入っている。

- 更新ログ: `logs/auto-update.log`(変更を検知して更新した時だけ記録される)
- Botの標準出力/エラーログ: `logs/pm2-out.log` / `logs/pm2-error.log`
- 状態確認: `pm2 status`
- 反映を追いかけるブランチは `scripts/windows/auto-update.ps1` 先頭の `$branch` で指定している
  (現在は `claude/waseda-calendar-ai-office-z60dya`。mainにマージされた後は書き換えること)。

旧来の `restart.bat`(手動で`npm start`するだけ)は緊急時の手動起動用に残しているが、
通常運用では上記のpm2ベースの自動更新に一本化する想定。

## Linux VM(Oracle Cloud等)での自動更新

`scripts/linux/` に、Windows版と同じ仕組みのLinux(Ubuntu想定)移植版を用意している。
24時間稼働のクラウドVMに移行する場合はこちらを使う。

**初回セットアップ(VMにSSH接続した状態で1回だけ)**:
```bash
cd ai-office/scripts/linux
bash setup-auto-update.sh
```

これで以下が行われる。
1. Node.js(未インストールの場合)・pm2をインストールし、pm2管理下でBotを起動
2. `pm2 startup`(systemd)でVM再起動後もBotが自動復帰するよう設定
3. **5分ごとに**GitHubの変更を確認し、変更があれば
   `git pull` → `npm install` → 構文チェック → `pm2 restart` を自動実行するcronジョブを登録

Windows版と同じく、構文チェックに失敗した場合は再起動を中止する安全策が入っている。
反映を追いかけるブランチは `scripts/linux/auto-update.sh` 先頭の `BRANCH` で指定している。

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

## 決定事項のGitHub Issue自動起票(任意)

`GITHUB_TOKEN`・`GITHUB_REPO`(`owner/repo`形式)の両方を`.env`に設定すると、
CEOが「採用」と決定し、かつOwner承認が不要(または承認ボタンで承認済み)になった
時点で、その決定内容(議題・根拠・検証方法・Decision Logのパス)を対象リポジトリの
GitHub Issueとして自動起票する(`src/integrations/githubIssue.js`)。

- **コード変更は一切自動化しない**。あくまで「人間がすぐ着手できる形にする」だけで、
  実装・コミット・PR作成は引き続き人間(またはOwnerが別途依頼したClaude Code等)が行う。
- 未設定の場合は完全に無効(オプトイン機能)。起票に失敗しても会議フロー自体は
  止めず、スレッドに警告を投稿するのみ。
- 「不採用」「保留」「実験」の決定や、Owner承認待ちのまま/却下された決定では起票しない。
