# C2GEN Engine V2.0 — 고도화 기획서

> **프로젝트명**: C2GEN Engine V2.0 "Director's Cut"
> **작성일**: 2026-03-09
> **작성자**: AI 기획 리드
> **상태**: 기획 완료 → 개발 대기

---

## 1. 배경 및 목표

### 현재 한계
C2GEN V9.2는 **1인 독백 정보 전달형 컨텐츠**에 최적화되어 있다. 사용자가 세밀한 연출을 제어할 수단이 없고, 씬 간 시각적 일관성이 보장되지 않으며, 다중 화자(대화형) 컨텐츠를 만들 수 없다.

### V2.0 핵심 전략: "고급 대본" 탭 신설

기존 `⚡ 자동 대본` / `✏️ 수동 대본` 모드는 **코드 변경 없이 100% 유지**하고, 새로운 `🎬 고급 대본` 탭을 추가하여 모든 V2.0 기능을 격리한다.

```
┌──────────┐  ┌──────────┐  ┌──────────────┐
│ ⚡ 자동   │  │ ✏️ 수동   │  │ 🎬 고급 대본  │
│  대본     │  │  대본     │  │  (V2.0 신규) │
└──────────┘  └──────────┘  └──────────────┘
  키워드 입력    대본 입력      대본 입력
  AI가 생성     그대로 사용     + 디렉티브 문법
  (기존 유지)   (기존 유지)     + 화자 설정
                              + 일관성 모드
                              + 검증 패널
```

**이렇게 하는 이유**:
- 기존 사용자 플로우에 영향 0% (하위 호환성 완벽 보장)
- 새 기능 버그가 기존 모드에 전파되지 않음
- 고급 대본 탭 미진입 시 추가 코드 로딩 없음 (lazy load)
- A/B 테스트 용이 (기존 모드 vs 고급 모드 비교)

### V2.0 목표
1. **"고급 대본" 탭 신설** — 기존 모드 격리, 새 기능 전용 진입점
2. **디렉티브 시스템** — 괄호 문법으로 연출을 세밀하게 제어
3. **다중 음성(Multi-Voice)** — 씬별 화자 지정, 대화형 컨텐츠 지원
4. **일관성 모드** — 씬 간 시각적 연결성 보장 (순차 렌더링)
5. **검증 시스템** — 디렉티브 파싱/적용 과정의 투명한 시각화

---

## 2. 핵심 기능 설계

### 2.0 "고급 대본" 탭 UI 구조

#### InputSection.tsx 탭 추가

기존 탭 구조에 3번째 탭을 추가한다.

```typescript
type ScriptMode = 'auto' | 'manual' | 'advanced';  // 'advanced' 신규
```

#### "고급 대본" 탭 내 UI 구성

```
┌─────────────────────────────────────────────────────┐
│  🎬 고급 대본                                        │
│                                                     │
│  ┌─ 화자 설정 ────────────────────────────────────┐ │
│  │  🔵 남자: Adam (ElevenLabs)  [변경] [미리듣기]  │ │
│  │  🔴 여자: Rachel (ElevenLabs) [변경] [미리듣기] │ │
│  │  [+ 화자 추가]                                  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ 대본 입력 ────────────────────────────────────┐ │
│  │  오늘 시장 어떻게 될 것 같아? (화자: 남자)       │ │
│  │  좀 불안한 것 같은데. (화자: 여자)(분위기: 어둡)  │ │
│  │  시장 데이터를 살펴봅시다. (구도: NO_CHAR)       │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ 옵션 ─────────────────────────────────────────┐ │
│  │  이미지 모드: ⚡ 빠른 생성 / 🔗 일관성 모드      │ │
│  │  검증 패널: [ON/OFF]                            │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  [📖 디렉티브 가이드]  ← 사용 가능한 문법 도움말     │
│                                                     │
│  [🎬 생성 시작]                                      │
└─────────────────────────────────────────────────────┘
```

#### 고급 대본 전용 생성 플로우

