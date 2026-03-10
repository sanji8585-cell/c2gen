# C2GEN Engine V2.0 — 구현 가이드

> **이 문서는 Claude Code가 다른 PC에서도 작업을 인지하고 수행할 수 있도록 작성되었습니다.**
> 기획 상세: `docs/ENGINE-UPGRADE-PLAN.md` 참조

---

## 작업 개요

C2GEN Engine V2.0 "Director's Cut" 업그레이드. 5개 핵심 기능:
1. **"고급 대본" 탭 신설** — 기존 자동/수동 대본 모드 코드 변경 없이, 별도 탭으로 격리
2. 디렉티브 시스템 (괄호 문법으로 연출 제어)
3. 다중 음성 (씬별 화자 지정)
4. 일관성 모드 (씬 간 시각적 연결)
5. 검증 시스템 (파싱/적용 과정 시각화)

### ⚠️ 최우선 원칙: 기존 모드 격리
- **기존 `⚡ 자동 대본` / `✏️ 수동 대본` 코드는 한 줄도 수정하지 않는다**
- 모든 V2.0 기능은 `🎬 고급 대본` 탭 전용으로 구현한다
- App.tsx의 기존 `handleGenerate()`, `handleApproveScript()` 함수는 건드리지 않는다
- 고급 대본 전용 함수를 별도로 만든다: `handleGenerateAdvanced()`, `handleApproveAdvancedScript()`

---

## Sprint 0: "고급 대본" 탭 껍데기 (최우선)

### Task 0.1: ScriptMode 타입 확장

**파일**: `types.ts`

```typescript
// 기존 (확인 필요 — 현재 auto/manual 구분 방식 파악 후 추가)
export type ScriptMode = 'auto' | 'manual' | 'advanced';
```

### Task 0.2: InputSection.tsx에 3번째 탭 추가

**파일**: `components/InputSection.tsx`

**변경 내용**:
- 기존 자동/수동 탭 옆에 `🎬 고급 대본` 탭 추가
- 고급 대본 탭 선택 시 전용 UI 렌더링:
  - 화자 설정 영역 (빈 껍데기, Sprint 2에서 구현)
  - 대본 입력란 (기존 수동 대본과 동일한 textarea)
  - 옵션 영역: 렌더링 모드 선택 (빈 껍데기, Sprint 3에서 구현)
  - 디렉티브 가이드 버튼 (빈 껍데기, Sprint 5에서 구현)
- **기존 자동/수동 탭 코드는 변경하지 않는다**

### Task 0.3: App.tsx에 고급 대본 전용 핸들러 추가

**파일**: `App.tsx`

**추가 함수**:
```typescript
// 초기에는 기존 수동 대본과 동일하게 동작
const handleGenerateAdvanced = async () => {
  // Sprint 0: 기존 handleGenerate()와 동일 로직 복사
  // Sprint 1~5에서 점진적으로 디렉티브/다중음성/일관성 로직 추가
};
```

**핵심**: 기존 `handleGenerate()` 함수는 수정하지 않고, 새 함수를 만든다.

### Task 0.4: 기존 모드 무결성 검증

**검증 방법**:
1. 자동 대본으로 키워드 입력 → 생성 → 기존과 동일한 결과 확인
2. 수동 대본으로 텍스트 입력 → 생성 → 기존과 동일한 결과 확인
3. 고급 대본으로 디렉티브 없는 텍스트 입력 → 수동 대본과 동일한 결과 확인

---

## Sprint 1: 디렉티브 파서 + 기본 적용

### Task 1.1: directiveParser.ts 신규 생성

**파일**: `services/directiveParser.ts`

**기능**:
- 나레이션 텍스트에서 `(키: 값)` 또는 `(플래그)` 패턴 추출
- 다국어 키를 내부 키로 정규화 (config.ts의 DIRECTIVE_KEY_MAP 사용)
- 구도/분위기 값을 내부 값으로 매핑
- 디렉티브 제거된 정제 나레이션 반환

**핵심 함수**:
```typescript
interface ParseResult {
  cleanNarration: string;       // 디렉티브 제거된 나레이션
  directives: SceneDirectives;  // 파싱된 디렉티브
  rawDirectives: string[];      // 원본 괄호 텍스트 (디버그용)
}

export function parseDirectives(narration: string, language?: Language): ParseResult
```

