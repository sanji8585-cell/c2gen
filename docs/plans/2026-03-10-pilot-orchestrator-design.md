# C2 PILOT 오케스트레이터 설계 문서

> 날짜: 2026-03-10
> 상태: 설계 확정 대기
> 범위: MVP (스토리보드까지) + 미래 확장 대비

## 1. 목표

운영자가 **주제 + 브랜드 프리셋**을 선택하고 "생성" 버튼을 누르면,
감정곡선 기반으로 스크립트 → 이미지 → TTS → BGM이 자동 생성되어
**승인 대기열**에 완성된 스토리보드가 들어간다.

### MVP 산출물
- 스크립트 (ScriptScene[]) ✅
- 씬별 이미지 (Supabase Storage URL) ✅
- 씬별 TTS + 자막 (Storage URL + SubtitleData) ✅
- BGM (Storage URL) ✅
- 영상 변환 ❌ (Phase 4.1에서 추가)

### 미래 확장 (구조만 예약)
- 멀티 캐릭터 대화 (ElevenLabs Text to Dialogue)
- SFX 효과음 (ElevenLabs Sound Effects)
- LipSync (ElevenLabs OmniHuman)
- Kling 2.6/3.0 영상 변환 (fal.ai)
- YouTube/TikTok 자동 업로드

## 2. 아키텍처: C → A 점진 전환

### Phase C (MVP — 클라이언트 오케스트레이션)
```
PilotDashboard → ContentGenerator UI
  → "생성" 클릭
  → contentPipeline.ts (브라우저에서 실행)
    → /api/gemini (스크립트)
    → /api/gemini (이미지 × N, 병렬)
    → /api/elevenlabs (TTS × N, 병렬)
    → /api/elevenlabs (BGM)
    → /api/pilot/save-content (결과 Storage 업로드 + approval_queue 저장)
  → 승인 대기열로 이동
```

### Phase A (미래 — 서버 자동화, Pro 플랜 800초)
```
Vercel Cron → /api/scheduler-trigger
  → /api/pilot/generate (maxDuration: 800)
    → contentPipeline.ts (서버에서 동일 코드 실행)
  → approval_queue에 자동 저장
  → 운영자는 아침에 검수만
```

**핵심**: `contentPipeline.ts`는 동일한 코드. 호출 환경만 다름.

## 3. 파이프라인 단계 설계

### 3.1 단계 구조
```
Step 1: SCRIPT      — 스크립트 생성 (프리셋 톤/캐릭터 주입)
Step 2: IMAGES      — 씬별 이미지 생성 (화풍+참조시트 주입, 병렬)
Step 3: TTS         — 씬별 나레이션 TTS (캐릭터 음성 주입, 병렬)
Step 4: BGM         — BGM 생성 (분위기 프리셋 주입)
Step 5: SAVE        — Storage 업로드 + approval_queue 저장

── 미래 확장 ──
Step 2b: SFX        — 씬별 효과음 (enableSfx 플래그)
Step 3b: DIALOGUE   — 멀티캐릭터 대화 (isDialogueScene 플래그)
Step 6: VIDEO       — Kling 영상 변환 (videoEngineMode)
Step 7: LIPSYNC     — OmniHuman 립싱크 (lipSyncEnabled 플래그)
Step 8: UPLOAD      — YouTube/TikTok 자동 업로드
```

### 3.2 병렬 처리
```
Step 1 (직렬) → [Step 2 + Step 3 + Step 4] (병렬) → Step 5
```
- 이미지: 최대 10개 동시 (Gemini 제한)
- TTS: 최대 5개 동시 (ElevenLabs Scale)
- BGM: 1개 (비블로킹)

## 4. 데이터 구조

