import { BgmMood } from '../config';

/**
 * Web Audio API 기반 앰비언트 BGM 생성기 V3
 *
 * 시그널 체인:
 *   [Pad Layer] ──→ [Convolution Reverb] ──→ [Master Filter] ──→ [Master Gain] ──→ output
 *                         ↑                        ↑
 *   [Arp Layer] ──────────┘                        │
 *   [Noise Layer] ──→ [Bandpass] ──────────────────┘
 *   [Sub Bass] ──→ [Lowpass] ──────────────────────┘
 *
 * 핵심 기법:
 * - Convolution Reverb (합성 임펄스 응답) → 공간감
 * - 3-코드 프로그레션 + 크로스페이드 → 움직임
 * - 노트당 3개 디튠 오실레이터 → 코러스 효과
 * - 핑크 노이즈 레이어 → 분위기 텍스처
 * - 서브 베이스 드론 → 저주파 기반
 * - 소프트 아르페지오 (분위기별) → 선율적 힌트
 */

const SAMPLE_RATE = 44100;
const DURATION = 30;
const CROSSFADE = 3; // 코드 전환 크로스페이드 (초)

// ── 음 주파수 (Hz) ──

const N = {
  E2: 82.41, G2: 98.00, A2: 110.00, Bb2: 116.54, B2: 123.47,
  C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61,
  Fs3: 185.00, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
  C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23,
  Fs4: 369.99, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
};

// ── 분위기별 설정 ──

interface MoodConfig {
  chords: number[][];        // 3-코드 프로그레션 (Hz 배열)
  filterFreq: number;        // 마스터 로우패스 컷오프
  volume: number;            // 마스터 볼륨
  reverbDecay: number;       // 리버브 감쇠율 (클수록 짧음)
  reverbTime: number;        // 리버브 테일 길이 (초)
  reverbMix: number;         // 리버브 웻/드라이 비율 (0~1)
  noiseVol: number;          // 노이즈 레이어 볼륨
  noiseCenter: number;       // 노이즈 밴드패스 중심 주파수
  noiseQ: number;            // 노이즈 밴드패스 Q
  subFreq: number;           // 서브 베이스 주파수
  subVol: number;            // 서브 베이스 볼륨
  arp: boolean;              // 아르페지오 레이어 활성화
  arpSpeed: number;          // 아르페지오 노트 간격 (초)
  arpVol: number;            // 아르페지오 볼륨
  lfoRate: number;           // 패드 LFO 속도
  warmth: number;            // 배음 강도 (0~1)
}

