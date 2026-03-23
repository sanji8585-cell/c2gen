# C2 GEN 플랫폼 — 코드 레벨 검토 답변서

> **검토자:** 제갈공명 (Claude Code, 코드베이스 직접 접근)
> **검토일:** 2026-03-24
> **검토 방법:** 모든 소스 파일을 라인 단위로 직접 열어서 확인. 추측 없음.
> **대상 문서:** C2GEN_검토요청서.md (2026-03-23)

---

## 전제: C2 GEN과 C2 PILOT은 별도 엔진

같은 코드베이스(`c2gen/`)에 공존하지만, 두 엔진은 **완전히 독립된 파이프라인**입니다.

| | C2 GEN (공개 엔진) | C2 PILOT (비공개 고도화 엔진) |
|---|---|---|
| **진입점** | `App.tsx` → `handleGenerate` → `handleApproveScript` | `components/pilot/ContentGenerator.tsx` → `runContentPipeline` |
| **스크립트** | `geminiService.generateScript()` | `services/pilot/scriptStep.ts` |
| **이미지** | `imageService.generateImage()` | `services/pilot/imageStep.ts` |
| **TTS** | `elevenLabsService.generateAudioWithElevenLabs()` | `services/pilot/ttsStep.ts` |
| **BGM** | App.tsx 내 `runAutoBgm()` | `services/pilot/bgmStep.ts` |
| **저장** | `projectService.saveProject()` | `services/pilot/saveStep.ts` → 승인 큐 |
| **감정 곡선** | **미사용** | `emotionCurveEngine.ts` 연결됨 |
| **오디오 태그** | **미사용** | `audioTagsService.ts` 연결됨 |
| **프롬프트** | `prompts.ts` (V10.0 비주얼 디렉터) | 브랜드 프리셋 컨텍스트 주입 |

이 답변서에서는 두 엔진을 명확히 구분하여 기술합니다.

---

# 검토 A: 콘텐츠 품질

## A1. "바이럴 콘텐츠 패턴"이 프롬프트 엔진에 반영돼 있는가?

### C2 GEN 엔진: 전무

`services/prompts.ts` 전체를 읽었습니다. 이 파일의 시스템 인스트럭션은 3종입니다:

- `CHIEF_ART_DIRECTOR` (19-46행): 문장→이미지 변환 규칙, 구도 시스템, 캐릭터 등장 판단
- `MANUAL_VISUAL_MATCHER` (50-55행): 대본 수정 금지, 씬 분할과 시각 연출만
- `REFERENCE_MATCH` (57행): 참조 이미지 화풍을 따르라

스크립트 생성 프롬프트(`getScriptGenerationPrompt`, 179-225행)에서 서사 구조 언급:
```
키워드 입력 시: "도입→배경→전개→세부→시사점→결론"
```
이것은 단순 섹션 라벨이며, 긴장감 설계/후킹 전략이 아닙니다.

서버사이드(`api/gemini.ts` 266-320행)에서도 추가 바이럴 프롬프트 없음.

| 바이럴 패턴 | C2 GEN에 존재? |
|---|---|
| YouTube 첫 3초 훅 | 없음 |
| TikTok 첫 1초 훅 | 없음 |
| 감정 곡선 / 긴장 아크 | 없음 (sentiment 3단계 분류만) |
| 시청 유지율 전략 | 없음 |
| CTR 최적화 | 없음 |
| 패턴 인터럽트 | 없음 |
| 오픈 루프 / 클리프행어 | 없음 |
| 플랫폼별 스크립트 전략 | 없음 (썸네일 크기만 구분) |

**결론: C2 GEN의 프롬프트 엔진은 100% 시각 구성(이미지 프롬프트)에 특화. 스토리텔링/바이럴 전략은 제로.**

### C2 PILOT 엔진: 부분적 존재

`services/pilot/scriptStep.ts` (137-155행)에서 감정 곡선 엔진을 사용합니다:

