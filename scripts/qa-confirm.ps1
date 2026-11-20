# Test-only UI driver. Not bundled with JARVIS and never called by the assistant runtime.
param([Parameter(Mandatory=$true)][int]$TargetPid,[Parameter(Mandatory=$true)][int]$ParentPid,[Parameter(Mandatory=$true)][ValidateSet('record_put','record_delete','settings_save','backup_create','project_write','automation_save','automation_delete','app_window_control')][string]$Action,[switch]$Cancel)
$ErrorActionPreference='Stop'
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$TargetPid"
$repoRoot=Split-Path -Parent $PSScriptRoot
$buildRoot=[IO.Path]::GetFullPath((Join-Path $repoRoot '.build\target'))+'\'
if(-not $process -or $process.ParentProcessId -ne $ParentPid -or -not $process.ExecutablePath.StartsWith($buildRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Refusing to operate any process not spawned by this QA runner from its build directory'}
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class JarvisQaDialog {
 public static string Seen="";
 delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent,EnumProc cb,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h,StringBuilder b,int max);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassNameW(IntPtr h,StringBuilder b,int max);
 [DllImport("user32.dll")] static extern bool PostMessageW(IntPtr h,uint m,IntPtr w,IntPtr l);
 static string Text(IntPtr h){var b=new StringBuilder(32000);GetWindowTextW(h,b,b.Capacity);return b.ToString();}
 public static bool Choose(uint pid,string action,bool cancel) {
  bool chosen=false;Seen="";
  EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner!=pid)return true;
   var c=new StringBuilder(100);GetClassNameW(h,c,100);Seen+=" ["+Text(h)+" class="+c.ToString()+"]";if(c.ToString()!="#32770"||!Text(h).StartsWith("JARVIS")||!Text(h).Contains("approve exact action"))return true;
   string body="";EnumChildWindows(h,(child,x)=>{body+=Text(child)+"\n";return true;},IntPtr.Zero);
   string expected=action=="record_put"?"Save the ":action=="record_delete"?"Delete the selected local record":action=="settings_save"?"Save preferences":action=="project_write"?"Replace the contents of ":action=="backup_create"?"Create an encrypted local backup":action=="automation_save"?"Save the selected recurring":action=="automation_delete"?"Remove the selected automation":" window";
   Seen+=" action="+action;if(!body.Contains(expected))return true;
   chosen=PostMessageW(h,0x0111,new IntPtr(cancel?2:1),IntPtr.Zero);return !chosen;
  },IntPtr.Zero);return chosen;
 }
}
'@
$deadline=[DateTime]::UtcNow.AddSeconds(18)
while([DateTime]::UtcNow -lt $deadline){
  if([JarvisQaDialog]::Choose([uint32]$TargetPid,$Action,$Cancel.IsPresent)){Write-Output ('QA selected '+$(if($Cancel){'Cancel'}else{'OK'})+' for verified MessageBoxW');exit 0}
  Start-Sleep -Milliseconds 80
}
throw ('Expected isolated QA confirmation dialog was not found. Synthetic window: '+[JarvisQaDialog]::Seen)
