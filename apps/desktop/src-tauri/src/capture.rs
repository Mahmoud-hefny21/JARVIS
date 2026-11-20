//! Native 16 kHz mono microphone capture with voice-activity detection.
//! Replaces the PowerShell recorder, which compiled C# on every request and lost the first
//! seconds of speech. The microphone opens in milliseconds, audio before speech is trimmed,
//! and recordings with no speech are rejected instead of being sent to Whisper (which invents
//! words such as "Okay." or "So" from room noise).
use crate::db::Result;
use serde_json::json;
use std::{
    path::Path,
    time::{Duration, Instant},
};
use tauri::Emitter;
use windows_sys::Win32::Media::Audio::{
    waveInAddBuffer, waveInClose, waveInOpen, waveInPrepareHeader, waveInReset, waveInStart,
    waveInUnprepareHeader, CALLBACK_NULL, HWAVEIN, WAVEFORMATEX, WAVEHDR, WAVE_FORMAT_PCM,
    WAVE_MAPPER, WHDR_DONE,
};

const RATE: usize = 16_000;
/// 50 ms per buffer keeps level updates and end-of-speech detection responsive.
const CHUNK: usize = RATE / 20;
const BUFFERS: usize = 16;
const CHUNK_MS: u64 = 50;
/// Absolute RMS below which audio is never treated as speech (about -45 dBFS).
const MIN_SPEECH_RMS: f32 = 180.0;
/// Silence after speech that ends the request.
const END_SILENCE_MS: u64 = 750;
/// Audio kept before the detected start so the first syllable is not clipped.
const PREROLL_MS: usize = 300;
const MAX_UTTERANCE: Duration = Duration::from_secs(15);

pub struct Settings {
    /// How long to wait for speech to begin before giving up.
    pub wait_for_speech: Duration,
}

struct Device {
    handle: HWAVEIN,
    headers: Vec<Box<WAVEHDR>>,
    _data: Vec<Vec<u8>>,
}
impl Drop for Device {
    fn drop(&mut self) {
        unsafe {
            waveInReset(self.handle);
            for h in &mut self.headers {
                waveInUnprepareHeader(self.handle, &mut **h, size_of::<WAVEHDR>() as u32);
            }
            waveInClose(self.handle);
        }
    }
}

fn open() -> Result<Device> {
    let format = WAVEFORMATEX {
        wFormatTag: WAVE_FORMAT_PCM as u16,
        nChannels: 1,
        nSamplesPerSec: RATE as u32,
        nAvgBytesPerSec: (RATE * 2) as u32,
        nBlockAlign: 2,
        wBitsPerSample: 16,
        cbSize: 0,
    };
    let mut handle: HWAVEIN = std::ptr::null_mut();
    if unsafe { waveInOpen(&mut handle, WAVE_MAPPER, &format, 0, 0, CALLBACK_NULL) } != 0 {
        return Err("No microphone is available. Check Windows sound input settings and microphone privacy permissions.".into());
    }
    let mut device = Device { handle, headers: Vec::new(), _data: Vec::new() };
    for _ in 0..BUFFERS {
        let mut data = vec![0u8; CHUNK * 2];
        let mut header = Box::new(WAVEHDR {
            lpData: data.as_mut_ptr(),
            dwBufferLength: (CHUNK * 2) as u32,
            dwBytesRecorded: 0,
            dwUser: 0,
            dwFlags: 0,
            dwLoops: 0,
            lpNext: std::ptr::null_mut(),
            reserved: 0,
        });
        let size = size_of::<WAVEHDR>() as u32;
        unsafe {
            if waveInPrepareHeader(handle, &mut *header, size) != 0
                || waveInAddBuffer(handle, &mut *header, size) != 0
            {
                return Err("Microphone capture unavailable".into());
            }
        }
        device._data.push(data);
        device.headers.push(header);
    }
    if unsafe { waveInStart(handle) } != 0 {
        return Err("Microphone capture unavailable".into());
    }
    Ok(device)
}

