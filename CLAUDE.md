# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**TubeGen AI V9.2** - AI 기반 스토리보드 & 영상 자동 생성 앱

주요 기능:
- 키워드/대본 입력 → AI가 자동으로 스토리보드 생성
- 씬별 이미지 생성 (Gemini 2.5 Flash Image / Flux.1 Schnell)
- TTS 음성 생성 (ElevenLabs + 타임스탬프 자막)
- 이미지→영상 애니메이션 변환 (fal.ai PixVerse v5.5)
- MP4 렌더링 및 내보내기
- **다국어 지원** (한국어/English/日本語) — 스크립트, 나레이션, 자막
- **BGM 자동 추가** — AI 분위기 분석 → 자동 BGM 선택 (수동 변경 가능)
- **썸네일 자동 생성** — YouTube/TikTok/Instagram 플랫폼별 최적화

## 개발 명령어

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

## 환경 변수 설정

`.env.local` 파일에 API 키 설정:
```
GEMINI_API_KEY=your_gemini_api_key
FAL_API_KEY=your_fal_api_key           # Flux 이미지 + PixVerse 영상용
ELEVENLABS_API_KEY=your_elevenlabs_key  # TTS용
ELEVENLABS_VOICE_ID=your_voice_id       # 선택적
```

앱 내 설정 패널에서도 API 키 입력 가능 (localStorage에 저장)

## 기술 스택

- **프레임워크**: React 19 + TypeScript
- **빌드 도구**: Vite 6
- **AI 서비스**:
  - Google Gemini API (`@google/genai`) - 스크립트 생성, 이미지 생성, TTS
  - fal.ai - Flux.1 이미지 생성, PixVerse 영상 변환
  - ElevenLabs - 고품질 TTS + 타임스탬프 자막

## 아키텍처

### 데이터 흐름
```
사용자 입력 (키워드/대본)
    ↓
[geminiService] 트렌드 검색 → 스크립트 생성 (씬 분할)
                └── 긴 대본(3000자+) → generateScriptChunked()로 청크 분할 처리
    ↓
[imageService] 씬별 이미지 생성 (Gemini or Flux 라우팅)
    ↓
[elevenLabsService] 나레이션 TTS + 자막 타임스탬프
    ↓
[falService] 이미지→영상 애니메이션 변환 (수동 버튼 방식)
    ↓
[videoService] MP4 렌더링 및 내보내기 (자막 하드코딩 옵션)
```

### 핵심 서비스 (`services/`)

| 파일 | 역할 |
|------|------|
| `geminiService.ts` | Gemini API 통합 (트렌드 검색, 스크립트 생성, 이미지 생성, TTS 폴백, 자막 분리, 분위기 분석, 썸네일 생성) |
| `imageService.ts` | 이미지 생성 라우터 - 선택된 모델(Gemini/Flux)로 라우팅, 캐릭터 참조 처리 |
| `prompts.ts` | V10.0 프롬프트 엔진 - 의미 기반 시각화, 색상 시스템, 타이포그래피 규칙, 캐릭터 등장 판단, 다국어 프롬프트 |
| `elevenLabsService.ts` | ElevenLabs TTS + 타임스탬프 자막 생성, AI 의미 단위 분리 |
| `falService.ts` | fal.ai 통합 (Flux.1 Schnell 이미지, PixVerse v5.5 영상) |
| `videoService.ts` | MP4 렌더링 (자막 하드코딩 포함, BGM 믹싱 + 오토 덕킹) |
| `thumbnailService.ts` | Canvas 기반 썸네일 텍스트 오버레이 (그라데이션, 그림자, 언어별 폰트) |
| `projectService.ts` | 프로젝트 저장/불러오기 (Supabase 클라우드) |
| `srtService.ts` | SRT 자막 파일 생성 |

### 주요 타입 (`types.ts`)

- `ScriptScene` - 씬 데이터 (나레이션, visualPrompt, analysis)
- `GeneratedAsset` - 생성된 에셋 (이미지, 오디오, 자막, 영상, status 포함)
- `ReferenceImages` - 참조 이미지 (캐릭터/스타일 분리, 강도 조절 0~100)
- `SubtitleData` - 자막 타임스탬프 데이터 (단어별 + 의미 단위 청크)
- `CostBreakdown` - 비용 추적 (이미지, TTS, 영상별 비용 및 개수)

### 설정 (`config.ts`)

- `IMAGE_MODELS` - 이미지 생성 모델 목록 및 가격
- `FLUX_STYLE_CATEGORIES` / `GEMINI_STYLE_CATEGORIES` - 화풍 프리셋
- `ELEVENLABS_MODELS` - TTS 모델 목록
- `PRICING` - API 가격 정보 (USD→KRW 변환)
- `CONFIG.STORAGE_KEYS` - localStorage 키 이름 (`LANGUAGE: 'tubegen_language'` 포함)
- `CONFIG.ANIMATION` - 애니메이션 설정 (ENABLED_SCENES, VIDEO_DURATION)
- `Language` 타입 (`'ko' | 'en' | 'ja'`) + `LANGUAGE_CONFIG` - 언어별 폰트/음성/샘플 텍스트
- `BgmMood` 타입 + `BGM_LIBRARY` - 8종 BGM 트랙 메타데이터 (mood별 분류)
- `ThumbnailPlatform` 타입 + `THUMBNAIL_PLATFORMS` - YouTube/TikTok/Instagram 크기