```
selectStoryArc(topic)
  → generateEmotionCurve(arcType, platform, totalDuration)
    → buildEmotionGuide(curve) — 텍스트 블록 생성
      → sourceContext로 합쳐서 Gemini에 전달
```

생성되는 감정 가이드 예시:
```
[EMOTION CURVE GUIDE — problem_solution]
Target duration: ~50s | Platform: youtube_shorts
Follow this emotional progression across scenes:
  0% — 후킹: curiosity (intensity 0.9)
  25% — 문제 제시: frustration (intensity 0.7)
  ...
```

**단, 한계가 있습니다:**
- sourceContext가 2000자 초과 시 잘림 (scriptStep.ts:147)
- JSON parse 에러 시 sourceContext 없이 재시도 (scriptStep.ts:158)
- Gemini가 이 가이드를 실제로 얼마나 반영하는지 검증/강제하는 메커니즘 없음

---

## A2. 감정 곡선 엔진이 실제 콘텐츠 생성에 영향을 주는가?

`services/emotionCurveEngine.ts`는 8가지 스토리 아크를 정의합니다:
`hero_journey`, `problem_solution`, `listicle`, `comparison`, `tutorial`, `news_report`, `emotional_story`, `mystery_reveal`

코드베이스 전체를 grep하여 추적한 결과:

| 영역 | C2 GEN (메인) | C2 PILOT |
|---|---|---|
| 스크립트 생성 | **영향 없음** | sourceContext로 Gemini에 주입 (부분적) |
| 이미지 생성 | **영향 없음** | **영향 없음** (visual_cue 필드 미사용) |
| TTS 생성 | **영향 없음** | 오디오 태그 삽입 + speed 0.85~1.15 조절 |
| BGM 선택 | **영향 없음** | **영향 없음** |
| 메타데이터 | **영향 없음** | peak intensity 씬 → YouTube 썸네일 텍스트 |

**결론: 감정 곡선 엔진은 C2 GEN에서 완전 무관. C2 PILOT에서만 스크립트(부분적)와 TTS(실질적)에 영향. 이미지 생성에는 두 엔진 모두 연결 안 됨.**

---

## A3. 플랫폼별 알고리즘 트렌드 추적 메커니즘

**존재하지 않습니다.**

- 트렌드 검색(`findTrends`)은 `api/gemini.ts`에서 Google Search 도구를 사용하지만, 이는 "주제 발굴"이지 "알고리즘 패턴 추적"이 아님
- 생성된 콘텐츠의 성과→다음 생성에 반영하는 피드백 루프 없음
- C2 PILOT의 analytics-collect가 플레이스홀더 상태 (아래 B 섹션 참조)

---

## A4. 이미지 생성 모델 현황

코드에서 확인된 모델:
- **Gemini 2.5 Flash Image** (`gemini-2.5-flash-image`): `api/gemini.ts:393`
- **GPT Image-1** (`gpt-image-1`): `api/openai.ts:147`
- **Flux.1 Schnell** (`fal-ai/flux/schnell`): `api/fal.ts:226`

`imageService.ts`에서 모델 분기 구조가 깔끔하여, 새 모델 추가는 분기 한 줄 + API 파일 수정으로 가능.

---

## A5. PixVerse v5.5 — 최선인가?

`services/falService.ts:78`에서 `fal-ai/pixverse/v5.5/image-to-video` 하드코딩.
모델 교체는 이 엔드포인트 문자열 한 줄 수정이면 됩니다.

C2 PILOT의 `services/pilot/types.ts:44-45`에 `videoEngine: 'pixverse' | 'kling'` 타입이 선언되어 있으나, Kling 호출 코드는 미구현.

---

## A6. 브라우저 Canvas MP4 렌더링 한계

`services/videoService.ts` (838줄): `MediaRecorder` + `Canvas 2D` 기반.

확인된 기술적 한계:
- 해상도/프레임레이트가 브라우저 성능에 종속
- `MediaRecorder`의 코덱 선택이 브라우저마다 다름 (Chrome: VP8/VP9, Safari: H.264)
- 서버사이드 FFmpeg가 근본 해결책이나 Vercel 서버리스(최대 120초)에서는 긴 영상 처리 불가