### 4.1 PipelineContext — 파이프라인 공유 컨텍스트
```typescript
interface PipelineContext {
  // 입력
  topic: string;
  preset: BrandPreset;
  characters: CharacterProfile[];
  emotionCurve?: EmotionCurve;
  platform: 'youtube' | 'tiktok' | 'youtube_shorts';
  language: Language;
  campaignId?: string;        // 캠페인에서 트리거 시

  // 진행률 콜백
  onProgress: (step: PipelineStep, current: number, total: number, message?: string) => void;

  // 설정
  imageModel?: string;        // 기본 'gemini-2.5-flash-image'
  orientation?: 'landscape' | 'portrait' | 'square';

  // 미래 확장 (MVP에서는 모두 undefined)
  enableSfx?: boolean;
  enableLipSync?: boolean;
  videoEngineMode?: VideoEngineMode;
}

type PipelineStep = 'script' | 'images' | 'tts' | 'bgm' | 'sfx' | 'dialogue' | 'video' | 'lipsync' | 'save';
```

### 4.2 PilotScriptScene — 확장된 씬 데이터
```typescript
interface PilotScriptScene extends ScriptScene {
  // MVP
  speakerName?: string;
  speakerVoiceId?: string;
  emotionTag?: string;          // '[excited]', '[sad]' 등

  // 미래 확장
  speakers?: {                  // 멀티캐릭터 대화
    name: string;
    voiceId: string;
    text: string;
    emotion?: string;
  }[];
  isDialogueScene?: boolean;
  sfxPrompt?: string;
  lipSyncEnabled?: boolean;
  videoEngine?: 'pixverse' | 'kling_2.6' | 'kling_3.0';
}
```

### 4.3 PilotGeneratedAsset — 생성 결과
```typescript
interface PilotGeneratedAsset {
  sceneNumber: number;
  narration: string;
  visualPrompt: string;

  // 생성된 에셋 (모두 Storage URL)
  imageUrl: string | null;
  audioUrl: string | null;
  subtitleData: SubtitleData | null;
  audioDuration: number | null;

  // 메타데이터
  status: 'pending' | 'generating' | 'completed' | 'error';
  errorMessage?: string;
  creditCost: number;

  // 미래 확장
  videoUrl?: string | null;
  sfxUrl?: string | null;
  lipSyncVideoUrl?: string | null;
  dialogueAudioUrl?: string | null;
}
```

### 4.4 PipelineResult — 최종 결과
```typescript
interface PipelineResult {
  success: boolean;
  topic: string;
  presetId: string;
  presetName: string;
  scenes: PilotScriptScene[];
  assets: PilotGeneratedAsset[];
  bgmUrl: string | null;
  emotionCurve?: EmotionCurve;
  metadata: {
    title: string;            // 자동 생성된 제목
    description: string;
    tags: string[];
    thumbnailText: string;
  };
  costs: {
    script: number;
    images: number;
    tts: number;
    bgm: number;
    total: number;            // 크레딧 합계
  };
  generatedAt: string;
  durationMs: number;
}
```

### 4.5 approval_queue.content_data 최종 형태
```json
{
  "topic": "강아지 캠핑 브이로그",
  "presetId": "uuid-...",
  "presetName": "HOUT",
  "language": "ko",
  "scenes": [
    {
      "sceneNumber": 1,
      "narration": "안녕하세요! 오늘은 뭉이와 함께...",
      "visualPrompt": "A cute shiba inu puppy at a campsite...",
      "analysis": { "composition_type": "STANDARD", ... },
      "speakerName": "뭉이",
      "speakerVoiceId": "xi-voice-id"
    }
  ],
  "assets": [
    {
      "sceneNumber": 1,
      "imageUrl": "https://...supabase.co/.../scene-1-image.png",
      "audioUrl": "https://...supabase.co/.../scene-1-audio.mp3",
      "subtitleData": { "words": [...], "chunks": [...] },
      "audioDuration": 4.5,
      "status": "completed",
      "creditCost": 31
    }
  ],
  "bgmUrl": "https://...supabase.co/.../bgm.mp3",
  "metadata": {
    "title": "뭉이와 떠나는 감성 캠핑 | HOUT",
    "description": "...",
    "tags": ["캠핑", "강아지", ...],
    "thumbnailText": "뭉이의 첫 캠핑!"
  },
  "costs": { "script": 5, "images": 80, "tts": 45, "bgm": 50, "total": 180 },
  "generatedAt": "2026-03-10T14:30:00Z",
  "durationMs": 45000
}
```

## 5. 브랜드 프리셋 주입 상세

