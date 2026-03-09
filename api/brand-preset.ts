import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Modality } from '@google/genai';

// ── Shared utilities (inlined for Vercel serverless compatibility) ──

// Upload base64 image to Supabase Storage and return public URL
async function uploadImageToStorage(
  supabase: ReturnType<typeof createClient>,
  base64DataUrl: string,
  path: string
): Promise<string | null> {
  try {
    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const ext = mimeType.split('/')[1] || 'png';
    const fullPath = `${path}.${ext}`;

    const { error } = await supabase.storage
      .from('preset-images')
      .upload(fullPath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error('[uploadImageToStorage] error:', error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('preset-images')
      .getPublicUrl(fullPath);

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error('[uploadImageToStorage] exception:', err);
    return null;
  }
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

async function getSessionEmail(supabase: ReturnType<typeof getSupabase>, token: string): Promise<string | null> {
  if (!token) return null;
  const { data } = await supabase
    .from('c2gen_sessions').select('email')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString()).single();
  return data?.email || null;
}

async function deductCredits(supabase: ReturnType<typeof getSupabase>, email: string, amount: number, description: string) {
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_email: email,
    p_amount: amount,
    p_description: description,
  });
  if (error) throw new Error(`Credit deduction failed: ${error.message}`);
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;
  const token = params.token;

  try {
    const supabase = getSupabase();

    switch (action) {

      // ══════════════════════════════════════════
      // 브랜드 프리셋 관리
      // ══════════════════════════════════════════

      // ── 프리셋 목록 조회 ──
      case 'preset-list': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        let query = supabase
          .from('c2gen_brand_presets')
          .select('*')
          .eq('owner_email', email)
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        if (params.channel_id) {
          query = query.eq('channel_id', params.channel_id);
        }

        const { data, error } = await query;
        if (error) return res.status(500).json({ error: error.message });

        return res.json({ presets: data });
      }

      // ── 프리셋 생성 (위저드 Step 1) ──
      case 'preset-create': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { name, description, channel_id, world_view, target_audience } = params;
        if (!name) return res.status(400).json({ error: 'name is required' });

        const { data, error } = await supabase
          .from('c2gen_brand_presets')
          .insert({
            owner_email: email,
            name,
            description: description || null,
            channel_id: channel_id || null,
            world_view: world_view || null,
            target_audience: target_audience || null,
            wizard_step: 1,
          })
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ preset: data });
      }

      // ── 프리셋 업데이트 (각 위저드 단계에서 호출) ──
      case 'preset-update': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { id, ...updateFields } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        // 소유권 확인
        const { data: existing } = await supabase
          .from('c2gen_brand_presets')
          .select('owner_email')
          .eq('id', id)
          .single();

        if (!existing || existing.owner_email !== email) {
          return res.status(403).json({ error: 'Not authorized to update this preset' });
        }

        // 허용된 필드만 추출
        const allowedFields = [
          'name', 'description', 'world_view', 'target_audience',
          'tone_voice', 'tone_reference_texts', 'tone_learned_patterns',
          'art_style', 'style_preview_images', 'character_profiles',
          'bgm_preferences', 'seed_values', 'negative_prompts',
          'platform_configs', 'wizard_step', 'channel_id',
        ];

        const updates: Record<string, unknown> = {};
        for (const field of allowedFields) {
          if (field in updateFields) {
            updates[field] = updateFields[field];
          }
        }
        updates.updated_at = new Date().toISOString();

        // Safety: strip any base64 data from character_profiles before saving
        if (updates.character_profiles && Array.isArray(updates.character_profiles)) {
          updates.character_profiles = (updates.character_profiles as any[]).map((cp: any) => {
            if (cp.reference_sheet) {
              const sheet = { ...cp.reference_sheet };
              // Remove base64 data URLs
              if (sheet.original_upload?.startsWith('data:')) sheet.original_upload = '[uploaded]';
              if (sheet.multi_angle) {
                for (const key of Object.keys(sheet.multi_angle)) {
                  if (typeof sheet.multi_angle[key] === 'string' && sheet.multi_angle[key].startsWith('data:')) {
                    sheet.multi_angle[key] = '[generated]';
                  }
                }
              }
              return { ...cp, reference_sheet: sheet };
            }
            return cp;
          });
        }

        // Strip base64 style preview images
        if (updates.style_preview_images && Array.isArray(updates.style_preview_images)) {
          updates.style_preview_images = (updates.style_preview_images as string[]).map(img =>
            typeof img === 'string' && img.startsWith('data:') ? '[preview_stored]' : img
          );
        }

        // MERGE art_style and bgm_preferences with existing DB data to prevent overwriting
        // (e.g., Step4 saves custom_prompt but shouldn't wipe situation_gallery)
        if (updates.art_style || updates.bgm_preferences) {
          const { data: currentPreset } = await supabase
            .from('c2gen_brand_presets')
            .select('art_style, bgm_preferences')
            .eq('id', id)
            .single();
          if (currentPreset) {
            if (updates.art_style) {
              updates.art_style = { ...(currentPreset.art_style || {}), ...(updates.art_style as Record<string, unknown>) };
            }
            if (updates.bgm_preferences) {
              updates.bgm_preferences = { ...(currentPreset.bgm_preferences || {}), ...(updates.bgm_preferences as Record<string, unknown>) };
            }
          }
        }

        const { data, error } = await supabase
          .from('c2gen_brand_presets')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ preset: data });
      }

      // ── 프리셋 삭제 ──
      case 'preset-delete': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        // 소유권 확인
        const { data: existing } = await supabase
          .from('c2gen_brand_presets')
          .select('owner_email')
          .eq('id', id)
          .single();

        if (!existing || existing.owner_email !== email) {
          return res.status(403).json({ error: 'Not authorized to delete this preset' });
        }

        const { error } = await supabase
          .from('c2gen_brand_presets')
          .delete()
          .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });

        return res.json({ success: true });
      }

      // ── 프리셋 상세 조회 (캐릭터 참조 포함) ──
      case 'preset-get': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { data: preset, error: presetError } = await supabase
          .from('c2gen_brand_presets')
          .select('*')
          .eq('id', id)
          .eq('owner_email', email)
          .single();

        if (presetError || !preset) {
          return res.status(404).json({ error: 'Preset not found or not authorized' });
        }

        // Characters: include reference_sheet (has angle images) but exclude original_upload_url (large upload base64)
        const { data: characters, error: charError } = await supabase
          .from('c2gen_character_references')
          .select('id, brand_preset_id, name, type, char_role, species, personality, distinction_tags, voice_id, reference_sheet, style_analysis, created_at')
          .eq('brand_preset_id', id);

        if (charError) return res.status(500).json({ error: charError.message });

        return res.json({ preset, characters: characters || [] });
      }

      // ══════════════════════════════════════════
      // 톤 분석 (Gemini AI)
      // ══════════════════════════════════════════

      // ── 참조 텍스트 톤 분석 ──
      case 'tone-analyze': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { texts } = params;
        if (!texts || !Array.isArray(texts) || texts.length === 0) {
          return res.status(400).json({ error: 'texts (string array) is required' });
        }

        // 크레딧 차감 (5 크레딧)
        await deductCredits(supabase, email, 5, 'Tone analysis (brand preset)');

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

        const prompt = `Analyze the following reference texts and extract tone/style patterns. Return ONLY valid JSON with this exact structure:
{
  "style": "description of the overall writing style",
  "formality": 0.0 to 1.0 (0=very casual, 1=very formal),
  "humor": 0.0 to 1.0 (0=serious, 1=very humorous),
  "common_phrases": ["frequently used phrases or expressions"],
  "sentence_structure": "description of typical sentence patterns (short/long, simple/complex, etc.)",
  "vocabulary_preferences": ["notable vocabulary choices or word categories"]
}

Reference texts to analyze:
${texts.map((t: string, i: number) => `--- Text ${i + 1} ---\n${t}`).join('\n\n')}`;

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2048,
              },
            }),
          }
        );

        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          return res.status(500).json({ error: `Gemini API error: ${errText}` });
        }

        const geminiData = await geminiResponse.json();
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // JSON 추출 (```json ... ``` 블록 또는 순수 JSON)
        let patterns;
        try {
          const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
          patterns = JSON.parse(jsonStr);
        } catch {
          return res.status(500).json({ error: 'Failed to parse Gemini response as JSON', raw: rawText });
        }

        return res.json({ patterns });
      }

      // ══════════════════════════════════════════
      // 스타일 프리뷰 & 시추에이션 갤러리 (C2 PILOT Phase 1)
      // ══════════════════════════════════════════

      // ── 아트 스타일 프리뷰 (3가지 변형) ──
      case 'style-preview': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { scene_description, style_variants, preset_id } = params;
        if (!scene_description) {
          return res.status(400).json({ error: 'scene_description is required' });
        }

        // 크레딧 차감 (48 크레딧 = 16 × 3)
        await deductCredits(supabase, email, 48, 'Style preview (3 variants)');

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

        const stylePool = [
          'Warm watercolor illustration, soft colors, hand-drawn feel, gentle brush strokes',
          'Minimal flat design, clean geometric shapes, bold accent colors, modern look',
          'Korean webtoon style, clean outlines, cel-shaded coloring, vibrant tones',
          'Anime/manga illustration, large expressive eyes, dynamic shading, Japanese style',
          'Pixar-style 3D render, soft lighting, glossy textures, rounded forms',
          'Retro pixel art, 16-bit aesthetic, limited palette, nostalgic feel',
          'Oil painting style, rich textures, classical lighting, gallery quality',
          'Pastel chalk illustration, dreamy atmosphere, muted colors, soft edges',
          'Storybook illustration, whimsical details, warm palette, hand-painted look',
          'Pop art style, bold outlines, halftone dots, bright contrasting colors',
          'Nordic minimalist, muted earth tones, simple shapes, cozy hygge vibe',
          'Cyberpunk neon, dark backgrounds, glowing accents, futuristic atmosphere',
          'Isometric illustration, clean vectors, flat shading, infographic style',
          'Gouache painting, opaque layers, textured paper feel, earthy palette',
          'Line art with color wash, delicate ink strokes, transparent watercolor fills',
        ];
        let variants: string[];
        if (Array.isArray(style_variants) && style_variants.length === 3) {
          variants = style_variants;
        } else {
          // Randomly pick 3 unique styles from the pool
          const shuffled = [...stylePool].sort(() => Math.random() - 0.5);
          variants = shuffled.slice(0, 3);
        }

        // GoogleGenAI, Modality imported at top
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const results: Array<{ style_prompt: string; image_data: string | null }> = [];

        for (let i = 0; i < variants.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 1000));

          try {
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: [{ text: `[ART STYLE]\n${variants[i]}\n\n[SCENE]\n${scene_description}` }] },
              config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: { aspectRatio: '16:9' },
              },
            });

            const parts = response?.candidates?.[0]?.content?.parts || [];
            const imagePart = parts.find((p: any) => p.inlineData);
            results.push({
              style_prompt: variants[i],
              image_data: imagePart
                ? `data:image/${imagePart.inlineData.mimeType?.split('/')[1] || 'png'};base64,${imagePart.inlineData.data}`
                : null,
            });
          } catch {
            results.push({ style_prompt: variants[i], image_data: null });
          }
        }

        // Upload images to Supabase Storage and save URLs
        if (preset_id) {
          const imageUrls: string[] = [];
          for (let i = 0; i < results.length; i++) {
            if (results[i].image_data) {
              const url = await uploadImageToStorage(
                supabase,
                results[i].image_data as string,
                `presets/${preset_id}/style-preview-${i}-${Date.now()}`
              );
              if (url) {
                imageUrls.push(url);
                results[i].image_data = url; // Replace base64 with URL in response too
              }
            }
          }

          const { data: currentPreset } = await supabase
            .from('c2gen_brand_presets')
            .select('art_style')
            .eq('id', preset_id)
            .single();
          const currentArtStyle = currentPreset?.art_style || {};
          await supabase
            .from('c2gen_brand_presets')
            .update({
              art_style: {
                ...currentArtStyle,
                preview_results: results.map(r => ({
                  style_prompt: r.style_prompt,
                  image_url: typeof r.image_data === 'string' && r.image_data.startsWith('http') ? r.image_data : null,
                })),
              },
              style_preview_images: imageUrls.length > 0 ? imageUrls : undefined,
            })
            .eq('id', preset_id);
        }

        return res.json({ variants: results });
      }

      // ── 시추에이션 갤러리 (선택 스타일로 4~6장 생성) ──
      case 'situation-gallery': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { art_style_prompt, scenarios: customScenarios, preset_id: galleryPresetId } = params;
        if (!art_style_prompt) {
          return res.status(400).json({ error: 'art_style_prompt is required' });
        }

        // 크레딧 차감 (96 크레딧 = 16 × 6)
        await deductCredits(supabase, email, 96, 'Situation gallery generation');

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

        const defaultScenarios = [
          'Character resting indoors, cozy room',
          'Character active outdoors, sunny park',
          'Close-up emotional expression, happy/surprised',
          'Multiple characters together, group scene',
          'Character eating food, dining table',
          'Character on an adventure, dramatic scenery',
        ];
        const scenarios: string[] = (Array.isArray(customScenarios) && customScenarios.length >= 4)
          ? customScenarios
          : defaultScenarios;

        // GoogleGenAI, Modality imported at top
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        const gallery: Array<{ scenario: string; image_data: string | null }> = [];

        for (let i = 0; i < scenarios.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 1000));

          try {
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: [{ text: `[ART STYLE]\n${art_style_prompt}\n\n[SCENE]\n${scenarios[i]}` }] },
              config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: { aspectRatio: '16:9' },
              },
            });

            const parts = response?.candidates?.[0]?.content?.parts || [];
            const imagePart = parts.find((p: any) => p.inlineData);
            gallery.push({
              scenario: scenarios[i],
              image_data: imagePart
                ? `data:image/${imagePart.inlineData.mimeType?.split('/')[1] || 'png'};base64,${imagePart.inlineData.data}`
                : null,
            });
          } catch {
            gallery.push({ scenario: scenarios[i], image_data: null });
          }
        }

        // Upload gallery images to Supabase Storage and save URLs
        if (galleryPresetId) {
          for (let i = 0; i < gallery.length; i++) {
            if (gallery[i].image_data?.startsWith('data:')) {
              const url = await uploadImageToStorage(
                supabase,
                gallery[i].image_data as string,
                `presets/${galleryPresetId}/gallery-${i}-${Date.now()}`
              );
              if (url) {
                gallery[i].image_data = url; // Replace base64 with URL
              }
            }
          }

          const { data: currentPreset } = await supabase
            .from('c2gen_brand_presets')
            .select('art_style')
            .eq('id', galleryPresetId)
            .single();
          const currentArtStyle = currentPreset?.art_style || {};
          await supabase
            .from('c2gen_brand_presets')
            .update({
              art_style: {
                ...currentArtStyle,
                situation_gallery: gallery.map(g => ({
                  scenario: g.scenario,
                  image_data: g.image_data, // Now URLs, not base64
                })),
              },
            })
            .eq('id', galleryPresetId);
        }

        return res.json({ gallery });
      }

      // ── BGM 오디오 업로드 to Storage ──
      case 'upload-bgm': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { preset_id: bgmPresetId, audio_base64, sample_index } = params;
        if (!bgmPresetId || !audio_base64) {
          return res.status(400).json({ error: 'preset_id and audio_base64 are required' });
        }

        const dataUrl = `data:audio/mpeg;base64,${audio_base64}`;
        const url = await uploadImageToStorage(
          supabase,
          dataUrl,
          `presets/${bgmPresetId}/bgm-sample-${sample_index || 0}-${Date.now()}`
        );

        if (!url) {
          return res.status(500).json({ error: 'Failed to upload BGM to storage' });
        }

        return res.json({ url });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}
