import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Vercel Fluid Compute — 스트리밍 응답 활성화
export const config = { supportsResponseStreaming: true };

// ── 유틸리티 ──

function pickGeminiKey(): string | undefined {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
  ].filter(Boolean) as string[];
  if (keys.length === 0) return undefined;
  return keys[Math.floor(Math.random() * keys.length)];
}

async function logUsage(req: VercelRequest, action: string) {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    if (!sessionToken || req.headers['x-custom-api-key']) return;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    const { data: session } = await supabase
      .from('c2gen_sessions').select('email').eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString()).single();
    if (!session?.email) return;
    await supabase.from('c2gen_usage').insert({ email: session.email, action, cost_usd: 0, count: 1 });
  } catch (_) { /* ignore */ }
}

// ── SSE 헬퍼 ──

function sendEvent(res: VercelResponse, data: Record<string, any>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Vercel Fluid Compute는 자동 flush
}

function sendDone(res: VercelResponse) {
  res.write(`data: [DONE]\n\n`);
  res.end();
}

// ── Gemini 재시도 래퍼 (503/429 대응) ──

async function geminiWithRetry(
  ai: InstanceType<typeof GoogleGenAI>,
  params: { model: string; contents: string; config: any },
  maxRetries = 2,
): Promise<string> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent(params);
      return response.text ?? '';
    } catch (err: any) {
      const msg = err.message || '';
      const is503 = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
      const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
      if ((is503 || is429) && attempt < maxRetries) {
        const delay = (attempt + 1) * 5000; // 5초, 10초
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Gemini 최대 재시도 횟수 초과');
}

// ── 스타일별 역할 설정 ──

const STYLE_ROLES: Record<string, { role: string; arc: string; structure: string }> = {
  documentary: { role: '넷플릭스 다큐멘터리 수석 PD. 팩트와 데이터, 인터뷰 구성, 내레이터 시점 전문가', arc: 'problem_solution', structure: '의문→조사→발견→증거→결론' },
  storytelling: { role: '100만 구독자 스토리텔러. 1인칭 경험담, 감정 고저, 반전 구조 전문가', arc: 'emotional', structure: '공감→몰입→위기→반전→카타르시스' },
  educational: { role: 'TED 강연 연출가. 복잡한 개념을 비유로 풀어내는 전문가', arc: 'educational', structure: '궁금증→기본설명→심화→아하!→정리' },
  viral: { role: 'MrBeast 스타일 콘텐츠 디렉터. 골든 3초 훅, 패턴 인터럽트, 도파민 루프 설계자', arc: 'reversal', structure: '충격→호기심→정보폭격→반전→공유유도' },
  investigative: { role: '탐사 저널리스트. 단서를 하나씩 공개하며 진실에 접근하는 긴장감 전문가', arc: 'investigative', structure: '단서→추적→벽→돌파구→진실공개' },
  countdown: { role: '에스컬레이션 전문가. 순위가 올라갈수록 강도를 높여 1위에서 폭발시키는 구성가', arc: 'countdown', structure: 'N위→상위권→3위 서프라이즈→1위 충격' },
  comparison: { role: '공정한 심판관. A와 B를 항목별로 대결시키고 예상을 뒤집는 판정을 내리는 전문가', arc: 'comparison', structure: 'A소개→B소개→항목대결→반전판정' },
  transformation: { role: '비포애프터 연출가. 최악에서 시작해 반전의 성공을 보여주는 서사 전문가', arc: 'transformation', structure: '비포(최악)→계기→시행착오→터닝포인트→애프터' },
  horror_warning: { role: '위기 경보 전문가. 긴장을 극대화하고 충격적 사실로 경각심을 유발하는 연출가', arc: 'horror_warning', structure: '긴장→위험신호→충격→해결→교훈' },
  humor: { role: '코미디 작가. 설정을 쌓고 기대를 배반하는 펀치라인을 설계하는 전문가', arc: 'humor', structure: '설정→기대→빌드업→펀치라인→마무리' },
  conspiracy: { role: '미완결의 대가. 증거를 나열하되 결론은 시청자에게 던지는 열린 구조 전문가', arc: 'conspiracy', structure: '의문→증거→반박→더큰증거→열린결말' },
};

// ── 프롬프트 빌더 ──

function buildDeepPrompt(topic: string, langName: string, lengthGuide: string, styleConfig: { role: string; arc: string; structure: string }, channelStylePrompt = '') {
  const emotionArcGuide = styleConfig.arc !== 'auto'
    ? `\n## 감정 곡선 설계 (${styleConfig.structure})\n씬 전체에 걸쳐 다음 감정 흐름을 따르세요. 3파도 이상의 긴장-이완 리듬을 만드세요.\n단조로운 감정이 3씬 이상 연속되지 않도록 변화를 주세요.`
    : `\n## 감정 곡선 설계\nAI가 주제에 맞는 최적의 감정 흐름을 자동 설계하세요. 3파도 이상의 긴장-이완 리듬을 만드세요.`;

  return `당신은 ${styleConfig.role}입니다. 주제를 깊이 분석하고, 시청자를 끝까지 몰입시키는 심층 대본을 작성하세요.

## 작성 언어
${langName}

## 대본 길이
${lengthGuide}

## 사고 단계 (이 순서로 사고한 뒤 대본을 작성하세요)
1. 먼저 주제의 핵심 논점 3가지를 정리하세요
2. 타겟 시청자가 가장 궁금해할 포인트를 파악하세요
3. 씬 구조를 설계하세요 (어디에 훅, 클리프행어, 반전을 배치할지)
4. 대본을 작성하세요
${emotionArcGuide}

## 시청자 심리학 기법 (반드시 적용)
- **도입 3초**: 패턴 인터럽트 또는 반직관 명제로 시작 (스크롤을 멈추게 하는 첫 문장)
- **씬 2 끝**: 오픈 루프 설치 ("이게 끝이 아닙니다" — 미완결 질문으로 시청 유지)
- **매 3~4씬**: 마이크로 훅 삽입 ("근데 여기서 반전", "이게 진짜 중요한 건데")
- **전체 40% 지점**: 최대 클리프행어 배치
- **전체 75% 지점**: 최대 긴장/위기 장면
- **마지막 직전 씬**: 감정 저점 → 마지막 씬에서 해소
- **인지 편향 최소 2개 활용**: 호기심 갭, 손실 회피, 앵커링, 사회적 증거, FOMO 중 택 2+
- **손실 프레이밍**: "이걸 하면 좋다"보다 "이걸 안 하면 잃는다" 형태가 2배 강력
- **구체적 숫자**: "많은 사람"보다 "47,283명"이 3배 높은 신뢰도

## 디렉티브 문법 (씬의 50% 이상에 반드시 포함)
각 문장 끝에 괄호로 연출 지시를 넣으세요. 아래 목록의 디렉티브만 사용하세요:
- (배경: 설명) — 배경 장면
- (분위기: 밝음/어두움/중립/긴장/따뜻함) — 이미지 톤
- (구도: 클로즈업/미디엄샷/와이드샷/캐릭터없음) — 카메라 구도
- (카메라: 줌인/줌아웃/패닝/고정) — 카메라 무브
- (색상: 웜톤/쿨톤/하이콘트라스트/디새츄레이션/네온) — 색감
- (텍스트: "표시할 내용") — 화면 내 텍스트
- (이전씬유지) (같은장소) (시간경과) (화자: 이름) (스타일: 설명)

위 목록에 없는 디렉티브는 절대 사용하지 마세요.
특히 (사운드:), (효과음:), (BGM:), (SFX:), (음악:), (SE:), (나레이션:) 등 오디오 관련 디렉티브는 시스템에서 지원하지 않으므로 절대 사용 금지입니다.

## 작성 규칙
- 한 문장 = 1개 씬 (마침표로 구분)
- 씬과 씬 사이에 빈 줄 1개
- 첫 씬 나레이션은 30자 이내의 강력한 훅
- 불필요한 인사/소개/자기소개 금지 — 본론부터
- 모든 오픈 루프는 반드시 닫아야 함
- 음소거로도 이해 가능하도록 핵심 키워드는 (텍스트:)로 시각화
- CTA는 단일하고 명확하게 — 하나의 행동만 요청
- 설명, 주석, 메타 코멘트 없이 대본만 출력
- 절대 마크다운 문법 사용 금지: ##, **, *, \`\`\` 등 마크다운 마커를 쓰지 마세요
- "씬 1:", "(씬 N)", "## 최종 대본" 같은 씬 번호 라벨이나 제목 절대 금지
- 나레이션 텍스트와 (디렉티브) 괄호만 출력하세요

## 주제
${topic}
${channelStylePrompt ? `\n## 참조 채널 스타일 (이 채널의 대본 패턴을 모방하되, 완전 복사가 아닌 톤/구조만 참고)\n${channelStylePrompt}` : ''}
완성된 대본만 출력하세요.`;
}

function buildAuditPrompt(draft: string): string {
  return `당신은 20년차 영상 콘텐츠 총괄 디렉터입니다. 아래 대본을 10가지 기준으로 냉정하게 평가하고, 구체적 개선점을 제시하세요.

## 평가 기준 (각 1-10점)
1. 첫 3초 훅 — 스크롤을 멈출 만큼 강력한가?
2. 오픈 루프 — 미완결 질문이 적절히 배치되었는가?
3. 감정 곡선 — 긴장-이완 리듬이 단조롭지 않은가?
4. 마이크로 훅 — 30초(3~4씬)마다 새로운 자극이 있는가?
5. 리서치 깊이 — 구체적 수치/사례/출처가 있는가?
6. 시각 묘사 — 디렉티브가 충분히 구체적인가?
7. 불필요한 문장 — 빼도 되는 문장이 있는가?
8. 클라이맥스 — 전체 75% 지점에 최대 긴장이 있는가?
9. CTA — 마무리가 임팩트 있는가?
10. 자연스러움 — 읽었을 때 구어체로 자연스러운가?

## 대본
${draft}

JSON 없이, 아래 형식으로만 출력하세요:
[점수] 항목1: X점 — 이유 (한 줄)
[점수] 항목2: X점 — 이유
...
[개선] 1. 구체적 개선 지시
[개선] 2. 구체적 개선 지시
(최대 5개)`;
}

function buildRefinePrompt(topic: string, langName: string, lengthGuide: string, styleRole: string, draft: string, audit: string): string {
  return `당신은 ${styleRole}입니다. 아래 초안과 감사 피드백을 반영하여 최종 대본을 작성하세요.

## 원래 주제
${topic}

## 작성 언어
${langName}

## 대본 길이
${lengthGuide}

## 초안
${draft}

## 감사 피드백
${audit}

## 지시사항
- 피드백에서 지적된 모든 항목을 반영하세요
- 초안의 좋은 부분은 유지하고, 약한 부분만 개선하세요
- 디렉티브 문법을 유지하세요
- 설명/주석 없이 개선된 대본만 출력하세요

개선된 최종 대본만 출력하세요.`;
}

// ── 화풍 매핑 테이블 (스타일 → 추천 화풍 ID) ──

const STYLE_ART_MAP: Record<string, string[]> = {
  documentary:    ['gemini-infographic', 'gemini-korea-cartoon', 'gemini-retro-news'],
  storytelling:   ['gemini-watercolor', 'gemini-crayon', 'gemini-minimal-flat'],
  educational:    ['gemini-infographic', 'gemini-minimal-flat', 'gemini-isometric'],
  viral:          ['gemini-korea-cartoon', 'gemini-infographic', 'gemini-minimal-flat'],
  investigative:  ['gemini-retro-news', 'gemini-korea-cartoon', 'gemini-infographic'],
  countdown:      ['gemini-infographic', 'gemini-korea-cartoon', 'gemini-isometric'],
  comparison:     ['gemini-infographic', 'gemini-isometric', 'gemini-minimal-flat'],
  transformation: ['gemini-watercolor', 'gemini-crayon', 'gemini-minimal-flat'],
  horror_warning: ['gemini-retro-news', 'gemini-korea-cartoon', 'gemini-infographic'],
  humor:          ['gemini-crayon', 'gemini-minimal-flat', 'gemini-isometric'],
  conspiracy:     ['gemini-retro-news', 'gemini-korea-cartoon', 'gemini-infographic'],
  auto:           ['gemini-korea-cartoon', 'gemini-infographic', 'gemini-watercolor'],
};

// ── 캐릭터/화풍/음성 분석 ──

async function analyzeScriptForSuggestions(
  ai: InstanceType<typeof GoogleGenAI>,
  script: string,
  style: string,
): Promise<Record<string, any>> {
  // 화풍 추천 (코드 매핑 — AI 호출 불필요)
  const recommendedStyles = STYLE_ART_MAP[style] || STYLE_ART_MAP.auto;

  // 캐릭터 + 음성 분석 (Gemini Flash — 빠르고 저렴)
  const analysisPrompt = `아래 영상 대본을 분석하여, 등장 캐릭터와 적합한 나레이터 음성을 제안하세요.

## 대본
${script.slice(0, 5000)}

## 출력 JSON (이 형식을 정확히 따르세요)
{
  "needsCharacter": true 또는 false,
  "characters": [
    {
      "role": "메인 나레이터" 또는 "화자1" 등,
      "gender": "male" 또는 "female",
      "ageRange": "20대" / "30대" / "40대" / "50대+",
      "personality": "성격/톤 한 줄 설명",
      "visualDescription": "외모/의상 묘사 한 줄",
      "voiceTone": "차분한" / "활기찬" / "따뜻한" / "긴장감 있는" / "유머러스한"
    }
  ],
  "narrationStyle": "단독 나레이션" / "대화형" / "인터뷰형",
  "overallMood": "진지한" / "밝은" / "감성적" / "긴장감" / "유머러스",
  "recommendedVoiceGender": "male" 또는 "female",
  "recommendedVoiceAge": "young" / "middle" / "mature"
}

JSON만 출력하세요. 설명 없이.`;

  try {
    const result = await geminiWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: analysisPrompt,
      config: { maxOutputTokens: 2048 },
    });

    // JSON 파싱 (마크다운 코드블록 제거)
    const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { ...parsed, recommendedStyles };
  } catch (err) {
    console.error('[deep-script] analysis parse error:', err);
    // 파싱 실패 시 기본 제안
    return {
      needsCharacter: true,
      characters: [{ role: '메인 나레이터', gender: 'male', ageRange: '30대', personality: '신뢰감 있는 전문가', visualDescription: '깔끔한 셔츠, 단정한 헤어', voiceTone: '차분한' }],
      narrationStyle: '단독 나레이션',
      overallMood: '진지한',
      recommendedVoiceGender: 'male',
      recommendedVoiceAge: 'middle',
      recommendedStyles,
    };
  }
}

// ── 메인 핸들러 ──

// ── 인증 + operator 전용 체크 ──

async function validateOperatorSession(req: VercelRequest): Promise<{ ok: boolean; error?: string; email?: string }> {
  try {
    const sessionToken = req.headers['x-session-token'] as string;
    // 커스텀 키 사용자는 인증 스킵 (자기 키 사용)
    if (req.headers['x-custom-api-key']) return { ok: true };
    if (!sessionToken) return { ok: false, error: '로그인이 필요합니다' };

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return { ok: true };

    const supabase = createClient(url, key);
    const { data: session } = await supabase
      .from('c2gen_sessions').select('email').eq('token', sessionToken)
      .gt('expires_at', new Date().toISOString()).single();
    if (!session?.email) return { ok: false, error: '세션이 만료되었습니다' };

    const { data: userRow } = await supabase
      .from('c2gen_users').select('plan').eq('email', session.email).single();
    if (userRow?.plan !== 'operator') return { ok: false, error: '운영자 전용 기능입니다' };

    return { ok: true, email: session.email };
  } catch (_) {
    return { ok: true }; // DB 오류 시 허용 (운영 연속성)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── 인증: operator만 접근 가능 ──
  const auth = await validateOperatorSession(req);
  if (!auth.ok) return res.status(403).json({ error: auth.error });

  const { topic, language = 'ko', style = 'auto', length = '180', mode = 'deep', channelStylePrompt = '' } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });

  // API 키
  const apiKey = (req.headers['x-custom-api-key'] as string) || pickGeminiKey();
  if (!apiKey) return res.status(400).json({ error: 'API key not configured' });

  const ai = new GoogleGenAI({ apiKey });

  // 파라미터 계산
  const langName = language === 'en' ? 'English' : language === 'ja' ? '日本語' : '한국어';
  const durationSec = parseInt(length, 10) || 180;
  const secPerScene = 12;
  const minScenes = Math.max(1, Math.floor(durationSec / (secPerScene + 3)));
  const maxScenes = Math.max(minScenes, Math.ceil(durationSec / (secPerScene - 3)));
  const durationMin = Math.floor(durationSec / 60);
  const durationRemSec = durationSec % 60;
  const durationStr = durationMin > 0
    ? (durationRemSec > 0 ? `${durationMin}분 ${durationRemSec}초` : `${durationMin}분`)
    : `${durationSec}초`;
  const lengthGuide = `${minScenes}~${maxScenes}씬 (${durationStr} 영상)`;

  const styleConfig = STYLE_ROLES[style] || {
    role: '영상 대본 전문 디렉터. 주제에 가장 적합한 톤과 구조를 자동 선택하는 전문가',
    arc: 'auto', structure: '주제에 맞게 자동 설계',
  };

  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const totalSteps = mode === 'fast' ? 2 : 4; // fast: 생성+분석, deep: 초안+감사+개선+분석

  try {
    // ── Step 1: 초안 생성 ──
    sendEvent(res, {
      step: 1, total: totalSteps, status: 'working',
      label: '초안 작성 중', icon: '📝',
      detail: '주제를 깊이 분석하고 대본 초안을 작성합니다',
    });

    const deepPrompt = buildDeepPrompt(topic, langName, lengthGuide, styleConfig, channelStylePrompt);
    const draft = await geminiWithRetry(ai, {
      model: 'gemini-2.5-pro',
      contents: deepPrompt,
      config: { thinkingConfig: { thinkingBudget: 32768 }, maxOutputTokens: 65536 },
    });
    const draftPreview = draft.split('\n').filter(l => l.trim()).slice(0, 3).join(' ').slice(0, 150);

    // 빠른 생성 → 대본 전달 후 분석 단계로
    if (mode === 'fast') {
      sendEvent(res, { step: 1, total: totalSteps, status: 'done', script: draft, charCount: draft.length, preview: draftPreview });

      // ── Step 2 (fast): 캐릭터/화풍/음성 분석 ──
      sendEvent(res, {
        step: 2, total: totalSteps, status: 'working',
        label: '캐릭터·화풍 분석 중', icon: '🎨',
        detail: '대본에 어울리는 캐릭터, 화풍, 음성을 추천합니다',
      });

      const analysisResult = await analyzeScriptForSuggestions(ai, draft, style);
      sendEvent(res, { step: 2, total: totalSteps, status: 'complete', analysis: analysisResult });

      logUsage(req, 'deep_script_fast');
      sendDone(res);
      return;
    }

    sendEvent(res, {
      step: 1, total: totalSteps, status: 'done',
      preview: draftPreview, charCount: draft.length,
    });

    // ── Step 2: 품질 감사 ──
    sendEvent(res, {
      step: 2, total: totalSteps, status: 'working',
      label: '품질 감사 중', icon: '🔍',
      detail: '훅 강도, 감정 곡선, 리서치 깊이를 평가합니다',
    });

    const auditPrompt = buildAuditPrompt(draft);
    const audit = await geminiWithRetry(ai, {
      model: 'gemini-2.5-pro',
      contents: auditPrompt,
      config: { thinkingConfig: { thinkingBudget: 8192 }, maxOutputTokens: 4096 },
    });

    // 개선점 수 파싱
    const improvementCount = (audit.match(/\[개선\]/g) || []).length;
    // 점수 요약 추출 (첫 3개 항목)
    const scoreLines = audit.split('\n').filter(l => l.startsWith('[점수]')).slice(0, 3).join('\n');

    sendEvent(res, {
      step: 2, total: totalSteps, status: 'done',
      auditPreview: scoreLines || audit.slice(0, 200),
      improvements: improvementCount,
    });

    // ── Step 3: 피드백 반영 최종본 ──
    sendEvent(res, {
      step: 3, total: totalSteps, status: 'working',
      label: '최종 개선 중', icon: '✨',
      detail: `감사 피드백 ${improvementCount}건을 반영하여 대본을 다듬습니다`,
    });

    const refinePrompt = buildRefinePrompt(topic, langName, lengthGuide, styleConfig.role, draft, audit);
    const finalScript = await geminiWithRetry(ai, {
      model: 'gemini-2.5-pro',
      contents: refinePrompt,
      config: { thinkingConfig: { thinkingBudget: 24576 }, maxOutputTokens: 65536 },
    });

    sendEvent(res, {
      step: 3, total: 4, status: 'done',
      script: finalScript,
      charCount: finalScript.length,
    });

    // ── Step 4: 캐릭터/화풍/음성 분석 ──
    sendEvent(res, {
      step: 4, total: 4, status: 'working',
      label: '캐릭터·화풍 분석 중', icon: '🎨',
      detail: '대본에 어울리는 캐릭터, 화풍, 음성을 추천합니다',
    });

    const analysisResult = await analyzeScriptForSuggestions(ai, finalScript, style);
    sendEvent(res, { step: 4, total: 4, status: 'complete', analysis: analysisResult });

    logUsage(req, 'deep_script_refined');
    sendDone(res);
  } catch (error: any) {
    const msg = error.message || 'Internal server error';
    console.error('[api/deep-script] Error:', msg);
    // 사용자 친화적 에러 메시지
    const userMsg = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')
      ? 'Gemini Pro 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.'
      : msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')
      ? 'API 요청 한도에 도달했습니다. 1~2분 후 다시 시도해주세요.'
      : msg;
    sendEvent(res, { error: userMsg });
    sendDone(res);
  }
}
