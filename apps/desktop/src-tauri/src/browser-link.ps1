$ErrorActionPreference = 'Stop'
$label = $env:JARVIS_BROWSER_LINK_LABEL
if ([string]::IsNullOrWhiteSpace($label) -or $label.Length -gt 160 -or $label -match '[\x00-\x1F\x7F]') { throw 'Browser link label is invalid.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JarvisBrowserLinkWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
$windows = @(Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -eq 0) { throw 'No open Chrome or Microsoft Edge window was found.' }
$foreground = [JarvisBrowserLinkWindow]::GetForegroundWindow()
$foregroundProcessId = [uint32]0
[void][JarvisBrowserLinkWindow]::GetWindowThreadProcessId($foreground,[ref]$foregroundProcessId)
$target = $windows | Where-Object { $_.Id -eq $foregroundProcessId } | Select-Object -First 1
if (-not $target) { if ($windows.Count -ne 1) { throw 'Several browser windows are open. Bring the intended page forward and retry.' }; $target = $windows[0] }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($target.MainWindowHandle)
$documentCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Document)
$document = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$documentCondition)
if ($null -eq $document) { throw 'The open browser page did not expose an accessible document.' }
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Hyperlink)
$links = $document.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
$matches = @()
for ($i = 0; $i -lt $links.Count; $i++) {
  $link = $links.Item($i)
  $current = $link.Current
  if ($current.IsOffscreen -or -not $current.IsControlElement) { continue }
  $name = [string]$current.Name
  if ([string]::Equals($name.Trim(),$label.Trim(),[StringComparison]::OrdinalIgnoreCase)) { $matches += $link }
}
if ($matches.Count -eq 0) { throw 'No accessible browser link has that exact visible label.' }
if ($matches.Count -ne 1) { throw 'Several visible links have that exact label. Use a more specific label or select one manually.' }
$link = $matches[0]
if (-not $link.Current.IsEnabled -or $link.Current.IsOffscreen) { throw 'The exact browser link is disabled or not visible.' }
$pattern = $null
if (-not $link.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)) { throw 'The browser link does not support safe accessible activation.' }
$pattern.Invoke()
@{label=$label.Trim();visibleLabel=$link.Current.Name.Trim();browser=$target.ProcessName;invoked=$true;verification='Windows UI Automation InvokePattern accepted the unique exact-label link'} | ConvertTo-Json -Compress