## 프롬프트 시스템 (`prompts.ts`)

V10.0 "문장→이미지 자동 생성 시스템" 핵심 원칙:

1. **의미 기반 시각화** - 문장의 의미를 이해하고 그대로 시각화
   - "컴퓨터" → 컴퓨터를 그려라
   - "발전된 자동차" → 미래적인 자동차를 그려라

2. **수식어 반영** - 형용사/부사를 시각에 반영
   - "거대한" → 크게, "빛나는" → 광택/발광

3. **캐릭터 등장 규칙**:
   - NO_CHAR: 주어가 수치/데이터/추상 시스템 ("GDP가 상승", "시장이 과열")
   - STANDARD/MICRO/MACRO: 주어가 사람 ("투자자가 고민", "소비자가 결정")

4. **구도 시스템**:
   - MICRO (5-15%): 작은 졸라맨 + 큰 사물
   - STANDARD (30-40%): 졸라맨과 사물 상호작용
   - MACRO (60-80%): 졸라맨 클로즈업
   - NO_CHAR: 캐릭터 없음 (사물/텍스트만)

5. **한국 금융 색상** - 상승=빨강, 하락=파랑 (미국과 반대)

6. **고유명사 표시** - 대본에 쓰인 언어 그대로 표시 (삼성→삼성, NVIDIA→NVIDIA)

## App.tsx 핵심 패턴

### 비용 추적 시스템
```typescript
// costRef로 실시간 비용 누적
const costRef = useRef<CostBreakdown>({...});
const addCost = (type: 'image' | 'tts' | 'video', amount: number, count: number) => {...};
```

### 병렬 처리
```typescript
// 이미지, 오디오, BGM 자동선택 병렬 생성
await Promise.all([runAudio(), runImages(), runAutoBgm()]);
```

### 재시도 로직
- 이미지/TTS 생성 실패 시 최대 2회 재시도
- Rate Limit 에러 시 대기 후 재시도
- 모든 재시도 실패 시 폴백 (ElevenLabs → Gemini TTS)

### 참조 이미지 처리
- `hasCharacterRef`가 true면 고정 캐릭터 프롬프트(`VAR_BASE_CHAR`) 제외
- 참조 이미지의 캐릭터를 따르도록 프롬프트 조정

## 컴포넌트 구조

- `App.tsx` - 메인 앱 로직 (생성 플로우, 상태 관리, 비용 추적, BGM 자동선택, 썸네일 모달)
- `components/InputSection.tsx` - 입력 폼 (키워드, 대본, 참조 이미지, 설정, **언어 선택기**)
- `components/ResultTable.tsx` - 생성 결과 테이블 (이미지 재생성, 애니메이션, **BGM 라이브러리 드롭다운**)
- `components/ThumbnailGenerator.tsx` - **썸네일 생성 모달** (AI 이미지 + Canvas 텍스트 오버레이, 플랫폼별)
- `components/ProjectGallery.tsx` - 저장된 프로젝트 갤러리
- `components/Header.tsx` - 헤더
- `components/AuthGate.tsx` - 로그인/회원가입 (관리자 승인제)
- `components/CreditShop.tsx` - 크레딧 충전 모달
- `components/admin/AdminDashboard.tsx` - 관리자 대시보드 (사용자 관리, 공지, 로그, API 키 등)

## 주의사항

- 참조 이미지가 있으면 고정 캐릭터 프롬프트(`VAR_BASE_CHAR`) 제외
- Flux.1은 참조 이미지 미지원 → 스타일 프롬프트로 대체
- ElevenLabs 타임스탬프는 `with-timestamps` 엔드포인트 사용
- 영상 변환은 수동 버튼 클릭 방식 (자동 변환 비활성화)
- 비용 추적은 실시간으로 `costRef`에 누적
- 긴 대본(3000자 초과)은 `generateScriptChunked()`로 청크 분할 처리
- TTS Rate Limit 대응: 씬 간 1.5초 딜레이, 실패 시 3초 대기 후 재시도
- **다국어**: 나레이션은 선택 언어, visual prompt(이미지 프롬프트)는 항상 영어로 생성
- **BGM 자동선택**: `tubegen_auto_bgm` localStorage 키로 ON/OFF (기본 ON), 이미 BGM이 있으면 스킵
- **BGM 파일**: `public/bgm/` 폴더에 MP3 파일 필요 (Pixabay에서 무료 다운로드)
- **자막 폰트**: 영상 렌더링 시 `LANGUAGE_CONFIG[language].subtitleFont` 자동 적용
- **썸네일**: 16크레딧 소비, Gemini 2.5 Flash로 이미지 생성 → Canvas 텍스트 오버레이 (선택적)