const CONFIGS: Record<BgmMood, MoodConfig> = {
  calm: {
    chords: [
      [N.F3, N.A3, N.C4, N.F4],
      [N.D3, N.F3, N.A3, N.D4],
      [N.Bb2, N.D3, N.F3, N.Bb3],
    ],
    filterFreq: 1200, volume: 0.12,
    reverbDecay: 2, reverbTime: 4, reverbMix: 0.75,
    noiseVol: 0.018, noiseCenter: 350, noiseQ: 0.4,
    subFreq: 87.31, subVol: 0.04,
    arp: false, arpSpeed: 0, arpVol: 0,
    lfoRate: 0.04, warmth: 0.4,
  },
  upbeat: {
    chords: [
      [N.C3, N.E3, N.G3, N.C4],
      [N.A2, N.C3, N.E3, N.A3],
      [N.F3, N.A3, N.C4, N.F4],
    ],
    filterFreq: 2800, volume: 0.10,
    reverbDecay: 2.5, reverbTime: 3, reverbMix: 0.55,
    noiseVol: 0.008, noiseCenter: 600, noiseQ: 0.3,
    subFreq: 65.41, subVol: 0.03,
    arp: true, arpSpeed: 1.8, arpVol: 0.025,
    lfoRate: 0.06, warmth: 0.25,
  },
  dramatic: {
    chords: [
      [N.D3, N.F3, N.A3, N.D4],
      [N.Bb2, N.D3, N.F3, N.Bb3],
      [N.G2, N.Bb2, N.D3, N.G3],
    ],
    filterFreq: 1800, volume: 0.13,
    reverbDecay: 2.5, reverbTime: 5, reverbMix: 0.65,
    noiseVol: 0.022, noiseCenter: 250, noiseQ: 0.7,
    subFreq: 73.42, subVol: 0.05,
    arp: false, arpSpeed: 0, arpVol: 0,
    lfoRate: 0.05, warmth: 0.45,
  },
  news: {
    chords: [
      [N.G3, N.B3, N.D4, N.G4],
      [N.E3, N.G3, N.B3, N.E4],
      [N.C3, N.E3, N.G3, N.C4],
    ],
    filterFreq: 2200, volume: 0.08,
    reverbDecay: 2, reverbTime: 2.5, reverbMix: 0.50,
    noiseVol: 0.005, noiseCenter: 500, noiseQ: 0.3,
    subFreq: 98.00, subVol: 0.02,
    arp: true, arpSpeed: 2.5, arpVol: 0.018,
    lfoRate: 0.07, warmth: 0.15,
  },
  tech: {
    chords: [
      [N.C3, N.Eb3, N.G3, N.C4],
      [N.Ab3, N.C4, N.Eb4],
      [N.Bb2, N.D3, N.F3, N.Bb3],
    ],
    filterFreq: 2400, volume: 0.10,
    reverbDecay: 2.5, reverbTime: 3.5, reverbMix: 0.55,
    noiseVol: 0.012, noiseCenter: 800, noiseQ: 0.4,
    subFreq: 65.41, subVol: 0.04,
    arp: true, arpSpeed: 1.4, arpVol: 0.022,
    lfoRate: 0.08, warmth: 0.2,
  },
  emotional: {
    chords: [
      [N.E3, N.G3, N.B3, N.E4],
      [N.C3, N.E3, N.G3, N.C4],
      [N.G3, N.B3, N.D4, N.G4],
    ],
    filterFreq: 1600, volume: 0.12,
    reverbDecay: 2, reverbTime: 5, reverbMix: 0.78,
    noiseVol: 0.012, noiseCenter: 300, noiseQ: 0.5,
    subFreq: 82.41, subVol: 0.04,
    arp: true, arpSpeed: 3.0, arpVol: 0.02,
    lfoRate: 0.035, warmth: 0.55,
  },
  inspiring: {
    chords: [
      [N.G3, N.B3, N.D4, N.G4],
      [N.D3, N.Fs3, N.A3, N.D4],
      [N.C3, N.E3, N.G3, N.C4],
    ],
    filterFreq: 2600, volume: 0.11,
    reverbDecay: 2.5, reverbTime: 4, reverbMix: 0.65,
    noiseVol: 0.008, noiseCenter: 500, noiseQ: 0.3,
    subFreq: 98.00, subVol: 0.03,
    arp: true, arpSpeed: 2.2, arpVol: 0.022,
    lfoRate: 0.05, warmth: 0.35,
  },
  dark: {
    chords: [
      [N.E2, N.B2, N.E3],
      [N.A2, N.C3, N.E3],
      [N.D3, N.A2, N.F3],
    ],
    filterFreq: 550, volume: 0.14,
    reverbDecay: 2, reverbTime: 6, reverbMix: 0.82,
    noiseVol: 0.028, noiseCenter: 180, noiseQ: 0.9,
    subFreq: 55.00, subVol: 0.06,
    arp: false, arpSpeed: 0, arpVol: 0,
    lfoRate: 0.025, warmth: 0.2,
  },
};

// ── 합성 임펄스 응답 생성 (Convolution Reverb용) ──

function createReverbIR(ctx: OfflineAudioContext, duration: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * duration);
  const ir = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = ir.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    // 지수 감쇠 노이즈 — 리버브 테일의 핵심
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
  }
  return ir;
}

// ── 핑크 노이즈 버퍼 생성 ──

function createPinkNoiseBuffer(ctx: OfflineAudioContext): AudioBuffer {
  const length = ctx.sampleRate * DURATION;
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);

  // Paul Kellet의 핑크 노이즈 알고리즘
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

