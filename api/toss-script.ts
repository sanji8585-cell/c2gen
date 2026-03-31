import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ── 캐릭터 추출 ──
const HUMAN_CHARACTERS = new Set(['princess', 'prince', 'girl', 'boy']);

function extractCharacter(topic: string) {
  const characters: Record<string, string> = {
    '토끼': 'rabbit', '고양이': 'cat', '강아지': 'puppy', '곰': 'bear',
    '펭귄': 'penguin', '여우': 'fox', '다람쥐': 'squirrel', '사자': 'lion',
    '코끼리': 'elephant', '돌고래': 'dolphin', '부엉이': 'owl', '판다': 'panda',
    '호랑이': 'tiger', '거북이': 'turtle', '나비': 'butterfly', '새': 'bird',
    '물고기': 'fish', '개구리': 'frog', '유니콘': 'unicorn', '용': 'dragon',
    '공주': 'princess', '왕자': 'prince', '소녀': 'girl', '소년': 'boy',
    '수달': 'otter', '햄스터': 'hamster', '오리': 'duck', '양': 'sheep',
    '반딧불이': 'firefly', '달팽이': 'snail', '곰돌이': 'teddy bear',
  };

  for (const [kr, en] of Object.entries(characters)) {
    if (topic.includes(kr)) {
      const mods = topic.match(/(아기|작은|꼬마|어린|용감한|씩씩한|귀여운|하얀|검은|빨간|분홍)\s*/g) || [];
      const type = HUMAN_CHARACTERS.has(en) ? 'human' as const : 'animal' as const;
      return { kr, en, full: `${mods.map(m => m.trim()).join(' ')} ${kr}`.trim(), type };
    }
  }
  // 사전에 없음 → 주제에서 이름 추출 시도
  // "미키의 즐거운 모험" → "미키", "루루와 별의 여행" → "루루"
  const nameMatch = topic.match(/^(?:용감한|씩씩한|귀여운|작은|아기|꼬마)?\s*(.+?)(?:의|와|과|이의|가|는|은)\s/);
  const extractedName = nameMatch?.[1]?.trim() || null;

  return extractedName
    ? { kr: extractedName, en: '', full: extractedName, type: 'unknown' as const }
    : null;
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
        // 3가지 경우: 사전 매칭(토끼 등), 이름만 추출(미키 등), 완전 위임(null)
        const isKnownSpecies = char !== null && char.type !== 'unknown'; // 사전에서 종까지 매칭
        const hasName = char !== null; // 이름이라도 추출됨
        const charKr = char?.kr || '';
        const charEn = char?.en || '';
        const charFull = char?.full || '';

        // 캐릭터에 따라 프롬프트 분기
        const charIntro = isKnownSpecies
          ? `■ 주인공: ${charFull} (영어: ${charEn})\n■ 주인공 이름: 귀여운 한국어 이름을 하나 지어주세요`
          : hasName
          ? `■ 주인공 이름: "${charKr}" (이 이름을 반드시 사용하세요!)\n■ "${charKr}"가 어떤 캐릭터인지는 네가 정해주세요. 동물이면 종류를, 사람이면 소년/소녀를 정하세요.\n■ 주제: ${topic}`
          : `■ 주인공: "${topic}"에 어울리는 주인공 캐릭터를 네가 정해주세요.\n  - 동물이면 귀여운 동물, 사람이면 아이/소년/소녀로\n  - 캐릭터의 한국어 이름과 영어 종류(species)를 정해주세요`;

        const charNarrationRule = isKnownSpecies
          ? `- 모든 장면에서 주인공은 "${charKr}"입니다. 절대 다른 동물로 바꾸지 마세요.`
          : hasName
          ? `- 모든 장면에서 주인공 이름은 반드시 "${charKr}"입니다. 다른 이름으로 바꾸지 마세요.`
          : `- 모든 장면에서 주인공은 1번 장면에서 정한 캐릭터입니다. 절대 바꾸지 마세요.`;

        const charVisualRule = isKnownSpecies
          ? `- 캐릭터는 반드시 "a small cute anthropomorphic ${charEn}"으로 표현하세요.`
          : `- 캐릭터는 "a small cute anthropomorphic [네가 정한 영어 species]"으로 표현하세요. 사람 캐릭터면 "a small cute [child/girl/boy]"으로.`;

        const charVisualExample = isKnownSpecies
          ? `a small cute anthropomorphic ${charEn}`
          : `a small cute anthropomorphic [species]`;

        const charForbidRule = isKnownSpecies && char?.type === 'animal'
          ? `- 절대 금지 단어: human, person, child, girl, boy, woman, man, people, kid. 모든 캐릭터는 동물입니다.`
          : `- 캐릭터가 동물이면 human/person/child 단어를 쓰지 마세요. 캐릭터가 사람이면 상관없습니다.`;

        const sceneIntro = isKnownSpecies
          ? `1번 장면: ${charFull}를 소개하세요. 어디에 사는지, 어떤 성격인지, 뭘 좋아하는지. 반드시 "${charKr}"가 나레이션에 포함되어야 합니다.`
          : hasName
          ? `1번 장면: "${charKr}"를 소개하세요. 어디에 사는지, 어떤 캐릭터인지, 뭘 좋아하는지. 반드시 "${charKr}"가 나레이션에 포함되어야 합니다.`
          : `1번 장면: 주인공을 소개하세요. 이름, 어디에 사는지, 어떤 성격인지, 뭘 좋아하는지.`;

        const sceneMid = hasName ? charKr : '주인공';

        // JSON 추가 필드 (사전 미매칭 시 캐릭터 정보 반환)
        const jsonCharField = isKnownSpecies
          ? ''
          : `, "character": {"name_kr":"${hasName ? charKr : '한국어이름'}", "name_en":"영어이름", "species":"영어종류", "type":"animal 또는 human"}`;

        const prompt = type === 'fairytale'
          ? `${count}장면 잠자리 동화를 JSON으로 만들어주세요.

${charIntro}
■ 주제: ${topic}

■ 장면 구성:
${sceneIntro}
${count >= 4 ? `2번 장면: ${sceneMid}에게 신기하거나 특별한 일이 생깁니다.\n3번 장면: ${sceneMid}가 용기를 내거나 노력합니다.\n` : `2번 장면: ${sceneMid}에게 모험이 시작되고 용기를 냅니다.\n`}${count >= 5 ? `4번 장면: ${sceneMid}가 어려움을 극복합니다.\n` : ''}마지막 장면: 이야기가 자연스럽게 마무리됩니다. 억지로 "잘 자"를 붙이지 마세요.

■ 나레이션 규칙:
- 한국어 50~80자 (절대 80자 초과 금지!)
- "~요/~죠/~어요" 체
- 감각 묘사 (소리, 색깔, 촉감) 간결하게
- 의성어/의태어 1~2개
${charNarrationRule}

■ visualPrompt 규칙 (매우 중요!):
- 영어로 작성, 최소 80단어 이상으로 상세하게
- 구성 비율: 배경/장소 60% + 캐릭터 행동 40%
- 반드시 이 구조를 따르세요:
  "[구체적 장소/배경 묘사 3~4문장], [시간대/날씨/조명/색감], [${charVisualExample}의 구체적 행동/자세/표정], children's picture book illustration, soft watercolor and pastel colors, warm gentle lighting, no text, no speech bubbles"
- 배경 규칙 (절대 준수!):
  * 각 장면마다 완전히 다른 장소여야 합니다
  * 장면1: 집/방/나무 위 등 일상 장소
  * 장면2: 숲/들판/정원 등 자연 장소
  * 장면3: 동굴/다리/언덕 등 모험 장소
  * 장면4+: 꽃밭/하늘/별빛 아래 등 아름다운 장소
  * 배경을 구체적으로: "a forest" ❌ → "a dense enchanted forest with towering oak trees, glowing mushrooms on moss-covered rocks, golden sunlight filtering through the canopy" ✅
- 나레이션의 내용과 visualPrompt의 장면이 정확히 일치해야 합니다
${charForbidRule}
${charVisualRule}

■ JSON 형식:
{"scenes":[{"sceneNumber":1, "narration":"50~80자 한국어", "visualPrompt":"상세 영어 장면 묘사", "duration":5}]${jsonCharField}}`

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

        console.log(`[toss-script] Generating: topic="${topic}", type=${type}, char=${charFull || '(AI위임)'}, count=${count}`);

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
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
        let aiCharacter: { name_kr?: string; name_en?: string; species?: string; type?: string } | null = null;
        try {
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            scenes = parsed;
          } else {
            scenes = parsed.scenes || [];
            // AI가 반환한 캐릭터 정보 (사전 미매칭 시)
            if (parsed.character) aiCharacter = parsed.character;
          }
        } catch {
          const arrMatch = cleaned.match(/\[[\s\S]*\]/);
          scenes = arrMatch ? JSON.parse(arrMatch[0]) : [];
        }

        if (!scenes.length) {
          return res.status(500).json({ error: 'Script generation failed' });
        }

        // 캐릭터 정보 결정
        let finalCharacter: { kr: string; en: string; type: 'animal' | 'human' };
        if (isKnownSpecies) {
          finalCharacter = { kr: char?.kr || '', en: char?.en || '', type: (char?.type === 'human' ? 'human' : 'animal') as 'animal' | 'human' };
          // 후처리: visualPrompt에 올바른 영어 캐릭터명 보장
          for (const scene of scenes) {
            if (scene.visualPrompt && !scene.visualPrompt.toLowerCase().includes(charEn.toLowerCase())) {
              scene.visualPrompt = scene.visualPrompt.replace(
                /cute baby \w+|baby \w+|little \w+/i,
                `cute baby ${charEn}`
              );
            }
          }
        } else {
          // AI가 정한 캐릭터 (이름이 추출됐으면 그 이름을 우선 사용)
          finalCharacter = {
            kr: charKr || aiCharacter?.name_kr || aiCharacter?.species || topic,
            en: aiCharacter?.species || aiCharacter?.name_en || 'creature',
            type: (aiCharacter?.type === 'human' ? 'human' : 'animal') as 'animal' | 'human',
          };

          // AI가 이름을 무시하고 다른 이름을 지었으면 나레이션에서 교체
          if (charKr && aiCharacter?.name_kr && aiCharacter.name_kr !== charKr) {
            for (const scene of scenes) {
              if (scene.narration) {
                scene.narration = scene.narration.replaceAll(aiCharacter.name_kr, charKr);
              }
            }
          }
        }

        return res.json({
          scenes: scenes.slice(0, count),
          character: finalCharacter,
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[toss-script]', error.message || error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
