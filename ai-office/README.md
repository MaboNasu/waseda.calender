# WasedaCalendar AI Office

Discord上に複数のAI役職(CEO/CTO/CFO/マーケティング/法務・リスク/反対意見役)を配置し、
議題に対して各役職が意見表明→反論→修正のラウンドを経て、CEO役AIが最終決定するBot。

「誰が何を主張し」「誰にどう反論され」「反論を受けてどう修正したか」「なぜその決定に至ったか」
という意思決定過程をDiscordスレッド上にそのまま可視化する。

役職ごとに OpenAI / Google Gemini / Groq という異なるプロバイダーを割り当てており、
単一モデルにペルソナを演じさせるだけの構成にはしていない(詳細は `src/roles/roles.config.js`)。

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
```

Discord Developer Portal で、Botに以下の権限を付与しておくこと:
- `applications.commands`(スラッシュコマンド)
- `bot` スコープ + `Manage Webhooks` / `Create Public Threads` / `Send Messages` / `Send Messages in Threads`

## APIキーなしでの動作確認(ドライラン)

Discordトークンや各社APIキーが揃う前でも、会議フロー自体(意見表明→反論→修正→CEO決定)の
ロジックが壊れていないかはこれで確認できる。実際のAPI呼び出しやDiscord接続は一切行わない。

```bash
npm run dry-run -- "議題をここに書く(省略可)"
```

`src/providers/mock.js` がダミー応答を返すだけで、料金も発生しない。

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

- `/meeting start topic:<議題> rounds:<任意、既定1>` — 会議スレッドを新規作成して開始
- `/meeting decision` — そのスレッドの最終決定を再表示
- `/meeting cost` — この会議・当月累計のAPI利用コストを表示
- `/meeting cancel` — 進行中の会議を中断

概算コストが `COST_CONFIRM_THRESHOLD_USD`(既定 $0.5)を超える場合、開始前に確認ボタンが出る。
月間予算 `MONTHLY_BUDGET_USD`(既定 $5)を超過している場合や、1日の開始回数上限
`DAILY_MEETING_LIMIT`(既定5回)に達している場合は新規会議の開始を拒否する。

## ログの場所

- `logs/meetings/<meetingId>.json` — 会議ごとの完全な構造化トランスクリプト(発言・反論・修正・決定)
- `logs/usage/<YYYY-MM>.jsonl` — API呼び出し1件ごとのトークン数・推定コスト(月次)
- いずれもリポジトリにはコミットしない(`.gitignore` で除外済み)。Bot稼働ホスト上のディスクに蓄積される。

料金単価は `src/cost/pricing.json` で手動管理している。プロバイダー側の値下げ/値上げがあれば
この1ファイルを更新するだけでよい。Groqの `openai/gpt-oss-120b` は無料枠内であれば実質0円だが、
単価は暫定値なので実際の請求と乖離がないか定期的に確認すること。

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
  index.js                Botエントリポイント(Gateway接続・コマンドハンドリング)
  discord/                 スラッシュコマンド定義・登録・Webhook経由の役職別投稿
  providers/               OpenAI/Gemini/Groqの共通インターフェース実装
  roles/                   役職定義(担当プロバイダー/モデル/persona prompt)
  orchestrator/            会議フロー(意見表明→反論→修正→CEO決定)とプロンプト組み立て
  cost/                    料金単価表・使用量トラッカー・予算ガード
  storage/                 会議トランスクリプトの保存/読み出し
logs/                      実行時に生成される会議ログ・使用量ログ(gitignore対象)
```
