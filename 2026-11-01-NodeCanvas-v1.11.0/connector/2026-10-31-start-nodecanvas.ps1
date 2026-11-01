param([string]$SiteUrl = 'http://127.0.0.1:7330')
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22 이상을 먼저 설치하세요.' }
$taskNodeMajor = [int]((& node --version) -replace '^v(\d+).*$', '$1')
if ($taskNodeMajor -lt 22) { throw 'Node.js 22 이상이 필요합니다.' }
$taskCodex = Get-Command codex.exe -ErrorAction SilentlyContinue
if ($taskCodex) { $env:NODECANVAS_CODEX = $taskCodex.Source }
else {
  $taskShim = Get-Command codex -ErrorAction SilentlyContinue
  if ($taskShim) {
    $taskCodexJs = Join-Path (Split-Path $taskShim.Source) 'node_modules\@openai\codex\bin\codex.js'
    if (Test-Path -LiteralPath $taskCodexJs) { $env:NODECANVAS_CODEX_JS = $taskCodexJs }
  }
}
Write-Host 'NodeCanvas 연결 앱을 시작합니다. 아래 연결 코드를 웹의 AI 연결 창에 입력하세요.'
& node (Join-Path $PSScriptRoot '2026-10-31-server.mjs') --origin $SiteUrl
