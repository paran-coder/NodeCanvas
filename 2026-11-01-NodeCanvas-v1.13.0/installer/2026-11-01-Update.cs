#if !LAUNCHER
using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using Microsoft.Win32;
static class UpdateInstall {
 const string Protocol=@"Software\Classes\nodecanvas";
 const string Registration=@"Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeCanvasConnector";
 class Value {public object Data;public RegistryValueKind Kind;}
 class Entry {public string Path;public Dictionary<string,Value> Values=new Dictionary<string,Value>();}
 static void Capture(string path,List<Entry> entries){using(var key=Registry.CurrentUser.OpenSubKey(path)){if(key==null)return;var entry=new Entry{Path=path};foreach(string name in key.GetValueNames())entry.Values[name]=new Value{Data=key.GetValue(name,null,RegistryValueOptions.DoNotExpandEnvironmentNames),Kind=key.GetValueKind(name)};entries.Add(entry);foreach(string sub in key.GetSubKeyNames())Capture(path+"\\"+sub,entries);}}
 static void Restore(List<Entry> entries){Registry.CurrentUser.DeleteSubKeyTree(Protocol,false);Registry.CurrentUser.DeleteSubKeyTree(Registration,false);foreach(var entry in entries)using(var key=Registry.CurrentUser.CreateSubKey(entry.Path))foreach(var v in entry.Values)key.SetValue(v.Key,v.Value.Data,v.Value.Kind);}
 static void Register(string dest,string launcher){using(var key=Registry.CurrentUser.CreateSubKey(Protocol)){key.SetValue("","URL:NodeCanvas Connection");key.SetValue("URL Protocol","");using(var command=key.CreateSubKey(@"shell\open\command"))command.SetValue("","\""+launcher+"\" \"%1\"");}using(var key=Registry.CurrentUser.CreateSubKey(Registration)){key.SetValue("DisplayName","NodeCanvas Connector");key.SetValue("DisplayVersion","1.14.2");key.SetValue("Publisher","NodeCanvas");key.SetValue("InstallLocation",dest);key.SetValue("UninstallString","\""+Path.Combine(dest,"2026-10-31-Uninstall-v1.14.2.exe")+"\" --uninstall");key.SetValue("NoModify",1,RegistryValueKind.DWord);key.SetValue("NoRepair",1,RegistryValueKind.DWord);}}
 internal static void Prepare(string oldRoot,string destination,int fail){
  InstalledApp.SafeTree(oldRoot);InstalledApp.SafeTree(destination);
  if(!InstalledApp.RuntimeOK(oldRoot))throw new IOException("기존 실행 구성 요소 검증 실패 · 설치 파일로 복구해 주세요.");
  string stage=destination+".prepare-"+Guid.NewGuid().ToString("N");
  using(var stream=typeof(Program).Assembly.GetManifestResourceStream("payload.zip"))Program.Extract(stream,stage);
  Directory.CreateDirectory(Path.Combine(stage,"runtime"));foreach(string name in InstalledApp.RuntimeNames)File.Copy(Path.Combine(oldRoot,"runtime",name),Path.Combine(stage,"runtime",name));
  InstalledApp.FailAfter=fail;try{InstalledApp.ApplyPayload(stage,destination);}finally{InstalledApp.FailAfter=-1;}
 }
 static bool Ready(){try{var request=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:7330/api/ready");request.Timeout=1000;request.ReadWriteTimeout=1000;request.Proxy=null;using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream())){var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(reader.ReadToEnd());return (string)data["app"]=="NodeCanvas"&&(string)data["version"]=="1.14.2";}}catch{return false;}}
 static Process Launch(string file,string activation){return Process.Start(new ProcessStartInfo(file,"\""+activation+"\""){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Path.GetDirectoryName(file)});}
 internal static int Run(string oldRoot,int parentPid,string activation){
  Program.Activation(activation);
  string baseRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","NodeCanvasConnector");oldRoot=Path.GetFullPath(oldRoot);
  if(!String.Equals(Path.GetDirectoryName(oldRoot),baseRoot,StringComparison.OrdinalIgnoreCase)||!Path.GetFileName(oldRoot).StartsWith("v"))throw new IOException("업데이트 설치 경로 오류");
  InstalledApp.SafeTree(baseRoot);
  string oldLauncher=Directory.GetFiles(oldRoot,"2026-10-31-NodeCanvasConnect-v*.exe").OrderByDescending(p=>new Version(FileVersionInfo.GetVersionInfo(p).FileVersion)).FirstOrDefault();
  if(oldLauncher==null)throw new IOException("기존 연결 앱을 찾지 못했습니다.");
  var previous=new Version(FileVersionInfo.GetVersionInfo(oldLauncher).FileVersion);if(!InstalledApp.IsUpgrade(previous))throw new IOException("동일하거나 이전 버전은 적용하지 않습니다.");
  try{var parent=Process.GetProcessById(parentPid);if(!String.Equals(Path.GetDirectoryName(parent.MainModule.FileName),oldRoot,StringComparison.OrdinalIgnoreCase))throw new IOException("업데이트를 요청한 앱을 확인하지 못했습니다.");if(!parent.WaitForExit(30000))throw new IOException("기존 연결 앱 종료를 기다리고 있습니다.");}catch(ArgumentException){}
  bool created;using(var mutex=new Mutex(true,"Local\\NodeCanvas-Installer-"+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value,out created)){
   if(!created)throw new IOException("다른 설치가 실행 중입니다.");
   string dest=Path.Combine(baseRoot,"v1.14.2"),launcher=Path.Combine(dest,"2026-10-31-NodeCanvasConnect-v1.14.2.exe");var saved=new List<Entry>();Capture(Protocol,saved);Capture(Registration,saved);Process started=null;bool registrationChanged=false;
   try{
    if(InstalledApp.PortInUse())throw new IOException("다른 앱이 연결 포트를 사용하고 있습니다.");
    Prepare(oldRoot,dest,-1);started=Launch(launcher,activation);
    bool ready=false;for(int i=0;i<25;i++){if(started.HasExited)break;if(Ready()){ready=true;break;}Thread.Sleep(1000);}if(!ready)throw new IOException("새 연결 앱을 시작하지 못했습니다.");
    registrationChanged=true;Register(dest,launcher);return 0;
   }catch{
    if(started!=null&&!started.HasExited){try{using(var stop=Process.Start(new ProcessStartInfo("taskkill.exe","/PID "+started.Id+" /T /F"){UseShellExecute=false,CreateNoWindow=true}))stop.WaitForExit(5000);}catch{}}
    if(registrationChanged)Restore(saved);
    if(!InstalledApp.PortInUse())Launch(oldLauncher,activation);
    throw;
   }
  }
 }
}
#endif
