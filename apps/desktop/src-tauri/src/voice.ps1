$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
try {
  Add-Type -AssemblyName System.Speech
  Add-Type -AssemblyName System.Web.Extensions
  $source = @'
using System;
using System.Speech.Recognition;
using System.Globalization;
using System.Web.Script.Serialization;
using System.Threading;
using System.Linq;
public class JarvisVoice {
  static object gate = new object();
  static JavaScriptSerializer json = new JavaScriptSerializer();
  static void Emit(object o) { lock(gate) { Console.WriteLine(json.Serialize(o)); Console.Out.Flush(); } }
  public static RecognizerInfo ResolveRecognizer(string language, RecognizerInfo[] installed) {
    var exact = installed.FirstOrDefault(candidate => candidate.Culture.Name == language);
    if(exact != null) return exact;
    // Windows commonly ships en-US while the user selects en-GB (or vice versa).
    // For English dictation, use an installed English recognizer rather than failing
    // to start; keep other languages exact so we never silently change dialect.
    if(language == "en-US" || language == "en-GB")
      return installed.FirstOrDefault(candidate => candidate.Culture.Name == "en-US")
        ?? installed.FirstOrDefault(candidate => candidate.Culture.Name == "en-GB");
    return null;
  }
  public static void Start(string mode, string language) {
    var installed = SpeechRecognitionEngine.InstalledRecognizers().ToArray();
    var info = ResolveRecognizer(language, installed);
    if(info == null) throw new Exception("No offline Windows recognizer is installed for " + language + ". Installed recognizers: " + (installed.Length == 0 ? "none" : String.Join(", ", installed.Select(candidate => candidate.Culture.Name))) + ". Install a Windows speech recognition language pack, then restart JARVIS.");
    using(var engine = new SpeechRecognitionEngine(info)) {
      bool wake = mode == "wake" || mode == "wake-whisper" || mode == "wake-interrupt";
      var builder = new GrammarBuilder(); builder.Culture=info.Culture; builder.Append(new Choices("JARVIS", "hey JARVIS", "OK JARVIS", "wake up JARVIS", "JARVIS wake up", "good morning JARVIS", "JARVIS are you there"));
      var keyword = new Grammar(builder); keyword.Enabled=wake;
      var dictation = new DictationGrammar(); dictation.Enabled=!wake;
      engine.LoadGrammar(keyword); engine.LoadGrammar(dictation);
      engine.SetInputToDefaultAudioDevice();
      engine.EndSilenceTimeout=TimeSpan.FromMilliseconds(800);
      engine.EndSilenceTimeoutAmbiguous=TimeSpan.FromMilliseconds(1000);
      var ended = new ManualResetEvent(false);
      DateTime lastLevel = DateTime.MinValue;
      engine.AudioLevelUpdated += (s,e) => { if((DateTime.UtcNow-lastLevel).TotalMilliseconds>100) {lastLevel=DateTime.UtcNow;Emit(new {type="level",level=e.AudioLevel});} };
      // Caption mode only mirrors live partial text while Whisper records; it never submits a request.
      bool caption = mode == "caption";
      bool woke = false;
      engine.SpeechHypothesized += (s,e) => {
        if(caption) { Emit(new {type="partial",text=e.Result.Text}); return; }
        // React while the keyword is still being heard instead of waiting for trailing silence.
        if(wake && !woke && e.Result.Grammar==keyword && e.Result.Confidence >= 0.45) { woke = true; Emit(new {type="wake",text=e.Result.Text,confidence=e.Result.Confidence}); ended.Set(); }
      };
      engine.SpeechRecognitionRejected += (s,e) => {
        if(caption) return;
        if(!wake) {
          Emit(new {type="unrecognized",text=e.Result == null ? "" : e.Result.Text,confidence=e.Result == null ? 0 : e.Result.Confidence});
          ended.Set();
        }
      };
      engine.SpeechRecognized += (s,e) => {
        if(caption) { Emit(new {type="partial",text=e.Result.Text}); return; }
        if(e.Result.Confidence < (wake ? 0.3 : 0.4)) {
          if(!wake) { Emit(new {type="unrecognized",text=e.Result.Text,confidence=e.Result.Confidence}); ended.Set(); }
          return;
        }
        if(wake && e.Result.Grammar==keyword) {
          // A single short keyword attracts false matches from noise and JARVIS's own voice; require a confident hit.
          if(e.Result.Confidence < 0.5 || woke) return;
          woke = true; Emit(new {type="wake",text=e.Result.Text,confidence=e.Result.Confidence});
          ended.Set(); return;
        } else {
          Emit(new {type="transcript",text=e.Result.Text});
          ended.Set();
        }
      };
      engine.RecognizeCompleted += (s,e) => ended.Set();
      engine.RecognizeAsync(RecognizeMode.Multiple);
      Emit(new {type="ready",mode=mode,language=info.Culture.Name,requestedLanguage=language,fallback=info.Culture.Name!=language});
      DateTime timeout=DateTime.UtcNow.AddSeconds(25);
      while(!ended.WaitOne(200)) {
        if(!wake && DateTime.UtcNow>timeout) {
          Emit(new {type="unrecognized",text="",reason="No speech was recognized before the listening timeout."});
          break;
        }
      }
      engine.RecognizeAsyncCancel();
    }
  }
}
'@
  $refs = @([System.Speech.Recognition.SpeechRecognitionEngine].Assembly.Location, [System.Web.Script.Serialization.JavaScriptSerializer].Assembly.Location)
  # Compiling the bridge took 1-2 s on every listener start; reuse a per-user build keyed by the source hash.
  $loaded = $false
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($source))) -replace '-', '').Substring(0, 20)
    $cache = Join-Path $env:LOCALAPPDATA 'JARVIS\speech-cache'
    $dll = Join-Path $cache "JarvisVoice-$hash.dll"
    if (-not (Test-Path -LiteralPath $dll)) {
      [void](New-Item -ItemType Directory -Force -Path $cache)
      $staging = Join-Path $cache "JarvisVoice-$hash-$PID.dll"
      Add-Type -TypeDefinition $source -ReferencedAssemblies $refs -OutputAssembly $staging -OutputType Library
      Move-Item -LiteralPath $staging -Destination $dll -Force
    }
    Add-Type -LiteralPath $dll
    $loaded = $true
  } catch { $loaded = $false }
  if (-not $loaded) { Add-Type -TypeDefinition $source -ReferencedAssemblies $refs }
  $config = $env:JARVIS_SPEECH_CONFIG | ConvertFrom-Json
  [JarvisVoice]::Start($config.mode, $config.language)
} catch {
  @{type='error'; error=$_.Exception.Message} | ConvertTo-Json -Compress
  exit 1
}
