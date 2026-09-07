#!/bin/bash
# AI Office 自動更新セットアップスクリプト(Linux VM。初回のみ、1回だけ実行する)
#
# これを実行すると:
#   1. Node.js/pm2をインストールし、Botをpm2管理下で起動する
#   2. pm2をVM再起動後も自動復帰するよう設定する(systemd)
#   3. 5分ごとにGitHubの変更を確認して自動反映するcronジョブを登録する
# 以降は、あなたが何もしなくても git push するだけで数分以内にBotへ反映される。
#
# 実行方法(VMにSSH接続した状態で):
#   cd ai-office/scripts/linux
#   bash setup-auto-update.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_OFFICE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== 1/5: Node.jsの有無を確認します ==="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.jsをインストールします(NodeSource経由、LTS版)..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "Node.jsは既にインストール済みです: $(node --version)"
fi

echo "=== 2/5: pm2をインストールします ==="
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
else
  echo "pm2は既にインストール済みです。"
fi

echo "=== 3/5: 依存パッケージをインストールし、Botを起動します ==="
cd "$AI_OFFICE_DIR"
npm install

# 初回実行時は「削除対象が存在しない」というpm2側のエラーが出るが無視してよい。
pm2 delete ai-office >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save

echo "=== 4/5: VM再起動後も自動復帰するよう設定します ==="
STARTUP_CMD=$(pm2 startup systemd -u "$(whoami)" --hp "$HOME" | tail -1)
echo "実行するコマンド: $STARTUP_CMD"
eval "$STARTUP_CMD"
pm2 save

echo "=== 5/5: 5分ごとの自動更新ジョブ(cron)を登録します ==="
AUTO_UPDATE_SCRIPT="$SCRIPT_DIR/auto-update.sh"
chmod +x "$AUTO_UPDATE_SCRIPT"
CRON_LINE="*/5 * * * * /bin/bash $AUTO_UPDATE_SCRIPT"
( crontab -l 2>/dev/null | grep -vF "$AUTO_UPDATE_SCRIPT" ; echo "$CRON_LINE" ) | crontab -

echo ""
echo "セットアップ完了です。"
echo "今後は git push するだけで、5分以内にBotへ反映されます。"
echo "更新ログ: ai-office/logs/auto-update.log"
echo "Botのログ: ai-office/logs/pm2-out.log / pm2-error.log"
echo ""
echo "動作確認コマンド: pm2 status"