### 5.1 스크립트 생성 시
```
Gemini 프롬프트에 주입:
- tone_voice.style → "이 브랜드의 톤: {style}"
- tone_voice.formality → "격식 수준: {0~1}"
- tone_voice.humor_level → "유머 수준: {0~1}"
- tone_voice.catchphrase → "가능하면 이 캐치프레이즈 포함: {catchphrase}"
- tone_voice.forbidden_words → "절대 사용 금지 단어: {words}"
- character_profiles[].name → 캐릭터 이름 목록
- character_profiles[].personality → 캐릭터 성격
- character_profiles[].speech_style → 말투/특징
- world_view → 브랜드 세계관
- target_audience → 타깃 시청자
```

### 5.2 이미지 생성 시
```
이미지 프롬프트에 주입:
- art_style.custom_prompt → 모든 이미지 프롬프트 앞에 추가
- art_style.negative_prompts → 네거티브 프롬프트
- art_style.extracted_features.palette → 색상 팔레트 지시
- art_style.extracted_features.shading → 셰이딩 스타일
- character.reference_sheet.multi_angle → 참조 이미지 (front, angle_45 등)
- character.distinction_tags → 캐릭터 구별 특징
- character.appearance.base_prompt → 캐릭터 외형 설명
```

### 5.3 TTS 생성 시
```
씬의 화자 캐릭터 → character_profiles에서 voice_id 조회
- voice_id가 있으면 해당 ElevenLabs 음성 사용
- 없으면 기본 음성 (LANGUAGE_CONFIG[language].defaultVoice)
- speech_style.tone → 안정성/스타일 파라미터 조정
```

### 5.4 BGM 생성 시
```
ElevenLabs Music API 프롬프트 구성:
- bgm_preferences.genre → "genre: {electronic}"
- bgm_preferences.mood → "mood: {uplifting}"
- bgm_preferences.tempo_range → "tempo: {min}~{max} bpm"
- bgm_preferences.custom_prompt → 추가 지시사항
- 감정곡선 전체 분위기 반영
```

## 6. 감정곡선 연동

### MVP에서의 감정곡선 활용
1. `selectStoryArc(topic)` → 자동 아크 선택 (8종)
2. `generateEmotionCurve(arc, platform)` → 곡선 생성
3. `applyEmotionToScenes(scenes, curve)` → 씬별 감정 매핑
4. 씬의 `emotionTag`를 TTS에 Audio Tag로 주입 (`[excited]`, `[sad]` 등)
5. 씬의 `visual_cue`를 이미지 프롬프트에 반영 (quick_zoom, slow_dissolve 등)

### 스크립트 생성 시 감정곡선 가이드
```
Gemini 프롬프트에 감정곡선 포인트 전달:
"이 콘텐츠의 감정 흐름:
 0~10%: curiosity (0.9) — 강한 후킹
 10~40%: tension (0.6) — 문제 제기
 40~70%: empathy (0.7) — 공감/사례
 70~90%: surprise (0.8) — 반전/해결
 90~100%: warmth (0.5) — CTA
각 씬의 나레이션 톤을 이 흐름에 맞춰 작성해줘."
```

## 7. Storage 저장 전략

### 버킷: `pilot-content` (신규)
```
pilot-content/
├── {approval_queue_id}/
│   ├── scene-1-image.png
│   ├── scene-1-audio.mp3
│   ├── scene-2-image.png
│   ├── scene-2-audio.mp3
│   ├── ...
│   └── bgm.mp3
```

### 업로드 패턴 (기존 코드 재사용)
```typescript
// api/pilot/save-content.ts 에서
async function uploadToStorage(
  supabase, base64DataUrl, path
): Promise<string | null> {
  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  const ext = match[1].split('/')[1] || 'bin';
  const { error } = await supabase.storage
    .from('pilot-content')
    .upload(`${path}.${ext}`, buffer, { contentType: match[1], upsert: true });
  if (error) return null;
  return supabase.storage.from('pilot-content').getPublicUrl(`${path}.${ext}`).data?.publicUrl || null;
}
```

## 8. UI 설계

### 8.1 콘텐츠 엔진 탭 (ContentGenerator — 기존 탭 개조)