**파싱 정규식**: `/\(([^)]+)\)/g`
- 각 매치에서 `:` 기준으로 key/value 분리
- key를 DIRECTIVE_KEY_MAP으로 정규화
- 값이 없으면 boolean 플래그 (KEEP_PREV, SAME_PLACE, TIME_PASS)
- COMPOSITION 값은 COMPOSITION_VALUE_MAP으로 매핑
- MOOD 값은 MOOD_VALUE_MAP으로 매핑

**주의사항**:
- 괄호 안에 순수 한국어/일본어 텍스트만 있고 매핑 키가 아닌 경우 → 디렉티브가 아닌 일반 괄호로 간주, 제거하지 않음
- 중첩 괄호는 지원하지 않음
- 동일 키 중복 시 마지막 값 사용

### Task 1.2: types.ts 타입 추가

**파일**: `types.ts`

**추가할 타입**: (기획서의 데이터 구조 섹션 참조)
- `SceneDirectives` 인터페이스
- `CharacterVoice` 인터페이스
- `SceneAnalysis`에 `directives?: SceneDirectives` 필드 추가
- `GeneratedAsset`에 `speakerName?: string`, `speakerColor?: string` 추가

### Task 1.3: config.ts 매핑 테이블 추가

**파일**: `config.ts`

**추가할 상수**: (기획서 참조)
- `DIRECTIVE_KEY_MAP` — 다국어 키 → 내부 키
- `COMPOSITION_VALUE_MAP` — 다국어 구도 값 → MICRO/STANDARD/MACRO/NO_CHAR
- `MOOD_VALUE_MAP` — 다국어 분위기 값 → POSITIVE/NEGATIVE/NEUTRAL
- `GEMINI_VOICE_MAP` — 언어+성별 → Gemini TTS voice name

### Task 1.4: api/gemini.ts 스크립트 생성에 파서 통합

**파일**: `api/gemini.ts`

**수정 위치**: `case 'generateScript'` (약 line 266-321)

**변경 내용**:
1. 스크립트 생성 전에 수동 대본(`sourceContext`)에서 디렉티브를 미리 추출하지 않음
   → Gemini에게 원본 그대로 전달 (Gemini가 괄호를 보고 narration에서 자연스럽게 제외)
2. Gemini 응답의 각 씬에 대해 `parseDirectives(scene.narration)` 실행
3. 파싱 결과를 `scene.analysis.directives`에 저장
4. `scene.narration`을 `cleanNarration`으로 교체

**대안**: 프론트엔드(`App.tsx`)에서 파싱할 수도 있음
→ 서버에서 하면 모든 클라이언트에 일관적 적용, 프론트에서 하면 즉시 미리보기 가능
→ **추천: 프론트엔드에서 파싱** (API 변경 최소화, 디버그 패널과 자연스러운 연결)

**프론트엔드 파싱 방식 (추천)**:
- `App.tsx`의 `handleGenerateAdvanced()` 내에서 각 씬의 narration을 파싱
- 파싱 결과를 assetsRef에 저장
- 이미지 생성 시 directives를 scene 객체에 포함하여 전달
- **기존 `handleGenerate()` / `handleApproveScript()`는 수정하지 않는다**

### Task 1.5: prompts.ts 디렉티브 적용

**파일**: `services/prompts.ts`

**수정 함수**: `getFinalVisualPrompt()` (line 61-106)

**변경 내용**: 함수 시그니처에 `directives?: SceneDirectives` 추가

```typescript
export const getFinalVisualPrompt = (
  scene: any,
  hasCharacterRef: boolean = false,
  artStylePrompt?: string,
  suppressKorean?: boolean,
  directives?: SceneDirectives  // 신규
) => {
  // 기존 로직 유지하되, directives가 있으면 오버라이드:

  // 1. composition_type 오버라이드
  const compositionType = directives?.COMPOSITION || scene.analysis?.composition_type || 'STANDARD';

  // 2. sentiment 오버라이드
  const sentiment = directives?.MOOD || scene.analysis?.sentiment || 'NEUTRAL';

  // 3. 배경 추가
  // directives.BACKGROUND가 있으면 프롬프트에 "Setting/Background: {value}" 추가

  // 4. 스타일 오버라이드
  // directives.STYLE이 있으면 artStylePrompt 대신 사용

  // 5. 텍스트 오버라이드
  // directives.TEXT가 있으면 visual_keywords 대신 사용

  // 6. 카메라 추가
  // directives.CAMERA가 있으면 "Camera angle: {value}" 추가

  // 7. 색상 추가
  // directives.COLOR가 있으면 "Dominant color emphasis: {value}" 추가
}
```