```
[고급 대본 입력]
     ↓
[directiveParser] 괄호 디렉티브 추출 + 나레이션 정제
     ↓
[geminiService] 스크립트 생성 (정제된 나레이션 사용)
     ↓
[propagateSceneContext] 연결 디렉티브 처리 (일관성 모드 시)
     ↓
[prompts.ts] 디렉티브 오버라이드 적용
     ↓
[이미지 생성] 빠른 모드(병렬) 또는 일관성 모드(하이브리드)
[TTS 생성] 화자별 Voice ID 매핑 (다중 음성)
[BGM 자동] (기존과 동일)
     ↓
[검증 패널 표시] (활성화 시)
     ↓
[videoService] 영상 렌더링 (화자별 자막 색상)
```

**핵심**: 기존 자동/수동 대본의 `handleGenerate()` → `handleApproveScript()` 플로우와 **별도 함수**로 구현.
예: `handleGenerateAdvanced()` → `handleApproveAdvancedScript()`

이렇게 하면 기존 코드에 if/else 분기를 넣을 필요 없이, 완전히 독립적인 플로우가 된다.

---

### 2.0.1 AI 대본 어시스턴트 (Smart Script Assistant)

#### 개요
고급 대본 탭의 **진입 장벽을 낮추기 위해**, 사용자가 대충 의도만 설명하고 몇 가지 옵션만 선택하면 AI가 **디렉티브가 포함된 완성 대본**으로 자동 변환해주는 기능.

#### 왜 필요한가
- 디렉티브 문법을 모르는 사용자도 고급 기능을 바로 사용 가능
- "대화형 컨텐츠 만들고 싶은데 어떻게 써야 하지?" → **AI가 대신 써줌**
- 변환 결과를 편집할 수 있어서 디렉티브 문법을 자연스럽게 학습

#### 사용자 입력 (간단하게)

**1. 대충 쓴 대본/의도 설명** (자유 텍스트)
```
주식 시장이 폭락했는데 한 투자자가 동료랑 대화하면서 대응 방법을 고민하는 내용으로 만들어줘
```

**2. 간단 설정 (선택형, 몇 개만)**

| 설정 | 선택지 | 기본값 |
|------|--------|--------|
| 형식 | **🤖 알아서** / 독백 / 대화형 / 나레이션 | 🤖 알아서 |
| 화자 수 | **🤖 알아서** / 1명 / 2명 / 3명+ | 🤖 알아서 |
| 분위기 | **🤖 알아서** / 밝음 / 긴장감 / 차분 | 🤖 알아서 |
| 씬 연결 | **🤖 알아서** / 독립 / 이어지게 | 🤖 알아서 |
| 씬 수 | **🤖 알아서** / 5~15 슬라이더 | 🤖 알아서 |

**"🤖 알아서" = 모든 설정의 기본값**
→ 사용자가 아무것도 안 건드리면 AI가 대본 내용을 분석해서 전부 자동 판단
→ 특정 항목만 지정하고 나머지는 "알아서"로 두는 것도 가능
→ 예: 형식만 "대화형"으로 지정, 나머지 전부 AI 판단

#### AI 변환 흐름

```
[사용자 의도 + 간단 설정]
        ↓
[Gemini API 호출]
  시스템 프롬프트: "다음 의도를 기반으로 디렉티브가 포함된 대본을 생성하세요.
  형식: 대화형, 화자: 남자/여자, 분위기: 긴장감, 씬 연결: 이어지게

  디렉티브 문법:
  - (화자: 이름) — 해당 씬의 화자 지정
  - (배경: 설명) — 배경 장면
  - (분위기: 밝음/어두움/중립) — 이미지 톤
  - (구도: 클로즈업/미디엄/와이드/캐릭터없음) — 카메라 구도
  - (이전씬유지) — 이전 씬과 같은 배경 유지
  - (텍스트: 표시할 내용) — 이미지 내 텍스트

  각 문장이 1개 씬이 됩니다. 마침표로 구분하세요."
        ↓
[변환된 대본 표시 (편집 가능)]

  오늘 시장 분위기가 심상치 않은데. (화자: 남자)(배경: 어두운 트레이딩룸)(분위기: 어두움)
  맞아, KOSPI가 벌써 3% 빠졌어. (화자: 여자)(이전씬유지)(텍스트: "KOSPI -3.2%")
  이럴 때는 현금 비중을 높여야 해. (화자: 남자)(이전씬유지)(구도: 클로즈업)
  그런데 바닥 잡으려는 사람들도 많잖아. (화자: 여자)(이전씬유지)
  데이터를 보면 아직 저점이 아닐 수 있어. (화자: 남자)(구도: 캐릭터없음)(텍스트: "KOSPI 하락 추이 그래프")
  일단 관망하면서 기회를 노리자. (화자: 여자)(배경: 밝은 사무실)(분위기: 중립)(시간경과)

        ↓
[사용자 선택]
  [🎬 이대로 생성]  — 변환된 대본 그대로 사용
  [✏️ 수정하고 생성] — 사용자가 편집 후 생성
```