기존 `ContentEngineTest` 컴포넌트를 `ContentGenerator`로 교체.
ContentEngineTest는 별도 import로 유지 (테스트 목적).

```
┌─────────────────────────────────────────────────────┐
│ 콘텐츠 엔진                                          │
│                                                       │
│ ┌── 입력 영역 ──────────────────────────────────────┐ │
│ │ 브랜드 프리셋: [HOUT ▼]     플랫폼: [YouTube ▼]  │ │
│ │                                                    │ │
│ │ 주제: [______________________________________]     │ │
│ │                                                    │ │
│ │ 감정곡선: [자동 추천 ▼]   언어: [한국어 ▼]        │ │
│ │                                                    │ │
│ │ [🚀 콘텐츠 생성]                                   │ │
│ └────────────────────────────────────────────────────┘ │
│                                                       │
│ ┌── 진행률 (생성 중일 때) ──────────────────────────┐ │
│ │ ✅ 스크립트 생성 (5씬)               3.2초         │ │
│ │ 🔄 이미지 생성 (3/5)                진행중...      │ │
│ │ ⏳ TTS 생성                          대기          │ │
│ │ ⏳ BGM 생성                          대기          │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━ 40%                    │ │
│ └────────────────────────────────────────────────────┘ │
│                                                       │
│ ┌── 생성 히스토리 ──────────────────────────────────┐ │
│ │ 최근 생성: "강아지 캠핑" (3분 전) → 승인 대기중    │ │
│ │ "주식 투자 팁" (1시간 전) → 승인됨                 │ │
│ └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 8.2 승인 대기열 탭 (ApprovalQueue — 개선)

기존 ApprovalQueue 컴포넌트를 확장하여 스토리보드 미리보기 지원.

```
┌─────────────────────────────────────────────────────┐
│ 승인 대기열  [전체 3건]  [일괄 승인]                  │
│                                                       │
│ ┌── 카드 ───────────────────────────────────────────┐ │
│ │ 📝 "강아지 캠핑 브이로그"  HOUT  |  180 크레딧     │ │
│ │ 2026-03-10 14:30  |  45초 소요                     │ │
│ │                                                    │ │
│ │ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         │ │
│ │ │ S1  │ │ S2  │ │ S3  │ │ S4  │ │ S5  │  이미지  │ │
│ │ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘         │ │
│ │                                                    │ │
│ │ ▶ 나레이션 S1   🎵 BGM 미리듣기                    │ │
│ │ "안녕하세요! 오늘은 뭉이와 함께 캠핑을..."         │ │
│ │                                                    │ │
│ │ 제목: "뭉이와 떠나는 감성 캠핑 | HOUT"             │ │
│ │ 태그: #캠핑 #강아지 #HOUT                          │ │
│ │                                                    │ │
│ │ [✅ 승인]  [❌ 반려]  [🔄 재생성]                  │ │
│ └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 8.3 캠페인 탭 (CampaignManager — 기존 개선)

기존 CampaignDashboard를 인라인 컴포넌트로 리팩토링 (모달 → 탭 내 렌더링).
캠페인 생성 시 브랜드 프리셋 드롭다운에서 선택.

## 9. API 엔드포인트

### 신규
| 파일 | 역할 |
|------|------|
| `api/pilot/save-content.ts` | 생성 결과 Storage 업로드 + approval_queue 업데이트 |

### 기존 재사용 (수정 없음)
| 파일 | 용도 |
|------|------|
| `api/gemini.ts` | 스크립트 생성, 이미지 생성, 분위기 분석 |
| `api/elevenlabs.ts` | TTS 생성, BGM 생성 |
| `api/brand-preset.ts` | 프리셋 조회 (preset-get) |
| `api/character.ts` | 캐릭터 목록 조회 (character-list) |
| `api/campaign.ts` | 캠페인 CRUD |
| `api/approval.ts` | 승인 큐 CRUD |

## 10. 파일 구조

