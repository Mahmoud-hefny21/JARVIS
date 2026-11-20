$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$repoRoot = Split-Path -Parent $PSScriptRoot
$probeRoot = Join-Path $repoRoot '.build/speech-probe'
New-Item -ItemType Directory -Force -Path $probeRoot | Out-Null
$wave = Join-Path $probeRoot 'synthetic-jarvis.wav'
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$recognizer = $null
try {
  $synth.SelectVoice('Microsoft David Desktop')
  $synth.SetOutputToWaveFile($wave)
  $tts = [Diagnostics.Stopwatch]::StartNew()
  $synth.Speak('JARVIS')
  $tts.Stop()
  $synth.SetOutputToNull()
  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine ([Globalization.CultureInfo]::GetCultureInfo('en-US'))
  $builder=New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture=[Globalization.CultureInfo]::GetCultureInfo('en-US')
  $builder.Append('JARVIS')
  $recognizer.LoadGrammar((New-Object System.Speech.Recognition.Grammar $builder))
  $recognizer.SetInputToWaveFile($wave)
  $stt=[Diagnostics.Stopwatch]::StartNew()
  $result=$recognizer.Recognize([TimeSpan]::FromSeconds(10))
  $stt.Stop()
  if(-not $result){throw 'Synthetic WAV recognition returned no phrase'}
  $resultDirectory = Join-Path $repoRoot 'test-results'
  New-Item -ItemType Directory -Force -Path $resultDirectory | Out-Null
  $resultPath = Join-Path $resultDirectory 'speech-probe.json'
  [pscustomobject]@{fixture='synthetic offline audio, no microphone or playback';voice='Microsoft David Desktop';language='en-US';recognized=$result.Text;confidence=$result.Confidence;ttsRenderToWaveMs=$tts.Elapsed.TotalMilliseconds;recognizeFromWaveMs=$stt.Elapsed.TotalMilliseconds} | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
  Get-Content -LiteralPath $resultPath
} finally {
  $synth.Dispose()
  if($recognizer){$recognizer.Dispose()}
  if(Test-Path -LiteralPath $wave){Remove-Item -LiteralPath $wave}
}
