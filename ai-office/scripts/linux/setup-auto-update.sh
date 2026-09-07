#!/bin/bash
# AI Office 自動更新セットアップスクリプト(Linux VM。初回のみ、1回だけ実行する)
#
# これを実行すると:
#   1. Node.js/pm2をインストールし、Botをpm2管理下で起動する
#   2. pm2をVM再起動後も自動復帰するよう設定する(systemd)
#   3. 5分ごとにGitHubの変更を確認して自動反映するcronジョブを登録する
# 以降は、あなたが何もしなくても git push するだけで数分以内にBotへ反映される。
#
# Ubuntu(apt)・Oracle Linux/RHEL系(dnf)の両方に対応。
#
# 実行方法(VMにSSH接続した状態で):
#   cd ai-office/scripts/linux
#   bash setup-auto-update.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI_OFFICE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

if command -v apt-get >/dev/null 2>&1; then
  PKG_MANAGER="apt"
elif command -v dnf >/dev/null 2>&1; then
  PKG_MANAGER="dnf"
elif command -v yum >/dev/null 2>&1; then
  PKG_MANAGER="yum"
else
  echo "エラー: apt/dnf/yumのいずれも見つかりません。未対応のディストリビューションです。"
  exit 1
fi
echo "パッケージマネージャ: $PKG_MANAGER"

echo "=== 1/6: gitとcron(定期実行の仕組み)の有無を確認します ==="
if [ "$PKG_MANAGER" = "apt" ]; then
  sudo apt-get update -y
  command -v git >/dev/null 2>&1 || sudo apt-get install -y git
  command -v crontab >/dev/null 2>&1 || sudo apt-get install -y cron
  sudo systemctl enable --now cron
else
  command -v git >/dev/null 2>&1 || sudo "$PKG_MANAGER" install -y git
  command -v crontab >/dev/null 2>&1 || sudo "$PKG_MANAGER" install -y cronie
  sudo systemctl enable --now crond
fi

echo "=== 2/6: Node.jsの有無を確認します ==="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.jsをインストールします(NodeSource経由、LTS版)..."
  if [ "$PKG_MANAGER" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo -E bash -
    sudo "$PKG_MANAGER" install -y nodejs
  fi
else
  echo "Node.jsは既にインストール済みです: $(node --version)"
fi

echo "=== 3/6: pm2をインストールします ==="
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
else
  echo "pm2は既にインストール済みです。"
fi

echo "=== 4/6: 依存パッケージをインストールし、Botを起動します ==="
cd "$AI_OFFICE_DIR"
npm install

# 初回実行時は「削除対象が存在しない」というpm2側のエラーが出るが無視してよい。
pm2 delete ai-office >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save

echo "=== 5/6: VM再起動後も自動復帰するよう設定します ==="
STARTUP_CMD=$(pm2 startup systemd -u "$(whoami)" --hp "$HOME" | tail -1)
echo "実行するコマンド: $STARTUP_CMD"
eval "$STARTUP_CMD"
pm2 save

echo "=== 6/6: 5分ごとの自動更新ジョブ(cron)を登録します ==="
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
