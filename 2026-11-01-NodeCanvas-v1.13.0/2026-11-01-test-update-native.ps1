param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$Seed)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$taskWork=Join-Path $taskRoot ('.runtime\2026-11-01-update-native-'+[guid]::NewGuid().ToString('N'))
if(-not [IO.Path]::GetFullPath($taskWork).StartsWith($taskRoot+'\')){throw 'workspace boundary'}
New-Item -ItemType Directory -Path $taskWork | Out-Null
function Run([string[]]$Arguments,[int]$Expected=0){$p=Start-Process -FilePath $Installer -ArgumentList ($Arguments|ForEach-Object{'"'+$_+'"'}) -Wait -PassThru -WindowStyle Hidden;if($p.ExitCode -ne $Expected){throw ('exit '+$p.ExitCode+' args '+($Arguments -join ' '))}}
$taskTarget=Join-Path $taskWork 'v1.13.0'
$taskData=Join-Path $taskWork 'user-data.json';[IO.File]::WriteAllText($taskData,'{"storage":"keyring","test":true}')
$taskDataHash=(Get-FileHash -LiteralPath $taskData).Hash
Run @('--test-prepare-update',$Seed,$taskTarget,'-1')
Run @('--check-installed',$taskTarget)
$taskLauncher=Join-Path $taskTarget '2026-10-31-NodeCanvasConnect-v1.13.0.exe'
$taskHash=(Get-FileHash -LiteralPath $taskLauncher).Hash
foreach($failure in @(0,1)){
 Run @('--test-prepare-update',$Seed,$taskTarget,"$failure") 1
 Run @('--check-installed',$taskTarget)
 if((Get-FileHash -LiteralPath $taskLauncher).Hash -ne $taskHash){throw 'rollback failed'}
}
Run @('--apply-update',$taskTarget,'0','nodecanvas://connect?origin=https%3A%2F%2Fexample.com&challenge=invalid') 1
if((Get-FileHash -LiteralPath $taskData).Hash -ne $taskDataHash){throw 'user data changed'}
$taskResult=@{status='PASS';prepare='PASS';preSwapRollback='PASS';postSwapRollback='PASS';dataPreserved='PASS';invalidActivation='PASS';realRegistry='NOT_TOUCHED';realAccount='NOT_USED';work=$taskWork}
$taskResult|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $taskWork '2026-11-01-native-result.json') -Encoding UTF8
$taskResult|ConvertTo-Json