### Task 1.6: api/gemini.ts 이미지 생성에 디렉티브 전달

**파일**: `api/gemini.ts`

**수정 위치**: `case 'generateImage'` (약 line 323-414)

**변경 내용**:
- params에서 `scene.analysis.directives` 읽기
- `getFinalVisualPrompt()` 호출 시 directives 전달

---

## Sprint 1.5: AI 대본 어시스턴트 (Smart Script Assistant)

### 개요
사용자가 대충 의도만 설명 + 간단 설정 선택 → AI가 디렉티브 포함된 완성 대본으로 자동 변환.
디렉티브 문법을 몰라도 고급 기능 사용 가능. 변환 결과는 편집 가능.

### Task 1.5.1: 간단 설정 UI

**파일**: `components/InputSection.tsx` (고급 대본 탭 내부)

**추가 UI 요소**:
```
형식 선택:   [🤖 알아서] [독백] [대화형] [나레이션]   — 라디오 (기본: 알아서)
화자 설정:   [🤖 알아서] [1명] [2명] [3명+]          — 라디오 (기본: 알아서)
분위기:      [🤖 알아서] [밝음] [긴장감] [차분]       — 라디오 (기본: 알아서)
씬 연결:     [🤖 알아서] [독립] [이어지게]            — 라디오 (기본: 알아서)
```

- 대본 입력란 상단에 배치
- 설정값은 `advancedSettings` state로 관리
- **모든 설정의 기본값이 "🤖 알아서"** → 아무것도 안 건드리면 AI가 전부 판단
- "알아서"인 항목은 Gemini 프롬프트에서 해당 설정을 생략 → AI 자율 판단

### Task 1.5.2: AI 변환 함수

**파일**: `services/geminiService.ts` (또는 별도 함수)

**신규 함수**:
```typescript
export const generateAdvancedScript = async (
  userIntent: string,        // 사용자가 대충 쓴 의도/대본
  settings: {
    format: 'auto' | 'monologue' | 'dialogue' | 'narration';      // 기본: 'auto'
    speakerCount: 'auto' | number;                                  // 기본: 'auto'
    mood: 'auto' | 'bright' | 'tense' | 'calm';                   // 기본: 'auto'
    sceneConnection: 'auto' | 'independent' | 'connected';         // 기본: 'auto'
    sceneCount?: 'auto' | number;                                   // 기본: 'auto'
  }
): Promise<string>  // 디렉티브 포함된 완성 대본 텍스트 반환
```

**Gemini 프롬프트 구성**:
- 시스템: 디렉티브 문법 가이드 + 형식/화자/분위기 설정 반영 지시
- 유저: 사용자가 입력한 의도/대본
- 출력: 디렉티브가 포함된 완성 대본 (plain text, 씬 구분은 마침표)

### Task 1.5.3: 변환 결과 편집 UI

**파일**: `components/InputSection.tsx`

**UX 흐름**:
1. 사용자가 의도 입력 + 설정 선택
2. `[✨ AI가 대본 완성해주기]` 버튼 클릭
3. 로딩 표시 → Gemini 응답 수신
4. 결과를 **기존 대본 입력란에 채워넣기** (편집 가능 상태)
5. 사용자 선택:
   - `[🎬 이대로 생성]` → 바로 생성 시작
   - `[✏️ 수정하고 생성]` → 수정 후 생성

**핵심**: 변환 결과가 표시된 후에는 기존 "직접 입력" 모드와 동일하게 동작.
디렉티브 파서가 이미 Sprint 1에서 구현되어 있으므로 자연스럽게 연결됨.

### Task 1.5.4: 크레딧 비용

- AI 변환 1회 = 스크립트 생성과 동일 (5크레딧)
- 사용자가 수정 후 재변환 요청 시 추가 5크레딧

---

## Sprint 2: 다중 음성

### Task 2.1: CharacterVoiceManager.tsx 신규 생성

**파일**: `components/CharacterVoiceManager.tsx`

**UI 구성**:
- 화자 목록 (이름, Voice ID, 색상, 성별)
- 화자 추가/삭제/편집
- Voice ID 선택 — 기존 ElevenLabs Voice Picker 재활용
- 미리듣기 버튼 (샘플 문장으로 해당 Voice ID 테스트)
- 프리셋: "남녀 대화", "뉴스 앵커+리포터", "나레이터+인터뷰이"

