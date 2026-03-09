
import { CONFIG, ElevenLabsModelId } from "../config";
import { SubtitleData, SubtitleWord, MeaningChunk } from "../types";
import { splitSubtitleByMeaning } from "./geminiService";

/**
 * ElevenLabs API Service
 * 서버 프록시(/api/elevenlabs)를 통해 API 호출
 */

export const getElevenLabsModelId = (): ElevenLabsModelId => {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_MODEL);
  return (saved as ElevenLabsModelId) || CONFIG.DEFAULT_ELEVENLABS_MODEL;
};

export const setElevenLabsModelId = (modelId: ElevenLabsModelId): void => {
  localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_MODEL, modelId);
};

export interface ElevenLabsResult {
  audioData: string | null;
  subtitleData: SubtitleData | null;
  estimatedDuration: number | null;
}

function convertToWords(
  characters: string[],
  startTimes: number[],
  endTimes: number[]
): SubtitleWord[] {
  const words: SubtitleWord[] = [];
  let currentWord = '';
  let wordStart = 0;
  let wordEnd = 0;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    if (char === ' ' || char === '\n' || char === '\t') {
      if (currentWord.length > 0) {
        words.push({ word: currentWord, start: wordStart, end: wordEnd });
        currentWord = '';
      }
    } else {
      if (currentWord.length === 0) wordStart = startTimes[i];
      currentWord += char;
      wordEnd = endTimes[i];
    }
  }
  if (currentWord.length > 0) {
    words.push({ word: currentWord, start: wordStart, end: wordEnd });
  }
  return words;
}

async function createMeaningChunks(
  fullText: string,
  words: SubtitleWord[]
): Promise<MeaningChunk[]> {
  const textChunks = await splitSubtitleByMeaning(fullText, 20);
  if (textChunks.length === 0 || words.length === 0) return [];

  const meaningChunks: MeaningChunk[] = [];
  let wordIndex = 0;

  for (const chunkText of textChunks) {
    const chunkWords = chunkText.split(/\s+/).filter(w => w.length > 0);
    if (chunkWords.length === 0) continue;

    const startWordIndex = wordIndex;
    let matchedWords = 0;
    while (wordIndex < words.length && matchedWords < chunkWords.length) {
      matchedWords++;
      wordIndex++;
    }

    if (startWordIndex < words.length) {
      const endWordIndex = Math.min(wordIndex - 1, words.length - 1);
      meaningChunks.push({
        text: chunkText,
        startTime: words[startWordIndex].start,
        endTime: words[endWordIndex].end,
      });
    }
  }

  for (let i = 0; i < meaningChunks.length - 1; i++) {
    meaningChunks[i].endTime = meaningChunks[i + 1].startTime;
  }
  return meaningChunks;
}

function preprocessTtsText(text: string): string {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => !/[.!?。…,，]$/.test(line) ? line + '.' : line)
    .join(' ');
}

function buildElevenLabsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const customKey = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY);
  if (customKey && customKey.length >= 10) headers['x-custom-api-key'] = customKey;
  const customVoice = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID);
  if (customVoice) headers['x-custom-voice-id'] = customVoice;
  const sessionToken = localStorage.getItem('c2gen_session_token');
  if (sessionToken) headers['x-session-token'] = sessionToken;
  return headers;
}