#### UX 핵심 원칙

1. **수정 가능** — AI가 만들어준 대본은 항상 편집할 수 있어야 함 (사용자 최종 통제권)
2. **학습 효과** — AI가 만들어준 디렉티브를 보면서 문법을 자연스럽게 배움
3. **점진적 숙련** — 처음엔 AI 어시스턴트 의존 → 익숙해지면 직접 디렉티브 작성
4. **폴백** — AI 변환 실패 시 단순 수동 대본 모드로 동작 (디렉티브 없이)

#### 구현 위치

- **Gemini API 호출**: 기존 `generateScript()` 변형 → `generateAdvancedScript()` 별도 함수
- **UI**: 고급 대본 탭 상단에 "AI 어시스턴트" 영역 + 변환 결과 편집 영역
- **Sprint**: Sprint 1 (디렉티브 파서) 이후, Sprint 2 (다중 음성) 이전 — **Sprint 1.5**로 삽입

---

### 2.1 디렉티브 시스템 (Bracket Directive System)

#### 개요
**고급 대본** 탭에서 **괄호 `()` 안에 자연어 지시**를 넣으면, C2GEN 엔진이 파싱하여 이미지/음성/자막 생성에 반영한다. ElevenLabs TTS가 괄호 안 텍스트를 자동 스킵하는 특성을 활용한다.

#### 지원 디렉티브

| 디렉티브 | 설명 | 예시 |
|---------|------|------|
| `(구도: 클로즈업)` | 구도 강제 지정 | MICRO / STANDARD / MACRO / NO_CHAR |
| `(분위기: 어두움)` | 이미지 톤 지정 | 밝음 / 어두움 / 중립 |
| `(배경: 어두운 사무실)` | 배경 장면 지정 | 자유 텍스트 |
| `(스타일: 사이버펑크)` | 화풍 오버라이드 | 스타일 ID 또는 자유 텍스트 |
| `(텍스트: "삼성 +50%")` | 이미지 내 텍스트 강제 | 자유 텍스트 |
| `(카메라: 위에서 내려다봄)` | 카메라 앵글 지정 | 자유 텍스트 |
| `(색상: 빨강 강조)` | 지배적 색상 지정 | 자유 텍스트 |
| `(화자: 여자)` | 해당 씬 음성 화자 지정 | 화자 이름/성별 |
| `(이전씬유지)` | 이전 씬 배경/분위기 연결 | 플래그 (값 없음) |
| `(같은장소)` | 이전 씬 배경만 유지 | 플래그 (값 없음) |
| `(시간경과)` | 같은 장소 + 조명 변화 | 플래그 (값 없음) |

#### 사용 예시

```
어두운 사무실에서 투자자가 모니터를 바라본다. (배경: 어두운 사무실, 모니터 빛)(구도: STANDARD)(화자: 남자)

투자자의 표정이 점점 굳어진다. (이전씬유지)(구도: 클로즈업)(화자: 남자)

옆에서 동료가 말한다. "이건 좀 위험할 수 있어." (이전씬유지)(화자: 여자)

갑자기 주가가 폭락한다. (이전씬유지)(텍스트: "KOSPI -8.5%")(색상: 파랑 강조)
```

#### 파싱 규칙

1. **패턴**: `(키: 값)` 또는 `(플래그)` 형태
2. **추출 위치**: 스크립트 생성 단계 (`api/gemini.ts` generateScript action)
3. **저장 위치**: `scene.analysis.directives` 필드 (신규)
4. **적용 위치**: `prompts.ts` → `getFinalVisualPrompt()` 에서 오버라이드
5. **나레이션에서 제거**: 파싱 후 괄호 텍스트는 나레이션에서 strip