// ── 패드 레이어: 3-코드 프로그레션 + 크로스페이드 ──

function buildPadLayer(
  ctx: OfflineAudioContext,
  cfg: MoodConfig,
  reverbSend: AudioNode,
  drySend: AudioNode,
) {
  const chordDur = DURATION / cfg.chords.length;

  for (let ci = 0; ci < cfg.chords.length; ci++) {
    const chord = cfg.chords[ci];
    const start = ci * chordDur;
    const end = start + chordDur;

    // 크로스페이드 타이밍 계산
    const fadeInStart = ci === 0 ? 0 : start - CROSSFADE / 2;
    const fadeInEnd = ci === 0 ? CROSSFADE : start + CROSSFADE / 2;
    const fadeOutStart = ci === cfg.chords.length - 1 ? end - CROSSFADE : end - CROSSFADE / 2;
    const fadeOutEnd = ci === cfg.chords.length - 1 ? end : end + CROSSFADE / 2;

    const oscStart = Math.max(0, fadeInStart);
    const oscEnd = Math.min(DURATION, fadeOutEnd + 0.1);

    for (let ni = 0; ni < chord.length; ni++) {
      const freq = chord[ni];

      // 노트당 3개 오실레이터 (코러스 효과)
      const oscs: OscillatorNode[] = [];
      const detunes = [0, +4, -4]; // cents 단위 디튠
      for (const dt of detunes) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        o.detune.value = dt;
        oscs.push(o);
      }

      // 따뜻한 배음 (1옥타브 위)
      const warmOsc = ctx.createOscillator();
      warmOsc.type = 'sine';
      warmOsc.frequency.value = freq * 2;

      const warmGain = ctx.createGain();
      warmGain.gain.value = cfg.warmth * 0.04;

      // 노트 게인 + LFO
      const noteGain = ctx.createGain();
      noteGain.gain.value = 0;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = cfg.lfoRate + ni * 0.008;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 0.012;
      lfo.connect(lfoAmt);
      lfoAmt.connect(noteGain.gain);

      // 엔벨로프: 크로스페이드 인/아웃
      const peakGain = 0.07;
      noteGain.gain.setValueAtTime(0, oscStart);
      noteGain.gain.linearRampToValueAtTime(peakGain, Math.min(DURATION, fadeInEnd));
      if (fadeOutStart > fadeInEnd + 0.1) {
        noteGain.gain.setValueAtTime(peakGain, fadeOutStart);
      }
      noteGain.gain.linearRampToValueAtTime(0, Math.min(DURATION, fadeOutEnd));

      // 연결
      for (const o of oscs) o.connect(noteGain);
      warmOsc.connect(warmGain);
      warmGain.connect(noteGain);

      noteGain.connect(reverbSend);
      noteGain.connect(drySend);

      // 스케줄
      for (const o of oscs) { o.start(oscStart); o.stop(oscEnd); }
      warmOsc.start(oscStart); warmOsc.stop(oscEnd);
      lfo.start(oscStart); lfo.stop(oscEnd);
    }
  }
}

// ── 노이즈 레이어: 핑크 노이즈 + 밴드패스 → 공기감 ──

function buildNoiseLayer(
  ctx: OfflineAudioContext,
  cfg: MoodConfig,
  destination: AudioNode,
) {
  const src = ctx.createBufferSource();
  src.buffer = createPinkNoiseBuffer(ctx);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = cfg.noiseCenter;
  bp.Q.value = cfg.noiseQ;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(cfg.noiseVol, 4);
  gain.gain.setValueAtTime(cfg.noiseVol, DURATION - 4);
  gain.gain.linearRampToValueAtTime(0, DURATION);

  src.connect(bp);
  bp.connect(gain);
  gain.connect(destination);

  src.start(0);
  src.stop(DURATION);
}

// ── 서브 베이스 레이어: 저주파 드론 ──