export const generateAudioWithElevenLabs = async (
  text: string,
  _providedApiKey?: string,
  providedVoiceId?: string,
  providedModelId?: ElevenLabsModelId,
  options?: { speed?: number; stability?: number }
): Promise<ElevenLabsResult> => {

  const finalVoiceId = providedVoiceId || localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID) || CONFIG.DEFAULT_VOICE_ID;
  const finalModelId = providedModelId || getElevenLabsModelId();
  const speed = options?.speed ?? 1.0;
  const stability = options?.stability ?? 0.6;
  const processedText = preprocessTtsText(text);

  // 빈 텍스트 가드 — ElevenLabs API는 빈 텍스트 시 400 에러 반환
  if (!processedText || processedText.trim().length === 0) {
    console.warn('[ElevenLabs] 빈 텍스트 — TTS 생성 스킵');
    return { audioData: null, subtitleData: null, estimatedDuration: 0 } as any;
  }

  try {
    const headers = buildElevenLabsHeaders();
    const response = await fetch('/api/elevenlabs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'generateAudio',
        text: processedText,
        voiceId: finalVoiceId,
        modelId: finalModelId,
        speed,
        stability,
      }),
    });

    if (!response.ok) {
      const errorDetail = await response.text();
      console.error("ElevenLabs API Error:", errorDetail);
      return { audioData: null, subtitleData: null, estimatedDuration: null };
    }

    const jsonResponse = await response.json();
    if (jsonResponse.error) {
      console.warn("ElevenLabs:", jsonResponse.error);
      return { audioData: null, subtitleData: null, estimatedDuration: null };
    }

    const audioBase64 = jsonResponse.audio_base64;
    let subtitleData: SubtitleData | null = null;
    let estimatedDuration: number | null = null;

    if (jsonResponse.alignment) {
      const { characters, character_start_times_seconds, character_end_times_seconds } = jsonResponse.alignment;
      const words = convertToWords(characters, character_start_times_seconds, character_end_times_seconds);
      subtitleData = { words, fullText: text };

      if (character_end_times_seconds?.length > 0) {
        estimatedDuration = character_end_times_seconds[character_end_times_seconds.length - 1] + 0.3;
      }

      // 자막 의미 청킹 — 최대 2초 타임아웃 (타임아웃 시 백그라운드 작업 취소)
      try {
        const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
        const meaningChunks = await Promise.race([
          createMeaningChunks(text, words),
          timeoutPromise
        ]);
        if (meaningChunks && meaningChunks.length > 0) {
          subtitleData.meaningChunks = meaningChunks;
        }
      } catch (e) {
        // Timeout or error — proceed without meaning chunks (word-based subtitles used instead)
      }
    }

    return { audioData: audioBase64, subtitleData, estimatedDuration };
  } catch (error) {
    console.error("ElevenLabs Generation Failed:", error);
    return { audioData: null, subtitleData: null, estimatedDuration: null };
  }
};

// ── AI BGM 생성 (Eleven Music) ──

const BGM_MOOD_PROMPTS: Record<string, string> = {
  upbeat: 'Create an upbeat, energetic instrumental track with bright synths, driving beat, and positive vibes. Suitable for motivational or fun video background music.',
  calm: 'Create a calm, peaceful piano instrumental with soft ambient pads and gentle melody. Relaxing and soothing, suitable for narration background.',
  dramatic: 'Create a dramatic orchestral instrumental with building tension, strings, and cinematic impact. Suitable for intense storytelling.',
  news: 'Create a professional news-style instrumental with clean electronic tones, moderate tempo, and authoritative feel. Suitable for information delivery.',
  tech: 'Create a modern electronic instrumental with futuristic synths, clean digital beats, and innovative feel. Suitable for technology content.',
  emotional: 'Create an emotional acoustic instrumental with gentle guitar, soft piano, and heartfelt melody. Suitable for touching storytelling.',
  inspiring: 'Create an inspiring instrumental with uplifting melody, building dynamics, and hopeful atmosphere. Suitable for motivational content.',
  dark: 'Create a dark ambient instrumental with mysterious tones, deep bass, and suspenseful atmosphere. Suitable for thriller or mystery content.',
};

export const generateMusicWithElevenLabs = async (
  mood: string,
  durationMs: number = 30000,
): Promise<{ audioBase64: string | null; error?: string }> => {
  try {
    const headers = buildElevenLabsHeaders();
    const prompt = BGM_MOOD_PROMPTS[mood] || BGM_MOOD_PROMPTS.calm;

    const response = await fetch('/api/elevenlabs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'generateMusic',
        prompt,
        durationMs,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      return { audioBase64: null, error: errorData.error || errorData.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { audioBase64: data.audio_base64 || null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ElevenLabs Music] Generation failed:', msg);
    return { audioBase64: null, error: msg };
  }
};

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels?: { accent?: string; age?: string; gender?: string; description?: string; use_case?: string };
  preview_url?: string;
}

export const fetchElevenLabsVoices = async (apiKey?: string): Promise<ElevenLabsVoice[]> => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey.length >= 10) {
      headers['x-custom-api-key'] = apiKey;
    } else {
      const savedKey = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY);
      if (savedKey && savedKey.length >= 10) headers['x-custom-api-key'] = savedKey;
    }

    const response = await fetch('/api/elevenlabs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'fetchVoices' }),
    });

    if (!response.ok) {
      console.error("ElevenLabs Voices API Error:", response.status);
      return [];
    }

    const data = await response.json();
    const voices: ElevenLabsVoice[] = data.voices || [];
    return voices;
  } catch (error) {
    console.error("ElevenLabs Voices Fetch Failed:", error);
    return [];
  }
};