**데이터 저장**: localStorage `tubegen_character_voices` (JSON)
→ 프로젝트 저장 시 settings에도 포함

### Task 2.2: App.tsx 화자별 TTS 호출

**파일**: `App.tsx`

**수정 위치**: `runAudio()` 함수 (약 line 780-850)

**변경 내용**:
```typescript
// 각 씬의 TTS 생성 시:
const speakerDirective = assetsRef.current[i].analysis?.directives?.SPEAKER;
const characterVoices = JSON.parse(localStorage.getItem('tubegen_character_voices') || '[]');
const matchedVoice = speakerDirective
  ? characterVoices.find(v => v.name === speakerDirective)
  : null;

const elResult = await generateAudioWithElevenLabs(
  assetsRef.current[i].narration,
  undefined,
  matchedVoice?.voiceId,  // 화자별 Voice ID 전달!
  undefined,
  { speed: elSpeed, stability: elStability }
);

// 화자 정보 저장
if (matchedVoice) {
  updateAssetAt(i, {
    ...audioFields,
    speakerName: matchedVoice.name,
    speakerColor: matchedVoice.color,
  });
}
```

### Task 2.3: Gemini TTS 폴백 개선

**파일**: `api/gemini.ts`

**수정 위치**: `case 'generateAudio'` (약 line 416-429)

**변경 내용**:
- params에서 `language`, `gender` (또는 `speakerName`에서 추론) 받기
- `GEMINI_VOICE_MAP[language][gender]`로 음성 선택
- 기본값 유지: ko + female → 'Kore'

### Task 2.4: 화자별 자막 색상 렌더링

**파일**: `services/videoService.ts` (또는 `services/renderUtils.ts`)

**수정 위치**: subtitle 렌더링 함수

**변경 내용**:
- scene에 `speakerColor`가 있으면 자막 텍스트 색상으로 적용
- 자막 배경색은 유지 (가독성)
- SRT 출력 시 `[화자이름] 텍스트` 형태 태깅

---

## Sprint 3: 일관성 모드 (프롬프트 레벨)

### Task 3.1: 연결 디렉티브 처리

**파일**: `services/directiveParser.ts`

**추가 함수**:
```typescript
// 씬 배열에서 연결 디렉티브를 처리하여 프롬프트 간 배경 정보 전파
export function propagateSceneContext(scenes: ScriptScene[]): ScriptScene[]
```

**로직**:
- 각 씬을 순회하면서:
  - `KEEP_PREV` → 이전 씬의 visualPrompt에서 배경/장소 관련 문장 추출하여 현재 씬에 추가
  - `SAME_PLACE` → 이전 씬의 배경 설명만 복사
  - `TIME_PASS` → 이전 씬의 배경 + "different lighting, passage of time" 추가
- 이 처리는 스크립트 생성 완료 후, 이미지 생성 전에 실행

### Task 3.2: 렌더링 모드 UI

**파일**: `components/InputSection.tsx`

**추가 UI**:
- 이미지 생성 모드 선택 토글
- `⚡ 빠른 생성` (기본) / `🔗 일관성 모드`
- localStorage에 저장: `tubegen_render_mode`

### Task 3.3: 프롬프트 연결 적용

**파일**: `App.tsx`

**수정 위치**: `handleApproveScript()` (스크립트 승인 후, 이미지 생성 전)

**변경 내용**:
- 렌더링 모드가 '일관성'이거나 연결 디렉티브가 있는 경우:
  - `propagateSceneContext(scenes)` 호출
  - 결과를 assetsRef에 반영
- 이미지 생성은 여전히 병렬 (프롬프트에 배경 정보가 포함되어 있으므로)

---

## Sprint 4: 일관성 모드 (이미지 참조 레벨)

### Task 4.1: 순차 이미지 생성 로직

**파일**: `App.tsx` 또는 `services/imageService.ts`

**수정 위치**: `runImages()` 함수

