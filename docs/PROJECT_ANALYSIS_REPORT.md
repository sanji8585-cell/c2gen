# TubeGen AI V9.2 — 전체 프로젝트 해부 보고서

> 작성일: 2026-03-23
> 작성자: 제갈공명 (Claude Code)
> 대상: C2 GEN (TubeGen AI) 프로젝트

---

## 한줄 요약

> **키워드나 대본을 넣으면 → AI가 자동으로 스토리보드(이미지+나레이션+자막+BGM+영상)를 만들어주는 웹앱**

---

## 1. 기술 스택

| 분류 | 기술 | 역할 |
|------|------|------|
| **프론트엔드** | React 19 + TypeScript | 화면 UI |
| **빌드** | Vite 6 | 개발서버 & 빌드 |
| **배포** | Vercel (서버리스) | 호스팅 + API |
| **DB** | Supabase (PostgreSQL) | 사용자, 프로젝트, 크레딧 |
| **파일저장** | Supabase Storage | 이미지, 오디오 파일 |
| **AI 대본** | Google Gemini 2.5 Flash | 스크립트 생성, 분석 |
| **AI 이미지** | Gemini / GPT Image-1 / Flux.1 | 씬별 이미지 생성 |
| **AI 음성** | ElevenLabs | TTS 나레이션 + 자막 |
| **AI 영상** | PixVerse v5.5 (fal.ai) | 이미지→영상 변환 |
| **AI BGM** | ElevenLabs Music API | 배경음악 생성 |
| **결제** | Toss Payments / Stripe | 크레딧 충전 |
| **다국어** | i18next | 한국어/영어/일본어 |

---

## 2. 핵심 생성 파이프라인

```
1단계: 키워드 입력 ("AI 투자 전략")
     ↓
2단계: Gemini가 스크립트 작성 (씬 10개로 쪼갬)
     ↓
3단계: 사용자가 검토 후 "생성 시작" 클릭
     ↓
4단계: 3가지가 동시에 진행 (병렬):
     ├── 씬별 이미지 생성 (Gemini/GPT/Flux)
     ├── 씬별 나레이션 TTS (ElevenLabs)
     └── BGM 자동 선택 (분위기 분석 → AI BGM)
     ↓
5단계: 완료! 결과 테이블에서 편집/미리보기
     ↓
6단계: (선택) 이미지→영상 변환 (PixVerse)
     ↓
7단계: (선택) MP4 렌더링 (자막+BGM 합성) → 다운로드
     ↓
8단계: (선택) 썸네일 생성 / YouTube·TikTok 업로드
```

---

## 3. 폴더 구조

### 3.1 루트 파일

| 파일 | 역할 |
|------|------|
| `App.tsx` | **메인 앱** — 전체 생성 로직이 여기에 (2,277줄) |
| `config.ts` | **설정 센터** — 모델 가격, 크레딧 단가, 스타일 프리셋 (31KB) |
| `types.ts` | **타입 정의** — 모든 데이터 구조 (16.8KB) |
| `index.tsx` | React 진입점 |
| `index.html` | HTML 진입점 |

### 3.2 api/ — 서버 API (23개 파일)

Vercel 서버리스 함수. 외부 AI API 호출의 중간 다리 역할 (API 키 보안 + 크레딧 차감)

