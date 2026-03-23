# C2 GEN 바이럴 엔진 업그레이드 실행 계획서

> **작성일:** 2026-03-24
> **작성자:** 제갈공명 (Claude Code)
> **기반 자료:** 4개 AI 종합비교분석 + 코드 레벨 직접 확인
> **상태:** 폐하 승인 대기

---

## 0. 모드별 영향범위 (코드 확인 완료)

### 3가지 입력 모드의 스크립트 생성 경로

| | 자동 모드 | 수동 모드 | 고급 모드 |
|---|---|---|---|
| **입력** | 키워드만 | 대본 직접 입력 | 대본 + 디렉티브 태그 |
| **App.tsx 핸들러** | `handleGenerate` | `handleGenerate` | `handleGenerateAdvanced` → `handleGenerate` |
| **sourceContext** | `null` | 대본 전문 | 디렉티브 제거된 대본 |
| **System Instruction** | `CHIEF_ART_DIRECTOR` | `CHIEF_ART_DIRECTOR` (사실상) | `CHIEF_ART_DIRECTOR` |
| **씬 분할 규칙** | "도입→배경→전개→시사점→결론" | "1문장=1씬, 원문 수정 금지" | "1문장=1씬, 원문 수정 금지" |

### 변경이 영향을 주는 범위

| 변경 내용 | 자동 | 수동 | 고급 |
|---|---|---|---|
| **프롬프트 바이럴 구조 교체** | ✅ 직접 영향 (씬 확장 방식 변경) | ⚠️ 간접 영향 (시각 프롬프트에만) | ⚠️ 간접 영향 |
| **감정 곡선 엔진 연결** | ✅ 직접 영향 (sourceContext로 주입) | ⚠️ 부분 영향 (대본+감정가이드 결합) | ⚠️ 부분 영향 |
| **린터 프롬프트 추가** | ✅ 자동 검증 | ✅ 자동 검증 | ✅ 자동 검증 |
| **플랫폼별 분기** | ✅ 영향 | ✅ 영향 | ✅ 영향 |

**핵심 발견: 수동/고급 모드에서는 Gemini가 "원문 수정 금지" 규칙을 따르므로, 나레이션 텍스트 자체는 변하지 않음. 바이럴 구조는 주로 자동 모드에 영향. 수동/고급에서는 시각 프롬프트와 감정 분석에만 반영됨.**

---

## 1. 구조적 문제 발견 (코드 확인)

### 문제 1: System Instruction 역할 혼선
`CHIEF_ART_DIRECTOR`가 **이미지 생성과 스크립트 생성 양쪽에 동시 사용됨** (`api/gemini.ts:272,294`). 바이럴 구조 지시를 여기에 넣으면 이미지 생성 AI도 영향받음.

**해결:** `SCRIPT_DIRECTOR` 신규 인스트럭션 추가. 스크립트 생성에만 사용.

### 문제 2: 감정 곡선 엔진이 C2 GEN에 미연결
`emotionCurveEngine.ts`는 8종 스토리 아크, 감정 매핑, 씬 적용 함수가 완성되어 있지만 C2 GEN 메인 플로우(`App.tsx` → `geminiService.ts`)에서 전혀 호출하지 않음. C2 PILOT(`services/pilot/scriptStep.ts`)에서만 사용.

**해결:** `geminiService.ts`의 `generateScript()`에서 `selectStoryArc` → `generateEmotionCurve` → `buildEmotionGuide`를 호출하여 sourceContext에 주입.

### 문제 3: 청크 분할 모드 미적용
3000자 초과 대본은 `generateScriptChunked()`로 분할되는데, 이 경로에서는 감정 곡선이 적용되지 않음.

**해결:** 첫 번째 청크에만 감정 가이드를 prepend.

---

## 2. 실행 계획 (Day 1~7)

### Day 1-2: 프롬프트 바이럴 구조 교체 (리스크 제로)

#### Step 1: `SCRIPT_DIRECTOR` 신규 인스트럭션 추가

**파일:** `services/prompts.ts` (18행 부근)

```typescript
SCRIPT_DIRECTOR: `당신은 바이럴 영상 대본을 쓰는 전문 스크립트 디렉터입니다.

## 핵심 원칙: 시청자가 끝까지 보게 만들어라
- 씬 1은 반드시 강력한 훅으로 시작 (충격 통계, 반전 질문, 긴급성, 리스트 예고 중 택1)
- 씬 1 나레이션은 30자 이내. 첫 문장이 길면 시청자가 이탈한다.
- 매 3번째 씬에 패턴 인터럽트 (시점 전환, 반전, 톤 변화)
- 연속 3개 씬이 같은 감정 톤 금지. 감정의 파동을 만들어라.
- 씬 2 끝에 오픈 루프 ("그런데 진짜 문제는 따로 있었습니다")
- 전체 40% 지점에 가장 큰 클리프행어 배치
- 마지막 씬 직전에 감정 저점(위기), 마지막 씬에 해결/행동 유도
- 1씬 = 1메시지. 한 씬에 여러 정보 넣지 마라.
- 문장 길이를 짧음-중간-짧음 리듬으로 배치

