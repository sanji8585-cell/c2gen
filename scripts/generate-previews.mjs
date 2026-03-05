/**
 * 화풍 미리보기 정적 이미지 생성 스크립트
 *
 * 사용법:
 *   node scripts/generate-previews.mjs
 *
 * 환경변수 (.env.local 또는 직접 설정):
 *   GEMINI_API_KEY    - Gemini API 키
 *   OPENAI_API_KEY    - OpenAI API 키
 *
 * 결과: public/previews/{styleId}-{1|2|3}.jpg
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'previews');

// ── .env.local 로드 ──
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── 프리뷰 프롬프트 (영문, 한글 제외) ──
const PREVIEW_PROMPTS = [
  'A young woman in a white lab coat and safety goggles standing before a massive holographic display of a human DNA double helix, her hands raised as she manipulates glowing data nodes, futuristic laboratory with glass walls and blue ambient lighting, wide shot showing the full room with robotic arms and floating digital panels in the background',
  'A smiling man in a casual denim apron carefully plating a colorful gourmet dish on a rustic wooden table, surrounded by fresh ingredients like tomatoes, herbs, and olive oil, warm golden hour sunlight streaming through a kitchen window, cozy cafe atmosphere with hanging copper pots and potted plants, medium close-up focusing on his hands and the vibrant food',
  'A confident businesswoman in a tailored navy blazer with a subtle smile, standing beside a large digital screen showing stock charts with green upward arrows and golden coin icons, modern glass-walled trading floor with city skyline visible through windows, other professionals working at desks in the soft-focus background, medium shot at eye level',
];

// ── 스타일 정의 ──
const GEMINI_STYLES = [
  { id: 'gemini-crayon', prompt: 'Hand-drawn crayon and colored pencil illustration style, waxy texture with rough organic strokes, warm nostalgic colors, childlike charm with innocent atmosphere, visible pencil texture on outlines and fills, soft analog warmth, 2D flat composition' },
  { id: 'gemini-watercolor', prompt: 'Soft watercolor illustration style, gentle hand-drawn aesthetic, warm color palette by default, organic brush strokes with paint bleeding effects, soft diffused edges, analog texture, dreamy and delicate atmosphere' },
  { id: 'gemini-minimal-flat', prompt: 'Minimal flat design illustration, clean geometric shapes, limited color palette with bold accent colors, no gradients, no shadows, modern UI/UX aesthetic inspired by Korean fintech apps, white space emphasis, simple iconographic elements, professional and sleek' },
  { id: 'gemini-korea-cartoon', prompt: 'Korean economic cartoon style, digital illustration with clean bold black outlines, cel-shaded flat coloring, strong color contrasts with golden warm highlights vs cool gray tones, modern webtoon infographic aesthetic, professional news graphic feel, dramatic lighting with sparkles and glow effects, 16:9 cinematic composition' },
  { id: 'gemini-infographic', prompt: 'Clean infographic illustration style, data visualization aesthetic, flat icons and diagram elements, bold sans-serif typography, color-coded sections with red for up and blue for down, white or light gray background, chart and graph visual motifs, professional business report feel, organized grid layout' },
  { id: 'gemini-retro-news', prompt: 'Retro 1980s-90s Korean news broadcast style, vintage CRT TV aesthetic, halftone dot texture, limited color palette with warm yellows and deep blues, old newspaper print quality, nostalgic analog broadcast graphics, grainy film texture overlay' },
  { id: 'gemini-isometric', prompt: 'Isometric 3D block illustration style, 30-degree angle perspective, clean geometric shapes, bright pastel colors with subtle shadows, miniature diorama feel, detailed tiny buildings and objects, organized grid layout, low-poly aesthetic with smooth surfaces' },
];

const GPT_STYLES = [
  { id: 'gpt-photorealistic', prompt: 'Photorealistic stock photography style, ultra-sharp detail, natural studio lighting with soft fill light, shallow depth of field, professional DSLR camera quality, neutral color grading, clean commercial aesthetic, 4K resolution feel' },
  { id: 'gpt-cinematic', prompt: 'Cinematic movie still style, dramatic three-point lighting, subtle film grain, anamorphic lens bokeh, moody color grading with teal and orange tones, wide-angle composition, atmospheric haze, depth of field, Netflix documentary quality' },
  { id: 'gpt-news-graphic', prompt: 'Professional broadcast news graphic style, Bloomberg/CNBC financial news aesthetic, clean dark background with glowing data elements, sleek glass and metal textures, holographic UI overlays, blue and white corporate color scheme, sharp typography integration, polished 3D infographic elements' },
  { id: 'gpt-3d-render', prompt: 'High-quality 3D render style, Pixar/Blender aesthetic, soft global illumination, subsurface scattering, smooth rounded shapes, vibrant saturated colors, clay-like material texture, clean studio backdrop, professional product visualization quality' },
  { id: 'gpt-webtoon', prompt: 'Korean webtoon digital illustration style, clean precise linework, cel-shaded coloring with smooth gradients, expressive character poses, dramatic panel-like composition, manhwa aesthetic, vibrant colors with atmospheric lighting effects, modern Korean digital art quality' },
  { id: 'gpt-oil-painting', prompt: 'Classical oil painting style, rich impasto brushwork, layered glazing technique, warm Renaissance-inspired palette, dramatic chiaroscuro lighting, museum-quality fine art aesthetic, canvas texture visible in brush strokes, timeless and authoritative' },
  { id: 'gpt-neon-cyber', prompt: 'Cyberpunk neon aesthetic, dark background with vivid neon glow effects in pink/cyan/purple, futuristic holographic UI elements, circuit board patterns, glitch art accents, rain-soaked reflective surfaces, high-tech dystopian atmosphere, crypto and blockchain visual motifs' },
  { id: 'gpt-watercolor', prompt: 'Artistic watercolor painting style, soft wet-on-wet washes of translucent color, gentle brush strokes with organic paint bleeding effects, delicate and ethereal atmosphere, visible paper texture, muted pastel tones with occasional vibrant accents, dreamy hand-painted gallery quality' },
];

// ── Gemini 이미지 생성 ──
async function generateGeminiImage(stylePrompt, scenePrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const fullPrompt = `[ART STYLE INSTRUCTION]\nApply this art style: ${stylePrompt}\nEnsure the entire image consistently follows this visual style.\n\n[SCENE PROMPT]\n${scenePrompt}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: fullPrompt }] },
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    },
  });

  for (const part of (response.candidates?.[0]?.content?.parts || [])) {
    if (part.inlineData) {
      return part.inlineData.data; // base64
    }
  }
  return null;
}

// ── OpenAI 이미지 생성 (직접 API 또는 배포된 서버 프록시) ──
async function generateOpenAIImage(stylePrompt, scenePrompt) {
  const apiKey = process.env.OPENAI_API_KEY;

  // 직접 API 호출 (로컬 키가 있으면)
  if (apiKey) {
    const fullPrompt = `[Art Style: ${stylePrompt}]\n\n${scenePrompt}`;

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: fullPrompt,
        n: 1,
        size: '1536x1024',
        quality: 'low',
        output_format: 'b64_json',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data?.data?.[0]?.b64_json || null;
  }

  // 배포된 서버 프록시 호출 (Production 키 사용)
  const DEPLOY_URL = process.env.DEPLOY_URL || 'https://tubegen-ai-bice.vercel.app';
  const sessionToken = process.env.SESSION_TOKEN || '';

  const headers = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['x-session-token'] = sessionToken;

  const res = await fetch(`${DEPLOY_URL}/api/openai`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'generateImage',
      scene: {
        visualPrompt: scenePrompt,
        analysis: { composition_type: 'STANDARD', sentiment: 'POSITIVE' },
        visual_keywords: '',
      },
      orientation: 'landscape',
      stylePrompt,
      isPreview: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Proxy API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data?.imageData || null;
}

// ── 이미지 저장 ──
function saveImage(base64, styleId, index) {
  const buffer = Buffer.from(base64, 'base64');
  const filePath = path.join(OUTPUT_DIR, `${styleId}-${index}.jpg`);
  fs.writeFileSync(filePath, buffer);
  const sizeKB = (buffer.length / 1024).toFixed(1);
  console.log(`  ✅ Saved: ${styleId}-${index}.jpg (${sizeKB} KB)`);
}

// ── 이미 생성된 파일 체크 ──
function alreadyExists(styleId, index) {
  return fs.existsSync(path.join(OUTPUT_DIR, `${styleId}-${index}.jpg`));
}

// ── 메인 ──
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  console.log('\n🎨 화풍 미리보기 이미지 생성 스크립트');
  console.log('=====================================');
  console.log(`Gemini API Key: ${geminiKey ? '✅' : '❌ (GEMINI_API_KEY 필요)'}`);
  const canOpenAI = openaiKey || process.env.DEPLOY_URL || true; // 프록시 폴백 가능
  console.log(`OpenAI API Key: ${openaiKey ? '✅ (직접)' : '🌐 (서버 프록시 사용)'}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Styles: Gemini ${GEMINI_STYLES.length}개 + GPT ${GPT_STYLES.length}개 = ${GEMINI_STYLES.length + GPT_STYLES.length}개`);
  console.log(`Images: ${(GEMINI_STYLES.length + GPT_STYLES.length) * 3}개 (3개/화풍)\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  // Gemini styles
  if (geminiKey) {
    console.log('── Gemini 스타일 ──');
    for (const style of GEMINI_STYLES) {
      console.log(`\n🖌️  ${style.id}`);
      for (let i = 1; i <= 3; i++) {
        if (alreadyExists(style.id, i)) {
          console.log(`  ⏭️  Skip: ${style.id}-${i}.jpg (already exists)`);
          skipped++;
          continue;
        }
        try {
          const base64 = await generateGeminiImage(style.prompt, PREVIEW_PROMPTS[i - 1]);
          if (base64) {
            saveImage(base64, style.id, i);
            generated++;
          } else {
            console.log(`  ⚠️  No image returned for ${style.id}-${i}`);
            failed++;
          }
        } catch (e) {
          console.error(`  ❌ Error: ${style.id}-${i}: ${e.message}`);
          failed++;
        }
        // Rate limit delay
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  } else {
    console.log('⏭️  Gemini 스타일 건너뜀 (API 키 없음)\n');
  }

  // GPT styles (로컬 키 또는 프록시)
  if (canOpenAI) {
    console.log('\n── GPT 스타일 ──');
    for (const style of GPT_STYLES) {
      console.log(`\n🖌️  ${style.id}`);
      for (let i = 1; i <= 3; i++) {
        if (alreadyExists(style.id, i)) {
          console.log(`  ⏭️  Skip: ${style.id}-${i}.jpg (already exists)`);
          skipped++;
          continue;
        }
        try {
          const base64 = await generateOpenAIImage(style.prompt, PREVIEW_PROMPTS[i - 1]);
          if (base64) {
            saveImage(base64, style.id, i);
            generated++;
          } else {
            console.log(`  ⚠️  No image returned for ${style.id}-${i}`);
            failed++;
          }
        } catch (e) {
          console.error(`  ❌ Error: ${style.id}-${i}: ${e.message}`);
          failed++;
        }
        // Rate limit delay
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  } else {
    console.log('⏭️  GPT 스타일 건너뜀 (API 키 없음)\n');
  }

  console.log('\n=====================================');
  console.log(`✅ 생성: ${generated}개 | ⏭️ 스킵: ${skipped}개 | ❌ 실패: ${failed}개`);
  console.log(`📁 결과: ${OUTPUT_DIR}`);

  if (generated > 0) {
    const estimatedCost = generated * 0.04;
    console.log(`💰 예상 비용: ~$${estimatedCost.toFixed(2)}`);
  }
}

main().catch(console.error);