| 파일 | 하는 일 | 크기 |
|------|---------|------|
| `gemini.ts` | Gemini API 연결 (스크립트, 이미지, TTS, 분석) | 28KB |
| `elevenlabs.ts` | ElevenLabs TTS + BGM + 음성 설계 | 20KB |
| `fal.ts` | fal.ai 연결 (Flux 이미지, PixVerse 영상) | 9.6KB |
| `fal-poll.ts` | fal.ai 영상 생성 상태 폴링 | 3KB |
| `openai.ts` | OpenAI GPT Image-1 | 6.7KB |
| `auth.ts` | 회원가입, 로그인, 관리자 기능 | 62KB |
| `payments.ts` | Toss/Stripe 결제 | 12KB |
| `projects.ts` | 프로젝트 저장/불러오기 | 14KB |
| `storage.ts` | Supabase Storage 파일 관리 | 8.5KB |
| `gamification.ts` | 레벨/업적/가챠 시스템 | 71KB |
| `user.ts` | 사용자 프로필, 크레딧, 즐겨찾기 | 16.9KB |
| `brand-preset.ts` | C2 PILOT 브랜드 프리셋 | 24KB |
| `character.ts` | 캐릭터 생성 | 19.7KB |
| `channel.ts` | 채널 관리 | 7.3KB |
| `campaign.ts` | 캠페인 관리 | 6.1KB |
| `approval.ts` | 콘텐츠 승인 워크플로우 | 7.7KB |
| `analytics.ts` | 분석 데이터 | 11.2KB |
| `playground.ts` | 플레이그라운드 | 43KB |
| `youtube-upload.ts` | YouTube 업로드 | 11.6KB |
| `youtube-auth.ts` | YouTube OAuth | 11.5KB |
| `tiktok-upload.ts` | TikTok 업로드 | 7.7KB |
| `tiktok-auth.ts` | TikTok OAuth | 8.7KB |
| `scheduler-trigger.ts` | Vercel Cron 자동화 | 5.8KB |

### 3.3 services/ — 비즈니스 로직 (32개 파일)

프론트엔드에서 API를 호출하는 실제 로직

| 파일 | 하는 일 | 라인수 |
|------|---------|--------|
| `geminiService.ts` | Gemini 호출 허브 (모든 AI 기능의 출발점) | 286 |
| `imageService.ts` | 이미지 생성 라우터 (모델별 분기) | 201 |
| `elevenLabsService.ts` | TTS + 타임스탬프 자막 | 445 |
| `falService.ts` | 영상 변환 (동시 7개 제한 큐) | 203 |
| `videoService.ts` | **MP4 렌더링 엔진** (Canvas + Web Audio) | 838 |
| `projectService.ts` | 클라우드 저장/로드 (Supabase) | 356 |
| `prompts.ts` | V10.0 프롬프트 엔진 (구도/색상/캐릭터 규칙) | 426 |
| `thumbnailService.ts` | Canvas 썸네일 오버레이 | 525 |
| `srtService.ts` | SRT 자막 파일 | 241 |
| `directiveParser.ts` | 씬 디렉티브 파싱 | 138 |
| `emotionCurveEngine.ts` | 감정 곡선 분석 (8종 스토리 아크) | 270 |
| `metadataEngine.ts` | YouTube/TikTok 메타데이터 생성 | 87 |
| `platformAdapterService.ts` | 플랫폼별 영상 스펙 어댑터 | 116 |
| `audioTagsService.ts` | ElevenLabs Audio Tag 주입 | 106 |
| `renderUtils.ts` | 렌더링 공유 유틸 | 297 |
| `exportService.ts` | 엑셀/ZIP 내보내기 | 184 |
| `soundService.ts` | UI 효과음 (오실레이터 합성) | 197 |
| `gamificationService.ts` | 레벨/뱃지/가챠 | 271 |
| `playgroundService.ts` | 커뮤니티 피드 | 268 |
| `brandPresetService.ts` | 브랜드 프리셋 CRUD | 55 |
| `characterService.ts` | 캐릭터 관리 | 46 |
| `channelService.ts` | 채널 관리 | 47 |
| `campaignService.ts` | 캠페인 관리 | 48 |
| `approvalQueueService.ts` | 승인 큐 | 42 |
| `analyticsService.ts` | 분석 추적 | 56 |
| `youtubeUploadService.ts` | YouTube 업로드 | 45 |
| `tiktokUploadService.ts` | TikTok 업로드 | 47 |
| `i18n.ts` | 다국어 초기화 | 27 |
| `mp4Faststart.ts` | MP4 스트리밍 최적화 | 34 |

