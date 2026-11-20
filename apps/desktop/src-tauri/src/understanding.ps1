$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime]
function Await-Result($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null,@($Operation))
  $task.Wait(); return $task.Result
}
function Await-Action($Operation) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
  $task = $method.Invoke($null,@($Operation))
  $task.Wait()
}
$ocr = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $ocr) { throw 'No supported Windows OCR language is installed.' }
function Read-Image($Stream) {
  $decoder = Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($Stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-Result ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
  try {
    if ($bitmap.PixelWidth -gt 2048 -or $bitmap.PixelHeight -gt 2048) { throw 'Image exceeds local OCR limit.' }
    $result = Await-Result ($ocr.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return $result.Text
  } finally { $bitmap.Dispose() }
}
try {
  $config = $env:JARVIS_DOCUMENT_CONFIG | ConvertFrom-Json
  $text = ''
  if ($config.mode -eq 'screen') {
    Add-Type -AssemblyName System.Drawing
    Add-Type -AssemblyName System.Windows.Forms
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $capture = [System.Drawing.Bitmap]::new($bounds.Width,$bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($capture)
    $memory = [System.IO.MemoryStream]::new()
    try {
      $graphics.CopyFromScreen($bounds.Location,[System.Drawing.Point]::Empty,$bounds.Size)
      $scale = [Math]::Min(1,1600/[Math]::Max($bounds.Width,$bounds.Height))
      $small = [System.Drawing.Bitmap]::new($capture,[System.Drawing.Size]::new([int]($bounds.Width*$scale),[int]($bounds.Height*$scale)))
      try { $small.Save($memory,[System.Drawing.Imaging.ImageFormat]::Png) } finally { $small.Dispose() }
      $memory.Position = 0
      $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($memory)
      $text = Read-Image $stream
    } finally { $graphics.Dispose(); $capture.Dispose(); $memory.Dispose() }
  } elseif ($config.mode -eq 'pdf') {
    $file = Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($config.path)) ([Windows.Storage.StorageFile])
    $pdf = Await-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
    for ($i=0; $i -lt [Math]::Min(3,$pdf.PageCount); $i++) {
      $page = $pdf.GetPage([uint32]$i)
      $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
      try {
        $options = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
        $scale = [Math]::Min(1,1600/[Math]::Max($page.Size.Width,$page.Size.Height))
        $options.DestinationWidth = [uint32]($page.Size.Width*$scale)
        $options.DestinationHeight = [uint32]($page.Size.Height*$scale)
        Await-Action ($page.RenderToStreamAsync($stream,$options))
        $stream.Seek(0)
        $text += "`nPage $($i+1):`n" + (Read-Image $stream)
      } finally { $page.Dispose(); $stream.Dispose() }
    }
  } else { throw 'Unsupported understanding mode.' }
  @{text=$text.Substring(0,[Math]::Min(20000,$text.Length));engine='Windows offline OCR';language=$ocr.RecognizerLanguage.LanguageTag;limit='Primary display or first three PDF pages; text only, layout/images are not interpreted.'} | ConvertTo-Json -Compress
} catch {
  # Never print exception details containing document paths or text.
  [Console]::Error.WriteLine('Windows offline OCR unavailable or document could not be read. Check installed OCR languages and file format.')
  exit 1
}