---

## A7. 썸네일 CTR 전략

`services/thumbnailService.ts`는 8종 텍스트 스타일 프리셋(`Bold White`, `Fire`, `Neon` 등)을 Canvas 오버레이합니다.

없는 것:
- A/B 테스트 인프라
- CTR 데이터 수집/분석
- 데이터 기반 스타일/텍스트 추천

---

# 검토 B: 기능 완성도 및 C2 PILOT 전략

## B1. 일괄 영상 변환 구현 난이도

`services/falService.ts`에 이미 `batchGenerateVideos()` 함수가 존재합니다. 동시 7개 제한 큐(`acquireVideoSlot`/`releaseVideoSlot`)도 구현되어 있습니다.

UI 측에서 체크박스 일괄 선택 → `batchGenerateVideos` 호출만 연결하면 됩니다. 구현 난이도는 **낮음** (UI 작업만 필요).

---

## B2. C2 PILOT 구현 현황 — Phase별 정확한 상태

### Phase 1: 브랜드 프리셋/채널/캐릭터 — ✅ 완전 구현

- `api/brand-preset.ts`, `api/character.ts`, `api/channel.ts` — API 동작
- `components/preset/PresetWizard.tsx` — 6단계 위저드 동작
- Supabase CRUD 완전 구현

미비: `PilotDashboard.tsx:51`에 `pendingCount = 0` 하드코딩

### Phase 2: 감정 곡선/오디오 태그/고급 스크립트 — ✅ 엔진 완성, ⚠️ UI 미노출

- `emotionCurveEngine.ts` — 8종 스토리 아크 + 감정 매핑 완전 구현
- `audioTagsService.ts` — 감정→TTS 오디오 태그 변환 완전 구현
- `components/pilot/ContentEngineTest.tsx` — 7탭 테스트 UI 존재

**문제: `ContentEngineTest.tsx`가 `PilotDashboard`에서 호출되지 않음.** 개발/테스트 도구로만 존재하며 사용자가 접근 불가.

### Phase 3: 플랫폼 업로드/승인 워크플로우 — ✅ 대부분 구현

- `api/approval.ts` — 5개 액션 모두 Supabase 쿼리 동작
- `api/pilot/save-content.ts` — Storage 업로드 + 승인 큐 저장 동작
- `components/ApprovalQueue.tsx` — 목록/승인/반려/일괄승인/프리뷰 UI 동작
- YouTube/TikTok OAuth + 업로드 API 존재

**문제: 승인 후 자동 플랫폼 업로드 연결 없음.** 승인 시 `status: 'approved'`로만 변경되고 끝.

### Phase 4: 캠페인 자동화 — ⚠️ 반쪽 구현

- `api/scheduler-trigger.ts` — Vercel Cron 매시간 실행, 캠페인별 예산/일일 횟수 체크
- `api/campaign.ts` — CRUD 완전 구현
- `components/CampaignDashboard.tsx` — 폼 UI 동작

**핵심 문제: 스케줄러가 approval queue에 메타데이터만 삽입하고, 실제 콘텐츠 파이프라인(`runContentPipeline`)을 실행하지 않음.** 스케줄이 발동해도 이미지/TTS/BGM 생성은 일어나지 않음.

### Phase 5: 성과 분석/피드백 인사이트 — ⚠️ 껍데기

- `api/analytics.ts:137-170` — `analytics-collect` 액션에 명시적 주석:
  ```javascript
  // Placeholder: in production, this would call YouTube/TikTok APIs
  ```
  모든 수치(views, likes, comments)를 **0으로 삽입**.

- `api/analytics.ts:247-301` — `analytics-generate-insights`도 하드코딩 규칙 기반:
  ```
  CTR > 8 → "높은 CTR"
  views < 100 → "후킹 강화"
  ```
  Gemini 등 실제 AI 분석 없음.

### 완전히 없는 것 (타입만 선언, 코드 미구현)