#### C2 PILOT 서비스 (services/pilot/)

| 파일 | 하는 일 |
|------|---------|
| `contentPipeline.ts` | 자동화 오케스트레이터 |
| `scriptStep.ts` | 스크립트 생성 스텝 |
| `imageStep.ts` | 이미지 생성 스텝 |
| `ttsStep.ts` | TTS 스텝 |
| `bgmStep.ts` | BGM 선택 스텝 |
| `saveStep.ts` | 저장 스텝 |
| `types.ts` | PILOT 타입 정의 |

### 3.4 components/ — UI 화면 (47개 파일)

#### 메인 컴포넌트

| 파일 | 하는 일 | 크기 |
|------|---------|------|
| `InputSection.tsx` | 입력 폼 (자동/수동/고급 3탭) | 25.9KB |
| `ResultTable.tsx` | 결과 테이블 (테이블 뷰) | 97.1KB |
| `ResultCards.tsx` | 결과 카드 (카드 뷰) | 9.4KB |
| `SceneCard.tsx` | 씬 한 장의 카드 | 26.7KB |
| `SceneToolbar.tsx` | 내보내기/렌더 설정 툴바 | 46.2KB |
| `PreviewPlayer.tsx` | Canvas 영상 미리보기 | 21.2KB |
| `Header.tsx` | 헤더 (테마, 프로필, 알림) | 23.7KB |

#### 기능 모달

| 파일 | 하는 일 | 크기 |
|------|---------|------|
| `ThumbnailGenerator.tsx` | 썸네일 만들기 | 28.5KB |
| `CreditShop.tsx` | 크레딧 충전 | 18.7KB |
| `ProjectGallery.tsx` | 저장된 프로젝트 갤러리 | 20.3KB |
| `Playground.tsx` | 커뮤니티 피드 | 97.5KB |
| `PlatformUploader.tsx` | YouTube/TikTok 업로드 | 15.1KB |

#### 인증/결제

| 파일 | 하는 일 | 크기 |
|------|---------|------|
| `AuthGate.tsx` | 로그인/회원가입 | 39.5KB |
| `AuthModal.tsx` | 인증 모달 | 1.5KB |
| `PaymentSuccess.tsx` | 결제 완료 페이지 | 5.5KB |

#### 게이미피케이션

| 파일 | 하는 일 | 크기 |
|------|---------|------|
| `GameOverlay.tsx` | 레벨업/업적 알림 | 32.8KB |
| `AchievementShowcase.tsx` | 업적 진열장 | 16.6KB |
| `DailyQuestPanel.tsx` | 일일 퀘스트 | 11.7KB |
| `InventoryModal.tsx` | 인벤토리 (가챠 아이템) | 46.1KB |
| `LeaderboardWidget.tsx` | 리더보드 | 5.4KB |
| `UserProfile.tsx` | 사용자 프로필 | 59.2KB |
| `EventBanner.tsx` | 이벤트 배너 | 4.4KB |

#### 기타

| 파일 | 하는 일 |
|------|---------|
| `CompletionScreen.tsx` | 생성 완료 결과 요약 |
| `CharacterVoiceManager.tsx` | 다중 화자 음성 매핑 |
| `EmotionCurveEditor.tsx` | 감정 곡선 편집 |
| `DirectiveDebugPanel.tsx` | 디렉티브 디버그 |
| `DirectiveGuideModal.tsx` | 디렉티브 가이드 |
| `CampaignDashboard.tsx` | 캠페인 대시보드 |
| `AnalyticsDashboard.tsx` | 분석 대시보드 |
| `ApprovalQueue.tsx` | 승인 대기열 |
| `PilotDashboard.tsx` | C2 PILOT 대시보드 |
| `ErrorBoundaries.tsx` | 에러 바운더리 |

#### 하위 컴포넌트 그룹

