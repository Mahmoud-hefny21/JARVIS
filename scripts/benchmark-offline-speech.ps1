$ErrorActionPreference='Stop'
$repoRoot=Split-Path -Parent $PSScriptRoot
$runtime=Join-Path $repoRoot '.build/optional/whisper/runtime/Release/whisper-cli.exe'
$model=Join-Path $repoRoot '.build/optional/whisper/ggml-base-q5_1.bin'
if((Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant() -ne '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'){throw 'Model checksum mismatch'}
$scratch=Join-Path $repoRoot '.build/speech-probe'
New-Item -ItemType Directory -Force -Path $scratch | Out-Null
$wav=Join-Path $scratch 'synthetic-multilingual-engine.wav'
Add-Type -AssemblyName System.Speech
$synth=[System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $synth.SelectVoice('Microsoft David Desktop')
  $format=[System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
  $synth.SetOutputToWaveFile($wav,$format)
  $synth.Speak('Jarvis, remember that I prefer local storage. Please show my system status.')
} finally {$synth.Dispose()}
$stdout=Join-Path $scratch 'whisper-result.txt'
$stderr=Join-Path $scratch 'whisper-diagnostics.txt'
$arguments='-m "'+$model+'" -f "'+$wav+'" -l auto -t 4 -bo 1 -bs 1 -nt -np -nf'
$watch=[Diagnostics.Stopwatch]::StartNew()
$child=Start-Process -FilePath $runtime -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$null=$child.Handle
$peakWorking=0L;$peakPrivate=0L
while(-not $child.HasExited){
  $child.Refresh()
  $peakWorking=[Math]::Max($peakWorking,$child.WorkingSet64)
  $peakPrivate=[Math]::Max($peakPrivate,$child.PrivateMemorySize64)
  if($watch.Elapsed.TotalSeconds -gt 90){$child.Kill();throw 'Synthetic offline recognition timed out'}
  Start-Sleep -Milliseconds 100
}
$child.WaitForExit();$watch.Stop()
if($child.ExitCode -ne 0){throw 'Synthetic offline recognizer failed'}
$text=(Get-Content -LiteralPath $stdout -Raw -Encoding UTF8).Trim()
if($text -notmatch 'storage' -or $text -notmatch 'system'){throw 'Synthetic transcript did not preserve the expected words'}
$result=[pscustomobject]@{fixture='Synthetic en-US SAPI WAV, not a microphone, Egyptian Arabic, mixed-language or wake-word test';engine='whisper.cpp b5454 / multilingual base-q5_1';transcript=$text;elapsedMs=[Math]::Round($watch.Elapsed.TotalMilliseconds,1);sampledPeakWorkingSetMiB=[Math]::Round($peakWorking/1MB,1);sampledPeakPrivateCommitMiB=[Math]::Round($peakPrivate/1MB,1);samplingMs=100;threads=4;modelBytes=(Get-Item -LiteralPath $model).Length;modelSha256='422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898';modelKeptLoadedAfterExit=$false}
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $repoRoot 'docs/verification/offline-speech-synthetic.json') -Encoding UTF8
$result | ConvertTo-Json
Remove-Item -LiteralPath $wav