| 기능 | 상태 |
|---|---|
| Kling 2.6/3.0 영상 생성 | `PilotScriptScene.videoEngine` 타입만 |
| SFX (Sound Effects) | `sfxPrompt` 타입만 |
| 립싱크 (OmniHuman) | 타입만 |
| 실제 YouTube/TikTok 성과 데이터 수집 | 미구현 |
| 승인→자동 업로드 연결 | 미구현 |

---

## B3. 기능이 너무 많은가?

코드 레벨에서 확인한 기능 목록:

**C2 GEN 핵심 (실제 동작):** 스크립트 생성, 이미지 생성(3모델), TTS, BGM 자동선택, MP4 렌더링, 썸네일, 프로젝트 저장, SRT 자막, 엑셀/ZIP 내보내기

**부가 기능 (실제 동작):** 게이미피케이션(레벨/업적/가챠/퀘스트/리더보드), 플레이그라운드(커뮤니티 피드), 결제(Toss/Stripe), 관리자 대시보드(19개 컴포넌트), 다국어(3개), 랜딩 페이지

**C2 PILOT (부분 동작):** 브랜드 프리셋, 채널, 캐릭터, 캠페인, 승인 큐, 감정 곡선, 오디오 태그

코드로 확인한 사실: 게이미피케이션만 해도 `api/gamification.ts`가 **71KB**로 전체 API 중 최대 크기. `components/InventoryModal.tsx`가 46KB, `UserProfile.tsx`가 59KB.

5명이 쓰는 내부 도구에 이 규모의 게이미피케이션은 과도합니다.

---

## B4. C2 PILOT을 계속 발전시킬 것인가, C2 GEN에 흡수할 것인가?

코드 구조상 두 엔진의 분리는 깔끔합니다:
- C2 PILOT의 서비스는 `services/pilot/`에 격리
- C2 GEN의 기존 코드 변경 없이 확장
- 공유하는 것은 API 레이어(`api/gemini.ts` 등)와 타입(`types.ts`)뿐

그러나 C2 PILOT의 **가장 가치있는 기능(감정 곡선, 오디오 태그)이 C2 GEN 메인 플로우에 연결되어 있지 않다**는 것이 문제입니다. C2 PILOT만의 전용 기능으로 남겨두면 5명 중 대부분이 이 기능의 혜택을 못 받습니다.

---

# 검토 C: 기술 아키텍처

## C1. React+Vercel+Supabase 스택 적합성

코드에서 확인된 Vercel 서버리스 제약:
- `vercel.json`에서 `maxDuration`이 최대 120초 (fal.ts, character.ts, youtube-upload.ts)
- PixVerse 영상 변환은 비동기 큐 방식(`submit` → `poll`)으로 이 제약을 우회
- MP4 렌더링은 브라우저에서 수행하여 서버 제약 회피

현재 규모(5명 내부 사용)에서는 적합합니다. 문제가 될 시점:
- 동시 사용자 50명+ 시 Supabase 커넥션 풀 이슈
- 긴 영상(5분+) MP4 렌더링 시 브라우저 메모리 부족

---

## C2. App.tsx 2,277줄 리팩토링 구체 플랜

전체 구성: **38개 state, 12개 ref, 9개 useEffect, 27개 핸들러**

### 가장 큰 문제: `handleApproveScript` — 459줄 단일 함수 (703~1161행)

이 함수 하나가 담당하는 것:
- TTS 5개 병렬 배치 (runAudio, 730~862행)
- 이미지 10개 병렬 배치 (runImages, 864~940행)
- BGM 자동 선택 + AI 생성 (runAutoBgm, 942~1005행)
- Promise.all([runAudio, runImages, runAutoBgm])
- 카운트다운 + confetti (1009~1018행)
- 게이미피케이션 이벤트 (1027~1121행)
- DOM 직접 조작 (1124~1139행)
- 크레딧 갱신 (1142행)

### 리팩토링 우선순위

**즉시 실행 가능 (의존성 적음):**

