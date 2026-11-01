using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Drawing;
using System.Web;
using System.Web.Script.Serialization;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("NodeCanvas Connector")]
[assembly: System.Reflection.AssemblyVersion("1.7.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.7.0.0")]
class InstalledApp {
 public string Root,Launcher;public Version Version;
 public static readonly string[] Required={"runtime/node.exe","runtime/codex.exe","runtime/codex-code-mode-host.exe","runtime/codex-command-runner.exe","runtime/codex-windows-sandbox-setup.exe","connector/2026-10-31-server.mjs","connector/2026-10-31-activation.mjs","web/2026-10-31-index.html"};
 public static InstalledApp Latest(string baseRoot){if(!Directory.Exists(baseRoot))return null;SafeTree(baseRoot);var found=new System.Collections.Generic.List<InstalledApp>();foreach(string dir in Directory.GetDirectories(baseRoot,"v*")){Version v;if(!Version.TryParse(Path.GetFileName(dir).Substring(1),out v)||v.Major!=1||v<new Version(1,3,0))continue;foreach(string exe in Directory.GetFiles(dir,"2026-10-31-NodeCanvasConnect-v*.exe")){Version candidate;if(Version.TryParse(Path.GetFileNameWithoutExtension(exe).Substring("2026-10-31-NodeCanvasConnect-v".Length),out candidate)&&candidate>v)v=candidate;}string launcher=Path.Combine(dir,"2026-10-31-NodeCanvasConnect-v"+v.ToString(3)+".exe");found.Add(new InstalledApp{Root=dir,Launcher=launcher,Version=v});}return Choose(found);}
 public static readonly string[] RuntimeNames={"node.exe","codex.exe","codex-code-mode-host.exe","codex-command-runner.exe","codex-windows-sandbox-setup.exe"};
 public static readonly string[] RuntimeHashes={"58E74BF02FC5BBACC41DCB8BEF089961CD5BDDD37830B87784E4FC624D145D1F","A395030B56B126F608F2403036DDDB654A9C063213E9C2B5F85D954CF490EBE6","8F98CC7AA079B51DBFBB16A8E655A468A9C37C1CD23E22422C10CDFD6CACE543","7F14523FE94A2D3EE3737198AFA3328FCDE04B53F6774BBD1A3F165666BEC682","CFF8F8861D0BB0DBA601F5D4E74D8EEB578A6B9A5956A6A83C818DAFC7D4894A"};
 public static bool RuntimeOK(string root){try{SafeTree(root);for(int i=0;i<RuntimeNames.Length;i++)if(!File.Exists(Path.Combine(root,"runtime",RuntimeNames[i]))||Hash(Path.Combine(root,"runtime",RuntimeNames[i])).Replace("-","")!=RuntimeHashes[i])return false;return true;}catch{return false;}}
 public static bool Valid(string root){try{SafeTree(root);if(!RuntimeOK(root))return false;string manifest=Path.Combine(root,"2026-10-31-payload.sha256");if(!File.Exists(manifest))return false;using(var embedded=typeof(Program).Assembly.GetManifestResourceStream("trusted-manifest")){if(embedded==null)return false;using(var reader=new StreamReader(embedded)){if(File.ReadAllText(manifest)!=reader.ReadToEnd())return false;}}foreach(string line in File.ReadAllLines(manifest)){string[] pair=line.Split(new[]{'|'},2);string file=Path.GetFullPath(Path.Combine(root,pair[1]));if(!file.StartsWith(Path.GetFullPath(root)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Hash(file).Replace("-","")!=pair[0])return false;}return true;}catch{return false;}}
 public static void SafeTree(string root){string full=Path.GetFullPath(root),parent=full;while(parent!=null){if((Directory.Exists(parent)||File.Exists(parent))&&(File.GetAttributes(parent)&FileAttributes.ReparsePoint)!=0)throw new Exception("연결된 경로는 사용할 수 없습니다.");parent=Path.GetDirectoryName(parent);}if(!Directory.Exists(full))return;foreach(string item in Directory.GetFileSystemEntries(full)){if((File.GetAttributes(item)&FileAttributes.ReparsePoint)!=0)throw new Exception("연결된 파일 또는 폴더는 사용할 수 없습니다.");if(Directory.Exists(item))SafeTree(item);}}
 public static bool HasVersionFolder(string root){if(!Directory.Exists(root))return false;return Directory.GetDirectories(root,"v*",SearchOption.TopDirectoryOnly).Any(d=>{Version v;return Version.TryParse(Path.GetFileName(d).Substring(1),out v)&&v>=new Version(1,3,0);});}
 public static string Hash(string file){using(var sha=SHA256.Create())using(var stream=File.OpenRead(file))return BitConverter.ToString(sha.ComputeHash(stream));}
 public static InstalledApp Choose(System.Collections.Generic.IEnumerable<InstalledApp> entries){return entries.OrderByDescending(x=>x.Version).ThenBy(x=>x.Root,StringComparer.OrdinalIgnoreCase).FirstOrDefault();}
 public static bool PortInUse(){var listener=new System.Net.Sockets.TcpListener(IPAddress.Loopback,7330);try{listener.Start();return false;}catch{return true;}finally{listener.Stop();}}
 public static readonly Version TargetVersion=new Version(1,7,0);
 public static bool CanRepair(Version existing){return existing==null||existing<=TargetVersion;}
 public static int FailAfter=-1;
 public static void ApplyPayload(string staged,string target){SafeTree(staged);SafeTree(target);if(!Valid(staged))throw new Exception("설치 파일 무결성 검사 실패");string backup=target+".backup-"+Guid.NewGuid().ToString("N");bool moved=false,committed=false;try{if(Directory.Exists(target)){foreach(string file in Directory.GetFiles(target,"*",SearchOption.AllDirectories))using(var handle=new FileStream(file,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){}Directory.Move(target,backup);moved=true;}if(FailAfter==0)throw new IOException("Injected transaction failure");Directory.Move(staged,target);committed=true;if(FailAfter>0)throw new IOException("Injected post-swap failure");if(!Valid(target))throw new IOException("설치 후 검증 실패");}catch{if(committed){Directory.Move(target,staged);}if(moved)Directory.Move(backup,target);throw;}if(moved)Directory.Delete(backup,true);}

}
static class Program {
 internal static readonly string Root=Path.GetDirectoryName(Application.ExecutablePath);
 internal static readonly string Data=Environment.GetEnvironmentVariable("NODECANVAS_PORTABLE_DATA") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"NodeCanvasConnector");
 internal static string ParseOrigin(string text) {
  Uri u;if(!Uri.TryCreate(text,UriKind.Absolute,out u)||u.UserInfo.Length>0||u.Query.Length>0||u.Fragment.Length>0||u.AbsolutePath!="/"||u.GetLeftPart(UriPartial.Authority)!=text)throw new Exception("올바른 웹 주소가 아닙니다.");
  if(u.Scheme!="https" && !(u.Scheme=="http"&&(u.Host=="127.0.0.1"||u.Host=="localhost")&&u.Port==7330))throw new Exception("HTTPS 작업실 주소만 허용됩니다.");return text;
 }
 internal static string[] Activation(string input){var u=new Uri(input);if(u.Scheme!="nodecanvas"||u.Host!="connect"||u.AbsolutePath!=""&&u.AbsolutePath!="/"||u.Fragment!=""||u.UserInfo!=""||!u.IsDefaultPort)throw new Exception("올바른 연결 요청이 아닙니다.");var q=HttpUtility.ParseQueryString(u.Query);if(q.Count!=2)throw new Exception("잘못된 연결 요청입니다.");string origin=ParseOrigin(q["origin"]),challenge=q["challenge"];if(challenge==null||challenge.Length!=64||challenge.Any(c=>!(c>='a'&&c<='f'||c>='0'&&c<='9')))throw new Exception("확인값이 올바르지 않습니다.");return new[]{origin,challenge};}
 internal static void Extract(Stream stream,string destination){InstalledApp.SafeTree(destination);string root=Path.GetFullPath(destination)+Path.DirectorySeparatorChar;Directory.CreateDirectory(root);using(var zip=new ZipArchive(stream,ZipArchiveMode.Read)){foreach(var e in zip.Entries){string target=Path.GetFullPath(Path.Combine(root,e.FullName));if(!target.StartsWith(root,StringComparison.OrdinalIgnoreCase))throw new Exception("안전하지 않은 압축 경로입니다.");if(e.FullName.EndsWith("/"))continue;Directory.CreateDirectory(Path.GetDirectoryName(target));using(var src=e.Open())using(var dst=new FileStream(target,FileMode.CreateNew)){src.CopyTo(dst);}}}}
 [STAThread] static int Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);try {
  if(args.Length>0&&args[0]=="--self-test"){Activation("nodecanvas://connect?origin=https%3A%2F%2Fexample.com&challenge="+new string('a',64));bool rejected=false;try{Activation("nodecanvas://connect?origin=http%3A%2F%2Fevil.test&challenge="+new string('a',64));}catch{rejected=true;}if(!rejected||!InstalledApp.CanRepair(new Version(1,7,0))||!InstalledApp.CanRepair(new Version(1,4,1))||InstalledApp.CanRepair(new Version(1,8,0)))return 1;InstalledApp old=new InstalledApp{Root="old",Version=new Version(1,3,0)},current=new InstalledApp{Root="existing",Version=new Version(1,7,0)};if(InstalledApp.Choose(new[]{old,current})!=current||InstalledApp.Choose(new InstalledApp[0])!=null)return 1;return 0;}
#if LAUNCHER
  if(args.Length>1&&args[0]=="--portable"){Environment.SetEnvironmentVariable("NODECANVAS_PORTABLE_DATA",Path.GetFullPath(args[1]));return 2;}
  string[] activation=args.Length>0?Activation(args[0]):null;
  if(activation!=null){Directory.CreateDirectory(Data);string trusted=Path.Combine(Data,"trusted-origins.txt");bool known=File.Exists(trusted)&&File.ReadAllLines(trusted).Contains(activation[0]);if(!known){if(MessageBox.Show("다음 작업실과 연결할까요?\n\n"+activation[0]+"\n\n신뢰하는 웹 주소인지 확인하세요. 허용한 주소는 이 PC에 기억합니다.","NodeCanvas · 웹 주소 확인",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return 0;File.AppendAllText(trusted,activation[0]+Environment.NewLine);}string dir=Path.Combine(Data,"activations");Directory.CreateDirectory(dir);var record=new {origin=activation[0],challenge=activation[1],createdAt=(long)(DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds};File.WriteAllText(Path.Combine(dir,Guid.NewGuid().ToString()+".json"),new JavaScriptSerializer().Serialize(record));}
  bool created;using(var mutex=new Mutex(true,"Local\\NodeCanvasConnector--"+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value,out created)){if(!created)return 0;Application.Run(new ConnectorContext());}return 0;
#else
  if(args.Length==3&&args[0]=="--test-repair"){string fixture=Path.GetFullPath(args[1]),seed=Path.GetFullPath(args[2]);if(!InstalledApp.RuntimeOK(seed))return 3;InstalledApp.SafeTree(fixture);string stage=fixture+".stage-"+Guid.NewGuid().ToString("N");using(var stream=typeof(Program).Assembly.GetManifestResourceStream("payload.zip"))Extract(stream,stage);Directory.CreateDirectory(Path.Combine(stage,"runtime"));foreach(string name in InstalledApp.RuntimeNames)File.Copy(Path.Combine(seed,"runtime",name),Path.Combine(stage,"runtime",name));InstalledApp.ApplyPayload(stage,fixture);return 0;}
  if(args.Length>=3&&args[0]=="--test-update"){if(args.Length>3)InstalledApp.FailAfter=int.Parse(args[3]);InstalledApp.ApplyPayload(Path.GetFullPath(args[1]),Path.GetFullPath(args[2]));return 0;}
  if(args.Length==2&&args[0]=="--check-installed")return InstalledApp.Valid(Path.GetFullPath(args[1]))?0:2;
  if(args.Length==2&&args[0]=="--extract-only"){using(var s=typeof(Program).Assembly.GetManifestResourceStream("payload.zip"))Extract(s,args[1]);return 0;}
  bool setupCreated;using(var setupMutex=new Mutex(true,"Local\\NodeCanvas-Installer-"+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value,out setupCreated)){if(!setupCreated){MessageBox.Show("연결 앱 설치 화면이 이미 열려 있습니다.","NodeCanvas");return 0;}Application.Run(new SetupForm());}return 0;
#endif
 }catch(Exception ex){if(args.Length>0&&args[0].StartsWith("--"))return 1;MessageBox.Show(ex.Message,"NodeCanvas",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}}
}
#if LAUNCHER
class ConnectorContext:ApplicationContext {
 NotifyIcon icon;Process child;bool stopping;string code;
 public ConnectorContext(){Directory.CreateDirectory(Program.Data);byte[] bytes=new byte[6];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(bytes);code=BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant();
  var menu=new ContextMenuStrip();menu.Items.Add("고급 연결 코드",null,(s,e)=>MessageBox.Show("연결 코드: "+code+"\n\n작업실의 고급 연결에 입력하세요.","NodeCanvas"));menu.Items.Add("연결 앱 종료",null,(s,e)=>ExitThread());
  icon=new NotifyIcon{Icon=SystemIcons.Application,Text="NodeCanvas 연결 앱",Visible=true,ContextMenuStrip=menu};
  string node=Environment.GetEnvironmentVariable("NODECANVAS_NODE")??Path.Combine(Program.Root,"runtime","node.exe");string codex=Environment.GetEnvironmentVariable("NODECANVAS_CODEX")??Path.Combine(Program.Root,"runtime","codex.exe");
  if(!File.Exists(node)||!File.Exists(codex))throw new Exception("구성 요소가 없습니다. 연결 앱을 다시 설치해 주세요.");
  // Refuse an occupied port rather than launching a second connector or adopting an unknown process.
  var listener=new System.Net.Sockets.TcpListener(IPAddress.Loopback,7330);try{listener.Start();}catch{throw new Exception("7330 포트를 사용 중입니다. 이전 연결 앱을 종료한 후 다시 연결해 주세요.");}finally{listener.Stop();}
  var info=new ProcessStartInfo(node,"\""+Path.Combine(Program.Root,"connector","2026-10-31-server.mjs")+"\""){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=Program.Root,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
  info.EnvironmentVariables["NODECANVAS_NATIVE"]="1";info.EnvironmentVariables["NODECANVAS_CODEX"]=codex;info.EnvironmentVariables["NODECANVAS_DATA_ROOT"]=Program.Data;info.EnvironmentVariables["NODECANVAS_ACTIVATION_DIR"]=Path.Combine(Program.Data,"activations");info.EnvironmentVariables["NODECANVAS_PAIR_CODE"]=code;
  child=new Process{StartInfo=info,EnableRaisingEvents=true};child.OutputDataReceived+=(s,e)=>{};child.ErrorDataReceived+=(s,e)=>{};child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();
  var timer=new System.Windows.Forms.Timer{Interval=1000};timer.Tick+=(s,e)=>{if(child.HasExited){timer.Stop();if(!stopping&&child.ExitCode!=0)MessageBox.Show("연결 앱을 시작하지 못했습니다. 다른 연결 앱이 실행 중인지 확인해 주세요.","NodeCanvas");ExitThread();}};timer.Start();
 }
 protected override void ExitThreadCore(){if(stopping)return;stopping=true;if(child!=null&&!child.HasExited){try{child.StandardInput.WriteLine("shutdown");child.StandardInput.Flush();if(!child.WaitForExit(10000)){var stop=Process.Start(new ProcessStartInfo("taskkill.exe","/PID "+child.Id+" /T /F"){UseShellExecute=false,CreateNoWindow=true});stop.WaitForExit(5000);}}catch{}}if(icon!=null){icon.Visible=false;icon.Dispose();}base.ExitThreadCore();}
}
#else
class SetupForm:Form {
 Label status;ProgressBar progress;Button install;bool busy;
 public SetupForm(){Text="NodeCanvas 연결 앱 설치 · v1.7.0";ClientSize=new Size(530,285);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;Font=new Font("맑은 고딕",10);Controls.Add(new Label{Text="버튼 하나로 내 ChatGPT와 연결",Font=new Font(Font.FontFamily,16,FontStyle.Bold),Location=new Point(28,24),AutoSize=true});Controls.Add(new Label{Text="Windows x64 · 관리자 권한 없이 내 계정에 설치합니다.\n처음 설치할 때 공식 Node.js와 Codex를 다운로드합니다.\n약 170MB 다운로드 · 충분한 디스크 공간과 인터넷이 필요합니다.",Location=new Point(28,70),Size=new Size(480,75)});status=new Label{Text="기존 설치도 파일과 실행 구성 요소를 검사하고 복구합니다.",Location=new Point(28,154),Size=new Size(475,40)};progress=new ProgressBar{Location=new Point(28,202),Size=new Size(475,8)};install=new Button{Text="설치하기",Location=new Point(365,228),Size=new Size(138,36)};install.Click+=async(s,e)=>await Install();Controls.Add(status);Controls.Add(progress);Controls.Add(install);FormClosing+=(s,e)=>{if(busy){e.Cancel=true;status.Text="설치를 완료한 후 닫아 주세요.";}};var existing=InstalledApp.Latest(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","NodeCanvasConnector"));if(existing!=null){status.Text="기존 설치 v"+existing.Version+" 확인 · 같은 폴더/구성 요소를 사용합니다.";install.Text="검사 및 복구 설치";}}
 async Task DownloadRuntime(string dir,string url,string sha,string expected,string target){string zip=Path.Combine(dir,Guid.NewGuid()+".zip");ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;using(var client=new WebClient()){client.Headers["User-Agent"]="NodeCanvas-Setup/1.7.0";client.DownloadProgressChanged+=(s,e)=>{progress.Value=Math.Max(0,Math.Min(100,e.ProgressPercentage));};await client.DownloadFileTaskAsync(new Uri(url),zip);}using(var h=SHA256.Create())using(var f=File.OpenRead(zip)){string actual=BitConverter.ToString(h.ComputeHash(f)).Replace("-","").ToLowerInvariant();if(actual!=sha)throw new Exception("다운로드 검증에 실패했습니다. 다시 설치해 주세요.");}using(var archive=ZipFile.OpenRead(zip)){var entries=archive.Entries.Where(e=>Path.GetFileName(e.FullName)==expected).ToArray();if(entries.Length!=1)throw new Exception("구성 요소 압축 내용이 올바르지 않습니다.");using(var src=entries[0].Open())using(var dst=new FileStream(target,FileMode.CreateNew))src.CopyTo(dst);if(expected=="codex-x86_64-pc-windows-msvc.exe"){foreach(string extra in new[]{"codex-command-runner.exe","codex-windows-sandbox-setup.exe"}){var e=archive.Entries.Single(x=>x.FullName==extra);using(var src=e.Open())using(var dst=new FileStream(Path.Combine(Path.GetDirectoryName(target),extra),FileMode.CreateNew))src.CopyTo(dst);}}}File.Delete(zip);}
 void Register(string launcher){using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Classes\nodecanvas")){k.SetValue("","URL:NodeCanvas Connection");k.SetValue("URL Protocol","");using(var c=k.CreateSubKey(@"shell\open\command"))c.SetValue("","\""+launcher+"\" \"%1\"");}}
 void RegisterUninstall(string dest){using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\NodeCanvasConnector")){k.SetValue("DisplayName","NodeCanvas Connector");k.SetValue("DisplayVersion","1.5.0");k.SetValue("Publisher","NodeCanvas");k.SetValue("InstallLocation",dest);k.SetValue("UninstallString","\""+Path.Combine(dest,"2026-10-31-Uninstall-v1.7.0.exe")+"\" --uninstall");k.SetValue("NoModify",1,RegistryValueKind.DWord);k.SetValue("NoRepair",1,RegistryValueKind.DWord);}}

 async Task Install(){if(install.Text=="닫기"){Close();return;}busy=true;install.Enabled=false;string baseRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","NodeCanvasConnector"),dest=Path.Combine(baseRoot,"v1.7.0"),staging=Path.Combine(baseRoot,"prepare-"+Guid.NewGuid().ToString("N"));try{
 if(!Environment.Is64BitOperatingSystem)throw new Exception("Windows x64가 필요합니다.");var existing=InstalledApp.Latest(baseRoot);var targetVersion=new Version(1,7,0);
 if(!InstalledApp.CanRepair(existing==null?null:existing.Version))throw new Exception("더 최신 버전이 설치되어 있습니다. 해당 버전 설치 파일로 복구하세요.");
 if(existing!=null&&InstalledApp.PortInUse())throw new Exception("기존 연결 앱을 트레이 메뉴에서 종료한 뒤 다시 누르세요.");
 InstalledApp.SafeTree(baseRoot);
 status.Text=existing==null?"연결 앱을 준비합니다…":"기존 설치를 찾았습니다. 같은 폴더의 프로그램만 업데이트합니다…";using(var s=typeof(Program).Assembly.GetManifestResourceStream("payload.zip"))Program.Extract(s,staging);
 if(existing!=null)dest=existing.Root;string runtime=Path.Combine(staging,"runtime");Directory.CreateDirectory(runtime);
 if(existing!=null&&InstalledApp.RuntimeOK(existing.Root)){foreach(string name in InstalledApp.RuntimeNames)File.Copy(Path.Combine(existing.Root,"runtime",name),Path.Combine(runtime,name));}else{
 status.Text="1/3 · 공식 Node.js를 다운로드합니다…";await DownloadRuntime(staging,"https://nodejs.org/dist/v24.14.1/node-v24.14.1-win-x64.zip","6e50ce5498c0cebc20fd39ab3ff5df836ed2f8a31aa093cecad8497cff126d70","node.exe",Path.Combine(runtime,"node.exe"));
 status.Text="2/3 · 공식 Codex를 다운로드합니다…";await DownloadRuntime(staging,"https://github.com/openai/codex/releases/download/rust-v0.149.1/codex-x86_64-pc-windows-msvc.exe.zip","c19dd84738dee791c4d39a96bd080d94f098af074ae9d2ef5e27d3d85a122665","codex-x86_64-pc-windows-msvc.exe",Path.Combine(runtime,"codex.exe"));
 status.Text="3/3 · Codex 실행 구성 요소를 다운로드합니다…";await DownloadRuntime(staging,"https://github.com/openai/codex/releases/download/rust-v0.149.1/codex-code-mode-host-x86_64-pc-windows-msvc.exe.zip","99e86c60dc20d7ca5b17062922062216700c67d146836a795370b7a8da7c4d14","codex-code-mode-host-x86_64-pc-windows-msvc.exe",Path.Combine(runtime,"codex-code-mode-host.exe"));}
 InstalledApp.ApplyPayload(staging,dest);
 string launcher=Path.Combine(dest,"2026-10-31-NodeCanvasConnect-v1.7.0.exe");Register(launcher);RegisterUninstall(dest);status.Text=existing==null?"설치 완료! 작업실에서 연결하기를 누르세요.":"기존 폴더 업데이트 완료! 파일과 실행 구성 요소를 검사하고 복구했습니다.";progress.Value=100;install.Text="닫기";install.Enabled=true;
 }catch(Exception ex){status.Text="완료하지 못했습니다: "+ex.Message;MessageBox.Show(ex.Message+"\n\n작업용 준비 폴더: "+staging,"NodeCanvas 설치",MessageBoxButtons.OK,MessageBoxIcon.Error);install.Enabled=true;}finally{busy=false;}}

}
#endif
