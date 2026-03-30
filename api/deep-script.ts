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

function buildDeepPrompt(topic: string, langName: string, lengthGuide: string, styleConfig: { role: string; arc: string; structure: string }) {
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
각 문장 끝에 괄호로 연출 지시를 넣으세요:
- (배경: 설명) — 배경 장면
- (분위기: 밝음/어두움/중립/긴장/따뜻함) — 이미지 톤
- (구도: 클로즈업/미디엄샷/와이드샷/캐릭터없음) — 카메라 구도
- (카메라: 줌인/줌아웃/패닝/고정) — 카메라 무브
- (색상: 웜톤/쿨톤/하이콘트라스트/디새츄레이션/네온) — 색감
- (텍스트: "표시할 내용") — 화면 내 텍스트
- (이전씬유지) (같은장소) (시간경과) (화자: 이름) (스타일: 설명)

## 작성 규칙
- 한 문장 = 1개 씬 (마침표로 구분)
- 씬과 씬 사이에 빈 줄 1개
- 첫 씬 나레이션은 30자 이내의 강력한 훅
- 불필요한 인사/소개/자기소개 금지 — 본론부터
- 모든 오픈 루프는 반드시 닫아야 함
- 음소거로도 이해 가능하도록 핵심 키워드는 (텍스트:)로 시각화
- CTA는 단일하고 명확하게 — 하나의 행동만 요청
- 설명, 주석, 메타 코멘트 없이 대본만 출력

## 주제
${topic}

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

// ── 메인 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { topic, language = 'ko', style = 'auto', length = '180', mode = 'deep' } = req.body;
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

  const totalSteps = mode === 'fast' ? 1 : 3;

  try {
    // ── Step 1: 초안 생성 ──
    sendEvent(res, {
      step: 1, total: totalSteps, status: 'working',
      label: '초안 작성 중', icon: '📝',
      detail: '주제를 깊이 분석하고 대본 초안을 작성합니다',
    });

    const deepPrompt = buildDeepPrompt(topic, langName, lengthGuide, styleConfig);
    const draftResponse = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: deepPrompt,
      config: { thinkingConfig: { thinkingBudget: 32768 }, maxOutputTokens: 65536 },
    });
    const draft = draftResponse.text ?? '';
    const draftPreview = draft.split('\n').filter(l => l.trim()).slice(0, 3).join(' ').slice(0, 150);

    sendEvent(res, {
      step: 1, total: totalSteps, status: 'done',
      preview: draftPreview, charCount: draft.length,
    });

    // 빠른 생성 → 여기서 종료
    if (mode === 'fast') {
      sendEvent(res, { step: 1, total: 1, status: 'complete', script: draft });
      logUsage(req, 'deep_script_fast');
      sendDone(res);
      return;
    }

    // ── Step 2: 품질 감사 ──
    sendEvent(res, {
      step: 2, total: 3, status: 'working',
      label: '품질 감사 중', icon: '🔍',
      detail: '훅 강도, 감정 곡선, 리서치 깊이를 평가합니다',
    });

    const auditPrompt = buildAuditPrompt(draft);
    const auditResponse = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: auditPrompt,
      config: { thinkingConfig: { thinkingBudget: 16384 }, maxOutputTokens: 4096 },
    });
    const audit = auditResponse.text ?? '';

    // 개선점 수 파싱
    const improvementCount = (audit.match(/\[개선\]/g) || []).length;
    // 점수 요약 추출 (첫 3개 항목)
    const scoreLines = audit.split('\n').filter(l => l.startsWith('[점수]')).slice(0, 3).join('\n');

    sendEvent(res, {
      step: 2, total: 3, status: 'done',
      auditPreview: scoreLines || audit.slice(0, 200),
      improvements: improvementCount,
    });

    // ── Step 3: 피드백 반영 최종본 ──
    sendEvent(res, {
      step: 3, total: 3, status: 'working',
      label: '최종 개선 중', icon: '✨',
      detail: `감사 피드백 ${improvementCount}건을 반영하여 대본을 다듬습니다`,
    });

    const refinePrompt = buildRefinePrompt(topic, langName, lengthGuide, styleConfig.role, draft, audit);
    const finalResponse = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: refinePrompt,
      config: { thinkingConfig: { thinkingBudget: 24576 }, maxOutputTokens: 65536 },
    });
    const finalScript = finalResponse.text ?? '';

    sendEvent(res, {
      step: 3, total: 3, status: 'complete',
      script: finalScript,
      charCount: finalScript.length,
    });

    logUsage(req, 'deep_script_refined');
    sendDone(res);
  } catch (error: any) {
    console.error('[api/deep-script] Error:', error.message);
    sendEvent(res, { error: error.message || 'Internal server error' });
    sendDone(res);
  }
}