**변경 내용**:
```
렌더링 모드가 'consistency'일 때:

1. 씬 그래프 생성:
   - KEEP_PREV/SAME_PLACE/TIME_PASS 디렉티브가 있는 씬 → 이전 씬에 의존
   - 의존 없는 씬 → 독립 (병렬 가능)

2. 의존 그래프 기반 실행:
   독립 씬들: Promise.all()로 병렬 생성
   의존 씬들: 이전 씬 완료 대기 → 이전 씬 이미지를 참조로 첨부하여 생성

3. 참조 이미지 전달:
   generateImageForScene()에 prevSceneImage 파라미터 추가
   api/gemini.ts에서 인라인 이미지로 포함
   강도: 60-80% (배경 유지, 내용은 변경)
```

### Task 4.2: imageService/geminiService 수정

**파일**: `services/geminiService.ts`

**변경 내용**:
- `generateImageForScene()` 파라미터에 `prevSceneImage?: string` 추가
- API 호출 시 참조 이미지 배열에 이전 씬 이미지 포함

**파일**: `api/gemini.ts`

**변경 내용**:
- `case 'generateImage'`에서 prevSceneImage 처리
- "Maintain the same background and environment as the reference image" 프롬프트 추가

### Task 4.3: 진행률 UI

**파일**: `components/ResultTable.tsx` (또는 `App.tsx`)

**추가 UI**:
- 일관성 모드 진행 상태 표시
- 각 씬: ✅ 완료 / 🔄 생성 중 / ⏳ 대기 / (독립 병렬 처리 중)
- 예상 남은 시간

---

## Sprint 5: 검증 시스템

### Task 5.1: DirectiveDebugPanel.tsx 신규 생성

**파일**: `components/DirectiveDebugPanel.tsx`

**UI 구성**:
- ResultTable 하단에 토글 패널
- 각 씬별:
  - 원본 나레이션 (디렉티브 포함)
  - 파싱된 디렉티브 목록 (아이콘 + 키:값)
  - 정제된 나레이션
  - 디렉티브 적용 전/후 visual prompt 비교
  - 화자 정보 (있는 경우)

### Task 5.2: 프롬프트 비교 뷰

**파일**: `components/ResultTable.tsx`

**추가 UI**:
- 각 씬의 이미지 옆에 "프롬프트 보기" 토글
- 디렉티브로 변경된 부분 하이라이트
- diff 스타일: 추가된 부분 초록, 오버라이드된 부분 노랑

---

## 테스트 시나리오

### 시나리오 1: 기본 디렉티브
```
입력: "투자자가 고민한다. (구도: 클로즈업)(분위기: 어두움)"
기대: MACRO 구도 + NEGATIVE 분위기 이미지
```

### 시나리오 2: 다중 음성 대화
```
화자 설정: 남자(Adam), 여자(Rachel)
입력:
  "오늘 시장 어때? (화자: 남자)"
  "좀 불안한 것 같아. (화자: 여자)"
기대: 씬1은 Adam 음성, 씬2는 Rachel 음성
```

### 시나리오 3: 일관성 모드
```
입력:
  "어두운 사무실에서 일하는 사람. (배경: 어두운 사무실)"
  "갑자기 전화가 울린다. (이전씬유지)"
  "밖으로 나간다. (시간경과)"
기대: 씬1,2 같은 배경, 씬3 같은 장소+다른 조명
```

### 시나리오 4: 디렉티브 없는 기존 대본
```
입력: "AI 기술이 발전하고 있다. 미래가 밝다."
기대: 기존과 100% 동일한 결과 (하위 호환성)
```

---

## 주의사항

1. **⚠️ 기존 모드 격리 (최우선 원칙)** — `⚡ 자동 대본` / `✏️ 수동 대본` 코드는 한 줄도 수정하지 않는다. 모든 V2.0 기능은 `🎬 고급 대본` 탭 전용.
2. **기존 함수 미수정** — `handleGenerate()`, `handleApproveScript()`는 건드리지 않고, `handleGenerateAdvanced()`, `handleApproveAdvancedScript()` 별도 생성
3. **ElevenLabs providedVoiceId** — 이미 파라미터가 존재하므로 elevenLabsService.ts 수정 불필요
4. **비용 변화 없음** — 디렉티브 파싱은 프론트엔드, API 호출 횟수 변화 없음
5. **DB 스키마 변경 불필요** — characterVoices는 기존 settings JSON 필드에 포함
6. **프론트엔드 파싱** — API 서버 변경 최소화, 디버그 패널과 자연스러운 연결
7. **각 Sprint 완료 시 기존 모드 무결성 검증** — 자동/수동 대본이 여전히 100% 동일하게 동작하는지 반드시 확인
