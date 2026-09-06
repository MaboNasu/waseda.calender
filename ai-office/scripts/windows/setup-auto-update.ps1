# AI Office 自動更新セットアップスクリプト(初回のみ、1回だけ実行する)
#
# これを実行すると:
#   1. pm2をインストールし、Botをpm2管理下で起動する
#   2. 5分ごとにGitHubの変更を確認して自動反映するタスクを登録する
#   3. PCログオン時に自動でBotを起動するタスクを登録する
# 以降は、あなたが何もしなくても git push するだけで数分以内にBotへ反映される。
#
# 実行方法(PowerShellで):
#   cd ai-office\scripts\windows
#   powershell -ExecutionPolicy Bypass -File .\setup-auto-update.ps1

$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
$aiOfficeDir = Resolve-Path (Join-Path $scriptDir '..\..')

Write-Host "=== 1/4: pm2をインストールします ==="
npm install -g pm2

Write-Host "=== 2/4: 依存パッケージをインストールし、Botを起動します ==="
Set-Location $aiOfficeDir
npm install

# 既に古い形(restart.batやnpm start)で起動している場合に備え、
# 同名のpm2プロセスがあれば一度削除してから起動し直す。
pm2 delete ai-office 2>$null
pm2 start ecosystem.config.cjs
pm2 save

Write-Host "=== 3/4: 5分ごとの自動更新タスクを登録します ==="
$autoUpdateScript = Join-Path $scriptDir 'auto-update.ps1'
schtasks /create /tn "AIOffice-AutoUpdate" `
  /tr "powershell.exe -ExecutionPolicy Bypass -File `"$autoUpdateScript`"" `
  /sc minute /mo 5 /f | Out-Null

Write-Host "=== 4/4: ログオン時の自動起動タスクを登録します ==="
schtasks /create /tn "AIOffice-StartOnLogon" `
  /tr "pm2 resurrect" `
  /sc onlogon /f | Out-Null

Write-Host ""
Write-Host "セットアップ完了です。"
Write-Host "今後は git push するだけで、5分以内にBotへ自動反映されます。"
Write-Host "更新ログ: ai-office\logs\auto-update.log"
Write-Host "Botのログ: ai-office\logs\pm2-out.log / pm2-error.log"
Write-Host ""
Write-Host "動作確認コマンド: pm2 status"