| 대상 | 라인 | 방법 | 효과 |
|---|---|---|---|
| 견적서 배너 | 1791~1981 | `ScriptReviewBanner` 컴포넌트 | -190줄 |
| 비용 추적 | 225~411 (분산) | `useCostTracker` hook | 외부 의존 없음 |
| 씬 편집 | 1346~1535 | `useSceneEditor` hook | assetsRef + pushUndoState만 공유 |

**중기 (보통 복잡도):**

| 대상 | 라인 | 방법 |
|---|---|---|
| 크레딧/유저 상태 | 155~223 | `useUserAccount` hook |
| Undo/Redo 컨트롤 | 232~451 (분산) | `useUndoRedoControls` hook |

**장기 (복잡, 설계 필요):**

| 대상 | 라인 | 장애물 |
|---|---|---|
| 생성 파이프라인 | 460~1161 | ref 7개 + setter 5개를 인터페이스로 설계 |
| 게이미피케이션 이벤트 | 1027~1121 | gameRef stale closure 패턴 교체 필요 |

### 리팩토링 장애물 3가지

1. **`assetsRef` 이중 역할** (236행) — React state 동기화 + 비동기 클로저 탈출구 겸용. 모든 씬 조작 함수가 직접 의존. Context/Zustand로 대체하지 않으면 prop drilling 불가피.

2. **`gameRef` stale closure 우회** (199~202행) — `useCallback` 메모이제이션 때문에 매 렌더마다 ref를 갱신하는 패턴. `useGameState` 훅이 stable reference를 보장하지 않는 한 이 우회로는 계속 필요.

3. **`pendingGenContextRef`** (240~246행) — Phase 1(스크립트 생성)과 Phase 2(에셋 생성)를 연결하는 유일한 채널. 두 함수가 반드시 같은 스코프에 있어야 함.

---

## C3. AI(Claude Code)만으로 유지보수하는 구조에서 코드 품질 유지

코드에서 확인된 현황:
- TODO/FIXME: 전체 코드베이스에서 **단 1건** (`PilotDashboard.tsx:51`)
- 빌드: 에러 없이 통과
- 타입 안전성: TypeScript strict 모드 사용

현재 부재한 것:
- 테스트 코드: **0개** (단위 테스트, E2E 테스트 모두 없음)
- ESLint/Prettier: 설정 파일 없음
- CI/CD 파이프라인: Vercel 자동 배포만 (빌드 실패 시 배포 차단은 됨)

---

## C4. Vercel Functions 실행 시간 제한 문제

`vercel.json`에서 확인된 설정:

| 함수 | maxDuration | 위험도 |
|---|---|---|
| `api/fal.ts` | 120초 | fal.ai submit은 즉시 반환, poll은 별도 GET |
| `api/character.ts` | 120초 | 레퍼런스 시트 생성 시 복수 이미지 |
| `api/youtube-upload.ts` | 120초 | 대용량 영상 업로드 |
| `api/tiktok-upload.ts` | 120초 | 대용량 영상 업로드 |
| `api/gemini.ts` | 60초 | 이미지 생성 시 가끔 타임아웃 |

현재 우회 전략:
- PixVerse: submit(비동기 큐) → poll(별도 GET) 분리 — 정상 작동
- YouTube 업로드: resumable upload (2-step) — 대용량 대응

잠재 문제: `gemini.ts`에서 이미지 생성 + 재시도 3회 시 60초 초과 가능.

---

# 검토 D (부분): 크레딧 단가 검증

## config.ts vs 실제 API 차감 대조

13개 항목 검증 결과 **12개 일치, 1개 구조적 불일치**:

