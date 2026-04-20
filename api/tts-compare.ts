import type { VercelRequest, VercelResponse } from '@vercel/node';

// TTS 3종 동시 비교용 엔드포인트 (운영자 테스트 전용, 테스트 후 삭제 예정)
// - ElevenLabs multilingual_v2 (현재 프로덕션)
// - ElevenLabs turbo_v2_5 (50% 저렴, 같은 보이스)
// - OpenAI gpt-4o-mini-tts (90% 저렴, 영어 베이스)

const MAX_CHARS = 150;
const DEFAULT_EL_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel
const DEFAULT_OAI_VOICE = 'nova';

function pickElevenLabsKey(): string | undefined {
  const keys = [
    process.env.ELEVENLABS_API_KEY,
    process.env.ELEVENLABS_API_KEY_2,
  ].filter((k): k is string => !!k && k.length >= 10);
  return keys[0];
}

function pickOpenAIKey(): string | undefined {
  const keys = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_2,
  ].filter(Boolean) as string[];
  return keys[0];
}

async function elevenLabsTTS(text: string, voiceId: string, modelId: string): Promise<{ base64: string | null; error?: string; ms: number }> {
  const start = Date.now();
  const apiKey = pickElevenLabsKey();
  if (!apiKey) return { base64: null, error: 'ELEVENLABS_API_KEY missing', ms: 0 };

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({
        text,
        model_id: modelId,
        output_format: 'mp3_44100_128',
        voice_settings: { stability: 0.6, similarity_boost: 0.75 },
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return { base64: null, error: `${response.status}: ${errText.slice(0, 200)}`, ms: Date.now() - start };
    }
    const buf = await response.arrayBuffer();
    return { base64: Buffer.from(buf).toString('base64'), ms: Date.now() - start };
  } catch (e: any) {
    return { base64: null, error: e.message || 'ElevenLabs fetch failed', ms: Date.now() - start };
  }
}

async function openaiTTS(text: string, voice: string): Promise<{ base64: string | null; error?: string; ms: number }> {
  const start = Date.now();
  const apiKey = pickOpenAIKey();
  if (!apiKey) return { base64: null, error: 'OPENAI_API_KEY missing', ms: 0 };

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return { base64: null, error: `${response.status}: ${errText.slice(0, 200)}`, ms: Date.now() - start };
    }
    const buf = await response.arrayBuffer();
    return { base64: Buffer.from(buf).toString('base64'), ms: Date.now() - start };
  } catch (e: any) {
    return { base64: null, error: e.message || 'OpenAI fetch failed', ms: Date.now() - start };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 인증 없음 — 테스트 후 엔드포인트 삭제 예정. 150자 제한만으로 악용 방지.

  const { text, elevenVoiceId, openaiVoice } = req.body || {};
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });
  if (text.length > MAX_CHARS) {
    return res.status(400).json({ error: `text too long (max ${MAX_CHARS})` });
  }

  const elVoice = (elevenVoiceId as string) || DEFAULT_EL_VOICE;
  const oaiVoice = (openaiVoice as string) || DEFAULT_OAI_VOICE;

  const [multilingual, turbo, openai] = await Promise.all([
    elevenLabsTTS(text, elVoice, 'eleven_multilingual_v2'),
    elevenLabsTTS(text, elVoice, 'eleven_turbo_v2_5'),
    openaiTTS(text, oaiVoice),
  ]);

  // 간단한 비용 추정 (참고용, 환율 1400원 고정)
  const charCount = text.length;
  const cost = {
    multilingual_krw: Math.round((charCount / 1000) * 0.17 * 1400), // Pro overage 기준
    turbo_krw: Math.round((charCount / 1000) * 0.085 * 1400), // 50% 할인
    openai_krw: Math.round((charCount / 1000) * 0.022 * 1400), // gpt-4o-mini-tts 추정
  };

  return res.json({
    multilingual,
    turbo,
    openai,
    meta: {
      charCount,
      elVoice,
      oaiVoice,
      cost,
    },
  });
}
