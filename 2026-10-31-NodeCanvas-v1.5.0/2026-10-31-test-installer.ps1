param([Parameter(Mandatory=$true)][string]$Installer)
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$work=Join-Path $root ('.runtime\2026-10-31-installer-tests-'+[guid]::NewGuid().ToString('N'))
$seed=Join-Path (Split-Path $root) '2026-10-31-NodeCanvas-v1.3.0\.runtime\native-check-9a59d4c197514125b7f10c90b013f921'
New-Item -ItemType Directory -Path $work | Out-Null
function Run([string[]]$Arguments,[int]$Expected=0){$p=Start-Process -FilePath $Installer -ArgumentList ($Arguments | ForEach-Object {'"'+$_+'"'}) -Wait -PassThru -WindowStyle Hidden;if($p.ExitCode -ne $Expected){throw ('Unexpected exit '+$p.ExitCode+' for '+($Arguments -join ' '))}}
$target=Join-Path $work 'v1.4.1'
Run @('--test-repair',$target,$seed)
Run @('--check-installed',$target)
$manifest=Join-Path $target '2026-10-31-payload.sha256'
$trusted=[IO.File]::ReadAllText($manifest)
foreach($tamper in @('',(($trusted -split "`n" | Select-Object -First 1) -join "`n"),($trusted+"`n"+('0'*64)+'|fake.txt'))){
 [IO.File]::WriteAllText($manifest,$tamper)
 Run @('--check-installed',$target) 2
}
[IO.File]::WriteAllText($manifest,$trusted)
$launcher=Join-Path $target '2026-10-31-NodeCanvasConnect-v1.5.0.exe'
$launcherBytes=[IO.File]::ReadAllBytes($launcher)
Remove-Item -LiteralPath $launcher
Run @('--check-installed',$target) 2
[IO.File]::WriteAllBytes($launcher,$launcherBytes)
$launcher=Join-Path $target '2026-10-31-NodeCanvasConnect-v1.5.0.exe'
$original=(Get-FileHash $launcher).Hash
Run @('--test-repair',$target,$seed)
if((Get-FileHash $launcher).Hash -ne $original){throw 'Same-version changed launcher'}
[IO.File]::WriteAllText((Join-Path $target 'runtime\node.exe'),'corrupt')
Run @('--check-installed',$target) 2
Run @('--test-repair',$target,$seed)
Remove-Item -LiteralPath (Join-Path $target 'connector\2026-10-31-server.mjs')
Run @('--check-installed',$target) 2
Run @('--test-repair',$target,$seed)
foreach($failure in @(0,1)){
 $stage=Join-Path $work ('stage-'+$failure)
 Run @('--test-repair',$stage,$seed)
 Run @('--test-update',$stage,$target,"$failure") 1
 Run @('--check-installed',$target)
 Run @('--check-installed',$stage)
 if((Get-FileHash $launcher).Hash -ne $original){throw 'Rollback lost original'}
}
$lockedStage=Join-Path $work 'locked-stage'
Run @('--test-repair',$lockedStage,$seed)
$lock=[IO.File]::Open((Join-Path $target 'licenses\2026-10-31-Node-LICENSE.txt'),'Open','Read','None')
try{Run @('--test-update',$lockedStage,$target) 1}finally{$lock.Dispose()}
Run @('--check-installed',$target)
$outside=Join-Path $work 'outside';New-Item -ItemType Directory -Path $outside | Out-Null
$link=Join-Path $target 'linked'
$junctionCreated=$false
try{New-Item -ItemType Junction -Path $link -Target $outside -ErrorAction Stop | Out-Null;$junctionCreated=$true}catch{Write-Warning ('SKIP reparse fixture: OS/sandbox rejected junction creation: '+$_.Exception.Message)}
if($junctionCreated){
 Run @('--test-update',$lockedStage,$target) 1
 if((Get-ChildItem -LiteralPath $outside).Count -ne 0){throw 'Reparse escaped target'}
 [IO.Directory]::Delete($link)
}
Run @('--check-installed',$target)
# Exercise the same removal routine without AppData or registry access.
$helper=Join-Path $work '2026-10-31-Uninstall-v1.5.0.exe'
Copy-Item -LiteralPath (Join-Path $target '2026-10-31-Uninstall-v1.5.0.exe') -Destination $helper
$preserved=Join-Path $target 'user-note.txt';[IO.File]::WriteAllText($preserved,'keep')
$u=Start-Process -FilePath $helper -ArgumentList @('--test-remove',('"'+$target+'"')) -Wait -PassThru -WindowStyle Hidden
if($u.ExitCode -ne 0 -or !(Test-Path -LiteralPath $preserved) -or (Test-Path -LiteralPath $launcher)){throw 'Uninstall failed or lost user file'}
Write-Host ('PASS: fresh, same-version, corrupt runtime, missing payload, pre/post-swap rollback, locked license. Reparse tested='+$junctionCreated+'. Evidence: '+$work)
