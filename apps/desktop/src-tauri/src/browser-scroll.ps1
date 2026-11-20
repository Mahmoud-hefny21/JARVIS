$ErrorActionPreference = 'Stop'
$direction = $env:JARVIS_BROWSER_SCROLL
if ($direction -notin @('up','down')) { throw 'Browser scroll direction is not allowed.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JarvisBrowserScrollWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
$windows = @(Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -eq 0) { throw 'No open Chrome or Microsoft Edge window was found.' }
$foreground = [JarvisBrowserScrollWindow]::GetForegroundWindow()
$foregroundProcessId = [uint32]0
[void][JarvisBrowserScrollWindow]::GetWindowThreadProcessId($foreground,[ref]$foregroundProcessId)
$target = $windows | Where-Object { $_.Id -eq $foregroundProcessId } | Select-Object -First 1
if (-not $target) { if ($windows.Count -ne 1) { throw 'Several browser windows are open. Bring the intended page forward and retry.' }; $target = $windows[0] }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($target.MainWindowHandle)
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Document)
$document = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
if ($null -eq $document) { throw 'The open browser page did not expose a scrollable document.' }
$pattern = $null
if (-not $document.TryGetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern,[ref]$pattern)) { throw 'The active browser page does not expose accessible scrolling.' }
$scroll = [System.Windows.Automation.ScrollPattern]$pattern
if (-not $scroll.Current.VerticallyScrollable) { throw 'The active browser page cannot scroll.' }
$before = $scroll.Current.VerticalScrollPercent
$amount = if ($direction -eq 'down') { [System.Windows.Automation.ScrollAmount]::LargeIncrement } else { [System.Windows.Automation.ScrollAmount]::LargeDecrement }
$scroll.Scroll([System.Windows.Automation.ScrollAmount]::NoAmount,$amount)
Start-Sleep -Milliseconds 80
$after = $scroll.Current.VerticalScrollPercent
if ([Math]::Abs($after - $before) -lt 0.1) { throw "The browser page did not move $direction; it may already be at that end." }
@{direction=$direction;before=$before;after=$after;browser=$target.ProcessName;verified=$true} | ConvertTo-Json -Compress
