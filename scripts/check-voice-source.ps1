$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Web.Extensions
$repoRoot = Split-Path -Parent $PSScriptRoot
$content=[IO.File]::ReadAllText((Join-Path $repoRoot 'apps/desktop/src-tauri/src/voice.ps1'))
$start=$content.IndexOf('using System;')
$end=$content.IndexOf("`n'@",$start)
if($start -lt 0 -or $end -le $start){throw 'Speech source boundaries missing'}
$source=$content.Substring($start,$end-$start)
Add-Type -TypeDefinition $source -ReferencedAssemblies @([System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location,[System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
$installed=[System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
$requested=[JarvisVoice]::ResolveRecognizer('en-GB',$installed)
if($installed.Culture.Name -contains 'en-US' -and ($null -eq $requested -or $requested.Culture.Name -ne 'en-US')){throw 'English locale fallback did not select the installed en-US recognizer.'}
$arabic=[JarvisVoice]::ResolveRecognizer('ar-EG',$installed)
if($installed.Culture.Name -notcontains 'ar-EG' -and $null -ne $arabic){throw 'Arabic locale unexpectedly fell back to a different recognizer.'}
'Production voice bridge compiled; English locale fallback and exact Arabic selection passed. Microphone was not activated.'