#### 파싱 흐름

```
사용자 입력: "주가가 폭락한다. (색상: 파랑)(텍스트: KOSPI -8.5%)"
                    ↓
[1] 디렉티브 추출: { 색상: "파랑", 텍스트: "KOSPI -8.5%" }
[2] 나레이션 정제: "주가가 폭락한다."
[3] Gemini 스크립트 생성: visualPrompt + analysis 생성
[4] directives 병합: scene.analysis.directives = { 색상: "파랑", 텍스트: "KOSPI -8.5%" }
                    ↓
[5] getFinalVisualPrompt()에서 directives 적용:
    - 색상 → "Dominant color: blue emphasis"
    - 텍스트 → visual_keywords 오버라이드
                    ↓
[6] 최종 이미지 프롬프트 → Gemini Image API
```

#### 다국어 디렉티브 키 매핑

| 한국어 | English | 日本語 | 내부 키 |
|--------|---------|--------|---------|
| 구도 | composition | 構図 | COMPOSITION |
| 분위기 | mood | 雰囲気 | MOOD |
| 배경 | background | 背景 | BACKGROUND |
| 스타일 | style | スタイル | STYLE |
| 텍스트 | text | テキスト | TEXT |
| 카메라 | camera | カメラ | CAMERA |
| 색상 | color | 色 | COLOR |
| 화자 | speaker | 話者 | SPEAKER |
| 이전씬유지 | keep-prev | 前シーン維持 | KEEP_PREV |
| 같은장소 | same-place | 同じ場所 | SAME_PLACE |
| 시간경과 | time-pass | 時間経過 | TIME_PASS |

---

### 2.2 다중 음성 시스템 (Multi-Voice)

#### 개요
씬별로 다른 화자의 음성을 지정하여 대화형 컨텐츠를 생성한다.

#### 아키텍처

```
[프로젝트 설정]
  characterVoices: [
    { name: "남자", voiceId: "pNInz6obpgDQGcFmaJgB", color: "#4A90D9" },
    { name: "여자", voiceId: "21m00Tcm4TlvDq8ikWAM", color: "#E85D75" },
    { name: "나레이터", voiceId: "ErXwobaYiN019PkySvjV", color: "#7B8794" }
  ]
        ↓
[디렉티브 파싱]
  "(화자: 남자)" → characterVoices에서 voiceId 매칭
        ↓
[TTS 생성]
  generateAudioWithElevenLabs(narration, undefined, matchedVoiceId)
  // 기존 providedVoiceId 파라미터 활용!
```

#### 구현 단계

**Phase 1: 수동 화자 지정** (MVP)
- 설정에서 화자 2~5명 등록 (이름 + Voice ID)
- 대본에서 `(화자: 이름)` 디렉티브로 지정
- 디렉티브 없는 씬은 기본 Voice ID 사용

**Phase 2: 자동 화자 감지**
- Gemini가 스크립트 생성 시 화자 자동 태깅
- 대본에 "남자:", "여자:" 같은 패턴 감지
- 감지된 화자를 characterVoices에 자동 매핑

**Phase 3: Voice Preview & Library**
- 화자 등록 시 샘플 문장으로 미리듣기
- ElevenLabs Voice Library 검색/선택 통합
- 자주 쓰는 화자 조합을 프리셋으로 저장

#### 자막 색상 분리
- 화자별 자막 색상 지정 가능 (characterVoices.color)
- 영상 렌더링 시 화자별 자막 색상 자동 적용
- SRT 출력 시 화자 태그 포함

#### TTS 흐름 변경

```typescript
// 현재 (App.tsx:800-803)
const elResult = await generateAudioWithElevenLabs(
  narration, undefined, undefined, undefined, { speed, stability }
);

// 변경 후
const speakerDirective = scene.analysis?.directives?.SPEAKER;
const voiceId = speakerDirective
  ? characterVoices.find(v => v.name === speakerDirective)?.voiceId
  : defaultVoiceId;
const elResult = await generateAudioWithElevenLabs(
  narration, undefined, voiceId, undefined, { speed, stability }
);
```