| 폴더 | 파일 수 | 내용 |
|------|---------|------|
| `components/input/` | 6개 | HeroInput, 설정, 프리셋, 참조이미지, 음성설정 |
| `components/landing/` | 7개 | 랜딩페이지 섹션들 |
| `components/pilot/` | 6개 | C2 PILOT UI 요소들 |
| `components/preset/` | 6개 | 프리셋 마법사 6단계 |
| `components/shared/` | 3개 | 오디오 플레이어, 지연로딩 이미지 |
| `components/admin/` | 19개 | 관리자 대시보드 전체 |

### 3.5 기타 폴더

| 폴더 | 내용 |
|------|------|
| `locales/` | 다국어 번역 (ko 796줄, en 795줄, ja 731줄) |
| `hooks/` | 커스텀 훅 5개 (게임상태, 프로젝트, 테마, Undo/Redo, 스크롤) |
| `contexts/` | AuthContext (인증 상태 관리) |
| `constants/` | UI 상수 |
| `utils/` | 유틸리티 함수 |
| `types/` | 추가 타입 정의 |
| `sql/` | Supabase DB 스키마 10개 파일 |
| `public/bgm/` | BGM MP3 8곡 |
| `public/previews/` | 스타일 프리셋 미리보기 51개 |
| `public/thumbnail-samples/` | 썸네일 샘플 11개 |
| `docs/` | C2 PILOT PRD, 엔진 감사보고서 등 |
| `scripts/` | 빌드 스크립트 |
| `android/` | Capacitor Android 빌드 |

---

## 4. API 엔드포인트 상세

### 4.1 /api/gemini (POST)

| action | 기능 | 크레딧 |
|--------|------|--------|
| `findTrends` | 트렌드 검색 | 무료 |
| `generateScript` | 대본 생성 | 5 |
| `generateImage` | 이미지 생성 | 16 (미리보기 무료) |
| `generateAudio` | Gemini TTS 폴백 | 무료 |
| `splitSubtitle` | 자막 의미단위 분리 | 무료 |
| `generateMotionPrompt` | 모션 프롬프트 | 무료 |
| `analyzeMood` | BGM용 분위기 분석 | 무료 |
| `generateThumbnail` | 썸네일 이미지 | 16 |
| `generateAdvancedScript` | 고급 대본 | 5 |

### 4.2 /api/elevenlabs (POST)

| action | 기능 | 크레딧 |
|--------|------|--------|
| `generateAudio` | TTS + 타임스탬프 | 1000자당 15 |
| `generatePreview` | 음성 미리듣기 | 무료 |
| `fetchVoices` | 음성 목록 | 무료 |
| `generateMusic` | AI BGM 생성 | 50 |
| `searchLibrary` | 음성 라이브러리 검색 | 무료 |
| `designVoice` | Voice Design v3 | 30 |
| `saveDesignedVoice` | 음성 저장 | 무료 |

### 4.3 /api/fal (POST)

| action | 기능 | 크레딧 |
|--------|------|--------|
| `uploadImage` | 이미지 업로드 | 무료 |
| `submitVideo` | PixVerse 영상 제출 | 73 (실패시 환불) |
| `generateFluxImage` | Flux.1 이미지 | 16 |

### 4.4 /api/openai (POST)

| action | 기능 | 크레딧 |
|--------|------|--------|
| `generateImage` | GPT Image-1 | 21 (미리보기 무료) |

### 4.5 /api/auth (POST)

| action | 기능 |
|--------|------|
| `register` | 회원가입 (관리자 승인제) |
| `login` | 이메일 로그인 (세션 7일) |
| `oauthLogin` | Google/Kakao 소셜 로그인 |
| `validate` | 세션 검증 |
| `logout` | 로그아웃 |
| `adminLogin` | 관리자 로그인 (4시간) |
| `listUsers` | 유저 목록 (관리자) |
| `setOperator` | 운영자 지정 (관리자) |

### 4.6 /api/payments (POST)

