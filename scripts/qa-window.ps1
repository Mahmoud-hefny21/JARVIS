# QA-only: operate solely on the child launched by the named test runner.
param([Parameter(Mandatory=$true)][int]$TargetPid,[Parameter(Mandatory=$true)][int]$ParentPid,[ValidateSet('minimize','hide','displace')][string]$Mode,[int]$Left,[int]$Top)
$ErrorActionPreference='Stop'
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$TargetPid"
$buildRoot=[IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) '.build\target'))+'\'
if(-not $process -or $process.ParentProcessId -ne $ParentPid -or -not $process.ExecutablePath.StartsWith($buildRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Not a test-owned build process'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JarvisQaWindow {
 delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb,IntPtr p);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int mode);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr z,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
 public static bool Apply(uint pid,string mode,int x,int y){
  SetThreadDpiAwarenessContext(new IntPtr(-4)); bool done=false;
  EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner!=pid||!IsWindowVisible(h))return true;
   if(mode=="displace")done=SetWindowPos(h,IntPtr.Zero,x,y,0,0,0x15);else{ShowWindow(h,mode=="hide"?0:6);done=true;}return false;
  },IntPtr.Zero);return done;
 }
}
'@
if(-not [JarvisQaWindow]::Apply([uint32]$TargetPid,$Mode,$Left,$Top)){throw 'Visible QA window was not found'}