#### Gemini TTS 폴백 개선
현재 Gemini TTS는 'Kore'(한국어 여성) 하드코딩이므로, 언어 + 화자 성별에 따라 음성을 라우팅:

| 언어 | 남성 | 여성 |
|-----|------|------|
| ko  | Charon | Kore |
| en  | Fenrir | Aoede |
| ja  | Charon | Kore |

---

### 2.3 일관성 모드 (Consistency Mode)

#### 개요
씬 간 시각적 연결성을 보장하기 위해 두 가지 렌더링 모드를 제공한다.

#### 옵션 UI

```
🎨 이미지 생성 모드
  ⚡ 빠른 생성 (기본) — 병렬 생성, 씬 독립, 속도 우선
  🔗 일관성 모드 — 순차 생성, 이전 씬 참조, 품질 우선
```

#### 레벨 1: 프롬프트 연결 (빠른 생성 + 일관성 향상)

병렬 생성을 유지하면서, 스크립트 생성 단계에서 프롬프트 간 연결성을 확보한다.

```
[스크립트 생성 단계 — 순차 (원래도 순차)]
  Gemini가 씬 분할할 때:
    - (이전씬유지) 디렉티브 감지
    - 씬1의 배경 설명을 씬2 visual prompt에 포함
    - 씬1의 배경 설명을 씬3 visual prompt에도 포함

[이미지 생성 단계 — 병렬 유지]
  씬1: "dark office with monitor light, investor looking at screen"
  씬2: "dark office with monitor light, close-up of worried face"
  씬3: "dark office with monitor light, red graph on screen"
  → 동시에 생성해도 배경 일관성 확보
```

**장점**: 속도 손해 없음, 기존 파이프라인 유지
**한계**: 100% 일관성은 아님 (같은 프롬프트라도 Gemini가 다르게 그릴 수 있음)

#### 레벨 2: 이미지 참조 순차 생성 (일관성 모드)

이전 씬의 생성된 이미지를 다음 씬의 참조로 전달한다.

```
씬1 생성 요청 → Gemini → 이미지1 반환
                              ↓ C2GEN이 이미지1을 받아서
씬2 생성 요청 + 이미지1 참조 첨부 → Gemini → 이미지2 반환
                                                ↓ C2GEN이 이미지2를 받아서
씬3 생성 요청 + 이미지2 참조 첨부 → Gemini → 이미지3 반환
```

**구현 세부사항**:
- `(이전씬유지)` / `(같은장소)` 디렉티브가 있는 씬만 순차 처리
- 디렉티브 없는 씬은 병렬 처리 유지 (하이브리드)
- 참조 이미지 강도: 60~80% (배경 유지, 내용은 변경)
- 진행률 표시: "씬 3/7 생성 중... (일관성 모드)"

**하이브리드 예시**:
```
씬1: (독립) ──────→ 병렬 생성
씬2: (이전씬유지) ──→ 씬1 완료 대기 → 순차 생성
씬3: (이전씬유지) ──→ 씬2 완료 대기 → 순차 생성
씬4: (독립) ──────→ 병렬 생성 (씬1과 동시 시작 가능)
씬5: (같은장소) ───→ 씬4 완료 대기 → 순차 생성
```

#### 비용 영향
- 레벨 1: 추가 비용 없음
- 레벨 2: 참조 이미지 전송으로 입력 토큰 ~258토큰/씬 추가 (무시할 수준)

---

### 2.4 검증/디버그 시스템

#### 개요
디렉티브가 제대로 파싱되고 적용되었는지 사용자가 확인할 수 있는 투명한 시각화를 제공한다.

#### 디렉티브 파싱 로그 (ResultTable 하단)

```
씬 1 ✅ 파싱 완료
  나레이션: "어두운 사무실에서 투자자가 모니터를 바라본다."
  디렉티브:
    📐 구도: STANDARD (원본 유지)
    🎨 분위기: 어두움 → "Dark, cold lighting"
    🏞️ 배경: "어두운 사무실, 모니터 빛" → prompt에 반영
    🎙️ 화자: 남자 → Voice ID: pNInz6obpgDQGcFmaJgB
```

