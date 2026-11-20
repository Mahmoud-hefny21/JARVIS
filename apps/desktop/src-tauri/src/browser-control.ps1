$ErrorActionPreference = 'Stop'
$request = $env:JARVIS_BROWSER_CONTROL | ConvertFrom-Json
$kind = [string]$request.kind
$label = [string]$request.label
if ($kind -notin @('button','fill') -or [string]::IsNullOrWhiteSpace($label) -or $label.Length -gt 120 -or $label -match '[\x00-\x1F\x7F]') { throw 'Browser control request is invalid.' }
$value = [string]$request.value
if ($kind -eq 'fill' -and ($value.Length -gt 2000 -or $value -match '[\x00-\x1F\x7F]')) { throw 'Browser field value exceeds safe limits.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JarvisBrowserControlWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@
$windows = @(Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })
if ($windows.Count -eq 0) { throw 'No open Chrome or Microsoft Edge window was found.' }
$foreground = [JarvisBrowserControlWindow]::GetForegroundWindow()
$foregroundProcessId = [uint32]0
[void][JarvisBrowserControlWindow]::GetWindowThreadProcessId($foreground,[ref]$foregroundProcessId)
$target = $windows | Where-Object { $_.Id -eq $foregroundProcessId } | Select-Object -First 1
if (-not $target) { if ($windows.Count -ne 1) { throw 'Several browser windows are open. Bring the intended page forward and retry.' }; $target = $windows[0] }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($target.MainWindowHandle)
$documentCondition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Document)
$document = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$documentCondition)
if ($null -eq $document) { throw 'The active browser page did not expose an accessible document.' }
$controlType = if ($kind -eq 'button') { [System.Windows.Automation.ControlType]::Button } else { [System.Windows.Automation.ControlType]::Edit }
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,$controlType)
$elements = $document.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
$matches = @()
for ($i = 0; $i -lt $elements.Count; $i++) {
  $element = $elements.Item($i)
  $current = $element.Current
  if ($current.IsOffscreen -or -not $current.IsControlElement) { continue }
  $name = [string]$current.Name
  if ([string]::Equals($name.Trim(),$label.Trim(),[StringComparison]::OrdinalIgnoreCase)) { $matches += $element }
}
if ($matches.Count -eq 0) { throw "No visible browser $kind has that exact accessible label." }
if ($matches.Count -ne 1) { throw "Several visible browser $kind controls have that exact label." }
$element = $matches[0]
if (-not $element.Current.IsEnabled -or $element.Current.IsOffscreen) { throw 'The exact browser control is disabled or not visible.' }
if ($kind -eq 'button') {
  $pattern = $null
  if (-not $element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)) { throw 'The browser button does not support accessible activation.' }
  $pattern.Invoke()
  @{kind=$kind;label=$label.Trim();visibleLabel=$element.Current.Name.Trim();browser=$target.ProcessName;verified=$true;verification='Windows UI Automation InvokePattern accepted the exact button'} | ConvertTo-Json -Compress
} else {
  if ($element.Current.IsPassword) { throw 'Password fields are excluded. Use the browser and password manager directly.' }
  $pattern = $null
  if (-not $element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)) { throw 'The browser field does not support accessible value entry.' }
  $valuePattern = [System.Windows.Automation.ValuePattern]$pattern
  if ($valuePattern.Current.IsReadOnly) { throw 'The exact browser field is read-only.' }
  $valuePattern.SetValue($value)
  if ($valuePattern.Current.Value -cne $value) { throw 'The browser field value could not be verified.' }
  @{kind=$kind;label=$label.Trim();visibleLabel=$element.Current.Name.Trim();browser=$target.ProcessName;verified=$true;verification='Field value matched after Windows UI Automation entry; form was not submitted'} | ConvertTo-Json -Compress
}