fn rms(samples: &[i16]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f64 = samples.iter().map(|&s| (s as f64) * (s as f64)).sum();
    (sum / samples.len() as f64).sqrt() as f32
}

/// Voice-activity state machine, separated from the device so it can be unit tested.
struct Detector {
    floor: f32,
    calibrating: usize,
    voiced_run: usize,
    silent_run: usize,
    onset: Option<usize>,
    voiced_chunks: usize,
}
enum Step {
    Continue,
    SpeechStarted,
    Finished,
}
impl Detector {
    fn new() -> Self {
        Self { floor: f32::MAX, calibrating: 4, voiced_run: 0, silent_run: 0, onset: None, voiced_chunks: 0 }
    }
    /// `position` is the sample count recorded after this chunk.
    fn push(&mut self, level: f32, position: usize) -> Step {
        if self.calibrating > 0 {
            // The quietest of the first 200 ms is the room's noise floor (speech may already have begun).
            self.calibrating -= 1;
            self.floor = self.floor.min(level).min(900.0);
            return Step::Continue;
        }
        let start = (self.floor * 3.0).max(MIN_SPEECH_RMS);
        let stop = (self.floor * 2.0).max(MIN_SPEECH_RMS * 0.75);
        match self.onset {
            None => {
                if level > start {
                    self.voiced_run += 1;
                    // 150 ms of sustained sound filters out clicks, taps and keyboard noise.
                    if self.voiced_run >= 3 {
                        let back = CHUNK * self.voiced_run + PREROLL_MS * RATE / 1000;
                        self.onset = Some(position.saturating_sub(back));
                        self.voiced_chunks = self.voiced_run;
                        return Step::SpeechStarted;
                    }
                } else {
                    self.voiced_run = 0;
                    // Track slowly changing background noise (fans, traffic).
                    self.floor = (self.floor * 0.9 + level * 0.1).min(900.0);
                }
                Step::Continue
            }
            Some(_) => {
                if level < stop {
                    self.silent_run += 1;
                } else {
                    self.silent_run = 0;
                    self.voiced_chunks += 1;
                }
                if self.silent_run as u64 * CHUNK_MS >= END_SILENCE_MS {
                    Step::Finished
                } else {
                    Step::Continue
                }
            }
        }
    }
}

/// Records one spoken request into `path` as 16-bit PCM WAV.
pub fn record(
    app: &tauri::AppHandle,
    settings: Settings,
    cancelled: impl Fn() -> bool,
    path: &Path,
) -> Result<()> {
    let mut device = open()?;
    let _ = app.emit("mic", json!({"phase":"listening"}));
    let started = Instant::now();
    let mut pcm: Vec<i16> = Vec::with_capacity(RATE * 16);
    let mut detector = Detector::new();
    let mut next = 0usize;
    let mut finished = false;
    let mut last_level = Instant::now() - Duration::from_secs(1);
    while !finished {
        if cancelled() {
            return Err("Speech capture cancelled".into());
        }
        let header: *mut WAVEHDR = &mut *device.headers[next];
        let flags = unsafe { std::ptr::read_volatile(std::ptr::addr_of!((*header).dwFlags)) };
        if flags & WHDR_DONE == 0 {
            if started.elapsed() > settings.wait_for_speech + MAX_UTTERANCE + Duration::from_secs(2) {
                break;
            }
            std::thread::sleep(Duration::from_millis(8));
            continue;
        }
        let recorded =
            unsafe { std::ptr::read_volatile(std::ptr::addr_of!((*header).dwBytesRecorded)) } as usize / 2;
        let samples = &device._data[next][..recorded * 2];
        let chunk: Vec<i16> = samples
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]))
            .collect();
        pcm.extend_from_slice(&chunk);
        unsafe {
            waveInAddBuffer(device.handle, header, size_of::<WAVEHDR>() as u32);
        }
        next = (next + 1) % BUFFERS;
        let level = rms(&chunk);
        if last_level.elapsed() >= Duration::from_millis(90) {
            last_level = Instant::now();
            let _ = app.emit("mic", json!({"level":(level / 2500.0).min(1.0)}));
        }
        match detector.push(level, pcm.len()) {
            Step::SpeechStarted => {
                let _ = app.emit("mic", json!({"phase":"speech"}));
            }
            Step::Finished => finished = true,
            Step::Continue => {}
        }
        match detector.onset {
            None if started.elapsed() > settings.wait_for_speech => {
                return Err("No audible speech captured".into());
            }
            Some(onset) if (pcm.len() - onset) > MAX_UTTERANCE.as_secs() as usize * RATE => finished = true,
            _ => {}
        }
    }
    drop(device);
    let _ = app.emit("mic", json!({"phase":"processing","level":0}));
    let onset = detector.onset.ok_or("No audible speech captured")?;
    // Keep ~200 ms of the trailing silence; drop the rest.
    let trailing = detector.silent_run.saturating_sub(4) * CHUNK;
    let end = pcm.len().saturating_sub(trailing).max(onset);
    let mut speech = pcm[onset..end].to_vec();
    if detector.voiced_chunks < 5 || speech.len() < RATE / 3 {
        return Err("No audible speech captured".into());
    }
    normalize(&mut speech);
    write_wav(path, &speech)
}