## 시각화 규칙
(기존 CHIEF_ART_DIRECTOR의 시각화 규칙 유지)
`,
```

#### Step 2: `api/gemini.ts` 시스템 인스트럭션 분기 수정

**파일:** `api/gemini.ts` (269-272행)

```typescript
// 변경 전
const baseInstruction =
  topic === 'Manual Script Input' ? SYSTEM_INSTRUCTIONS.MANUAL_VISUAL_MATCHER
  : hasReferenceImage ? SYSTEM_INSTRUCTIONS.REFERENCE_MATCH
  : SYSTEM_INSTRUCTIONS.CHIEF_ART_DIRECTOR;

// 변경 후
const baseInstruction =
  topic === 'Manual Script Input' ? SYSTEM_INSTRUCTIONS.MANUAL_VISUAL_MATCHER
  : hasReferenceImage ? SYSTEM_INSTRUCTIONS.REFERENCE_MATCH
  : SYSTEM_INSTRUCTIONS.SCRIPT_DIRECTOR;  // ← 변경
```

#### Step 3: 자동 모드 씬 구조 변경

**파일:** `services/prompts.ts` (183-187행)

```
// 변경 전
- Expand the topic into a full narrative: introduction → background → development → details → implications → conclusion

// 변경 후
- Expand the topic with VIRAL STRUCTURE: hook(충격/질문) → problem(문제제기) → tension(긴장고조) → reveal(핵심정보) → resolution(해결) → CTA(행동유도)
- Scene 1 MUST start with a hook: shocking stat, counter-intuitive claim, or urgent question
- Include at least 1 cliffhanger in the middle scenes
- Final scene: clear conclusion + call to action
```

#### Step 4: Few-shot 예시 추가 (자동 모드 전용)

**파일:** `services/prompts.ts` (202행 부근, `[Input]` 섹션 직전)

자동 모드(`!isManual`)일 때만 바이럴 훅 예시 3개를 삽입.

#### Step 5: JSON 스키마에 `scene_role` 필드 추가

**파일:** `services/prompts.ts` (216행 부근)

```json
"scene_role": "hook | build | tension | climax | resolution | cta"
```

---

### Day 3-4: 감정 곡선 엔진 C2 GEN 연결

#### Step 1: `buildEmotionGuide`를 `emotionCurveEngine.ts`로 이동

**현재 위치:** `services/pilot/scriptStep.ts` (89-105행)
**이동 위치:** `services/emotionCurveEngine.ts` (맨 아래에 export)

#### Step 2: `geminiService.ts`의 `generateScript()` 수정

**파일:** `services/geminiService.ts` (88-95행)

```typescript
import { selectStoryArc, generateEmotionCurve, buildEmotionGuide } from './emotionCurveEngine';

export const generateScript = async (
  topic, hasReferenceImage, sourceContext, language, options?
) => {
  // Feature flag 확인
  const useEmotion = localStorage.getItem('tubegen_emotion_curve') !== 'false';

  let enrichedContext = sourceContext ?? null;

  if (useEmotion && !sourceContext) {
    // 자동 모드: 감정 가이드를 sourceContext로 설정
    const arc = selectStoryArc(topic);
    const curve = generateEmotionCurve(arc, 'youtube_shorts', 60);
    enrichedContext = buildEmotionGuide(curve);
  } else if (useEmotion && sourceContext) {
    // 수동/고급 모드: 감정 가이드를 대본 앞에 prepend
    const arc = selectStoryArc(topic);
    const curve = generateEmotionCurve(arc, 'youtube_shorts', 60);
    const guide = buildEmotionGuide(curve);
    const combined = `${guide}\n\n${sourceContext}`;
    enrichedContext = combined.length > 2000 ? combined.slice(0, 2000) + '\n...' : combined;
  }

  return generateScriptSingle(topic, hasReferenceImage, enrichedContext, undefined, language);
};
```

#### Step 3: Feature flag 추가

**파일:** `config.ts` → `CONFIG.STORAGE_KEYS`에 `EMOTION_CURVE: 'tubegen_emotion_curve'` 추가
**기본값:** ON (`localStorage 값 없으면 활성화`)

---

### Day 5-6: 린터 프롬프트 추가 (GPT 제안 반영)

#### 개념
스크립트 생성 직후, 생성된 대본을 자동 검증하는 2차 프롬프트.

#### 구현 위치
**파일:** `services/geminiService.ts` — `generateScript()` 반환 직전

