#!/bin/bash
# AI Office 自動更新スクリプト(Linux VM。cronから定期実行される)
#
# 目的: GitHubにpushされた変更を検知したら、自動で
#   git pull -> npm install -> 構文チェック -> pm2再起動
# まで行う。Windows版(scripts/windows/auto-update.ps1)のLinux移植版。
#
# 安全策: 構文チェック(node --check)に失敗した場合は再起動を中止し、
# 現在動いているBotをそのまま動かし続ける(壊れたコードでBotを落とさない)。

set -uo pipefail

# 反映を追いかけるブランチ。ai-office関連の作業が別ブランチに移ったら、ここを書き換える。
BRANCH="claude/waseda-calendar-ai-office-z60dya"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
AI_OFFICE_DIR="$REPO_ROOT/ai-office"
LOG_DIR="$AI_OFFICE_DIR/logs"
LOG_FILE="$LOG_DIR/auto-update.log"

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

cd "$REPO_ROOT" || { log "エラー: リポジトリのディレクトリに移動できません"; exit 1; }

git fetch origin "$BRANCH" >/dev/null 2>&1
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
  # 変更なし。ログを汚さないため何も書かずに終了。
  exit 0
fi

log "変更を検知しました ($LOCAL_HASH -> $REMOTE_HASH)。更新を開始します。"

if ! git pull origin "$BRANCH" >/dev/null 2>&1; then
  log "エラー: git pullに失敗しました。"
  exit 1
fi

cd "$AI_OFFICE_DIR" || { log "エラー: ai-officeディレクトリに移動できません"; exit 1; }

if ! npm install >/dev/null 2>&1; then
  log "エラー: npm installに失敗しました。再起動を中止します。"
  exit 1
fi

# 構文チェック: 壊れたコードのままBotを再起動しないための安全策。
CHECK_FAILED=0
while IFS= read -r -d '' file; do
  if ! node --check "$file" 2>>"$LOG_FILE"; then
    CHECK_FAILED=1
    log "構文エラー: $file"
  fi
done < <(find "$AI_OFFICE_DIR/src" -name '*.js' -print0)

if [ "$CHECK_FAILED" -eq 1 ]; then
  log "構文チェックに失敗したため、再起動を中止しました。現在のBotはそのまま動作を継続します。"
  exit 1
fi

pm2 restart ai-office >/dev/null 2>&1
log "更新完了。Botを再起動しました。"