| action | 기능 |
|--------|------|
| `toss-prepare` | 토스 결제 준비 |
| `toss-confirm` | 토스 결제 승인 → 크레딧 충전 |
| `stripe-checkout` | Stripe 결제 URL 생성 |
| `payment-history` | 결제 내역 조회 |

---

## 5. Supabase DB 테이블 (22개)

| 테이블 | 용도 |
|--------|------|
| `c2gen_users` | 사용자 (credits, plan, xp, level, streak) |
| `c2gen_sessions` | 세션 토큰 (일반 7일, 관리자 4시간) |
| `c2gen_usage` | API 사용량 로그 |
| `c2gen_error_logs` | 에러 로그 |
| `c2gen_credit_transactions` | 크레딧 거래 내역 |
| `c2gen_payments` | 결제 내역 (Toss/Stripe) |
| `c2gen_projects` | 프로젝트 데이터 |
| `c2gen_channels` | C2 PILOT 채널 |
| `c2gen_campaigns` | C2 PILOT 캠페인 |
| `c2gen_approval_queue` | 승인 대기열 |
| `c2gen_content_analytics` | 콘텐츠 성과 스냅샷 |
| `c2gen_feedback_insights` | AI 인사이트 |
| `c2gen_upload_logs` | YouTube/TikTok 업로드 로그 |
| `c2gen_platform_connections` | 소셜 플랫폼 OAuth 토큰 |
| `c2gen_brand_presets` | 브랜드 프리셋 |
| `c2gen_character_references` | 캐릭터 참조 이미지 |
| `c2gen_presets` | 생성 설정 프리셋 |
| `c2gen_favorite_voices` | 즐겨찾기 음성 |
| `c2gen_inquiries` | 1:1 문의 |
| `c2gen_game_config` | 게이미피케이션 설정 |
| `c2gen_gacha_pool` | 가챠 아이템 풀 |
| `c2gen_user_equipped` | 장착 아이템 |
| `playground_posts` | Playground 게시물 |

### Supabase RPC 함수

| 함수 | 역할 |
|------|------|
| `deduct_credits(email, amount, description)` | 크레딧 차감 (FOR UPDATE 잠금) |
| `add_credits(email, amount, type, description, reference_id)` | 크레딧 추가 |

### Supabase Storage 버킷

| 버킷 | 용도 |
|------|------|
| `project-assets` | 씬 이미지/오디오, 아바타, Playground 영상 |
| `preset-images` | 스타일 미리보기, BGM 샘플 |

---

## 6. 서비스 간 의존 관계

```
App.tsx (오케스트레이터)
  │
  ├── geminiService → /api/gemini
  │     ├── 스크립트 생성
  │     ├── 이미지 생성
  │     ├── 자막 분리
  │     ├── 분위기 분석
  │     └── 썸네일 생성
  │
  ├── imageService → geminiService 또는 /api/openai
  │     └── 모델에 따라 Gemini/GPT 분기
  │
  ├── elevenLabsService → /api/elevenlabs + geminiService
  │     ├── TTS 생성
  │     └── AI 의미단위 자막 (geminiService 의존)
  │
  ├── falService → /api/fal + /api/fal-poll
  │     └── 이미지→영상 변환
  │
  ├── videoService (브라우저 Canvas 처리)
  │     └── MP4 렌더링 + 자막 + BGM 믹싱
  │
  ├── projectService → /api/projects + /api/storage
  │     └── 클라우드 저장/로드
  │
  ├── thumbnailService (브라우저 Canvas 처리)
  │     └── 텍스트 오버레이
  │
  └── srtService (브라우저 파일 처리)
        └── SRT 자막 파일 생성
```

---

## 7. 크레딧 단가표

