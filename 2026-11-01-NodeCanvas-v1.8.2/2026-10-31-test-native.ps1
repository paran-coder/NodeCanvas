$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskSetup=Join-Path $taskRoot 'web\2026-10-31-NodeCanvas-Setup-v1.4.1.exe'
$taskPortable=Join-Path $taskRoot ('.runtime\native-check-'+[guid]::NewGuid().ToString('N'))
$taskExtract=Start-Process -FilePath $taskSetup -ArgumentList @('--extract-only',('"'+$taskPortable+'"')) -Wait -PassThru -WindowStyle Hidden
if($taskExtract.ExitCode -ne 0){throw 'Payload extraction failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRuntime=Join-Path $taskPortable 'runtime'
New-Item -ItemType Directory -Path $taskRuntime | Out-Null
$taskAssets=@(
 @{Name='node';Hash='6e50ce5498c0cebc20fd39ab3ff5df836ed2f8a31aa093cecad8497cff126d70';Files=@{'node.exe'='node.exe'}},
 @{Name='codex';Hash='c19dd84738dee791c4d39a96bd080d94f098af074ae9d2ef5e27d3d85a122665';Files=@{'codex-x86_64-pc-windows-msvc.exe'='codex.exe';'codex-command-runner.exe'='codex-command-runner.exe';'codex-windows-sandbox-setup.exe'='codex-windows-sandbox-setup.exe'}},
 @{Name='host';Hash='99e86c60dc20d7ca5b17062922062216700c67d146836a795370b7a8da7c4d14';Files=@{'codex-code-mode-host-x86_64-pc-windows-msvc.exe'='codex-code-mode-host.exe'}}
)
foreach($taskAsset in $taskAssets){$taskArchive=Join-Path $taskRoot ('.runtime\downloads\'+$taskAsset.Name+'.zip');if((Get-FileHash $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskAsset.Hash){throw 'Hash mismatch'};$taskZip=[IO.Compression.ZipFile]::OpenRead($taskArchive);try{foreach($taskName in $taskAsset.Files.Keys){$taskEntry=@($taskZip.Entries | Where-Object {[IO.Path]::GetFileName($_.FullName) -eq $taskName});if($taskEntry.Count -ne 1){throw 'Unexpected ZIP contents'};[IO.Compression.ZipFileExtensions]::ExtractToFile($taskEntry[0],(Join-Path $taskRuntime $taskAsset.Files[$taskName]))}}finally{$taskZip.Dispose()}}
$taskData=Join-Path $taskPortable 'test-data';New-Item -ItemType Directory -Path $taskData | Out-Null
[IO.File]::WriteAllText((Join-Path $taskData 'trusted-origins.txt'),"http://localhost:7330`n")
$taskSecret='b'*64;$taskSha=[Security.Cryptography.SHA256]::Create();$taskChallenge=[BitConverter]::ToString($taskSha.ComputeHash([Text.Encoding]::UTF8.GetBytes($taskSecret))).Replace('-','').ToLowerInvariant();$taskSha.Dispose()
$env:NODECANVAS_PORTABLE_DATA=$taskData
$taskUri='nodecanvas://connect?origin=http%3A%2F%2Flocalhost%3A7330&challenge='+$taskChallenge
$taskLauncher=Start-Process -FilePath (Join-Path $taskPortable '2026-10-31-NodeCanvasConnect-v1.4.1.exe') -ArgumentList ('"'+$taskUri+'"') -PassThru -WindowStyle Hidden
$taskHttp=New-Object Net.WebClient
try{
 for($taskIndex=0;$taskIndex -lt 30;$taskIndex++){try{$taskReady=$taskHttp.DownloadString('http://127.0.0.1:7330/api/ready') | ConvertFrom-Json;break}catch{Start-Sleep -Milliseconds 500}}
 if($taskReady.version -ne '1.4.1'){throw 'Native startup failed'}
 $taskHeaders=@{Origin='http://localhost:7330'}
 $taskClaim=Invoke-RestMethod 'http://127.0.0.1:7330/api/claim' -Method Post -Headers $taskHeaders -ContentType 'application/json' -Body (@{secret=$taskSecret;tabId='native-test'} | ConvertTo-Json)
 if($taskClaim.token.Length -ne 64){throw 'Native activation claim failed'}
 Write-Output ('Native activation + official-runtime payload PASS; PID='+$taskLauncher.Id+'; portable='+$taskPortable)
 $taskLauncher.WaitForExit(105000) | Out-Null
 if(!$taskLauncher.HasExited){throw 'Last-tab grace expiry failed'}
 if($taskLauncher.ExitCode -ne 0){throw 'Native exit failed'}
 Write-Output 'Native helper and launcher exited after last-tab grace: PASS'
 @{version='1.4.1';nativeActivation=$true;officialRuntimeHashes=$true;lastTabExit=$true;portable=$taskPortable;completedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $taskRoot '.runtime\2026-10-31-native-verification.json') -Encoding utf8
}finally{$taskHttp.Dispose();Remove-Item Env:NODECANVAS_PORTABLE_DATA -ErrorAction SilentlyContinue}
