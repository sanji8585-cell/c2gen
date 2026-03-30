import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ── 캐릭터 추출 ──
function extractCharacter(topic: string) {
  const animals: Record<string, string> = {
    '토끼': 'rabbit', '고양이': 'cat', '강아지': 'puppy', '곰': 'bear',
    '펭귄': 'penguin', '여우': 'fox', '다람쥐': 'squirrel', '사자': 'lion',
    '코끼리': 'elephant', '돌고래': 'dolphin', '부엉이': 'owl', '판다': 'panda',
    '호랑이': 'tiger', '거북이': 'turtle', '나비': 'butterfly', '새': 'bird',
    '물고기': 'fish', '개구리': 'frog', '유니콘': 'unicorn', '용': 'dragon',
    '공주': 'princess', '왕자': 'prince', '소녀': 'girl', '소년': 'boy',
    '수달': 'otter', '햄스터': 'hamster', '오리': 'duck', '양': 'sheep',
    '반딧불이': 'firefly', '달팽이': 'snail', '곰돌이': 'teddy bear',
  };

  for (const [kr, en] of Object.entries(animals)) {
    if (topic.includes(kr)) {
      const mods = topic.match(/(아기|작은|꼬마|어린|용감한|씩씩한|귀여운|하얀|검은|빨간|분홍)\s*/g) || [];
      return { kr, en, full: `${mods.map(m => m.trim()).join(' ')} ${kr}`.trim() };
    }
  }
  return { kr: topic, en: topic, full: topic };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { action, ...params } = req.body || {};

  try {
    switch (action) {

      case 'generateScript': {
        const { topic, type = 'fairytale', sceneCount = 4 } = params;
        if (!topic) return res.status(400).json({ error: 'topic required' });

        const count = Math.max(3, Math.min(10, sceneCount));
        const ai = new GoogleGenAI({ apiKey });
        const char = extractCharacter(topic);

        // 하나의 API 호출로 전체 이야기 생성
        // 핵심: 캐릭터를 프롬프트 곳곳에 반복 삽입하여 AI가 바꿀 수 없게 함
        const prompt = type === 'fairytale'
          ? `${count}장면 잠자리 동화를 JSON 배열로 만들어주세요.

■ 주인공: ${char.full} (영어: ${char.en})
■ 주인공 이름: 귀여운 한국어 이름을 하나 지어주세요
■ 주제: ${topic}

■ 장면 구성:
1번 장면: ${char.full}를 소개하세요. 어디에 사는지, 어떤 성격인지, 뭘 좋아하는지. 반드시 "${char.kr}"가 나레이션에 포함되어야 합니다.
${count >= 4 ? `2번 장면: ${char.full}에게 신기하거나 특별한 일이 생깁니다.\n3번 장면: ${char.full}가 용기를 내거나 노력합니다.\n` : `2번 장면: ${char.full}에게 모험이 시작되고 용기를 냅니다.\n`}${count >= 5 ? `4번 장면: ${char.full}가 어려움을 극복합니다.\n` : ''}마지막 장면: 이야기가 자연스럽게 마무리됩니다. 억지로 "잘 자"를 붙이지 마세요.

■ 나레이션 규칙:
- 한국어 50~80자 (절대 80자 초과 금지!)
- "~요/~죠/~어요" 체
- 감각 묘사 (소리, 색깔, 촉감) 간결하게
- 의성어/의태어 1~2개
- 모든 장면에서 주인공은 "${char.kr}"입니다. 절대 다른 동물로 바꾸지 마세요.

■ visualPrompt 규칙 (매우 중요!):
- 영어로 작성, 최소 80단어 이상으로 상세하게
- 구성 비율: 배경/장소 60% + 캐릭터 행동 40%
- 반드시 이 구조를 따르세요:
  "[구체적 장소/배경 묘사 3~4문장], [시간대/날씨/조명/색감], [a small cute anthropomorphic ${char.en}의 구체적 행동/자세/표정], children's picture book illustration, soft watercolor and pastel colors, warm gentle lighting, no text, no speech bubbles"
- 배경 규칙 (절대 준수!):
  * 각 장면마다 완전히 다른 장소여야 합니다
  * 장면1: 집/방/나무 위 등 일상 장소
  * 장면2: 숲/들판/정원 등 자연 장소
  * 장면3: 동굴/다리/언덕 등 모험 장소
  * 장면4+: 꽃밭/하늘/별빛 아래 등 아름다운 장소
  * 배경을 구체적으로: "a forest" ❌ → "a dense enchanted forest with towering oak trees, glowing mushrooms on moss-covered rocks, golden sunlight filtering through the canopy" ✅
- 나레이션의 내용과 visualPrompt의 장면이 정확히 일치해야 합니다
- 절대 금지 단어: human, person, child, girl, boy, woman, man, people, kid. 모든 캐릭터는 동물입니다.
- 캐릭터는 반드시 "a small cute anthropomorphic ${char.en}"으로 표현하세요. baby/little 대신 small cute 사용.

■ visualPrompt 좋은 예시:
- "A cozy treehouse bedroom nestled in the branches of a giant oak tree, with round windows glowing warm orange light, tiny bookshelves carved into the wood, a patchwork quilt on a small bed, fireflies drifting outside the window in the cool evening air, a small cute anthropomorphic ${char.en} sitting on the bed hugging a star-shaped pillow with sleepy half-closed eyes and a gentle smile, children's picture book illustration, soft watercolor and pastel colors, warm gentle lighting, no text"
- "A crystal-clear shallow stream winding through a meadow of wildflowers and tall grass, smooth stepping stones covered with tiny moss patches, willow branches dipping into the sparkling water, golden afternoon sunlight casting long shadows, a small cute anthropomorphic ${char.en} carefully balancing on a stepping stone with arms spread wide and a determined brave expression, children's picture book illustration, soft pastel colors, warm lighting, no text"

■ visualPrompt 나쁜 예시:
- "cute baby ${char.en} in forest" → 너무 짧고 배경이 없음
- "A child and a ${char.en} playing" → 사람이 포함됨
- "An anthropomorphic ${char.en} standing" → 배경 묘사가 전혀 없음

■ JSON 형식:
[{"sceneNumber":1, "narration":"50~80자 한국어", "visualPrompt":"[배경 3~4문장], [시간/조명/색감], [a small cute anthropomorphic ${char.en}의 행동], children's picture book illustration, soft watercolor and pastel colors, warm gentle lighting, no text", "duration":5}]`

          : `${count}장면 영상 편지를 JSON 배열로 만들어주세요.

■ 주제: ${topic}
■ 이것은 동화가 아닙니다. 소중한 사람에게 보내는 진심 어린 편지입니다.

■ 장면 구성:
1번 장면: 자연스러운 시작 ("있잖아", "요즘 네 생각이 많이 나")
${count >= 4 ? '2번 장면: 함께한 구체적인 추억\n3번 장면: 진심 (고마움, 사랑, 미안함)\n' : '2번 장면: 추억과 진심\n'}마지막 장면: 따뜻한 마무리 ("보고 싶다", "사랑해")

■ 나레이션 규칙:
- 한국어 50~80자 (절대 80자 초과 금지!), 반말 편지체 ("~야", "~거든", "~잖아")
- 구체적 감각 (계절, 날씨, 장소, 음식)
- 꾸미지 않은 솔직한 진심

■ visualPrompt: 영어, 뒷모습/실루엣/풍경, "warm emotional illustration style"
■ JSON: [{"sceneNumber":1, "narration":"...", "visualPrompt":"...", "duration":5}]`;

        console.log(`[toss-script] Generating: topic="${topic}", type=${type}, char=${char.full}, count=${count}`);

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
            temperature: 0.9,
          },
        });

        const text = response.text || '';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        let scenes;
        try {
          const parsed = JSON.parse(cleaned);
          scenes = Array.isArray(parsed) ? parsed : parsed.scenes || [];
        } catch {
          const arrMatch = cleaned.match(/\[[\s\S]*\]/);
          scenes = arrMatch ? JSON.parse(arrMatch[0]) : [];
        }

        if (!scenes.length) {
          return res.status(500).json({ error: 'Script generation failed' });
        }

        // 후처리: 캐릭터 검증 (동화만)
        if (type === 'fairytale' && char.kr !== topic) {
          for (const scene of scenes) {
            // visualPrompt에 올바른 영어 캐릭터명 보장
            if (scene.visualPrompt && !scene.visualPrompt.toLowerCase().includes(char.en.toLowerCase())) {
              scene.visualPrompt = scene.visualPrompt.replace(
                /cute baby \w+|baby \w+|little \w+/i,
                `cute baby ${char.en}`
              );
            }
          }
        }

        return res.json(scenes.slice(0, count));
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-script]', error.message || error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
