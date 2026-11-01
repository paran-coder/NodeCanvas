param([string]$OutputPath='',[string]$SigningKey='')
$ErrorActionPreference='Stop'
$taskRoot=$PSScriptRoot
$taskOutput=Join-Path $taskRoot 'web\2026-10-31-NodeCanvas-Setup-v1.9.0.exe'
if($OutputPath){$taskOutput=[IO.Path]::GetFullPath($OutputPath)}
if(Test-Path -LiteralPath $taskOutput){throw '기존 설치 파일을 덮어쓰지 않습니다.'}
$taskCompiler='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$taskStage=Join-Path $taskRoot ('.runtime\build-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskStage | Out-Null
$taskSource=Join-Path $taskRoot 'installer\2026-10-31-Connector.cs'
$taskLauncher=Join-Path $taskStage '2026-10-31-NodeCanvasConnect-v1.9.0.exe'
$taskRefs=@('/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:System.Web.dll','/r:System.Web.Extensions.dll')
& $taskCompiler /nologo /codepage:65001 /target:winexe /define:LAUNCHER "/out:$taskLauncher" @taskRefs $taskSource (Join-Path $taskRoot 'installer/2026-11-01-Update.cs')
if($LASTEXITCODE -ne 0){throw '연결 앱 컴파일 실패'}
$taskUninstaller=Join-Path $taskStage '2026-10-31-Uninstall-v1.9.0.exe'
$taskInventory=Join-Path $taskStage '2026-10-31-owned-files.txt'
$taskOwned=@('2026-10-31-Uninstall-v1.9.0.exe','2026-10-31-NodeCanvasConnect-v1.9.0.exe','licenses/2026-10-31-Node-LICENSE.txt','licenses/2026-10-31-Codex-LICENSE.txt')
foreach($taskFolder in @('web','connector')){Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskFolder) -File | Where-Object { $_.Extension -in @('.mjs','.html','.css') } | ForEach-Object {$taskOwned+=($taskFolder+'/'+$_.Name)}}
[IO.File]::WriteAllLines($taskInventory,$taskOwned)
& $taskCompiler /nologo /codepage:65001 /target:winexe "/out:$taskUninstaller" "/resource:$taskInventory,owned-files" /r:System.Windows.Forms.dll (Join-Path $taskRoot 'installer/2026-10-31-Uninstall.cs')
if($LASTEXITCODE -ne 0){throw '제거 앱 컴파일 실패'}
$taskManifest=Join-Path $taskStage '2026-10-31-payload.sha256'
$taskEntries=@()
foreach($taskFolder in @('web','connector')){
 Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskFolder) -File | Where-Object { $_.Extension -in @('.mjs','.html','.css') } | ForEach-Object { $taskEntries+=((Get-FileHash $_.FullName).Hash+'|'+$taskFolder+'/'+$_.Name) }
}
$taskEntries+=((Get-FileHash $taskUninstaller).Hash+'|'+[IO.Path]::GetFileName($taskUninstaller))
$taskEntries+=((Get-FileHash $taskLauncher).Hash+'|'+[IO.Path]::GetFileName($taskLauncher))
foreach($taskLicense in @('2026-10-31-Node-LICENSE.txt','2026-10-31-Codex-LICENSE.txt')){$taskEntries+=((Get-FileHash (Join-Path $taskRoot ('installer/'+$taskLicense))).Hash+'|licenses/'+$taskLicense)}
[IO.File]::WriteAllLines($taskManifest,$taskEntries)
$taskPayload=Join-Path $taskStage 'payload.zip'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[IO.Compression.ZipFile]::Open($taskPayload,[IO.Compression.ZipArchiveMode]::Create)
try{
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$taskUninstaller,'2026-10-31-Uninstall-v1.9.0.exe') | Out-Null
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$taskManifest,'2026-10-31-payload.sha256') | Out-Null
 foreach($taskFolder in @('web','connector')){
  Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskFolder) -File | Where-Object { $_.Extension -in @('.mjs','.html','.css') } | ForEach-Object {
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$_.FullName,($taskFolder+'/'+$_.Name)) | Out-Null
  }
 }
 [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,$taskLauncher,'2026-10-31-NodeCanvasConnect-v1.9.0.exe') | Out-Null
 foreach($taskLicense in @('2026-10-31-Node-LICENSE.txt','2026-10-31-Codex-LICENSE.txt')){
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip,(Join-Path $taskRoot ('installer\'+$taskLicense)),('licenses/'+$taskLicense)) | Out-Null
 }
}finally{$taskZip.Dispose()}
& $taskCompiler /nologo /codepage:65001 /target:winexe "/resource:$taskPayload,payload.zip" "/resource:$taskManifest,trusted-manifest" "/out:$taskOutput" @taskRefs $taskSource (Join-Path $taskRoot 'installer/2026-11-01-Update.cs')
if($LASTEXITCODE -ne 0){throw '설치 앱 컴파일 실패'}
$taskCheck=Start-Process -FilePath $taskOutput -ArgumentList '--self-test' -Wait -PassThru -WindowStyle Hidden
if($taskCheck.ExitCode -ne 0){throw '설치 앱 자체 검증 실패'}
Write-Host ('설치 파일 생성: '+$taskOutput)
Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256

if(-not $OutputPath){
 if($SigningKey){& node (Join-Path $taskRoot '2026-11-01-sign-update.mjs') $SigningKey}else{& node (Join-Path $taskRoot '2026-11-01-sign-update.mjs')}
 if($LASTEXITCODE -ne 0){throw 'Update manifest signing failed. Keep the signing key local and rebuild before release.'}
}
