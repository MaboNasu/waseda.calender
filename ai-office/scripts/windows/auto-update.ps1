# AI Office 自動更新スクリプト(Windowsタスクスケジューラから定期実行される)
#
# 目的: GitHubにpushされた変更を検知したら、自動で
#   git pull -> npm install -> 構文チェック -> pm2再起動
# まで行う。人が手でnpm install/再起動をする必要をなくすための「地盤」。
#
# 安全策: 構文チェック(node --check)に失敗した場合は再起動を中止し、
# 現在動いているBotをそのまま動かし続ける(壊れたコードでBotを落とさない)。

$ErrorActionPreference = 'Stop'

# 反映を追いかけるブランチ。ai-office関連の作業が別ブランチに移ったら、ここを書き換える。
$branch = 'claude/waseda-calendar-ai-office-z60dya'

$scriptDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..\..')
$aiOfficeDir = Join-Path $repoRoot 'ai-office'
$logDir = Join-Path $aiOfficeDir 'logs'
$logFile = Join-Path $logDir 'auto-update.log'

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logFile -Value "[$timestamp] $Message"
}

try {
  Set-Location $repoRoot

  git fetch origin $branch *>&1 | Out-Null
  $localHash = (git rev-parse HEAD).Trim()
  $remoteHash = (git rev-parse "origin/$branch").Trim()

  if ($localHash -eq $remoteHash) {
    # 変更なし。ログを汚さないため何も書かずに終了。
    exit 0
  }

  Write-Log "変更を検知しました ($localHash -> $remoteHash)。更新を開始します。"

  git pull origin $branch *>&1 | Out-Null

  Set-Location $aiOfficeDir
  npm install *>&1 | Out-Null

  # 構文チェック: 壊れたコードのままBotを再起動しないための安全策。
  $checkFailed = $false
  Get-ChildItem -Path (Join-Path $aiOfficeDir 'src') -Recurse -Filter '*.js' | ForEach-Object {
    node --check $_.FullName
    if ($LASTEXITCODE -ne 0) {
      $checkFailed = $true
      Write-Log "構文エラー: $($_.FullName)"
    }
  }

  if ($checkFailed) {
    Write-Log "構文チェックに失敗したため、再起動を中止しました。現在のBotはそのまま動作を継続します。"
    exit 1
  }

  pm2 restart ai-office *>&1 | Out-Null
  Write-Log "更新完了。Botを再起動しました。"
}
catch {
  Write-Log "エラーが発生しました: $_"
  exit 1
}
