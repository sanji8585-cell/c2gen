// ============================================================
// Sound Effects Service - Web Audio API (No audio files needed)
// ============================================================

import type { SoundType } from '../types/gamification';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ── 저장소 ──

const STORAGE_KEY = 'tubegen_sound_enabled';

export function getSoundEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

// ── 유틸 ──

function playTone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.08, startTime = 0) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration);
}

function playArpeggio(notes: number[], noteDuration: number, type: OscillatorType = 'square', volume = 0.08) {
  notes.forEach((freq, i) => playTone(freq, noteDuration, type, volume, i * noteDuration * 0.7));
}

// ── 효과음 정의 ──

const SOUNDS: Record<SoundType, () => void> = {
  // 레벨업: C-E-G-C' 상승 아르페지오
  levelUp: () => {
    playArpeggio([523.25, 659.25, 783.99, 1046.50], 0.15, 'square', 0.07);
    // 추가 하모닉
    setTimeout(() => playTone(1046.50, 0.4, 'sine', 0.05), 350);
  },

  // 업적 해금: 팡파레
  achievement: () => {
    playArpeggio([392, 523.25, 659.25, 783.99], 0.12, 'square', 0.06);
    setTimeout(() => {
      playTone(783.99, 0.3, 'sine', 0.05);
      playTone(1046.50, 0.3, 'sine', 0.04);
    }, 300);
  },

  // 퀘스트 완료: 성공 차임
  questComplete: () => {
    playTone(659.25, 0.15, 'sine', 0.07);
    playTone(783.99, 0.15, 'sine', 0.07, 0.12);
    playTone(1046.50, 0.25, 'sine', 0.06, 0.24);
  },

  // 뽑기: 등급별 효과
  gachaCommon: () => {
    playTone(440, 0.1, 'triangle', 0.05);
  },

  gachaUncommon: () => {
    playTone(440, 0.1, 'triangle', 0.06);
    playTone(554.37, 0.15, 'triangle', 0.06, 0.1);
  },

  gachaRare: () => {
    playArpeggio([440, 554.37, 659.25], 0.12, 'triangle', 0.06);
    setTimeout(() => playTone(880, 0.3, 'sine', 0.04), 250);
  },

  gachaEpic: () => {
    playArpeggio([392, 523.25, 659.25, 783.99], 0.1, 'sawtooth', 0.04);
    setTimeout(() => {
      playTone(783.99, 0.4, 'sine', 0.05);
      playTone(1046.50, 0.4, 'sine', 0.03);
    }, 300);
  },

  gachaLegendary: () => {
    // 드라마틱한 상승 + 팡파레
    playArpeggio([261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.50], 0.08, 'square', 0.05);
    setTimeout(() => {
      playTone(1046.50, 0.5, 'sine', 0.06);
      playTone(1318.51, 0.5, 'sine', 0.04);
      playTone(1567.98, 0.5, 'sine', 0.03);
    }, 500);
  },

  // 뽑기 스핀: 슬롯머신 돌아가는 틱 사운드
  gachaSpin: () => {
    const ctx = getCtx();
    for (let i = 0; i < 12; i++) {
      const freq = 800 + Math.random() * 400;
      playTone(freq, 0.04, 'square', 0.03, i * 0.08);
    }
  },

  // 뽑기 결과 드럼롤: 두근두근 기대감
  gachaRevealDrum: () => {
    const ctx = getCtx();
    // 빠른 드럼롤 → 감속
    for (let i = 0; i < 16; i++) {
      const delay = i * 0.06 + (i > 10 ? (i - 10) * 0.04 : 0);
      playTone(200 + i * 20, 0.05, 'triangle', 0.04 + i * 0.002, delay);
    }
    // 마지막 서스펜스 톤
    playTone(440, 0.3, 'sine', 0.05, 1.2);
  },

  // 콤보: 짧은 펀치 (피치 상승)
  combo: () => {
    playTone(523.25, 0.08, 'square', 0.06);
    playTone(659.25, 0.08, 'square', 0.05, 0.06);
  },

  // 프레스티지: 웅장한 코드
  prestige: () => {
    playArpeggio([261.63, 329.63, 392, 523.25], 0.2, 'sine', 0.06);
    setTimeout(() => {
      playTone(523.25, 0.6, 'sine', 0.07);
      playTone(659.25, 0.6, 'sine', 0.05);
      playTone(783.99, 0.6, 'sine', 0.04);
    }, 500);
  },

  // 마일스톤: 승리 차임
  milestone: () => {
    playTone(523.25, 0.12, 'triangle', 0.06);
    playTone(659.25, 0.12, 'triangle', 0.06, 0.1);
    playTone(783.99, 0.2, 'triangle', 0.05, 0.2);
  },
};

// ── 메인 함수 ──

export function playSFX(type: SoundType): void {
  if (!getSoundEnabled()) return;
  try {
    SOUNDS[type]?.();
  } catch {
    // AudioContext 초기화 실패 시 무시
  }
}

// 뽑기 등급에 맞는 사운드 타입 반환
export function getGachaSoundType(rarity: string): SoundType {
  const map: Record<string, SoundType> = {
    common: 'gachaCommon',
    uncommon: 'gachaUncommon',
    rare: 'gachaRare',
    epic: 'gachaEpic',
    legendary: 'gachaLegendary',
  };
  return map[rarity] || 'gachaCommon';
}
