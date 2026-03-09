import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Modality } from '@google/genai';

// ── Shared utilities (inlined for Vercel serverless compatibility) ──

async function uploadToStorage(
  supabase: ReturnType<typeof createClient>,
  base64DataUrl: string,
  path: string
): Promise<string | null> {
  try {
    const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    const buffer = Buffer.from(match[2], 'base64');
    const ext = match[1].split('/')[1] || 'png';
    const fullPath = `${path}.${ext}`;
    const { error } = await supabase.storage
      .from('preset-images')
      .upload(fullPath, buffer, { contentType: match[1], upsert: true });
    if (error) { console.error('[uploadToStorage]', error.message); return null; }
    const { data: urlData } = supabase.storage.from('preset-images').getPublicUrl(fullPath);
    return urlData?.publicUrl || null;
  } catch (err) { console.error('[uploadToStorage]', err); return null; }
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

// ── Ownership verification helpers ──

async function verifyPresetOwnership(
  supabase: ReturnType<typeof getSupabase>,
  presetId: string,
  email: string
): Promise<boolean> {
  const { data } = await supabase
    .from('c2gen_brand_presets')
    .select('id')
    .eq('id', presetId)
    .eq('owner_email', email)
    .single();
  return !!data;
}

async function verifyCharacterOwnership(
  supabase: ReturnType<typeof getSupabase>,
  characterId: string,
  email: string
): Promise<{ owned: boolean; presetId?: string }> {
  const { data } = await supabase
    .from('c2gen_character_references')
    .select('id, brand_preset_id')
    .eq('id', characterId)
    .single();

  if (!data) return { owned: false };

  const presetOwned = await verifyPresetOwnership(supabase, data.brand_preset_id, email);
  return { owned: presetOwned, presetId: data.brand_preset_id };
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

function buildImagePart(dataUrl: string): Record<string, unknown> {
  // Handle data URL format: data:image/png;base64,<data>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      inlineData: {
        mimeType: match[1],
        data: match[2],
      },
    };
  }
  // If it's a plain URL, use fileData
  return {
    fileData: {
      mimeType: 'image/png',
      fileUri: dataUrl,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...params } = req.body;
  const token = params.token;

  try {
    const supabase = getSupabase();

    switch (action) {

      // ══════════════════════════════════════════
      // 캐릭터 관리
      // ══════════════════════════════════════════

      // ── 캐릭터 목록 조회 ──
      case 'character-list': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { brand_preset_id } = params;
        if (!brand_preset_id) return res.status(400).json({ error: 'brand_preset_id is required' });

        const owned = await verifyPresetOwnership(supabase, brand_preset_id, email);
        if (!owned) return res.status(403).json({ error: 'Access denied' });

        // Exclude original_upload_url (large base64) — use original_upload from reference_sheet instead
        const { data, error } = await supabase
          .from('c2gen_character_references')
          .select('id, brand_preset_id, name, type, char_role, species, personality, appearance_description, distinction_tags, speech_style, voice_id, original_upload_url, reference_sheet, style_analysis, created_at')
          .eq('brand_preset_id', brand_preset_id)
          .order('created_at', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });

        // Strip ALL base64 data from response — keep only URLs
        const safeData = (data || []).map((c: any) => {
          const sheet = c.reference_sheet || {};
          const safeSheet: Record<string, any> = {};
          for (const [key, val] of Object.entries(sheet)) {
            if (typeof val === 'string' && val.startsWith('data:')) {
              safeSheet[key] = '[base64]'; // Mark as exists but don't send
            } else {
              safeSheet[key] = val;
            }
          }
          return {
            ...c,
            original_upload_url: c.original_upload_url?.startsWith('http') ? c.original_upload_url : undefined,
            reference_sheet: safeSheet,
          };
        });
        return res.json({ characters: safeData });
      }

      // ── 캐릭터 생성 ──
      case 'character-create': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { brand_preset_id, name } = params;
        // Accept both `type` and `image_type` from frontend
        const charType = params.type || params.image_type;
        if (!brand_preset_id || !name || !charType) {
          return res.status(400).json({ error: 'brand_preset_id, name, and type are required' });
        }

        if (!['mascot', 'photo', 'sketch'].includes(charType)) {
          return res.status(400).json({ error: 'type must be mascot, photo, or sketch' });
        }

        const owned = await verifyPresetOwnership(supabase, brand_preset_id, email);
        if (!owned) return res.status(403).json({ error: 'Access denied' });

        // Handle original_upload — upload to Storage if base64
        let originalUploadUrl = params.original_upload_url || params.reference_sheet?.original_upload || null;
        if (originalUploadUrl?.startsWith('data:')) {
          const storageUrl = await uploadToStorage(supabase, originalUploadUrl, `characters/${brand_preset_id}/${Date.now()}-original`);
          if (storageUrl) originalUploadUrl = storageUrl;
        }

        const insertData: Record<string, unknown> = {
          brand_preset_id,
          name,
          type: charType,
        };

        if (originalUploadUrl) {
          insertData.original_upload_url = originalUploadUrl;
        }

        // Optional fields (DB column names)
        const optionalFields = [
          'char_role', 'species', 'personality', 'appearance_description',
          'distinction_tags', 'speech_style',
          'voice_id', 'reference_sheet', 'style_analysis',
        ];
        for (const field of optionalFields) {
          if (params[field] !== undefined) {
            insertData[field] = params[field];
          }
        }

        const { data, error } = await supabase
          .from('c2gen_character_references')
          .insert(insertData)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ character: data });
      }

      // ── 캐릭터 수정 ──
      case 'character-update': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { owned } = await verifyCharacterOwnership(supabase, id, email);
        if (!owned) return res.status(403).json({ error: 'Access denied' });

        const updateData: Record<string, unknown> = {};
        // Map image_type → type for DB column
        if (params.image_type !== undefined || params.type !== undefined) {
          updateData.type = params.type || params.image_type;
        }
        const updatableFields = [
          'name', 'char_role', 'species', 'personality',
          'appearance_description', 'distinction_tags', 'speech_style',
          'voice_id', 'original_upload_url', 'reference_sheet', 'style_analysis',
        ];
        for (const field of updatableFields) {
          if (params[field] !== undefined) {
            updateData[field] = params[field];
          }
        }

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        const { data, error } = await supabase
          .from('c2gen_character_references')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ character: data });
      }

      // ── 캐릭터 삭제 ──
      case 'character-delete': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { id } = params;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { owned } = await verifyCharacterOwnership(supabase, id, email);
        if (!owned) return res.status(403).json({ error: 'Access denied' });

        const { error } = await supabase
          .from('c2gen_character_references')
          .delete()
          .eq('id', id);

        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      // ── 캐릭터 레퍼런스 시트 생성 (4-angle) ──
      case 'character-generate-sheet': {
        const email = await getSessionEmail(supabase, token);
        if (!email) return res.status(401).json({ error: 'Invalid session' });

        const { character_id, brand_preset_id } = params;
        if (!character_id || !brand_preset_id) {
          return res.status(400).json({ error: 'character_id and brand_preset_id are required' });
        }

        // Verify preset ownership
        const presetOwned = await verifyPresetOwnership(supabase, brand_preset_id, email);
        if (!presetOwned) return res.status(403).json({ error: 'Access denied' });

        // Get character record
        const { data: character, error: charError } = await supabase
          .from('c2gen_character_references')
          .select('*')
          .eq('id', character_id)
          .eq('brand_preset_id', brand_preset_id)
          .single();

        if (charError || !character) {
          return res.status(404).json({ error: 'Character not found' });
        }

        // Deduct credits
        await deductCredits(supabase, email, 32, `Reference sheet: ${character.name}`);

        // Gemini setup
        // GoogleGenAI, Modality imported at top
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
        const ai = new GoogleGenAI({ apiKey: geminiKey });

        // Prepare original image part (if available)
        // Image may be in original_upload_url column OR inside reference_sheet JSONB
        const originalUrl = character.original_upload_url
          || character.reference_sheet?.original_upload
          || null;
        const originalImagePart = originalUrl
          ? buildImagePart(originalUrl)
          : null;

        // Style analysis for mascot type
        let styleAnalysis: Record<string, unknown> | null = null;
        if (character.type === 'mascot' && originalImagePart) {
          try {
            const analyzeResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash-preview-05-20',
              contents: {
                parts: [
                  originalImagePart,
                  {
                    text: `Analyze this character illustration and extract visual style features. Return ONLY valid JSON:\n{\n  "line_weight": "description of line style",\n  "color_mode": "flat/gradient/painted etc",\n  "palette": ["#hex1", "#hex2", ...top 5 colors],\n  "texture": "smooth/rough/etc",\n  "shading": "cel-shading/realistic/none etc"\n}`,
                  },
                ],
              },
            });
            const analysisText = analyzeResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              styleAnalysis = JSON.parse(jsonMatch[0]);
            }
          } catch {
            // Style analysis is optional; continue without it
          }
        }

        // Build type-specific prompt prefix
        let typePrefix = '';
        if (character.type === 'mascot') {
          const styleDesc = styleAnalysis
            ? `Maintain exact art style: ${(styleAnalysis as Record<string, string>).line_weight || ''}, ${(styleAnalysis as Record<string, string>).color_mode || ''}, ${(styleAnalysis as Record<string, string>).shading || ''} shading.`
            : 'Maintain the exact same art style as the original.';
          typePrefix = `[MASCOT CHARACTER]\n${styleDesc}\n`;
        } else if (character.type === 'photo') {
          // Get brand preset art_style
          const { data: preset } = await supabase
            .from('c2gen_brand_presets')
            .select('art_style')
            .eq('id', brand_preset_id)
            .single();
          const artStyle = preset?.art_style || 'illustration';
          typePrefix = `[PHOTO CHARACTER - STYLE CONVERSION]\nConvert this photo-based character into ${artStyle} art style.\n`;
        } else if (character.type === 'sketch') {
          typePrefix = `[SKETCH CHARACTER - ENHANCEMENT]\nConvert and enhance this sketch into a fully detailed, clean illustration.\n`;
        }

        // Define angles
        const angles = [
          { key: 'front', description: 'Front-facing view, looking directly at viewer' },
          { key: 'angle_45', description: '3/4 view (45-degree angle), slight turn to the right' },
          { key: 'side', description: 'Side profile view, facing right' },
          { key: 'full_body', description: 'Full body front view showing complete outfit and proportions' },
        ];

        // Generate each angle sequentially
        const referenceSheet: Record<string, string | null> = {
          front: null,
          angle_45: null,
          side: null,
          full_body: null,
        };

        for (const angle of angles) {
          try {
            const parts: Array<Record<string, unknown>> = [];

            if (originalImagePart) {
              parts.push(originalImagePart);
            }

            parts.push({
              text: `${typePrefix}[CHARACTER REFERENCE]\n\nGenerate a ${angle.key} view of this character.\nMaintain exact same: clothing, accessories, colors, proportions, art style.\nThe character should be on a plain white/light gray background.\nAngle: ${angle.description}`,
            });

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts },
              config: {
                responseModalities: [Modality.IMAGE],
                imageConfig: { aspectRatio: '1:1' },
              },
            });

            const responseParts = response.candidates?.[0]?.content?.parts || [];
            for (const part of responseParts) {
              if (part.inlineData) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                const base64Url = `data:image/${mimeType.split('/')[1] || 'png'};base64,${part.inlineData.data}`;
                // Upload to Supabase Storage
                const storagePath = `characters/${character_id}/${angle.key}-${Date.now()}`;
                console.log(`[generate-sheet] Uploading ${angle.key} to storage: ${storagePath} (${Math.round(part.inlineData.data.length / 1024)}KB)`);
                const storageUrl = await uploadToStorage(supabase, base64Url, storagePath);
                console.log(`[generate-sheet] ${angle.key} storage result:`, storageUrl ? 'URL OK' : 'FAILED - using base64 fallback');
                referenceSheet[angle.key] = storageUrl || base64Url;
                break;
              }
            }
          } catch {
            // If angle generation fails, continue with null
          }

          // 1-second delay between generations to avoid rate limits
          if (angle !== angles[angles.length - 1]) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        // Update character record in DB — preserve existing original_upload
        const existingSheet = character.reference_sheet || {};
        let origUpload = existingSheet.original_upload || character.original_upload_url || undefined;
        // Upload original to Storage if still base64
        if (origUpload?.startsWith('data:')) {
          const storageUrl = await uploadToStorage(supabase, origUpload, `characters/${character_id}/original-${Date.now()}`);
          if (storageUrl) origUpload = storageUrl;
        }
        const mergedSheet = {
          ...existingSheet,
          ...referenceSheet,
          original_upload: origUpload,
        };
        // Log what's being saved
        const sheetSummary = Object.entries(mergedSheet).map(([k, v]) => `${k}: ${typeof v === 'string' ? (v.startsWith('http') ? 'URL' : v.startsWith('data:') ? 'base64' : v?.slice(0, 20)) : v}`);
        console.log('[generate-sheet] Saving reference_sheet:', sheetSummary);

        const updatePayload: Record<string, unknown> = {
          reference_sheet: mergedSheet,
        };
        if (styleAnalysis) {
          updatePayload.style_analysis = styleAnalysis;
        }

        const { data: updatedCharacter, error: updateError } = await supabase
          .from('c2gen_character_references')
          .update(updatePayload)
          .eq('id', character_id)
          .select()
          .single();

        if (updateError) return res.status(500).json({ error: updateError.message });
        return res.json({ character: updatedCharacter });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ error: message });
  }
}