| 작업 | 크레딧 | 원화 (1크레딧=10원) | API 원가 |
|------|--------|---------------------|----------|
| 스크립트 생성 | 5 | 50원 | ~$0.01 |
| 이미지 (Gemini/Flux) | 16 | 160원 | ~$0.0315 |
| 이미지 (GPT Image-1) | 21 | 210원 | ~$0.042 |
| TTS (1000자당) | 15 | 150원 | ~$0.03 |
| 영상 변환 (PixVerse) | 73 | 730원 | ~$0.15 |
| 썸네일 | 16 | 160원 | ~$0.0315 |
| AI BGM 생성 | 50 | 500원 | — |
| Voice Design | 30 | 300원 | — |

- **가입 보너스**: 100크레딧
- **원가율**: API 원가 대비 약 30%

---

## 8. 핵심 설계 원칙

### 8.1 API 키 보안
클라이언트가 AI API를 직접 호출하지 않음. 반드시 `api/` 서버리스 함수를 거침. 커스텀 API 키(`x-custom-api-key` 헤더)가 있으면 크레딧 차감 스킵.

### 8.2 크레딧 원자적 차감
Supabase `FOR UPDATE` 잠금으로 동시 요청 시 크레딧 이중 차감 방지. `deduct_credits` RPC가 단일 트랜잭션으로 처리.

### 8.3 프록시 단일 액션 패턴
`/api/gemini`, `/api/elevenlabs`, `/api/fal` 모두 POST + `action` 필드로 라우팅. 엔드포인트 수 최소화.

### 8.4 이중 상태 패턴
`assetsRef` (비동기 클로저용) + `generatedData` (React 렌더용) 이중 관리. `updateAssetAt()`이 동기화.

### 8.5 C2 PILOT 분리
기존 코드 건드리지 않고 `services/pilot/`, `components/pilot/`, `api/pilot/`에 별도 구현.

---

## 9. 프로젝트 현재 상태 (2026-03-23)

| 항목 | 상태 | 비고 |
|------|------|------|
| **빌드** | ✅ 성공 | 에러 없음 |
| **Git** | ✅ 클린 | 변경사항 없음 |
| **코드 품질** | ✅ 양호 | TODO 단 1건 |
| **코드 규모** | 57,955줄 | 중대형 프로젝트 |
| **node_modules** | ⚠️ 없음 | `npm install` 필요 |
| **현재 브랜치** | `dev` | |
| **메인 브랜치** | `imagemaker` | |
| **배포 URL** | https://tubegen-ai-bice.vercel.app | |

### 코드 규모 상세

| 영역 | 크기 |
|------|------|
| `components/` | 1.7MB |
| `api/` | 456KB |
| `services/` | 296KB |
| `public/` | 22MB (정적 파일) |
| `hooks/` | 28KB |

### TODO 항목

- `components/PilotDashboard.tsx:51` — `TODO: fetch from approval API` (pendingCount 하드코딩 0)

---

## 10. 개발 명령어

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (포트 3000)
npm run dev

# 프로덕션 빌드
npm run build

# 빌드된 앱 미리보기
npm run preview
```

### 환경 변수 (.env.local)

```
GEMINI_API_KEY=your_key
GEMINI_API_KEY_2=your_key_2          # 라운드 로빈
FAL_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
ELEVENLABS_API_KEY_2=your_key_2      # 라운드 로빈
OPENAI_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
ADMIN_PASSWORD=your_password
TOSS_SECRET_KEY=your_key
STRIPE_SECRET_KEY=your_key
CRON_SECRET=your_cron_secret
```

---

## 11. Vercel 배포 설정

- **Framework**: Vite
- **Output**: dist
- **Cron Jobs**:
  - `/api/scheduler-trigger` — 매시간 (캠페인 자동화)
  - `/api/analytics` — 6시간마다 (분석 수집)
- **서버리스 함수**: 23개, 각각 maxDuration 설정
- **Body Limit**: storage.ts는 50MB 확장

---

*끝. 이 문서는 제갈공명(Claude Code)이 2026-03-23에 프로젝트 전수 분석하여 작성했습니다.*
