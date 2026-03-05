/**
 * 썸네일 AI 스타일 샘플 이미지 생성 스크립트
 * 사용법: node scripts/generate-samples.mjs
 */
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local 수동 파싱
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) envVars[m[1].trim()] = m[2].trim();
}

const API_KEY = envVars.GEMINI_API_KEY;
if (!API_KEY) { console.error('GEMINI_API_KEY not found'); process.exit(1); }

const ai = new GoogleGenAI({ apiKey: API_KEY });
const OUT_DIR = path.resolve(__dirname, '../public/thumbnail-samples');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const STYLES = {
  cinematic: `Cinematic movie poster quality. Dramatic volumetric lighting with strong rim light. Shallow depth of field with bokeh. Rich teal & orange color grading. Film grain texture. A dramatic landscape with mountains at sunset.`,
  minimal: `Clean minimalist design. Single geometric object on soft gradient background. Plenty of negative space. Soft even lighting. Muted color palette with cyan accent. Modern, premium feel.`,
  'bold-graphic': `Bold graphic pop art style. Extremely high contrast with saturated neon colors. Strong geometric shapes and patterns. Dynamic diagonal composition with an explosion of color shapes. Energy and excitement.`,
  neon: `Dark cyberpunk neon aesthetic. Glowing neon lights (cyan, magenta, purple). Reflective wet city street at night. Futuristic atmosphere. Synthwave mood with dramatic backlighting.`,
  editorial: `High-end editorial magazine quality. Elegant coffee cup on marble surface. Natural warm lighting. Soft shadows. Premium texture. Earth tones and pastel color palette.`,
  anime: `Japanese anime illustration style. Vivid cel-shaded coloring. A scenic cherry blossom landscape with a path. Dramatic speed lines and sparkle effects. Makoto Shinkai quality lighting.`,
  retro: `Retro vintage aesthetic from the 70s-80s. Warm film tones with faded highlights. A vintage car on an open road. Sun-bleached colors. Nostalgic warm palette (mustard, burnt orange, teal).`,
  '3d-render': `High-quality 3D rendered scene. Smooth glossy colorful geometric shapes floating in studio. Studio lighting with soft box and rim light. Pixar quality rendering. Pastel purple and blue tones.`,
  watercolor: `Delicate watercolor painting style. Soft flowing pigment of a serene lake with mountains. Gentle color bleeds and transparent washes. Dreamy ethereal atmosphere. Pastel and muted tones.`,
  dark: `Dark moody atmosphere. A single candle in a dark room casting dramatic shadows. Film noir inspired. High contrast between light and shadow. Deep blacks with warm accent highlights.`,
  fantasy: `Epic fantasy art style. A magical glowing crystal floating above an ancient forest. Rich jewel tones (deep purple, emerald, gold). Mystical atmosphere with particle effects. Concept art quality.`,
};

async function generateOne(styleId, prompt) {
  const outPath = path.join(OUT_DIR, `${styleId}.jpg`);
  if (fs.existsSync(outPath)) {
    console.log(`  [SKIP] ${styleId} — already exists`);
    return;
  }

  const fullPrompt = `Create a STUNNING social media THUMBNAIL image (16:9 aspect ratio).\n\n${prompt}\n\nRules:\n- ABSOLUTELY NO text, letters, numbers, or words\n- Ultra high quality, sharp details\n- Leave space for text overlay at the bottom`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: fullPrompt }] },
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData) {
        const buf = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(outPath, buf);
        console.log(`  [OK] ${styleId} — ${(buf.length / 1024).toFixed(0)}KB`);
        return;
      }
    }
    console.log(`  [FAIL] ${styleId} — no image in response`);
  } catch (err) {
    console.log(`  [ERROR] ${styleId} — ${err.message}`);
  }
}

async function main() {
  console.log(`Generating ${Object.keys(STYLES).length} sample thumbnails...\n`);
  for (const [id, prompt] of Object.entries(STYLES)) {
    await generateOne(id, prompt);
    // Rate limit: 1.5초 대기
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('\nDone!');
}

main();