## 인증/결제 시스템

- **회원가입**: 관리자 승인제 (`api/auth.ts` → Supabase `users` 테이블)
- **로그인**: 세션 토큰 기반 (`c2gen_session_token` localStorage)
- **크레딧 시스템**: Supabase RPC `deduct_credits`, API 원가 기준 30% 원가율로 설정

### 크레딧 단가 (API 원가율 30% 기준, 1크레딧 = 10원)

| 항목 | 크레딧 | API 원가 | 설정 위치 |
|------|--------|---------|----------|
| 스크립트 생성 | 5 | ~$0.01 | `api/gemini.ts` |
| 이미지 (Gemini) | 16 | ~$0.0315 | `api/gemini.ts`, `config.ts` |
| 이미지 (GPT Image-1) | 21 | ~$0.042 | `api/openai.ts`, `config.ts` |
| 이미지 (Flux) | 16 | ~$0.0315 | `api/fal.ts`, `config.ts` |
| TTS (1000자당) | 15 | ~$0.03 | `api/elevenlabs.ts`, `config.ts` |
| 영상 변환 (PixVerse) | 73 | ~$0.15 | `api/fal.ts`, `api/fal-poll.ts`, `config.ts` |
| 썸네일 | 16 | ~$0.0315 | `api/gemini.ts`, `config.ts` |

- **가입 보너스**: 100크레딧 (`api/auth.ts`)
- **크레딧 설정 중앙**: `config.ts` → `CREDIT_CONFIG.COSTS`
- **주의**: API 파일에도 하드코딩된 크레딧 값이 있으므로 변경 시 `config.ts` + 해당 API 파일 모두 동기화 필요
- **소셜 로그인**: Google/Kakao OAuth 준비됨 (활성화 필요 — Google Cloud Console, Kakao Developers 설정)
- **결제**: Toss Payments 연동 준비됨 (API 키 설정 필요)

## API 레이어 (`api/`)

| 파일 | 역할 |
|------|------|
| `api/gemini.ts` | Gemini API 프록시 — 스크립트, 이미지, TTS, 자막분리, 분위기분석(`analyzeMood`), 썸네일(`generateThumbnail`) |
| `api/auth.ts` | 인증/사용자관리 — 회원가입, 로그인, 크레딧, 관리자 기능, 에러로깅 |
| `api/elevenlabs.ts` | ElevenLabs TTS 프록시 |
| `api/fal.ts` | fal.ai 프록시 (Flux 이미지, PixVerse 영상) |
| `api/openai.ts` | OpenAI API 프록시 (선택적) |

## 관리자 대시보드

- `components/admin/AdminDashboard.tsx` — 탭 기반 관리자 UI
- 사용자 관리 (승인/거부/차단), 공지사항, 사용 로그, API 키 관리
- 분석 대시보드 (가입 통계, 활동 통계)
- 세션 관리, 글로벌 검색, CSV 내보내기

## 배포

- **플랫폼**: Vercel (서버리스)
- **URL**: https://tubegen-ai-bice.vercel.app
- **빌드**: `npm run build` → `npx vercel --prod`
- **환경 변수**: Vercel 대시보드에서 설정 (GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 등)

## C2 PILOT (자동화 엔진)

C2 PILOT은 C2 GEN 안에 내장되는 고도화 자동화 엔진입니다.
전체 설계 문서: docs/C2PILOT_PRD_v1.7_FINAL.docx

### 핵심 원칙
- Phase 순서대로 구현 (1→2→3→4→5)
- 기존 C2 GEN 코드 스타일을 반드시 따름
- 새로운 코드는 기존 파일에 넣지 말고 별도 파일로 생성
- C2 PILOT 관련 파일은 아래 구조를 따름:
  - services/pilot/ (서비스 로직)
  - components/pilot/ (UI 컴포넌트)
  - api/pilot/ (API 엔드포인트)

### 접근 권한
- 채널 워크스페이스: assigned_operators가 함께 공유하며 작업
- 개인 작업 영역: 각 계정 본인만 접근 가능 (Supabase RLS)

### 기술 스택 (기존 유지 + 확장)
- 기존: React 19 + TypeScript + Vite 6 + Vercel + Supabase
- 이미지: Gemini 2.5 Flash (메인) + Flux (폴백) + GPT Image (썸네일)
- 영상: PixVerse v5.5 (수동) + Kling 2.6/3.0 via fal.ai (자동화)
- 오디오: ElevenLabs Scale 플랜 풀 활용
  - TTS: Eleven v3 + Audio Tags
  - BGM: Eleven Music API
  - SFX: Sound Effects API
  - 대화: Text to Dialogue API
  - 목소리: Voice Design v3
  - 립싱크: OmniHuman LipSync
