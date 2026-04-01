import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

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
  // 사전에 없음 → 주제에서 이름 추출 (regex 대신 문자열 검색)
  // "미키의 즐거운 모험" → "미키", "루루와 별의 여행" → "루루"
  let extractedName: string | null = null;
  // 유니코드 이스케이프로 한글 리터럴 문제 우회
  const particles = ['\uc774\uc758 ', '\uc758 ', '\uc640 ', '\uacfc '];  // 이의, 의, 와, 과
  const prefixes = ['\uc6a9\uac10\ud55c ', '\uc529\uc529\ud55c ', '\uadc0\uc5ec\uc6b4 ', '\uc791\uc740 ', '\uc544\uae30 ', '\uaf2c\ub9c8 '];  // 용감한, 씩씩한, 귀여운, 작은, 아기, 꼬마
  let cleanTopic = topic;
  for (const pf of prefixes) {
    if (cleanTopic.startsWith(pf)) { cleanTopic = cleanTopic.slice(pf.length); break; }
  }
  for (const pt of particles) {
    const idx = cleanTopic.indexOf(pt);
    if (idx > 0 && idx <= 10) { extractedName = cleanTopic.slice(0, idx).trim(); break; }
  }

  return extractedName
    ? { kr: extractedName, en: '', full: extractedName, type: 'unknown' as const }
    : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — 앱인토스 미니앱 origin 화이트리스트
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 세션 인증 필수 (DB 검증)
  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const sUrl = process.env.SUPABASE_URL;
  const sKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sUrl || !sKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  const supabase = createClient(sUrl, sKey);
  const { data: sess } = await supabase
    .from('toss_sessions')
    .select('user_key')
    .eq('token', sessionToken)
    .single();
  if (!sess?.user_key) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { action, ...params } = req.body || {};

  try {
    switch (action) {

      case 'generateScript': {
        const { topic, type = 'fairytale', sceneCount = 4, characterDescription } = params;
        if (!topic) return res.status(400).json({ error: 'topic required' });
        if (typeof topic !== 'string' || topic.length > 200) {
          return res.status(400).json({ error: 'topic too long (max 200)' });
        }

        const count = Math.max(3, Math.min(10, sceneCount));
        const ai = new GoogleGenAI({ apiKey });
        // 동화 모드만 캐릭터 추출 (편지/자유는 캐릭터 불필요)
        const char = type === 'fairytale' ? extractCharacter(topic) : null;
        const isKnownSpecies = char !== null && char.type !== 'unknown';
        const hasName = char !== null;
        const charKr = char?.kr || '';
        const charEn = char?.en || '';
        const charFull = char?.full || '';

        // 캐릭터 참조 이미지에서 분석된 외형 설명 (Vision 결과)
        const hasVisionDesc = !!characterDescription;

        // 캐릭터에 따라 프롬프트 분기
        const charIntro = hasVisionDesc
          ? (hasName
            ? `■ 주인공 이름: "${charKr}" (이 이름을 반드시 사용하세요!)\n■ "${charKr}"의 외형 (참조 이미지 분석):\n${characterDescription}\n■ visualPrompt에서 이 외형을 정확히 묘사하세요. 종류를 바꾸거나 추측하지 마세요.`
            : `■ 주인공 외형 (참조 이미지 분석):\n${characterDescription}\n■ 이 캐릭터에 어울리는 귀여운 한국어 이름을 지어주세요.\n■ visualPrompt에서 이 외형을 정확히 묘사하세요.`)
          : isKnownSpecies
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

          : type === 'shorts'
          ? `${count}장면 영상 편지를 JSON으로 만들어주세요.

■ 주제: ${topic}
■ 이것은 동화가 아닙니다. 소중한 사람에게 보내는 진심 어린 편지입니다.

■ 장면 구성:
1번 장면: 자연스러운 시작 ("있잖아", "요즘 네 생각이 많이 나")
${count >= 4 ? '2번 장면: 함께한 구체적인 추억\n3번 장면: 진심 (고마움, 사랑, 미안함)\n' : '2번 장면: 추억과 진심\n'}마지막 장면: 따뜻한 마무리 ("보고 싶다", "사랑해")

■ 나레이션 규칙:
- 한국어 50~80자 (절대 80자 초과 금지!), 반말 편지체 ("~야", "~거든", "~잖아")
- 구체적 감각 (계절, 날씨, 장소, 음식)
- 꾸미지 않은 솔직한 진심

■ visualPrompt 규칙:
- 영어로 작성, 최소 80단어 이상으로 상세하게
- 나레이션의 감정과 내용에 맞는 장면을 구체적으로 묘사
- 각 장면마다 완전히 다른 배경/장소 (카페→공원→해변→거리→하늘 등)
- 사람은 자연스럽게 등장 가능 (앞모습, 옆모습, 뒷모습 모두 OK)
- 스타일: "warm emotional illustration, soft lighting, gentle color palette, cinematic composition, no text, no captions, no speech bubbles"
- 감정이 느껴지는 디테일: 표정, 손동작, 빛의 방향, 계절감

■ JSON 형식:
{"scenes":[{"sceneNumber":1, "narration":"50~80자 한국어", "visualPrompt":"상세 영어 장면 묘사", "duration":5}]}`

          : type === 'free'
          ? `${count}장면 쇼츠 영상 대본을 JSON으로 만들어주세요.

■ 주제: ${topic}
■ 이것은 자유 주제 쇼츠입니다. 주제에 맞는 흥미롭고 유익한 콘텐츠를 만들어주세요.

■ 장면 구성:
1번 장면: 주제를 흥미롭게 소개 (시청자의 관심을 끄는 오프닝)
${count >= 4 ? '2번 장면: 핵심 내용 1\n3번 장면: 핵심 내용 2\n' : '2번 장면: 핵심 내용\n'}${count >= 5 ? '4번 장면: 추가 정보 또는 반전\n' : ''}마지막 장면: 인상적인 마무리 (요약, 교훈, 또는 여운)

■ 나레이션 규칙:
- 한국어 50~80자 (절대 80자 초과 금지!)
- "~요/~해요/~이에요" 체 (친근한 정보 전달)
- 흥미로운 사실, 구체적 수치, 감각적 묘사 활용
- 시청자가 "오!" 하고 반응할 포인트를 넣으세요

■ visualPrompt 규칙:
- 영어로 작성, 최소 80단어 이상으로 상세하게
- 주제에 맞는 장면을 구체적으로 묘사
- 각 장면마다 완전히 다른 구도와 배경
- 스타일: "polished modern digital illustration, vivid colors, clean composition, social media style, no text, no captions, no watermarks"
- 사람이 필요하면 실루엣이나 뒷모습으로 표현
- 음식/자연/도시/동물 등 주제에 맞는 소재를 생생하게

■ JSON 형식:
{"scenes":[{"sceneNumber":1, "narration":"50~80자 한국어", "visualPrompt":"상세 영어 장면 묘사", "duration":5}]}`

          : `${count}장면 쇼츠를 JSON으로 만들어주세요. 주제: ${topic}. 한국어 나레이션 50~80자, 영어 visualPrompt 80단어+. JSON: {"scenes":[{"sceneNumber":1,"narration":"...","visualPrompt":"...","duration":5}]}`;

        console.log(`[toss-script] Generating: topic="${topic}", type=${type}, char=${charFull || '(AI위임)'}, count=${count}`);

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
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

        // 캐릭터 정보 결정 (동화만 — 편지/자유는 캐릭터 없음)
        let finalCharacter: { kr: string; en: string; type: 'animal' | 'human' } | null = null;
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

          // AI가 이름을 무시했으면 나레이션에서 강제 교체
          if (charKr) {
            // AI가 반환한 이름 (character 필드 또는 첫 나레이션에서 추출)
            const aiName = aiCharacter?.name_kr || null;
            // 첫 나레이션에서 "꼬마 용 미르가" 같은 패턴으로 AI가 지은 이름 추출
            const firstNarr = scenes[0]?.narration || '';
            const nameInNarr = !firstNarr.includes(charKr)
              ? firstNarr.match(/(?:꼬마|아기|작은|귀여운)?\s*(?:\S+)\s+(\S+?)(?:가|는|은|이|의|와|도|를)\s/)?.[1] || aiName
              : null;
            const wrongName = aiName || nameInNarr;

            if (wrongName && wrongName !== charKr) {
              for (const scene of scenes) {
                if (scene.narration) {
                  scene.narration = scene.narration.replaceAll(wrongName, charKr);
                }
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
