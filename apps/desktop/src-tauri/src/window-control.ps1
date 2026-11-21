$ErrorActionPreference = 'Stop'
$request = $env:JARVIS_WINDOW_REQUEST | ConvertFrom-Json
$processName = switch ($request.application) {
  'chrome' { 'chrome' }
  'vscode' { 'Code' }
  default { throw 'Unsupported application' }
}
$operation = [string]$request.operation
if (@('focus','move','minimize','restore') -notcontains $operation) { throw 'Unsupported window operation' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class JarvisAppWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
if ([JarvisAppWindow]::SetThreadDpiAwarenessContext([IntPtr](-4)) -eq [IntPtr]::Zero) { throw 'Per-monitor physical coordinate context unavailable' }
$deadline = [DateTime]::UtcNow.AddSeconds(8)
$target = $null
do {
  $target = Get-Process -Name $processName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
  if ($target -or [DateTime]::UtcNow -ge $deadline) { break }
  Start-Sleep -Milliseconds 200
} while ($true)
if (-not $target) { throw 'No supported application window is available' }
$handle = $target.MainWindowHandle

# Restore and DPI notifications are asynchronous in the other process. Reapply
# physical bounds until stable instead of assuming the first request has settled.
if ($operation -eq 'move') {
  if (-not $request.bounds) { throw 'A connected monitor is required' }
  $bounds = $request.bounds
  $margin = [Math]::Min(24, [Math]::Floor([Math]::Min([int]$bounds.width,[int]$bounds.height)/10))
  $x = [int]$bounds.x + $margin; $y = [int]$bounds.y + $margin
  $width = [int]$bounds.width - 2*$margin; $height = [int]$bounds.height - 2*$margin
  if ($width -le 0 -or $height -le 0) { throw 'Invalid connected display work area' }
}
$stable = 0
$deadline = [DateTime]::UtcNow.AddSeconds(3)
$lastError = 0
if ($operation -eq 'minimize') { [void][JarvisAppWindow]::ShowWindow($handle,6) }
else { [void][JarvisAppWindow]::ShowWindow($handle,9) }
do {
  if ($operation -eq 'minimize') { $valid = [JarvisAppWindow]::IsIconic($handle) }
  else {
    $valid = -not [JarvisAppWindow]::IsIconic($handle)
    if ($operation -eq 'move') {
      $rect = [JarvisAppWindow+Rect]::new()
      $valid = $valid -and [JarvisAppWindow]::GetWindowRect($handle,[ref]$rect)
      $valid = $valid -and $rect.Left -eq $x -and $rect.Top -eq $y -and ($rect.Right-$rect.Left) -eq $width -and ($rect.Bottom-$rect.Top) -eq $height
      if (-not $valid) {
        # NOZORDER | NOACTIVATE | SHOWWINDOW: avoid stealing z-order during repair.
        if (-not [JarvisAppWindow]::SetWindowPos($handle,[IntPtr]::Zero,$x,$y,$width,$height,0x54)) { $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error() }
      }
    }
    if ([JarvisAppWindow]::GetForegroundWindow() -ne $handle) { [void][JarvisAppWindow]::SetForegroundWindow($handle) }
    # Windows forbids a background app from stealing focus, so only an explicit focus request must end in front.
    if ($operation -ne 'move') { $valid = $valid -and [JarvisAppWindow]::GetForegroundWindow() -eq $handle }
  }
  if ($valid) { $stable++ } else { $stable = 0 }
  if ($stable -ge 3) { break }
  Start-Sleep -Milliseconds 150
} while ([DateTime]::UtcNow -lt $deadline)
if ($stable -lt 3) { throw "Windows did not verify stable $operation (Win32 error $lastError); no success reported" }
# Fill the target display like a person dragging the window there would.
if ($operation -eq 'move') { [void][JarvisAppWindow]::ShowWindow($handle,3) }