/// Brings quiet microphones to a normal level (gain capped so noise is not amplified wildly).
fn normalize(samples: &mut [i16]) {
    let peak = samples.iter().map(|s| s.unsigned_abs() as f32).fold(1.0, f32::max);
    let gain = (22_000.0 / peak).min(6.0);
    if gain > 1.2 {
        for s in samples.iter_mut() {
            *s = (*s as f32 * gain).clamp(-32768.0, 32767.0) as i16;
        }
    }
}

fn write_wav(path: &Path, samples: &[i16]) -> Result<()> {
    let data = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&(RATE as u32).to_le_bytes());
    out.extend_from_slice(&((RATE * 2) as u32).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    std::fs::write(path, out).map_err(|_| "Cannot save the recording".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(levels: &[f32]) -> (Option<usize>, bool) {
        let mut d = Detector::new();
        let mut finished = false;
        for (i, &l) in levels.iter().enumerate() {
            if let Step::Finished = d.push(l, (i + 1) * CHUNK) {
                finished = true;
                break;
            }
        }
        (d.onset, finished)
    }

    #[test]
    fn steady_room_noise_is_not_speech() {
        let (onset, _) = run(&[60.0; 100]);
        assert!(onset.is_none());
        let (onset, _) = run(&[150.0, 170.0, 140.0, 160.0, 175.0, 150.0, 165.0, 158.0, 172.0, 149.0]);
        assert!(onset.is_none());
    }

    #[test]
    fn a_short_click_is_not_speech() {
        let mut levels = vec![50.0; 10];
        levels.extend([3000.0, 3000.0]);
        levels.extend([50.0; 30]);
        assert!(run(&levels).0.is_none());
    }

    #[test]
    fn speech_starts_with_preroll_and_ends_after_silence() {
        let mut levels = vec![50.0; 10];
        levels.extend([1500.0; 20]);
        levels.extend([50.0; 20]);
        let (onset, finished) = run(&levels);
        let onset = onset.expect("speech detected");
        assert!(onset < 10 * CHUNK, "preroll keeps audio before the detected start");
        assert!(finished, "750 ms of silence ends the request");
    }

    #[test]
    fn speech_in_noisy_room_needs_to_stand_out() {
        let mut levels = vec![400.0; 10];
        levels.extend([700.0; 10]);
        assert!(run(&levels).0.is_none(), "a slightly louder room is not speech");
        levels.extend([2500.0; 10]);
        assert!(run(&levels).0.is_some());
    }

    #[test]
    fn normalize_caps_gain() {
        let mut quiet = vec![100i16, -100, 50];
        normalize(&mut quiet);
        assert_eq!(quiet[0], 600);
    }
}