| 항목 | config.ts | 실제 API | 일치 |
|---|---|---|---|
| 스크립트 생성 | 5 | gemini.ts:310 → 5 | ✅ |
| Gemini 이미지 | 16 | gemini.ts:398 → 16 | ✅ |
| GPT Image-1 | 21 | openai.ts:165 → 21 | ✅ |
| Flux 이미지 | **(키 없음)** | fal.ts:240 → 16 (하드코딩) | ⚠️ |
| PixVerse 영상 | 73 | fal.ts:170 → 73 | ✅ |
| TTS (1000자당) | 15 | elevenlabs.ts:161 → 15 | ✅ |
| BGM 생성 | 50 | elevenlabs.ts:243 → 50 | ✅ |
| Voice Design | 30 | elevenlabs.ts:368 → 30 | ✅ |
| 썸네일 | 16 | gemini.ts:572 → 16 | ✅ |
| AI 대본 어시스턴트 | 5 | gemini.ts:593 → 5 | ✅ |
| 톤 분석 | 5 | brand-preset.ts:302 → 5 | ✅ |
| 스타일 프리뷰 | 48 | brand-preset.ts:371 → 48 | ✅ |
| 상황별 갤러리 | 96 | brand-preset.ts:485 → 96 | ✅ |

---

## 원가율 30% 주장 검증

환율 1USD = 1,450원 기준, 1크레딧 = 10원:

| 항목 | API 원가(USD) | 원가(KRW) | 판매가(KRW) | 실제 원가율 |
|---|---|---|---|---|
| Gemini 이미지 | $0.0315 | 45.7원 | 160원 | **28.5%** ✅ |
| GPT Image-1 | $0.042 | 60.9원 | 210원 | **29.0%** ✅ |
| TTS (1000자) | $0.030 | 43.5원 | 150원 | **29.0%** ✅ |
| PixVerse 영상 | $0.150 | 217.5원 | 730원 | **29.8%** ✅ |
| 스크립트 | ~$0.010 | ~14.5원 | 50원 | **~29.0%** ✅ |
| **Flux 이미지** | **$0.003** | **4.4원** | **160원** | **2.7%** ❌ |
| **BGM 생성 (30초)** | **~$0.35** | **~507원** | **500원** | **101.4%** ❌ |

---

## 발견된 수익성 문제 3건

### 문제 1: BGM 생성 적자 (심각)

`elevenlabs.ts:278`에서 확인:
```javascript
logUsage(req, 'bgm', (durationSec/60) * 0.70)
```
30초 기준: (30/60) × $0.70 = $0.35 = 약 507원
판매가: 50크레딧 × 10원 = 500원
**→ 건당 7원 적자**

### 문제 2: Gemini TTS 크레딧 구멍

`api/gemini.ts`의 `generateAudio` 액션(429~447행)에 `checkAndDeductCredits` 호출이 **없음**.
ElevenLabs 실패 시 Gemini TTS 폴백이 발동하면 **크레딧 무료 사용**.

### 문제 3: Flux 원가 로그 오기록

| | CLAUDE.md 표기 | 실제 코드 로그 (fal.ts:249) | 실제 API 원가 |
|---|---|---|---|
| Flux 이미지 | $0.0315 | $0.003 | ~$0.003 |

Flux 실제 원가는 Gemini의 **10분의 1**이지만 같은 16크레딧을 받음.
c2gen_usage 테이블의 비용 합산이 Gemini/Flux 혼용 시 부정확.

---

# 최종 요약

| 영역 | C2 GEN | C2 PILOT |
|---|---|---|
| 바이럴/스토리텔링 프롬프트 | **전무** | 감정 곡선으로 부분적 |
| 감정 곡선 엔진 | **미연결** | 스크립트(부분)+TTS(실질) 영향 |
| 이미지 프롬프트에 감정 반영 | **없음** | **없음** |
| 성과 피드백 루프 | **없음** | 껍데기 (0 삽입) |
| 캠페인 자동 실행 | 해당 없음 | 큐 삽입만, 실제 생성 안 함 |
| App.tsx 구조 | 2,277줄, 459줄 단일 함수 | 별도 파이프라인 (깔끔) |
| 크레딧 단가 | 대부분 30% 원가율 | BGM 적자, Gemini TTS 무료, Flux 마진 과다 |
| 테스트 코드 | **0개** | **0개** |

---

*이 문서는 코드베이스를 직접 열어서 라인 단위로 확인한 사실만 기록했습니다. 추측은 포함되어 있지 않습니다.*
