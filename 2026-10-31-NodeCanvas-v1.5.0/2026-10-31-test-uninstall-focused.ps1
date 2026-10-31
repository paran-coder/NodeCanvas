param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$work=Join-Path $PSScriptRoot ('.runtime\2026-10-31-uninstall-focused-'+[guid]::NewGuid().ToString('N'))
$fixture=Join-Path $work 'fixture'
New-Item -ItemType Directory -Path $work | Out-Null
function Invoke-Native([string]$Exe,[string[]]$Arguments,[int]$Expected=0){$p=Start-Process -FilePath $Exe -ArgumentList ($Arguments|ForEach-Object {'"'+$_+'"'}) -Wait -PassThru -WindowStyle Hidden;if($p.ExitCode -ne $Expected){throw ('Unexpected exit '+$p.ExitCode)}}
Invoke-Native $Installer @('--extract-only',$fixture)
$helper=Join-Path $work '2026-10-31-Uninstall-v1.5.0.exe'
Copy-Item -LiteralPath (Join-Path $fixture '2026-10-31-Uninstall-v1.5.0.exe') -Destination $helper
$manifest=Join-Path $fixture '2026-10-31-payload.sha256'
$trusted=[IO.File]::ReadAllText($manifest)
$note=Join-Path $fixture 'web\user-note.txt';[IO.File]::WriteAllText($note,'preserve unknown web file')
$launcher=Join-Path $fixture '2026-10-31-NodeCanvasConnect-v1.5.0.exe'
$hash=(Get-FileHash $launcher).Hash
$lines=[IO.File]::ReadAllLines($manifest)
$cases=@('',($lines[0]),($trusted+('0'*64)+'|web/user-note.txt'+"`n"),($trusted.Replace($lines[0],(('G'*64)+'|'+($lines[0] -split '\|')[1]))),($trusted+$lines[0]+"`n"))
foreach($bad in $cases){
 [IO.File]::WriteAllText($manifest,$bad)
 Invoke-Native $helper @('--test-remove',$fixture) 1
 if(!(Test-Path -LiteralPath $note) -or (Get-FileHash $launcher).Hash -ne $hash){throw 'Invalid manifest removed files'}
}
[IO.File]::WriteAllText($manifest,$trusted)
Invoke-Native $helper @('--test-remove',$fixture)
if(!(Test-Path -LiteralPath $note) -or (Test-Path -LiteralPath $launcher)){throw 'Valid removal lost unknown file or retained owned launcher'}
$bytes=(Get-ChildItem -LiteralPath $work -Recurse -File|Measure-Object Length -Sum).Sum
Write-Host ('PASS: empty, truncated, unknown web path, nonhex hash, duplicate manifest rejected without removal; valid removal preserves unknown web file. Evidence: '+$work+' Remaining bytes: '+$bytes)
