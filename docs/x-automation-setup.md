# X(旧Twitter)自動投稿 セットアップ手順

Waseda Calendar公式X(@waseda_calendar)への自動投稿(`scripts/x-automation/`)を実際に動かすには、
X Developer Portal側の設定と、GitHub Secrets/Variablesの設定が必要です。認証情報の発行は
セキュリティ上、運営者本人にしか行えないため、以下だけは代行できません。

これ以外の日常運用(投稿するかどうかの判断・文章生成・URL生成・投稿・ログ記録)はすべて
GitHub Actionsが自動で行います。この手順が終われば、日常的にXを開いて操作する必要はありません。

---

## 1. X Developer Portalでアプリを作成する(初回のみ)

1. [developer.x.com](https://developer.x.com/) にアクセスし、@waseda_calendar でログイン
2. 開発者アカウントの登録がまだの場合は登録する(用途は「自分のアカウントからの情報配信の自動化」等、正直に記入)
3. 新しいプロジェクト・アプリを作成する
4. アプリの設定で **「User authentication settings」** を有効化し、以下を設定:
   - App permissions: **Read and write**(投稿に書き込み権限が必須)
   - Type of App: **Web App, Automated App or Bot**
   - Callback URI: `https://wasedacalendar.com`(実際には使わないが入力必須のため仮で可)
   - Website URL: `https://wasedacalendar.com`

## 2. OAuth 1.0aの4つの認証情報を発行する

このシステムはOAuth 1.0a(ユーザーコンテキスト)を使います。理由: X API v2の投稿エンドポイントは
ユーザーコンテキスト認証が必須で、OAuth 2.0だとアクセストークンの定期更新が必要になり、
人が操作しないcron実行と相性が悪いためです。OAuth 1.0aの認証情報は失効なく使えます。

1. アプリの「Keys and tokens」タブを開く
2. **API Key と API Key Secret** を生成・控える(= `X_API_KEY` / `X_API_SECRET`)
3. **Access Token と Access Token Secret** を生成・控える
   - 生成時に権限(Read and write)を確認されたら、必ず「Read and write」を選ぶこと
   - (= `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET`)
4. これら4つの値は再表示できないので、その場で安全な場所に控えてください

## 3. 支出上限を設定する(推奨・強く推奨)

X APIは従量課金です(2026-08時点、docs.x.com/x-api/getting-started/pricing で確認)。
本システムの投稿はすべてURLを含むため、投稿1件あたり約$0.20かかります(投稿頻度は既定で
週1〜数件程度に抑えてあるため、月額では数ドル程度の想定ですが、念のため上限を設定してください)。

1. Developer Consoleの支出設定(Spending limits)で、月あたりの上限額を設定する
2. 必要であれば自動チャージ(Auto-recharge)も設定する

## 4. GitHub Secretsに認証情報を登録する

このリポジトリ(`MaboNasu/waseda.calender`)の **Settings → Secrets and variables → Actions → Secrets** で、
以下の4つを登録してください(名前は完全一致させること):

| Secret名 | 値 |
|---|---|
| `X_API_KEY` | 手順2で控えたAPI Key |
| `X_API_SECRET` | 手順2で控えたAPI Key Secret |
| `X_ACCESS_TOKEN` | 手順2で控えたAccess Token |
| `X_ACCESS_TOKEN_SECRET` | 手順2で控えたAccess Token Secret |

## 5. GitHub Variablesで運用モードを設定する

同じ画面の **Variables** タブで、以下を設定してください:

| Variable名 | 値 | 説明 |
|---|---|---|
| `X_AUTOMATION_ENABLED` | `true` | Kill Switch。`false`にすると全自動投稿を即座に停止できます(コード変更不要) |
| `X_DRY_RUN` | `true` → 動作確認後に `false` | `true`の間は実際には投稿せず、GitHub Actionsのログに「投稿していたら何を投稿していたか」だけが出力されます |

**まずは `X_DRY_RUN=true` のまま数日〜1週間ほど運用し、Actionsのログで投稿内容・タイミング・
頻度に問題が無いことを確認してから `X_DRY_RUN=false` に変更することを強く推奨します。**

## 6. 動作確認

1. リポジトリの **Actions** タブ → 「X投稿(朝・今週/今日/テーマ/おすすめ誘導)」を選択
2. 「Run workflow」から手動実行(dry_run欄は `true` のままでよい)
3. 実行ログに、その日の判断結果(投稿する/しないと、その理由)が出力されるので確認する
4. 問題なければ、そのまま毎朝7:30 JST・毎昼12:30 JSTの定期実行に任せてよい

## 7. 停止したくなったら

- **一時停止**: GitHub Variablesの `X_AUTOMATION_ENABLED` を `false` にする(コード変更不要、即座に反映)
- **投稿だけ止めてログは見たい**: `X_DRY_RUN` を `true` に戻す
- **完全に削除**: `.github/workflows/x-post-morning.yml` / `x-post-midday.yml` を削除するか、
  GitHub Actions画面からワークフローを無効化する

---

## 参考: ローカルで試す場合

```bash
# 特定の日付を「今日」として動作確認したい場合(投稿はしない)
WC_NOW_OVERRIDE=2026-08-24 node scripts/x-automation/decide-and-post.js --slot=all

# 実際に投稿する場合(認証情報を.envまたは環境変数に設定した上で)
X_DRY_RUN=false node scripts/x-automation/decide-and-post.js --slot=morning
```

`.env`ファイルを使う場合は、リポジトリ直下に`.env`を作成し(`.gitignore`済みなのでコミットされません)、
`X_API_KEY=...`のように1行ずつ書いた上で、実行前に読み込んでください(例: `set -a; source .env; set +a`)。