function buildSubBass(
  ctx: OfflineAudioContext,
  cfg: MoodConfig,
  destination: AudioNode,
) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = cfg.subFreq;

  // 극히 느린 주파수 변조 (숨쉬는 느낌)
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.015;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = cfg.subFreq * 0.015;
  lfo.connect(lfoAmt);
  lfoAmt.connect(osc.frequency);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cfg.subFreq * 2.5;
  lp.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(cfg.subVol, 5);
  gain.gain.setValueAtTime(cfg.subVol, DURATION - 5);
  gain.gain.linearRampToValueAtTime(0, DURATION);

  osc.connect(lp);
  lp.connect(gain);
  gain.connect(destination);

  lfo.start(0); osc.start(0);
  lfo.stop(DURATION); osc.stop(DURATION);
}

// ── 아르페지오 레이어: 리버브에 녹는 부드러운 선율 힌트 ──

function buildArpLayer(
  ctx: OfflineAudioContext,
  cfg: MoodConfig,
  reverbSend: AudioNode,
) {
  // 코드 프로그레션에서 고유 음 수집 → 1옥타브 위
  const notes: number[] = [];
  for (const chord of cfg.chords) {
    for (const n of chord) {
      const high = n * 2; // 1옥타브 위
      if (!notes.includes(high)) notes.push(high);
    }
  }
  notes.sort((a, b) => a - b);

  let time = 3; // 3초 후 시작
  let idx = 0;
  let dir = 1;

  while (time < DURATION - 4) {
    const freq = notes[idx];

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    // 매우 부드러운 어택, 긴 릴리즈 — 리버브에 녹아드는 느낌
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(cfg.arpVol, time + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + cfg.arpSpeed * 0.85);

    osc.connect(gain);
    gain.connect(reverbSend); // 리버브에만 보냄 → 먼 거리감

    osc.start(time);
    osc.stop(time + cfg.arpSpeed);

    idx += dir;
    if (idx >= notes.length - 1) dir = -1;
    if (idx <= 0) dir = 1;

    time += cfg.arpSpeed;
  }
}

// ── WAV 인코딩 ──

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const samples = buffer.getChannelData(0);
  const dataSize = samples.length * 2;
  const bufferSize = 44 + dataSize;
  const wav = new ArrayBuffer(bufferSize);
  const v = new DataView(wav);

  // RIFF header
  writeStr(v, 0, 'RIFF');
  v.setUint32(4, bufferSize - 8, true);
  writeStr(v, 8, 'WAVE');
  // fmt
  writeStr(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  // data
  writeStr(v, 36, 'data');
  v.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return wav;
}

function writeStr(v: DataView, off: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
}

// ── 메인 ──

export async function generateAmbientBgm(mood: BgmMood): Promise<string> {
  const cfg = CONFIGS[mood] || CONFIGS.calm;
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE * DURATION, SAMPLE_RATE);

  // ── 마스터 체인 ──
  const masterGain = ctx.createGain();
  masterGain.gain.value = cfg.volume;
  masterGain.connect(ctx.destination);

  const masterFilter = ctx.createBiquadFilter();
  masterFilter.type = 'lowpass';
  masterFilter.frequency.value = cfg.filterFreq;
  masterFilter.Q.value = 0.5;
  masterFilter.connect(masterGain);

  // ── Convolution Reverb ──
  const reverb = ctx.createConvolver();
  reverb.buffer = createReverbIR(ctx, cfg.reverbTime, cfg.reverbDecay);

  const wetGain = ctx.createGain();
  wetGain.gain.value = cfg.reverbMix;
  reverb.connect(wetGain);
  wetGain.connect(masterFilter);

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1 - cfg.reverbMix;
  dryGain.connect(masterFilter);

  // ── 레이어 빌드 ──
  buildPadLayer(ctx, cfg, reverb, dryGain);

  if (cfg.noiseVol > 0) {
    buildNoiseLayer(ctx, cfg, masterFilter);
  }

  if (cfg.subVol > 0) {
    buildSubBass(ctx, cfg, masterFilter);
  }

  if (cfg.arp) {
    buildArpLayer(ctx, cfg, reverb);
  }

  // ── 렌더링 ──
  const audioBuffer = await ctx.startRendering();
  const wavData = audioBufferToWav(audioBuffer);

  // base64 변환
  const bytes = new Uint8Array(wavData);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
