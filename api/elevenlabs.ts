import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── API 키 라운드 로빈 ──

function pickElevenLabsKey(): string | undefined {
  const keys = [
    process.env.ELEVENLABS_API_KEY,
    process.env.ELEVENLABS_API_KEY_2,
  ].filter(Boolean) as string[];
  if (keys.length === 0) return undefined;
  return keys[Math.floor(Math.random() * keys.length)];
}

// ── 사용량 로깅 ──

async function logUsage(req: VercelRequest, action: string, costUsd: number) {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken) return;
    if (req.headers['x-custom-api-key']) return;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const { data: session } = await supabase
      .from('c2gen_sessions')
      .select('email')
      .eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!session?.email) return;

    await supabase.from('c2gen_usage').insert({
      email: session.email,
      action,
      cost_usd: costUsd,
      count: 1,
    });
  } catch (e) {
    console.error('[api/elevenlabs] logUsage error:', e);
  }
}

async function logError(action: string, errorMessage: string) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    await supabase.from('c2gen_error_logs').insert({
      service: 'elevenlabs', action, error_message: errorMessage,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;

  try {
    switch (action) {
      // ── TTS 생성 (타임스탬프 포함) ──
      case 'generateAudio': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickElevenLabsKey();
        if (!apiKey || apiKey.length < 10) {
          return res.json({ audio_base64: null, alignment: null, error: 'API key not configured' });
        }

        const voiceId = (req.headers['x-custom-voice-id'] as string)
          || params.voiceId
          || process.env.ELEVENLABS_VOICE_ID
          || '21m00Tcm4TlvDq8ikWAM'; // Rachel default

        const { text, modelId = 'eleven_multilingual_v2', speed = 1.0, stability = 0.6 } = params;

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            output_format: 'mp3_44100_128',
            voice_settings: {
              stability,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true,
              speed,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[api/elevenlabs] TTS error:', response.status, errorText);
          return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        // TTS 비용: 글자수 × $0.00003
        const ttsCost = (text?.length || 0) * 0.00003;
        logUsage(req, 'tts', ttsCost);
        return res.json(data);
      }

      // ── 음성 미리듣기 (타임스탬프 없이 간단한 TTS) ──
      case 'generatePreview': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickElevenLabsKey();
        if (!apiKey || apiKey.length < 10) {
          return res.json({ audio_base64: null, error: 'API key not configured' });
        }

        const { text, voiceId, modelId = 'eleven_multilingual_v2' } = params;
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return res.status(response.status).json({ error: errorText });
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return res.json({ audio_base64: base64 });
      }

      // ── 음성 목록 조회 (계정 소유 음성) ──
      case 'fetchVoices': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickElevenLabsKey();
        if (!apiKey || apiKey.length < 10) {
          return res.json({ voices: [] });
        }

        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
          method: 'GET',
          headers: { 'xi-api-key': apiKey },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[api/elevenlabs] Voices error:', response.status, errorText);
          return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        return res.json(data);
      }

      // ── 공유 음성 라이브러리 검색 ──
      case 'searchLibrary': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickElevenLabsKey();
        if (!apiKey || apiKey.length < 10) {
          return res.json({ voices: [], has_more: false, error: 'API 키 없음' });
        }

        const { search, gender, language, page_size = 20, page = 0 } = params;

        const queryParams = new URLSearchParams();
        queryParams.set('page_size', String(page_size));
        if (page) queryParams.set('page', String(page));
        if (search) queryParams.set('search', search);
        if (gender) queryParams.set('gender', gender);
        if (language) queryParams.set('language', language);

        // 먼저 /v1/shared-voices 시도
        let url = `https://api.elevenlabs.io/v1/shared-voices?${queryParams.toString()}`;
        let response = await fetch(url, {
          method: 'GET',
          headers: { 'xi-api-key': apiKey },
        });

        // 권한 에러 시 /v1/voices (자체 음성 목록)으로 폴백
        if (response.status === 403 || response.status === 401) {
          console.warn('[api/elevenlabs] shared-voices 권한 없음, voices 목록으로 폴백');
          const fallbackRes = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: { 'xi-api-key': apiKey },
          });
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            let voices = fallbackData.voices || [];
            // 클라이언트 필터 적용
            if (gender) voices = voices.filter((v: any) => v.labels?.gender?.toLowerCase() === gender);
            if (search) {
              const q = search.toLowerCase();
              voices = voices.filter((v: any) =>
                v.name?.toLowerCase().includes(q) ||
                v.labels?.accent?.toLowerCase().includes(q) ||
                v.labels?.description?.toLowerCase().includes(q)
              );
            }
            return res.json({
              voices: voices.map((v: any) => ({
                voice_id: v.voice_id,
                name: v.name,
                gender: v.labels?.gender,
                accent: v.labels?.accent,
                age: v.labels?.age,
                description: v.labels?.description,
                preview_url: v.preview_url,
                category: v.category,
              })),
              has_more: false,
              notice: 'API 키에 voices_read 권한이 없어 계정 음성만 표시됩니다. ElevenLabs 대시보드에서 API 키를 재생성하세요.',
            });
          }
          return res.json({ voices: [], has_more: false, error: 'API 키에 voices_read 권한이 필요합니다. ElevenLabs 대시보드에서 API 키를 재생성하세요.' });
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[api/elevenlabs] Library search error:', response.status, errorText);
          return res.json({ voices: [], has_more: false, error: `검색 실패: ${response.status}` });
        }

        const data = await response.json();
        return res.json(data);
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/elevenlabs] ${action} 실패:`, error.message);
    logError(action, error.message || 'Unknown error');
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