// ── 공유 음성 라이브러리 검색 ──

export interface SharedVoice {
  public_owner_id: string;
  voice_id: string;
  name: string;
  accent?: string;
  gender?: string;
  age?: string;
  language?: string;
  description?: string;
  preview_url?: string;
  use_case?: string;
  category?: string;
  rate?: number;
  cloned_by_count?: number;
}

export interface SharedVoiceSearchResult {
  voices: SharedVoice[];
  has_more: boolean;
  last_sort_id?: string;
}

export const searchSharedVoices = async (params: {
  search?: string;
  gender?: string;
  language?: string;
  page_size?: number;
  page?: number;
}): Promise<SharedVoiceSearchResult> => {
  try {
    const headers = buildElevenLabsHeaders();
    const response = await fetch('/api/elevenlabs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'searchLibrary', ...params }),
    });

    if (!response.ok) {
      console.error("ElevenLabs Library Search Error:", response.status);
      return { voices: [], has_more: false };
    }

    const data = await response.json();
    return {
      voices: data.voices || [],
      has_more: data.has_more || false,
      last_sort_id: data.last_sort_id,
    };
  } catch (error) {
    console.error("ElevenLabs Library Search Failed:", error);
    return { voices: [], has_more: false };
  }
};

// ── C2 PILOT: Voice Design v3 ──

export interface VoiceDesignVariant {
  voice_id: string;
  preview_url: string;  // data:audio/mpeg;base64,...
  name: string;
}

export const designCharacterVoice = async (
  description: string,
  sampleText?: string,
  apiKey?: string
): Promise<{ variants: VoiceDesignVariant[]; creditBalance?: number }> => {
  const key = apiKey || localStorage.getItem('tubegen_el_key') || '';
  const sessionToken = localStorage.getItem('c2gen_session_token') || '';

  const res = await fetch('/api/elevenlabs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'x-custom-api-key': key } : {}),
      ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
    },
    body: JSON.stringify({
      action: 'designVoice',
      description,
      sample_text: sampleText,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Voice design failed' }));
    throw new Error(err.error || err.message || 'Voice design failed');
  }

  return res.json();
};

export const saveDesignedVoice = async (
  generatedVoiceId: string,
  voiceName: string,
  voiceDescription?: string,
  apiKey?: string
): Promise<{ voice_id: string; name: string }> => {
  const key = apiKey || localStorage.getItem('tubegen_el_key') || '';
  const sessionToken = localStorage.getItem('c2gen_session_token') || '';

  const res = await fetch('/api/elevenlabs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'x-custom-api-key': key } : {}),
      ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
    },
    body: JSON.stringify({
      action: 'saveDesignedVoice',
      generated_voice_id: generatedVoiceId,
      voice_name: voiceName,
      voice_description: voiceDescription,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to save voice' }));
    throw new Error(err.error || 'Failed to save voice');
  }

  return res.json();
};

// ── C2 PILOT: Brand Preset BGM Generation ──

export const generateBrandBgm = async (
  bgmPreferences: { genre: string; mood: string; tempo_range: { min: number; max: number }; custom_prompt?: string },
  durationMs: number = 30000,
  apiKey?: string
): Promise<{ audio_base64: string | null; creditBalance?: number; error?: string }> => {
  // Build prompt from preferences
  const parts: string[] = [];
  if (bgmPreferences.genre) parts.push(bgmPreferences.genre);
  if (bgmPreferences.mood) parts.push(`${bgmPreferences.mood} mood`);
  const avgTempo = Math.round((bgmPreferences.tempo_range.min + bgmPreferences.tempo_range.max) / 2);
  parts.push(`${avgTempo} BPM`);
  parts.push('instrumental');
  parts.push(`${Math.round(durationMs / 1000)} seconds`);
  if (bgmPreferences.custom_prompt) parts.push(bgmPreferences.custom_prompt);

  const prompt = parts.join(', ');

  // Call API directly with the custom prompt (don't use generateMusicWithElevenLabs
  // which overrides prompt with BGM_MOOD_PROMPTS lookup)
  try {
    const headers = buildElevenLabsHeaders();
    const response = await fetch('/api/elevenlabs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'generateMusic',
        prompt,
        durationMs,
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      return { audio_base64: null, error: errorData.error || `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { audio_base64: data.audio_base64 || null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'BGM generation failed';
    return { audio_base64: null, error: msg };
  }
};