```
services/pilot/
├── contentPipeline.ts        ← 파이프라인 오케스트레이터
├── scriptStep.ts             ← Step 1: 스크립트 (프리셋+감정곡선 주입)
├── imageStep.ts              ← Step 2: 이미지 (화풍+참조시트 주입)
├── ttsStep.ts                ← Step 3: TTS (캐릭터 음성 주입)
├── bgmStep.ts                ← Step 4: BGM (분위기 프리셋 주입)
├── saveStep.ts               ← Step 5: Storage 업로드 + DB 저장
└── types.ts                  ← PipelineContext, PilotScriptScene 등

components/pilot/
├── ContentGenerator.tsx      ← 콘텐츠 엔진 탭 (입력+생성+진행률)
├── ApprovalQueue.tsx         ← 승인 대기열 (개선: 스토리보드 미리보기)
├── CampaignManager.tsx       ← 캠페인 관리 (모달→인라인 리팩토링)
├── ContentEngineTest.tsx     (유지 — 기존 테스트 UI)
├── AudioTagsPreview.tsx      (유지)
├── MetadataPreview.tsx       (유지)
├── SceneEmotionTable.tsx     (유지)
└── PlatformComparison.tsx    (유지)

api/pilot/
└── save-content.ts           ← Storage 업로드 + approval_queue 저장
```

## 11. 에러 처리 & 재시도

### 재시도 전략 (C2 GEN 패턴 유지)
- 이미지: 최대 2회 재시도, 2초 백오프
- TTS: 최대 2회 재시도, 429 시 3초 대기, 실패 시 Gemini TTS 폴백
- BGM: 1회 재시도, 실패 시 무음 (BGM 없이 진행)
- 스크립트: 재시도 없음 (실패 시 전체 중단)

### 부분 실패 처리
- 이미지 일부 실패: 해당 씬만 error 표시, 나머지 정상 진행
- TTS 일부 실패: Gemini TTS 폴백 시도
- 전체 실패: approval_queue에 status='error'로 저장, 에러 메시지 기록

### 크레딧 처리
- 각 API 호출 시 서버에서 실시간 차감 (기존 패턴)
- 파이프라인 실패 시 이미 차감된 크레딧은 복구하지 않음 (API 비용 이미 발생)
- estimated_credits는 사전 예측값, 실제 차감은 API별 개별 처리

## 12. Phase A 전환 계획 (미래)

### 변경 사항
1. `api/pilot/generate.ts` 신규 — maxDuration: 800
2. `scheduler-trigger.ts` 수정 — generate API 호출 추가
3. `contentPipeline.ts` 수정 없음 — 동일 코드 서버에서 실행

### 전환 조건
- Vercel Pro 플랜 확인 (maxDuration 800초 가용)
- 베타테스트에서 파이프라인 안정성 검증 완료
- 평균 생성 시간이 800초 미만 확인

## 13. 미래 확장 체크리스트

### 멀티캐릭터 대화 추가 시
- [ ] `PilotScriptScene.speakers` 필드 활성화
- [ ] `ttsStep.ts`에 `isDialogueScene` 분기 추가
- [ ] ElevenLabs Text to Dialogue API 호출 로직
- [ ] 대화 씬 UI 미리보기 (화자별 색상 구분)

### SFX 추가 시
- [ ] `PipelineContext.enableSfx` 플래그
- [ ] `sfxStep.ts` 신규 (Step 2 이후 병렬 실행)
- [ ] ElevenLabs Sound Effects API 호출
- [ ] SFX + TTS + BGM 믹싱 로직

### Kling 영상 변환 추가 시
- [ ] `videoStep.ts` 신규 (Step 5 이후)
- [ ] fal.ai Kling 2.6/3.0 API 호출 + 폴링
- [ ] 별도 API 엔드포인트 (800초 초과 가능 → 비동기 폴링)
- [ ] 영상 변환은 승인 후 트리거 (approval → generate video)

### LipSync 추가 시
- [ ] `lipSyncStep.ts` 신규 (영상 변환 후)
- [ ] ElevenLabs OmniHuman API 호출
- [ ] 캐릭터 이미지 + TTS 오디오 → 말하기 영상

### 자동 업로드 추가 시
- [ ] `uploadStep.ts` 신규
- [ ] approval status='approved' → 업로드 트리거
- [ ] 기존 youtube-upload.ts / tiktok-upload.ts 재사용
