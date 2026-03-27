import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── API 키 라운드 로빈 ──

let _elKeyIdx = 0;
function pickElevenLabsKey(): string | undefined {
  const keys = [
    process.env.ELEVENLABS_API_KEY,
    process.env.ELEVENLABS_API_KEY_2,
  ].filter((k): k is string => !!k && k.length >= 10);
  if (keys.length === 0) return undefined;
  // 라운드 로빈 (랜덤 대신 순차 — 유효하지 않은 키 혼입 시 안정성 향상)
  const key = keys[_elKeyIdx % keys.length];
  _elKeyIdx++;
  return key;
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

async function logError(action: string, errorMessage: string, options?: {
  severity?: 'info' | 'warn' | 'error' | 'critical';
  stack?: string;
  email?: string;
  context?: Record<string, any>;
}) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    await supabase.from('c2gen_error_logs').insert({
      service: 'elevenlabs', action, error_message: errorMessage,
      severity: options?.severity || 'error',
      stack_trace: options?.stack?.slice(0, 4000),
      email: options?.email,
      request_context: options?.context,
      created_at: new Date().toISOString(),
    });
  } catch (_e) { /* ignore */ }
}

// ── 크레딧 차감 ──

async function checkAndDeductCredits(req: VercelRequest, creditAmount: number, description: string): Promise<{ ok: boolean; error?: string; balance?: number }> {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken || req.headers['x-custom-api-key']) return { ok: true };

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { ok: true };

    const supabase = createClient(url, key);
    const { data: session } = await supabase
      .from('c2gen_sessions')
      .select('email')
      .eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!session?.email) return { ok: true };

    // 운영자 등급은 크레딧 차감 스킵
    const { data: userRow } = await supabase
      .from('c2gen_users').select('plan').eq('email', session.email).single();
    if (userRow?.plan === 'operator') return { ok: true };

    const { data } = await supabase.rpc('deduct_credits', {
      p_email: session.email,
      p_amount: creditAmount,
      p_description: description,
    });
    if (!data?.success) return { ok: false, error: data?.error, balance: data?.current };
    return { ok: true, balance: data.balance };
  } catch (e) {
    console.error('[api/elevenlabs] checkAndDeductCredits error:', e);
    return { ok: true };
  }
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

        // params.voiceId가 명시적으로 전달되면 우선 사용 (V2.0 화자별 TTS)
        const voiceId = params.voiceId
          || (req.headers['x-custom-voice-id'] as string)
          || process.env.ELEVENLABS_VOICE_ID
          || '21m00Tcm4TlvDq8ikWAM'; // Rachel default

        const { text, modelId = 'eleven_multilingual_v2', speed = 1.0, stability = 0.6 } = params;

        // 크레딧 차감을 API 호출 전에 수행 (실패 시 불필요한 API 호출 방지)
        const charCount = text?.length || 0;
        const ttsCredits = Math.max(1, Math.ceil(charCount / 1000) * 15);
        const creditResult = await checkAndDeductCredits(req, ttsCredits, `TTS 생성 (${charCount}자)`);
        if (!creditResult.ok) {
          return res.status(402).json({
            error: 'insufficient_credits',
            message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: ${ttsCredits})`,
            balance: creditResult.balance,
          });
        }

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

        // ElevenLabs 응답 검증 — audio_base64가 없으면 에러 반환
        if (!data.audio_base64) {
          const debugInfo = {
            hasAlignment: !!data.alignment,
            responseKeys: Object.keys(data),
            textLength: charCount,
            textPreview: text?.slice(0, 100),
            voiceId,
            modelId,
            apiKeyPrefix: apiKey.slice(0, 8) + '...',
          };
          console.error('[api/elevenlabs] TTS 응답에 audio_base64 없음:', JSON.stringify(debugInfo));
          await logError('generateAudio', `audio_base64 missing in ElevenLabs response`, {
            severity: 'error',
            context: debugInfo,
          });
          return res.status(502).json({
            error: 'ElevenLabs가 오디오 데이터를 반환하지 않았습니다',
            debug: debugInfo,
          });
        }

        const ttsCost = charCount * 0.00003;
        logUsage(req, 'tts', ttsCost);
        return res.json({ ...data, creditBalance: creditResult.balance });
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

      // ── AI BGM 생성 (Eleven Music) ──
      case 'generateMusic': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickElevenLabsKey();
        if (!apiKey || apiKey.length < 10) {
          return res.json({ audio_base64: null, error: 'API key not configured' });
        }

        const { prompt, durationMs = 30000 } = params;
        if (!prompt) {
          return res.status(400).json({ error: 'prompt is required' });
        }

        // 크레딧 차감 (BGM: 50크레딧)
        const bgmCredits = 50;
        const creditResult = await checkAndDeductCredits(req, bgmCredits, `BGM 생성 (${Math.round(durationMs / 1000)}초)`);
        if (!creditResult.ok) {
          return res.status(402).json({
            error: 'insufficient_credits',
            message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: ${bgmCredits})`,
            balance: creditResult.balance,
          });
        }

        const musicResponse = await fetch('https://api.elevenlabs.io/v1/music', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            prompt,
            music_length_ms: durationMs,
            model_id: 'music_v1',
            force_instrumental: true,
          }),
        });

        if (!musicResponse.ok) {
          const errorText = await musicResponse.text();
          console.error('[api/elevenlabs] Music error:', musicResponse.status, errorText);
          await logError('generateMusic', `Music API ${musicResponse.status}: ${errorText.slice(0, 500)}`);
          return res.status(musicResponse.status).json({ error: errorText });
        }

        const arrayBuffer = await musicResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        const durationSec = durationMs / 1000;
        const musicCost = (durationSec / 60) * 0.70; // $0.70/min (Scale overage rate)
        logUsage(req, 'music_generation', musicCost);

        return res.json({ audio_base64: base64, creditBalance: creditResult.balance });
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

      // ── C2 PILOT: Voice Design v3 ──
      case 'designVoice': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickElevenLabsKey();
        if (!apiKey || apiKey.length < 10) {
          return res.status(400).json({ error: 'ElevenLabs API key required' });
        }

        const { description, sample_text } = params;
        if (!description) {
          return res.status(400).json({ error: 'Voice description is required' });
        }

        // 크레딧 차감 (30크레딧 = 3변형)
        const creditResult = await checkAndDeductCredits(req, 30, 'Voice Design (캐릭터 음성 3변형)');
        if (!creditResult.ok) {
          return res.status(402).json({
            error: 'insufficient_credits',
            message: `크레딧이 부족합니다. (현재: ${creditResult.balance ?? 0}, 필요: 30)`,
            balance: creditResult.balance,
          });
        }

        // Generate 3 voice variants using POST /v1/text-to-voice/design
        const variants: Array<{ voice_id: string; preview_url: string; name: string }> = [];
        const errors: string[] = [];

        // Pad description if too short (API requires >= 20 chars)
        const paddedDesc = description.length < 20
          ? description + ' with clear natural pronunciation and moderate pace'
          : description;

        for (let i = 0; i < 3; i++) {
          try {
            const designRes = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
              },
              body: JSON.stringify({
                voice_description: paddedDesc,
                output_format: 'mp3_22050_32',
                text: sample_text || '안녕하세요, 저는 새로 만들어진 캐릭터 음성입니다. 이 음성이 마음에 드시나요? 오늘도 좋은 하루 보내시길 바랍니다. 여러분과 함께하는 시간이 정말 즐겁습니다. 앞으로도 재미있는 이야기를 많이 들려드리겠습니다!',
              }),
            });

            if (!designRes.ok) {
              const errText = await designRes.text();
              const errMsg = `variant ${i}: ${designRes.status} ${errText.slice(0, 300)}`;
              console.error(`[designVoice]`, errMsg);
              errors.push(errMsg);
              continue;
            }

            // Try parsing as JSON first (API returns { previews: [...] })
            const rawBuffer = await designRes.arrayBuffer();
            const rawText = Buffer.from(rawBuffer).toString('utf-8');
            let parsed = false;

            try {
              const jsonData = JSON.parse(rawText);
              // Format: { previews: [{ audio_base_64, generated_voice_id, ... }] }
              if (jsonData.previews && Array.isArray(jsonData.previews)) {
                for (const preview of jsonData.previews) {
                  variants.push({
                    voice_id: preview.generated_voice_id || `designed_${Date.now()}_${variants.length}`,
                    preview_url: preview.audio_base_64 ? `data:audio/mpeg;base64,${preview.audio_base_64}` : '',
                    name: `변형 ${String.fromCharCode(65 + variants.length)}`,
                  });
                }
                parsed = true;
                // Got all previews from single call, no need to call again
                break;
              }
              // Single voice format: { generated_voice_id, audio }
              if (jsonData.generated_voice_id || jsonData.audio) {
                variants.push({
                  voice_id: jsonData.generated_voice_id || `designed_${Date.now()}_${i}`,
                  preview_url: jsonData.audio ? `data:audio/mpeg;base64,${jsonData.audio}` : '',
                  name: `변형 ${String.fromCharCode(65 + i)}`,
                });
                parsed = true;
              }
            } catch {
              // Not JSON — treat as binary audio
            }

            if (!parsed) {
              // Binary audio response
              const audioBase64 = Buffer.from(rawBuffer).toString('base64');
              variants.push({
                voice_id: `designed_${Date.now()}_${i}`,
                preview_url: audioBase64.length > 100 ? `data:audio/mpeg;base64,${audioBase64}` : '',
                name: `변형 ${String.fromCharCode(65 + i)}`,
              });
            }

            // Delay between calls to avoid rate limits
            if (i < 2) await new Promise(r => setTimeout(r, 800));
          } catch (err: any) {
            const errMsg = `variant ${i} exception: ${err.message}`;
            console.error(`[designVoice]`, errMsg);
            errors.push(errMsg);
          }
        }

        logUsage(req, 'voice_design', 0.10);
        return res.json({
          variants,
          creditBalance: creditResult.balance,
          // Include debug errors so frontend can show what went wrong
          ...(variants.length === 0 && errors.length > 0 ? { debug_errors: errors } : {}),
        });
      }

      // ── C2 PILOT: Save Designed Voice ──
      case 'saveDesignedVoice': {
        const apiKey = (req.headers['x-custom-api-key'] as string) || pickElevenLabsKey();
        if (!apiKey || apiKey.length < 10) {
          return res.status(400).json({ error: 'ElevenLabs API key required' });
        }

        const { generated_voice_id, voice_name, voice_description } = params;
        if (!generated_voice_id || !voice_name) {
          return res.status(400).json({ error: 'generated_voice_id and voice_name are required' });
        }

        const saveRes = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            voice_name,
            voice_description: voice_description || '',
            generated_voice_id,
          }),
        });

        if (!saveRes.ok) {
          const errText = await saveRes.text();
          return res.status(saveRes.status).json({ error: `Failed to save voice: ${errText}` });
        }

        const savedVoice = await saveRes.json();
        return res.json({ voice_id: savedVoice.voice_id, name: voice_name });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/elevenlabs] ${action} 실패:`, error.message);
    logError(action, error.message || 'Unknown error', { stack: error.stack });
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