#### 프롬프트 비교 뷰 (토글)

```
[원본 프롬프트]     vs     [디렉티브 적용 후]
"A person looking        "A person looking at screen,
 at screen"               60-80% close-up,           ← 구도 반영
                          dark office with monitor    ← 배경 반영
                          light, dark cold lighting"  ← 분위기 반영
```

#### 일관성 모드 진행 상태

```
🔗 일관성 모드 진행 중
  씬 1: ✅ 생성 완료
  씬 2: 🔄 생성 중... (씬 1 이미지 참조 중)
    📎 참조: 씬 1 이미지 첨부됨 (강도: 70%)
  씬 3: ⏳ 대기 중 (씬 2 완료 후 시작)
  씬 4: ✅ 생성 완료 (독립 — 병렬 처리)
```

---

## 3. 데이터 구조 변경

### types.ts 변경사항

```typescript
// 신규: 디렉티브 타입
export interface SceneDirectives {
  COMPOSITION?: 'MICRO' | 'STANDARD' | 'MACRO' | 'NO_CHAR';
  MOOD?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  BACKGROUND?: string;
  STYLE?: string;
  TEXT?: string;
  CAMERA?: string;
  COLOR?: string;
  SPEAKER?: string;
  KEEP_PREV?: boolean;
  SAME_PLACE?: boolean;
  TIME_PASS?: boolean;
}

// 신규: 화자 음성 매핑
export interface CharacterVoice {
  name: string;
  voiceId: string;
  color: string;        // 자막 색상
  gender?: 'male' | 'female';
  previewText?: string; // 미리듣기용 샘플 텍스트
}

// 기존 SceneAnalysis 확장
export interface SceneAnalysis {
  composition_type: 'MICRO' | 'STANDARD' | 'MACRO' | 'NO_CHAR';
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  directives?: SceneDirectives;  // 신규
}

// 기존 GeneratedAsset 확장
export interface GeneratedAsset {
  // ... 기존 필드 유지
  speakerName?: string;   // 신규: 화자 이름
  speakerColor?: string;  // 신규: 자막 색상
}

// 기존 ProjectSettings 확장 (또는 신규)
export interface ProjectSettings {
  imageModel: string;
  elevenLabsModel?: string;
  renderMode?: 'parallel' | 'consistency';  // 신규
  characterVoices?: CharacterVoice[];       // 신규
}
```

### config.ts 추가사항

```typescript
// 디렉티브 키 매핑 (다국어)
export const DIRECTIVE_KEY_MAP: Record<string, string> = {
  // 한국어
  '구도': 'COMPOSITION', '분위기': 'MOOD', '배경': 'BACKGROUND',
  '스타일': 'STYLE', '텍스트': 'TEXT', '카메라': 'CAMERA',
  '색상': 'COLOR', '화자': 'SPEAKER',
  '이전씬유지': 'KEEP_PREV', '같은장소': 'SAME_PLACE', '시간경과': 'TIME_PASS',
  // English
  'composition': 'COMPOSITION', 'mood': 'MOOD', 'background': 'BACKGROUND',
  'style': 'STYLE', 'text': 'TEXT', 'camera': 'CAMERA',
  'color': 'COLOR', 'speaker': 'SPEAKER',
  'keep-prev': 'KEEP_PREV', 'same-place': 'SAME_PLACE', 'time-pass': 'TIME_PASS',
  // 日本語
  '構図': 'COMPOSITION', '雰囲気': 'MOOD', '背景': 'BACKGROUND',
  'スタイル': 'STYLE', 'テキスト': 'TEXT', 'カメラ': 'CAMERA',
  '色': 'COLOR', '話者': 'SPEAKER',
  '前シーン維持': 'KEEP_PREV', '同じ場所': 'SAME_PLACE', '時間経過': 'TIME_PASS',
};

// 구도 값 매핑 (다국어)
export const COMPOSITION_VALUE_MAP: Record<string, string> = {
  '클로즈업': 'MACRO', 'close-up': 'MACRO', 'クローズアップ': 'MACRO',
  '미디엄샷': 'STANDARD', 'medium': 'STANDARD', 'ミディアム': 'STANDARD',
  '와이드샷': 'MICRO', 'wide': 'MICRO', 'ワイド': 'MICRO',
  '캐릭터없음': 'NO_CHAR', 'no-char': 'NO_CHAR', 'キャラなし': 'NO_CHAR',
};

// 분위기 값 매핑
export const MOOD_VALUE_MAP: Record<string, string> = {
  '밝음': 'POSITIVE', 'bright': 'POSITIVE', '明るい': 'POSITIVE',
  '어두움': 'NEGATIVE', 'dark': 'NEGATIVE', '暗い': 'NEGATIVE',
  '중립': 'NEUTRAL', 'neutral': 'NEUTRAL', '中立': 'NEUTRAL',
};

// Gemini TTS 음성 매핑 (폴백용)
export const GEMINI_VOICE_MAP: Record<string, Record<string, string>> = {
  ko: { male: 'Charon', female: 'Kore' },
  en: { male: 'Fenrir', female: 'Aoede' },
  ja: { male: 'Charon', female: 'Kore' },
};
```

