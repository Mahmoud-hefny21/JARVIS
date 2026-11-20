$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JarvisBrowserWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
$windows = @(Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -eq 0) { throw 'No open Chrome or Microsoft Edge window was found.' }
$foreground = [JarvisBrowserWindow]::GetForegroundWindow()
$foregroundProcessId = [uint32]0
[void][JarvisBrowserWindow]::GetWindowThreadProcessId($foreground,[ref]$foregroundProcessId)
$target = $windows | Where-Object { $_.Id -eq $foregroundProcessId } | Select-Object -First 1
if (-not $target) {
  if ($windows.Count -ne 1) { throw 'Several browser windows are open. Bring the intended page forward and retry.' }
  $target = $windows[0]
}
$root = [System.Windows.Automation.AutomationElement]::FromHandle($target.MainWindowHandle)
if ($null -eq $root) { throw 'The selected browser window did not expose an accessibility tree.' }
$condition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::Document)
$document = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
if ($null -eq $document) { throw 'The open browser page did not expose a readable document.' }
$elements = $document.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$lines = [System.Collections.Generic.List[string]]::new()
for ($i=0; $i -lt [Math]::Min(600,$elements.Count); $i++) {
  $element = $elements.Item($i)
  try {
    $current = $element.Current
    if ($current.IsOffscreen -or -not $current.IsControlElement) { continue }
    $kind = $current.ControlType.ProgrammaticName
    if ($kind -notin @('ControlType.Text','ControlType.Hyperlink','ControlType.ListItem','ControlType.Heading')) { continue }
    $name = ([string]$current.Name).Trim()
    if ($name -and $name.Length -le 2000) { $lines.Add($name) }
  } catch { }
}
$text = (($lines | Select-Object -Unique) -join "`n")
if ([string]::IsNullOrWhiteSpace($text)) { throw 'The browser page exposed no visible readable text.' }
@{text=$text.Substring(0,[Math]::Min(20000,$text.Length));engine='Windows UI Automation';browser=$target.ProcessName;limit='Visible accessible text and headings, up to 20,000 characters. No content was uploaded.'} | ConvertTo-Json -Compress
