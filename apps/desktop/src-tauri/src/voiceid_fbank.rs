// Kaldi-style 80-dim log-mel filterbank with per-utterance mean normalization (as wespeaker expects).
fn fbank(pcm: &[i16]) -> Vec<f32> {
    const SR: f64 = 16000.0; const WIN: usize = 400; const HOP: usize = 160; const NFFT: usize = 512; const MELS: usize = 80;
    let mut x: Vec<f64> = pcm.iter().map(|&s| s as f64).collect();
    if x.len() < WIN { x.resize(WIN, 0.0); }
    let frames = 1 + (x.len() - WIN) / HOP;
    let povey: Vec<f64> = (0..WIN).map(|i| (0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (WIN - 1) as f64).cos()).powf(0.85)).collect();
    let mel = |f: f64| 1127.0 * (1.0 + f / 700.0).ln();
    let (lo, hi) = (mel(20.0), mel(SR / 2.0));
    let centers: Vec<f64> = (0..MELS + 2).map(|i| lo + (hi - lo) * i as f64 / (MELS + 1) as f64).collect();
    let bins: Vec<f64> = (0..=NFFT / 2).map(|k| mel(k as f64 * SR / NFFT as f64)).collect();
    let mut planner = rustfft::FftPlanner::<f64>::new();
    let fft = planner.plan_fft_forward(NFFT);
    let mut out = vec![0f32; frames * MELS];
    let mut buf = vec![rustfft::num_complex::Complex::new(0.0, 0.0); NFFT];
    for f in 0..frames {
        let frame = &x[f * HOP..f * HOP + WIN];
        let mean = frame.iter().sum::<f64>() / WIN as f64;
        let d: Vec<f64> = frame.iter().map(|v| v - mean).collect();
        for c in buf.iter_mut() { *c = rustfft::num_complex::Complex::new(0.0, 0.0); }
        for i in 0..WIN {
            let pre = if i == 0 { d[0] - 0.97 * d[0] } else { d[i] - 0.97 * d[i - 1] };
            buf[i].re = pre * povey[i];
        }
        fft.process(&mut buf);
        let power: Vec<f64> = buf[..=NFFT / 2].iter().map(|c| c.norm_sqr()).collect();
        for m in 0..MELS {
            let (l, c, r) = (centers[m], centers[m + 1], centers[m + 2]);
            let mut e = 0.0;
            for (k, &b) in bins.iter().enumerate() {
                let w = ((b - l) / (c - l)).min((r - b) / (r - c));
                if w > 0.0 { e += w * power[k]; }
            }
            out[f * MELS + m] = e.max(f32::EPSILON as f64).ln() as f32;
        }
    }
    for m in 0..MELS {
        let mean = (0..frames).map(|f| out[f * MELS + m]).sum::<f32>() / frames as f32;
        for f in 0..frames { out[f * MELS + m] -= mean; }
    }
    out
}
