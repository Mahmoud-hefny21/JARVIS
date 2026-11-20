# Persistent speech host: loads SAPI and enumerates voices once, then speaks one JSON request per stdin line.
# Native SAPI (COM) sees natural voices added by NaturalVoiceSAPIAdapter; System.Speech does not.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
$voice = New-Object -ComObject SAPI.SpVoice
$all = $voice.GetVoices()
$tokens = @(for ($i = 0; $i -lt $all.Count; $i++) { $all.Item($i) })
# Warm the online voice connection silently so the first real reply starts quickly.
 try { foreach ($t in $tokens) { if ($t.GetDescription() -like '*Ryan*') { $voice.Voice = $t; break } }; $voice.Volume = 0; [void]$voice.Speak('Ready.'); $voice.Volume = 100 } catch { $voice.Volume = 100 }
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $c = $line.TrimStart([char]0xFEFF) | ConvertFrom-Json
    # Without an explicit voice: Ryan (British) for English, Shakir (Egyptian) for Arabic.
    $wants = @()
    if ($c.voice) { $wants += $c.voice }
    if (@($c.text.ToCharArray() | Where-Object { [int]$_ -ge 0x600 -and [int]$_ -le 0x6FF }).Count -gt 0) { $wants += 'Shakir', 'Arabic' } else { $wants += 'Ryan', 'Thomas', 'United Kingdom', 'Guy' }
    :pick foreach ($w in $wants) { foreach ($t in $tokens) { if ($t.GetDescription() -like "*$w*") { $voice.Voice = $t; break pick } } }
    [void]$voice.Speak($c.text)
    [Console]::Out.WriteLine('done')
  } catch {
    [Console]::Out.WriteLine('error')
  }
  [Console]::Out.Flush()
}