---

## 4. 파일별 수정 범위

### 신규 파일

| 파일 | 설명 |
|------|------|
| `services/directiveParser.ts` | 디렉티브 파싱 엔진 (추출, 정규화, 검증) |
| `components/DirectiveDebugPanel.tsx` | 디렉티브 파싱 결과 시각화 UI |
| `components/CharacterVoiceManager.tsx` | 화자 음성 등록/관리 UI |

### 수정 파일

| 파일 | 수정 내용 | 난이도 | 기존 모드 영향 |
|------|----------|--------|---------------|
| `types.ts` | SceneDirectives, CharacterVoice, ScriptMode 타입 추가 | ★☆☆ | 없음 (타입 추가만) |
| `config.ts` | 디렉티브 매핑, Gemini 음성 매핑 추가 | ★☆☆ | 없음 (상수 추가만) |
| `services/prompts.ts` | `getFinalVisualPrompt()`에 선택적 directives 파라미터 | ★★☆ | 없음 (optional param) |
| `api/gemini.ts` | Gemini TTS 언어별 음성 라우팅 | ★★☆ | 개선 (폴백 음성 다양화) |
| `services/geminiService.ts` | 일관성 모드 순차 생성 로직 (고급 전용) | ★★★ | 없음 (별도 함수) |
| `services/imageService.ts` | 일관성 모드 이미지 참조 전달 (고급 전용) | ★★☆ | 없음 (별도 함수) |
| `App.tsx` | `handleGenerateAdvanced()` 별도 함수 추가 | ★★★ | **없음 (기존 함수 미수정)** |
| `services/elevenLabsService.ts` | (변경 없음 — providedVoiceId 이미 존재) | — | 없음 |
| `services/videoService.ts` | 화자별 자막 색상 렌더링 (speakerColor 있을 때만) | ★★☆ | 없음 (조건부) |
| `components/InputSection.tsx` | 3번째 탭 `🎬 고급 대본` UI 추가 | ★★☆ | **없음 (탭 추가만)** |
| `components/ResultTable.tsx` | 디렉티브 디버그 패널 (고급 모드일 때만 표시) | ★★☆ | 없음 (조건부) |

---

## 5. 구현 순서 (우선순위)

### Sprint 0: "고급 대본" 탭 껍데기 (최우선)
1. `InputSection.tsx`에 3번째 탭 `🎬 고급 대본` 추가
2. `ScriptMode` 타입에 `'advanced'` 추가
3. 고급 대본 탭 기본 UI (대본 입력란 + 화자 설정 영역 + 옵션 영역)
4. `App.tsx`에 `handleGenerateAdvanced()` 별도 함수 생성 (초기에는 기존 수동 대본과 동일 동작)
5. 기존 자동/수동 대본 코드 **변경 없음** 확인

**검증**: 기존 자동/수동 대본이 100% 동일하게 동작하는지 확인
**검증**: 고급 대본 탭에서 디렉티브 없는 대본 입력 → 수동 대본과 동일 결과

