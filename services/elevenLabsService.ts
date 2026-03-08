
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

      // 자막 의미 청킹을 비동기로 처리 (오디오 반환을 블로킹하지 않음)
      const chunkingPromise = createMeaningChunks(text, words).then(meaningChunks => {
        if (meaningChunks.length > 0) {
          subtitleData!.meaningChunks = meaningChunks;
        }
      }).catch(e => {
        console.warn('[ElevenLabs] AI 자막 분리 실패, 단어 기반 방식 사용:', e);
      });

      // 청킹 완료를 기다리되 최대 2초만 (넘으면 백그라운드 처리)
      await Promise.race([chunkingPromise, new Promise(r => setTimeout(r, 2000))]);
    }

    return { audioData: audioBase64, subtitleData, estimatedDuration };
  } catch (error) {
    console.error("ElevenLabs Generation Failed:", error);
    return { audioData: null, subtitleData: null, estimatedDuration: null };
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