```typescript
// 스크립트 생성 후 자동 린트 (옵션)
if (localStorage.getItem('tubegen_script_lint') !== 'false') {
  scenes = await lintScript(scenes, language);
}
```

#### 린터 프롬프트 내용
```
다음 스크립트를 검토하고 약한 부분을 개선하라:
1. 씬 1이 3초 안에 멈출 만한 훅인가? (아니면 더 강한 훅으로 교체)
2. 군더더기 씬이 있는가? (있으면 삭제하거나 병합)
3. 감정 곡선이 단조로운가? (단조로우면 패턴 인터럽트 추가)
4. 마지막 씬에 행동 유도가 있는가? (없으면 추가)
```

#### 비용
추가 API 호출 1회 (Gemini Flash, ~$0.01 = 5크레딧). 기존 스크립트 생성과 같은 비용.

---

### Day 7: A/B 비교 테스트

동일 키워드 10개로 기존 프롬프트 vs 새 프롬프트 대본 생성 비교.

| 키워드 | 기존 대본 | 새 대본 | 평가 |
|---|---|---|---|
| "비트코인 반감기" | | | 훅 강도 / 긴장감 / 완결성 |
| "MZ세대 소비 트렌드" | | | |
| (8개 더) | | | |

---

## 3. 2주차~한 달: 플랫폼별 분기

### 구현
**파일:** `services/prompts.ts` — `getScriptGenerationPrompt()` 시그니처에 `platform` 추가

```typescript
getScriptGenerationPrompt(topic, sourceContext, language, platform?)
```

| 플랫폼 | 추가 지시 |
|---|---|
| YouTube Shorts | 60초 이내. 교육/정보형 훅. 검색 키워드 포함. |
| TikTok | 15~30초. 완주율 극대화. 트렌드 음악/효과음 힌트. |
| Instagram Reels | 공유 유도 문구. "친구한테 보여줘야 해" CTA. |
| YouTube 롱폼 | 10씬+. 챕터 구조. 깊은 분석. |

### UI 변경
**파일:** `components/InputSection.tsx` — 플랫폼 선택 드롭다운 추가 (영상 방향 옆)

---

## 4. 장기 (2~3개월)

| 순서 | 작업 | 의존 |
|---|---|---|
| 1 | YouTube/TikTok API 성과 데이터 수집 | C2 PILOT Phase 5 완성 |
| 2 | 성과 피드백 루프 (어떤 훅/아크가 효과적인지 추적) | 1 완료 후 |
| 3 | GPT "150생성→30발행" 린트 파이프라인 | 린터 프롬프트 안정화 후 |
| 4 | 2단계 생성 (beat JSON → 대본 렌더링) | 1단계 프롬프트 한계 확인 후 |
| 5 | Gemini 2.5 Pro / 3 Flash 모델 테스트 | 프롬프트 개선 효과 확인 후 |

---

## 5. 하지 말 것

| 금지 | 이유 | 출처 |
|---|---|---|
| 모델을 당장 교체하지 마라 | 4/4 AI 동의. 프롬프트가 "도입→배경→전개"면 Pro로 바꿔도 똑같이 밋밋함 | 전원 |
| 2단계 생성을 당장 도입하지 마라 | API 호출 2배 + 에러 처리 복잡도. 1인+AI 환경에서 과도함 | Thunder Room |
| 생산량을 줄이지 마라 | 알고리즘은 꾸준한 업로드를 봄. 줄이는 대신 최소 품질선을 올려라 | Thunder Room, GPT |

---

## 6. 변경 파일 요약

| 파일 | 변경 내용 | Day |
|---|---|---|
| `services/prompts.ts` | `SCRIPT_DIRECTOR` 추가, 바이럴 구조, Few-shot, `scene_role`, 플랫폼 파라미터 | 1-2 |
| `api/gemini.ts` | 시스템 인스트럭션 분기 `SCRIPT_DIRECTOR` 사용 | 1-2 |
| `services/emotionCurveEngine.ts` | `buildEmotionGuide` 이동 (from scriptStep.ts) | 3-4 |
| `services/pilot/scriptStep.ts` | import 경로 수정 | 3-4 |
| `services/geminiService.ts` | `generateScript()`에 감정 곡선 주입 + feature flag | 3-4 |
| `config.ts` | `EMOTION_CURVE` 스토리지 키 추가 | 3-4 |
| `services/geminiService.ts` | `lintScript()` 린터 함수 추가 | 5-6 |

**총 변경 파일: 6개. 신규 파일: 0개. 기존 코드 삭제: 0줄.**

---

*"C2 GEN의 문제는 AI가 못 써서가 아니라, AI에게 뭘 써달라고 하는지를 모르고 있었던 것이다. 엔진은 이미 있다. 켜기만 하면 된다." — Thunder Room*