### Sprint 1: 디렉티브 파서 + 기본 적용 (핵심 기반)
1. `directiveParser.ts` 구현 — 괄호 패턴 파싱, 다국어 키 매핑
2. `types.ts` 타입 추가
3. `config.ts` 매핑 테이블 추가
4. `handleGenerateAdvanced()`에 파서 통합
5. `prompts.ts` getFinalVisualPrompt() 디렉티브 오버라이드

**검증**: 디렉티브가 있는 대본 vs 없는 대본 → visual prompt 비교
**검증**: 기존 자동/수동 대본 영향 없음 재확인

### Sprint 2: 다중 음성 (가장 임팩트 큰 기능)
1. `CharacterVoiceManager.tsx` UI 구현 (고급 대본 탭 내부)
2. `handleGenerateAdvanced()` 내 씬별 화자 Voice ID 매핑 + TTS 호출
3. `api/gemini.ts` Gemini TTS 폴백 언어/성별 라우팅
4. `videoService.ts` 화자별 자막 색상

**검증**: 남녀 대화 대본 → 서로 다른 음성 출력 확인

### Sprint 3: 일관성 모드 (프롬프트 레벨)
1. `(이전씬유지)` 등 연결 디렉티브 파싱
2. 스크립트 생성 시 이전 씬 배경 설명 전파
3. 고급 대본 탭 내 렌더링 모드 선택 UI
4. 레벨 1 (프롬프트 연결) 구현

**검증**: 같은 대본 → 빠른 생성 vs 일관성 모드 이미지 비교

### Sprint 4: 일관성 모드 (이미지 참조 레벨)
1. 순차 렌더링 로직 (이미지 완료 → 다음 씬에 참조 전달)
2. 하이브리드 병렬/순차 스케줄링
3. 진행률 UI
4. 레벨 2 (이미지 참조) 구현

**검증**: 연결 디렉티브 씬들의 배경/색감 일관성 비교

### Sprint 5: 검증 시스템 + 폴리싱
1. `DirectiveDebugPanel.tsx` 구현 (고급 대본 전용)
2. 프롬프트 비교 뷰
3. 일관성 모드 진행 상태 UI
4. 디렉티브 가이드 도움말 모달
5. A/B 테스트 모드 (선택적)

---

## 6. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Gemini가 디렉티브를 프롬프트에 반영 안 함 | 이미지 품질 | 디렉티브를 영어로 변환 후 프롬프트 최상단에 배치 |
| 순차 렌더링 속도 저하 | UX | 하이브리드 방식으로 필요한 씬만 순차 처리 |
| ElevenLabs Rate Limit (다중 Voice ID) | TTS 실패 | 기존 재시도 로직 + Gemini 폴백 유지 |
| 디렉티브 오타/잘못된 값 | 파싱 실패 | 알 수 없는 키는 무시 + 디버그 패널에서 경고 표시 |
| DB 스키마 변경 필요 | 마이그레이션 | characterVoices는 기존 settings JSON에 포함 (스키마 변경 불필요) |

---

## 7. 비용 영향

| 항목 | 현재 | V2.0 예상 | 비고 |
|------|------|----------|------|
| 스크립트 생성 | 5크레딧 | 5크레딧 | 변경 없음 (디렉티브 파싱은 프론트엔드) |
| 이미지 (빠른 생성) | 16크레딧/장 | 16크레딧/장 | 변경 없음 |
| 이미지 (일관성 모드) | — | 16크레딧/장 | 참조 이미지 토큰 추가분 무시 가능 |
| TTS (다중 음성) | 15크레딧/1000자 | 15크레딧/1000자 | Voice ID만 다를 뿐 비용 동일 |

**결론**: V2.0은 사용자 비용 증가 없이 기능 향상 가능

---

## 8. 성공 지표

1. **대화형 컨텐츠 생성 성공률** — 2인 대화 대본 → 서로 다른 음성 출력 100%
2. **디렉티브 파싱 정확도** — 올바른 형식의 디렉티브 99% 이상 인식
3. **씬 간 일관성 체감** — 일관성 모드에서 같은 배경 유지율 80% 이상
4. **속도 유지** — 빠른 생성 모드에서 현재 대비 속도 저하 0%
5. **사용자 만족도** — 디렉티브 사용 시 "원하는 결과에 가까움" 평가 향상
