__C2 GEN__

AI Content Studio

__C2 PILOT__

C2 GEN 플랫폼 안의 고도화 자동화 엔진 | C2 Clover

C2 GEN 안에 내장된 운영자 전용 자동화 오케스트레이션 엔진

*C2 Clover\(회사\) → C2 GEN\(제작 플랫폼\) → C2 PILOT\(GEN 안의 고도화 자동화 엔진\)*

C2 PILOT PRD v1\.7 FINAL  |  2026\.03\.09  |  C2 Clover Confidential

기존 스택: React 19 \+ TypeScript \+ Vite 6 \+ Vercel \+ Supabase

# __목차 \(Table of Contents\)__

1\. Executive Summary — 프로젝트 비전과 핵심 전략

   1\.4 듀얼 비디오 엔진 전략 — PixVerse vs Kling 사용 분기

2\. 전체 시스템 아키텍처 — 데이터 흐름과 모듈 구조

3\. Phase 1: 브랜드 프리셋 시스템 — 브랜드 DNA 고정

4\. Phase 2: 스크립트 엔진 고도화 — 감정 곡선 \+ 플랫폼 문법

5\. Phase 3: 자동 업로드 연동 — YouTube \+ TikTok API

6\. Phase 4: C2 PILOT 오케스트레이터 — 스케줄러 \+ 캠페인 엔진

7\. Phase 5: 피드백 루프 — 성과 분석 \+ 자동 학습

8\. DB 스키마 \(전체\) — Supabase 테이블 설계

9\. API 엔드포인트 \(전체\) — Vercel Serverless Functions

10\. 구현 로드맵 \+ Claude Code 지시사항

# __1\. Executive Summary__

## __1\.1 프로젝트 비전__

C2 GEN은 현재 '키워드 입력 → MP4 다운로드'까지의 AI 콘텐츠 제작 도구입니다\. C2 PILOT은 C2 GEN 플랫폼 안에 내장된 고도화 자동화 엔진으로, 운영자 등급만 접근할 수 있는 상위 시스템입니다\. 콘텐츠가 자동으로 생산되고, 업로드되고, 성과가 분석되어 다음 콘텐츠에 반영되는 자율 콘텐츠 순환 시스템입니다\.

__C2 Clover:__ 회사명

__C2 GEN:__ AI 콘텐츠 제작 도구 \(일반 사용자가 수동으로 콘텐츠를 제작하는 플랫폼\)

__C2 PILOT:__ C2 GEN 안에 내장된 고도화 자동화 엔진 \(운영자 전용, 플랫폼 안의 플랫폼\)

C2 PILOT은 별도의 독립 앱이 아닙니다\. C2 GEN이라는 플랫폼 위에서 돌아가며, C2 GEN의 기존 기능\(대본 생성, 이미지 생성, TTS, 영상 렌더링\)을 그대로 활용하되, 여기에 브랜드 프리셋, 감정곡선, 자동 업로드, 스케줄링, 피드백 루프를 얹어서 전체 파이프라인을 자동화합니다\.

## __1\.2 핵심 과제 3가지__

__과제 1 — AI 콘텐츠 홍수 속 차별화:__ 브랜드 고유의 세계관/캐릭터/톤을 시스템 레벨에서 고정하여, 어떤 운영자가 만들어도 브랜드의 결이 유지되는 'Brand DNA Preset' 시스템을 구축합니다\.

__과제 2 — AI 거부감 극복:__ '불완전함의 설계'를 도입합니다\. 의도적 머뭇거림, 예상 밖 전개, 감정 곡선 기반의 자연스러운 흐름으로 AI 특유의 매끄러운 거부감을 해소합니다\.

__과제 3 — 품질 일관성:__ 캐릭터 레퍼런스 시트, 고정 시드값, 네거티브 프롬프트 라이브러리를 내장하여 '같은 캐릭터가 장면마다 달라지는' AI 영상의 치명적 약점을 해결합니다\.

## __1\.3 운영 환경__

__항목__

__사양__

운영자 인원

1~3명 \(소수 정예\)

업로드 플랫폼

YouTube \+ TikTok \(동시\)

스케줄링 방식

C2 GEN 자체 내장 스케줄러 \(외부 도구 의존 없음\)

기존 스택 유지

React 19 \+ TypeScript \+ Vite 6 \+ Vercel \+ Supabase

신규 추가

Vercel Cron \+ YouTube Data API \+ TikTok API \+ Kling 2\.6/3\.0 \(fal\.ai\)

## __1\.4 듀얼 비디오 엔진 전략__

C2 GEN은 수동 제작 모드와 C2 PILOT 모드에서 서로 다른 비디오 생성 엔진을 사용합니다\. 이는 각 모드의 핵심 요구사항이 다르기 때문입니다\.

### __왜 두 개의 엔진이 필요한가?__

__수동 제작 모드 \(기존 C2 GEN\):__ 사용자가 화면 앞에서 결과를 기다립니다\. 30초~1분 안에 영상이 나와야 UX가 유지됩니다\. → 속도가 핵심

__C2 PILOT 모드 \(C2 PILOT\):__ 스케줄러가 새벽에 알아서 돌립니다\. 운영자는 아침에 결과만 확인합니다\. → 품질과 비용이 핵심

__구분__

__수동 제작 모드__

__C2 PILOT 모드__

엔진

PixVerse v5\.5 \(fal\.ai\)

Kling 2\.6 Pro \(fal\.ai\)

렌더링 속도

30초~1분 \(빠름\)

5~30분 \(느림, 하지만 OK\)

5초 영상 비용

~$0\.15~$0\.40

~$0\.35 \(오디오 포함 $0\.70\)

캐릭터 일관성

중간

높음 \(레퍼런스 4장 지원\)

네이티브 오디오

v5\.5부터 지원

지원 \(한/영/중/일\)

프리미엄 옵션

\-

Kling 3\.0 \(멀티샷 6컷, 초당 ~$0\.10\)

사용 시점

사용자가 실시간 제작 시

Vercel Cron 자동 트리거 시

### __Kling 3\.0 멀티샷 — 프리미엄 옵션 상세__

Kling 3\.0은 한 번의 프롬프트로 최대 6개의 카메라 앵글/장면을 하나의 영상\(최대 15초\)으로 생성합니다\. 모든 컷이 같은 잠재 공간\(latent space\)을 공유하므로 캐릭터, 조명, 물체가 장면 사이에서 자동으로 일관성을 유지합니다\.

예시: '와이드 샷: 카페에서 커피를 마시는 여성 → 클로즈업: 커피잔 → 미디엄 샷: 고개를 들어 창밖을 보는 여성' → AI가 3개 장면을 자연스럽게 연결된 하나의 영상으로 생성

이 기능은 감정곡선 엔진과 결합하면 강력합니다\. 감정곡선의 각 포인트를 멀티샷의 각 컷으로 자동 변환하면, 감정 흐름에 맞는 카메라 워크가 자동으로 완성됩니다\.

### __구현: falService\.ts 듀얼 엔진 라우터__

// falService\.ts에 추가할 듀얼 엔진 라우터

type VideoEngineMode = 'interactive' | 'automation' | 'premium';

function selectVideoEngine\(mode: VideoEngineMode\) \{

  switch \(mode\) \{

    case 'interactive':  // 수동 제작 — 속도 우선

      return \{ provider: 'pixverse', model: 'v5\.5' \};

    case 'automation':   // 자동화 — 품질\+비용 우선

      return \{ provider: 'kling', model: 'v2\.6\-pro' \};

    case 'premium':      // 프리미엄 — 멀티샷 스토리텔링

      return \{ provider: 'kling', model: 'v3\.0' \};

  \}

\}

### __캠페인 설정에서의 영상 품질 모드__

campaigns 테이블의 설정에 video\_engine\_mode 필드를 추가하여, 운영자가 캠페인별로 영상 품질 모드를 선택할 수 있도록 합니다:

- 표준 모드 \(Kling 2\.6 Pro\): 대부분의 자동화 콘텐츠에 적합\. 가성비 최고\.
- 프리미엄 모드 \(Kling 3\.0\): 스토리텔링이 중요한 콘텐츠\. 멀티샷으로 편집 없이 완성된 시퀀스 생성\. 비용 2~3배\.
- 속도 모드 \(PixVerse v5\.5\): 긴급하게 빠른 결과가 필요한 경우\. 자동화에서도 선택 가능\.

## __1\.5 Phase 구성 요약__

__Phase__

__명칭__

__핵심 산출물__

__예상 기간__

1

브랜드\+채널\+캐릭터\+BGM

채널 워크스페이스 \+ 프리셋 위자드 \+ 캐릭터 파이프라인

3~5일

2

감정곡선\+메타데이터 엔진

스토리아크 라이브러리 \+ 플랫폼별 변환 \+ 메타 자동생성

3~5일

3

자동 업로드 연동

YouTube/TikTok OAuth \+ 업로드 \+ 메타데이터 적용

3~4일

4

C2 PILOT 오케스트레이터

캠페인 UI \+ Vercel Cron \+ 승인 대기열

4~6일

5

피드백 루프

4축 피드백 수집 \+ AI 분석 \+ 자동/수동 반영

3~5일

# __2\. 전체 시스템 아키텍처__

## __2\.1 데이터 흐름도 \(End\-to\-End\)__

아래는 운영자가 캠페인을 설정한 뒤 콘텐츠가 자동 순환하는 전체 흐름입니다:

\[운영자\] 캠페인 설정 \(브랜드 \+ 주제 \+ 스케줄 \+ 플랫폼\)

    ↓

\[Vercel Cron\] 스케줄 트리거 발동

    ↓

\[감정곡선 엔진\] 트렌드 검색 → 감정곡선 설계 → 대본 생성

    ↓

\[브랜드 프리셋\] 캐릭터/화풍/톤 자동 적용

    ↓

\[기존 C2 GEN 파이프라인\] 이미지 → TTS → 영상 렌더링

    ↓

\[듀얼 엔진 라우터\] 자동화 → Kling 2\.6 Pro / 프리미엄 → Kling 3\.0 멀티샷

    ↓

\[플랫폼 변환\] YouTube 문법 / TikTok 문법 각각 생성

    ↓

\[운영자 검수\] 70% 자동 / 30% 사람 \(승인 대기열\)

    ↓

\[자동 업로드\] YouTube API \+ TikTok API 동시 발행

    ↓

\[성과 수집\] 24h/72h/7d 시점에 조회수, 시청지속, 댓글 수집

    ↓

\[피드백 루프\] 성과 데이터 → 다음 콘텐츠 방향 반영 ← 순환

## __2\.2 모듈 구조__

기존 C2 GEN 모듈에 추가되는 새로운 서비스와 컴포넌트:

### __신규 Services \(services/ 폴더\)__

__파일명__

__역할__

__의존성__

brandPresetService\.ts

브랜드 프리셋 CRUD \+ 프롬프트 주입

Supabase

channelWorkspaceService\.ts

채널 워크스페이스 관리 \(다채널 운영\)

Supabase

characterPipelineService\.ts

캐릭터 등록 \(배경제거→화풍변환→멀티앵글\)

Gemini/fal\.ai

multiCharacterEngine\.ts

멀티 캐릭터 씬 프롬프트 빌더 \+ 캐스팅

brandPresetService

bgmService\.ts

Eleven Music BGM 생성 \+ bgmGenerator 폴백 \+ 덕킹

ElevenLabs API

sfxService\.ts

Eleven SFX 효과음 생성 \+ 씬별 자동 삽입

ElevenLabs API

voiceDesignService\.ts

캐릭터 목소리 생성 \(Voice Design v3\)

ElevenLabs API

lipSyncService\.ts

OmniHuman 립싱크 \(캐릭터 말하기 영상\)

ElevenLabs API

videoEngineRouter\.ts

듀얼 비디오 엔진 라우터 \(PixVerse/Kling 분기\)

fal\.ai

emotionCurveEngine\.ts

감정곡선 설계 \+ 대본 구조 생성

Gemini API

platformAdapterService\.ts

플랫폼별 편집 리듬/자막/CTA 변환

기존 videoService\.ts

youtubeUploadService\.ts

YouTube Data API v3 업로드 \+ 메타데이터

YouTube OAuth

tiktokUploadService\.ts

TikTok Content Posting API 업로드

TikTok OAuth

campaignService\.ts

캠페인 CRUD \+ 스케줄 관리

Supabase

schedulerService\.ts

Vercel Cron 트리거 \+ 작업 큐 관리

Supabase

analyticsService\.ts

성과 데이터 수집 \+ 분석 \+ 피드백 생성

YouTube/TikTok API

approvalQueueService\.ts

운영자 승인 대기열 관리

Supabase

### __신규 Components \(components/ 폴더\)__

__파일명__

__역할__

BrandPresetManager\.tsx

브랜드 프리셋 생성/편집 \(6단계 위자드\)

ChannelWorkspace\.tsx

채널별 독립 워크스페이스 대시보드

CharacterRegistration\.tsx

캐릭터 등록 위자드 \(1장→레퍼런스시트\)

StylePreviewGallery\.tsx

화풍 A/B 프리뷰 \+ 상황별 갤러리

EmotionCurveEditor\.tsx

감정곡선 시각적 에디터 \(드래그 포인트\)

CampaignDashboard\.tsx

캠페인 목록 \+ 상태 \+ 다음 실행 시간

ApprovalQueue\.tsx

생성된 콘텐츠 검수/승인/반려 UI

PlatformPreview\.tsx

YouTube vs TikTok 미리보기 비교

AnalyticsDashboard\.tsx

성과 차트 \+ 트렌드 \+ AI 인사이트

AutomationSettings\.tsx

운영자 전용 자동화 설정 패널

### __신규 API \(api/ 폴더\)__

__파일명__

__역할__

brand\-preset\.ts

브랜드 프리셋 CRUD API

campaign\.ts

캠페인 관리 API

scheduler\-trigger\.ts

Vercel Cron 엔드포인트 \(자동 실행\)

youtube\-auth\.ts

YouTube OAuth 2\.0 콜백

youtube\-upload\.ts

YouTube 영상 업로드 프록시

tiktok\-auth\.ts

TikTok OAuth 2\.0 콜백

tiktok\-upload\.ts

TikTok 영상 업로드 프록시

analytics\.ts

성과 데이터 수집/조회 API

approval\.ts

승인 대기열 관리 API

__🎨 Phase 1__

__브랜드 프리셋 \+ 채널 \+ 캐릭터 \+ BGM 시스템__

### __목표__

다채널 운영 환경에서, 각 채널의 브랜드 세계관/캐릭터/화풍/톤/BGM이 시스템 레벨에서 고정되어 어떤 운영자가 만들어도 일관된 브랜드 아이덴티티를 유지합니다\.

## __3\.1 채널 워크스페이스 \(다채널 운영\)__

각 운영자가 담당 채널의 워크스페이스에 들어가면, 거기에 연결된 브랜드 프리셋, 캠페인, 업로드 계정, 성과 대시보드가 한 화면에 보입니다\. HOUT 채널 운영자는 HOUT 세계만, 사회이슈 채널 운영자는 사회이슈 세계만 보는 구조입니다\.

### __접근 권한 2계층 구조__

채널 워크스페이스와 개인 작업 영역은 완전히 분리됩니다:

__영역__

__접근 범위__

__예시__

채널 워크스페이스

assigned\_operators에 포함된 운영자들이 함께 공유

HOUT 채널 → 운영자 A, B가 함께 보고 작업

개인 작업 영역

각 계정 본인만 접근 가능 \(다른 사람 절대 못 봄\)

운영자 A의 개인 프로젝트, 실험 콘텐츠

Supabase RLS 정책으로 강제합니다\. 채널 데이터는 channels\.assigned\_operators 배열에 auth\.uid\(\)가 포함된 경우에만 접근 가능하고, 개인 데이터는 user\_id = auth\.uid\(\) 조건으로 본인만 접근 가능합니다\.

### __channels 테이블__

__컬럼__

__타입__

__설명__

id

uuid \(PK\)

고유 식별자

channel\_name

text

채널명 \(예: HOUT 공식, 사회이슈 탐구\)

description

text

채널 설명

assigned\_operators

uuid\[\]

담당 운영자 ID 배열

brand\_preset\_id

uuid \(FK\)

연결된 브랜드 프리셋

platform\_accounts

jsonb

\{youtube: 계정ID, tiktok: 계정ID\}

tone\_references

text\[\]

톤 학습용 레퍼런스 콘텐츠 URL

is\_active

boolean

활성 상태

created\_at

timestamptz

생성일

## __3\.2 brand\_presets 테이블 \(확장\)__

__컬럼__

__타입__

__설명__

id

uuid \(PK\)

고유 식별자

user\_id

uuid \(FK\)

소유자

brand\_name

text

브랜드명

description

text

브랜드 한줄 설명

world\_view

jsonb

세계관 설정 \(배경, 가치관, 분위기\)

character\_profiles

jsonb\[\]

캐릭터 배열 \(상세 구조는 3\.4 참조\)

art\_style

jsonb

화풍 설정 \(스타일, 색상, 네거티브 프롬프트\)

tone\_voice

jsonb

톤앤보이스 \(말투, 감정 범위, 금지어\)

tone\_reference\_texts

text\[\]

레퍼런스 대본/텍스트 \(AI 학습용\)

tone\_learned\_patterns

jsonb

AI가 추출한 톤 패턴

style\_preview\_images

jsonb\[\]

A/B 프리뷰 \+ 상황별 갤러리 이미지

selected\_style\_variant

text

운영자가 선택한 화풍 변형

seed\_values

jsonb

고정 시드값

negative\_prompts

text\[\]

네거티브 프롬프트 라이브러리

bgm\_preferences

jsonb

BGM 선호 설정 \(장르, 분위기, 템포 범위\)

platform\_configs

jsonb

플랫폼별 세부 설정

is\_active

boolean

활성 상태

created\_at / updated\_at

timestamptz

생성/수정일

## __3\.3 프리셋 생성 6단계 위자드__

운영자가 브랜드 프리셋을 만드는 플로우입니다\. 각 단계가 UI의 스텝 위자드로 구현됩니다:

__Step 1 — 브랜드 기본 정보:__ 이름, 설명, 타겟 오디언스 입력

__Step 2 — 톤앤보이스:__ 직접 입력 OR 레퍼런스 콘텐츠 3~5개 업로드 → AI가 톤 패턴 자동 학습

__Step 3 — 캐릭터 등록:__ 캐릭터별 이미지 1장 업로드 → 자동 레퍼런스 시트 생성 \(상세: 3\.4\)

__Step 4 — 화풍 A/B 프리뷰:__ AI가 3가지 화풍으로 테스트 이미지 생성 → 운영자 선택

__Step 5 — 상황별 프리뷰 갤러리:__ 선택한 화풍으로 4~6가지 다른 상황 이미지 자동 생성 → 확인

__Step 6 — BGM 선호 설정:__ 장르, 분위기, 템포 범위 설정 → Eleven Music API로 샘플 3곡 생성 미리듣기

## __3\.4 캐릭터 등록 파이프라인 \(1장 → 레퍼런스 시트\)__

운영자가 캐릭터 이미지 1장을 업로드하면, 이미지 유형에 따라 자동으로 최적의 처리 경로를 선택하여 레퍼런스 시트를 생성합니다\.

### __3가지 업로드 케이스__

__케이스__

__예시__

__처리 경로__

완성된 마스코트/일러스트

디자이너가 만든 HOUT 공식 마스코트

배경 제거 → 화풍 역분석 → 멀티 앵글

실사 사진

핸드폰으로 찍은 실제 강아지 사진

배경 제거 → 화풍 변환 → 멀티 앵글

러프 스케치

손으로 대충 그린 컨셉 이미지

배경 제거 → 화풍 변환 → 멀티 앵글

### __통합 파이프라인 플로우__

\[운영자\] 캐릭터 이미지 1장 업로드

    ↓

\[이미지 유형 감지\] AI 자동 분류 or 운영자 수동 선택

    ├── '완성된 일러스트/마스코트'

    │     → 배경 제거만 수행

    │     → 이 이미지의 화풍을 AI가 역분석하여 art\_style에 자동 반영

    │       \(색감, 선 굵기, 질감, 톤 추출 → 다른 씬에도 동일 스타일 적용\)

    │

    ├── '실사 사진'

    │     → 배경 제거 → 브랜드 art\_style에 맞게 화풍 변환

    │       예: 골든리트리버 사진 → 감성 일러스트 '뭉이'

    │

    └── '러프 스케치'

          → 배경 제거 → 브랜드 art\_style에 맞게 화풍 변환 \+ 디테일 보강

    ↓

\[멀티 앵글 생성\] 정면 / 45도 / 측면 / 전신 자동 생성 \(4장\)

    ↓

\[운영자 확인\] '이 캐릭터가 맞나요?' → 승인 or 재생성

    ↓

\[저장\] 4장이 캐릭터 레퍼런스 시트로 brand\_presets에 저장

### __완성된 마스코트 업로드 시: 화풍 역분석__

이미 완성된 마스코트가 업로드되면, 그 이미지가 화풍의 '기준'이 됩니다\. AI가 이미지에서 시각적 스타일 특성을 역으로 추출하여 art\_style을 자동 생성합니다:

// 화풍 역분석 결과 예시

\{

  "style\_name": "마스코트에서 추출한 스타일",

  "extracted\_features": \{

    "line\_weight": "medium, clean outlines",

    "color\_mode": "flat colors with soft gradients",

    "palette": \["\#FF6B6B", "\#4ECDC4", "\#FFE66D", "\#2C3E50"\],

    "texture": "smooth, minimal texture",

    "shading": "soft cel\-shading style"

  \},

  "auto\_generated\_prompt": "clean illustration, flat colors with soft gradients,

    medium line weight, soft cel\-shading, warm color palette",

  "negative\_prompt": "realistic, photo, 3d render, rough sketch, watercolor bleed"

\}

이 추출된 스타일이 이후 모든 씬 이미지 생성에 자동 적용되어, 마스코트와 배경/소품의 화풍이 자연스럽게 통일됩니다\.

### __구현: characterPipelineService\.ts__

type ImageType = 'mascot' | 'photo' | 'sketch';

async function registerCharacter\(image, artStyle, imageType: ImageType\) \{

  // Step 1: 배경 제거 \(모든 케이스 공통\)

  const extracted = await removeBackground\(image\);

  

  let styled, derivedStyle;

  

  if \(imageType === 'mascot'\) \{

    // 완성 일러스트: 화풍 변환 없이 역분석

    styled = extracted;  // 원본 유지

    derivedStyle = await analyzeArtStyle\(extracted\);  // 화풍 역추출

  \} else \{

    // 실사/스케치: 화풍 변환 적용

    styled = await convertToArtStyle\(extracted, artStyle\);

    derivedStyle = null;  // 기존 artStyle 사용

  \}

  

  // Step 3: 멀티 앵글 생성 \(모든 케이스 공통\)

  const refSheet = await generateMultiAngle\(styled, \{

    angles: \['front', '45deg', 'side', 'full\_body'\]

  \}\);

  

  return \{ original: extracted, styled, refSheet, derivedStyle \};

\}

## __3\.5 character\_profiles JSONB 확장 구조__

각 캐릭터의 상세 데이터 구조\. 멀티 캐릭터 씬에서의 구별을 위한 distinction\_tags가 핵심입니다:

\{

  "id": "char\_001",

  "name": "뭉이",

  "type": "main",          // main | supporting | extra

  "image\_type": "mascot",   // mascot | photo | sketch

  "species": "골든리트리버",

  "personality": "활발하고 호기심 많은, 약간 덜렁대는",

  "appearance": \{

    "base\_prompt": "golden retriever puppy, fluffy fur, big brown eyes",

    "outfit": "red bandana around neck, small backpack",

    "expression\_range": \["happy", "curious", "surprised", "sleepy"\]

  \},

  "distinction\_tags": \["red bandana", "backpack"\],  // 다른 캐릭터와 구별 핵심

  "reference\_sheet": \{

    "original\_upload": "upload\_001\.jpg",     // 운영자가 올린 원본

    "background\_removed": "extracted\_001\.png",

    "style\_converted": "styled\_001\.png",     // 화풍 변환 결과

    "multi\_angle": \{                          // 자동 생성된 레퍼런스 시트

      "front": "ref\_front\_001\.png",

      "angle\_45": "ref\_45\_001\.png",

      "side": "ref\_side\_001\.png",

      "full\_body": "ref\_full\_001\.png"

    \}

  \},

  "speech\_style": \{

    "tone": "반말, 귀여운 말투, ~멍 접미사",

    "catchphrase": "오늘도 모험이다멍\!",

    "forbidden\_words": \["싫어", "못해"\]

  \},

  "voice\_id": "elevenlabs\_voice\_001"          // TTS 목소리 고정

\}

## __3\.6 멀티 캐릭터 씬 시스템__

여러 캐릭터가 한 장면에 등장할 때, AI가 각 캐릭터를 혼동하지 않도록 하는 시스템입니다\.

### __씬별 캐릭터 캐스팅 구조__

\{

  "scene\_id": 3,

  "narration": "뭉이와 다오가 캠핑장에 도착했다",

  "cast": \["char\_001", "char\_002"\],

  "character\_positions": \{

    "char\_001": "center\-left",

    "char\_002": "center\-right"

  \},

  "interaction": "walking\_together"  // 상호작용 유형

\}

### __멀티 캐릭터 프롬프트 빌더 로직__

function buildMultiCharacterPrompt\(scene, preset\) \{

  const chars = scene\.cast\.map\(id =>

    preset\.character\_profiles\.find\(c => c\.id === id\)\);

  

  // 핵심: 캐릭터별 위치 \+ 구별 태그를 명시적으로 지정

  const charDesc = chars\.map\(c => \{

    const pos = scene\.character\_positions\[c\.id\];

    return \`\[$\{pos\}\] $\{c\.appearance\.base\_prompt\},

            MUST HAVE: $\{c\.distinction\_tags\.join\(', '\)\}\`;

  \}\)\.join\(' | '\);

  

  return \{

    prompt: \`$\{preset\.art\_style\.base\_prompt\}, $\{charDesc\}\`,

    negative: 'merged characters, mixed features, wrong accessories',

    references: chars\.flatMap\(c =>

      Object\.values\(c\.reference\_sheet\.multi\_angle\)\)

  \};

\}

### __멀티 캐릭터 안전장치__

- 한 장면 최대 3캐릭터 권장 \(4명 이상은 AI 구별 어려움\)
- 멀티 캐릭터 씬은 자동 승인 불가 → 반드시 승인 대기열로
- 일관성 실패 시 자동 폴백: 캐릭터 개별 생성 → 합성 모드 전환
- Kling 3\.0 멀티샷 활용: 점진적 캐릭터 등장 \(샷1: 뭉이만 → 샷2: 다오 등장 → 샷3: 함께\)
- 장면별 재생성 버튼: 승인 대기열에서 특정 씬만 다시 생성 가능

## __3\.7 ElevenLabs 오디오 통합 엔진 \(Scale 플랜 풀 활용\)__

ElevenLabs는 2025~2026년에 TTS를 넘어 Music, SFX, Voice Design, Text to Dialogue, LipSync까지 확장했습니다\. C2 Clover는 이미 Scale 플랜\($330/월, 200만 크레딧\)을 사용 중이므로, 하나의 ELEVENLABS\_API\_KEY로 오디오 파이프라인 전체를 해결합니다\.

### __ElevenLabs 활용 기능 맵__

__기능__

__용도__

__Scale 플랜 할당량__

__C2 PILOT 활용__

Eleven v3 TTS \+ Audio Tags

감정 제어 나레이션

200만 크레딧\(~50시간\)

메인 나레이션 엔진

Text to Dialogue

멀티 캐릭터 대화 씬

TTS 크레딧 공유

뭉이\+다오\+치치 대화

Eleven Music

맞춤 BGM 생성 \(인스트루멘탈\)

1,100분/월\(~2,200곡\)

감정곡선 연동 BGM

Sound Effects \(SFX\)

장면별 효과음 생성

크레딧 과금

캠핑/자연/도시 효과음

Voice Design v3

캐릭터 목소리 생성

프리셋 설정 시 1회

브랜드별 고유 목소리

LipSync \(OmniHuman\)

캐릭터 말하기 영상

크레딧 과금

정적 이미지→말하는 영상

Topaz Upscale

영상/썸네일 4배 업스케일

크레딧 과금

최종 품질 향상

Dubbing

다국어 자동 더빙

별도 과금

미래: 한→영/일 자동 변환

### __3\.7\.1 Eleven v3 \+ Audio Tags — 나레이션 혁신__

기존 Multilingual v2에서 Eleven v3로 업그레이드합니다\. v3는 대괄호 안의 오디오 태그로 감정, 톤, 비언어적 표현을 직접 제어합니다\. 감정곡선 엔진의 감정 데이터를 Audio Tags로 자동 변환하여, 텍스트 수준이 아닌 음성 수준에서 감정을 조율합니다\.

// 기존 \(Multilingual v2\) — 텍스트로만 감정 표현

나레이션: "그, 그러니까 말이야\.\.\."

// 신규 \(Eleven v3\) — Audio Tags로 음성 레벨 제어

나레이션: "\[hesitantly\] 그러니까 말이야\.\.\. \[sigh\] 아, 잠깐"

나레이션: "\[whispers\] 이건 비밀인데\.\.\. \[excited\] 대박이야\!"

나레이션: "\[sad\] 정말 안타까운 일이에요 \[pause\] \[hopeful\] 하지만 희망이 있어요"

감정곡선 엔진이 씬별 감정을 분석하면, emotionToAudioTags\(\) 함수가 자동으로 적절한 Audio Tags를 나레이션 텍스트에 삽입합니다\.

### __3\.7\.2 Text to Dialogue — 멀티 캐릭터 대화__

v3의 Text to Dialogue API는 여러 화자의 대화를 하나의 자연스러운 오디오로 생성합니다\. 끊김, 인터럽트, 감정 전환이 자동으로 처리되어, 캐릭터 간 대화 씬을 수동 편집 없이 만들 수 있습니다\.

// Text to Dialogue API 호출 예시

\[

  \{ speaker: '뭉이\_voice\_id', text: '\[excited\] 오늘 캠핑이다멍\!' \},

  \{ speaker: '다오\_voice\_id', text: '\[calm\] 침착해, 아직 안 왔어' \},

  \{ speaker: '뭉이\_voice\_id', text: '\[interrupting\] 근데 텐트는 누가 쳐?' \},

  \{ speaker: '치치\_voice\_id', text: '\[sarcastically\] 당연히 너지, 뭉이' \}

\]

→ 하나의 자연스러운 대화 오디오 파일 생성

### __3\.7\.3 Eleven Music — BGM 생성__

Eleven Music API는 라이선스된 데이터로 학습된 공식 음악 생성 모델입니다\. 텍스트 프롬프트로 감정곡선에 맞는 맞춤 BGM을 매번 새로 생성합니다\. Scale 플랜에 월 1,100분 포함\(30초 BGM 기준 ~2,200곡\)\. 상업적 사용이 완전 클리어됩니다\.

\[감정곡선 엔진\] → 씬별 분위기 분석

    ↓

\[bgmService\.ts\] → Eleven Music API 프롬프트 생성

    예: 'warm acoustic guitar, gentle piano, 30 seconds, instrumental,

         hopeful mood, medium tempo 100bpm'

    ↓

\[API 응답\] → 스튜디오급 맞춤 BGM \(MP3\)

    ↓

\[videoService\.ts\] → Web Audio API로 BGM \+ TTS 믹싱 \+ 오토 덕킹

__폴백:__ ElevenLabs API 장애 시 기존 bgmGenerator\.ts\(Web Audio API 자체 합성, 497줄\)로 자동 전환

### __3\.7\.4 Sound Effects — 효과음 자동 삽입__

감정곡선의 각 씬에 맞는 효과음을 텍스트 프롬프트로 자동 생성하여 삽입합니다:

씬 1 \(캠핑장 도착\): 'campfire crackling, birds chirping, gentle wind'

씬 3 \(놀람 반전\):   'dramatic whoosh, comedic boing'

씬 5 \(따뜻한 결말\): 'soft wind chimes, sunset ambience'

SFX는 선택 기능으로, 운영자가 채널 프리셋에서 on/off할 수 있습니다\. BGM과 TTS 사이에 레이어로 삽입됩니다\.

### __3\.7\.5 Voice Design — 캐릭터 목소리 생성__

브랜드 프리셋의 캐릭터 등록 시, 이미지뿐만 아니라 목소리도 자동 생성합니다\. 텍스트 프롬프트로 3가지 변형을 생성하고 운영자가 선택합니다:

프롬프트: 'young, energetic Korean male voice, slightly high\-pitched,

          playful, puppy\-like enthusiasm'

→ 변형 A, B, C 생성 → 운영자 미리듣기 → 선택

→ voice\_id를 character\_profiles에 저장

### __3\.7\.6 LipSync \(OmniHuman\) — 캐릭터 말하기 영상__

정적 캐릭터 이미지에 TTS 오디오를 입혀서, 캐릭터가 실제로 말하는 것처럼 보이는 영상을 생성합니다\. 기본 립싱크를 넘어 눈 깜빡임, 호흡, 표정, 손 움직임까지 자연스럽게 동기화됩니다\.

\[캐릭터 이미지\] \+ \[v3 TTS 오디오\] → \[OmniHuman LipSync\]

→ 캐릭터가 말하는 영상 \(표정\+입 움직임\+자연스러운 호흡\)

기존 C2 GEN의 Ken Burns 줌/팬 효과보다 훨씬 생동감 있는 영상이 됩니다\. 캐릭터 나레이션 씬에서 선택적으로 활용합니다\.

### __3\.7\.7 오토 덕킹 로직__

ElevenLabs TTS의 단어별 타임스탬프를 기준으로, 나레이션 구간에서 BGM/SFX 볼륨을 자동 조절합니다:

// Web Audio API GainNode 기반 덕킹

나레이션 시작 0\.3초 전: BGM 볼륨 → 0\.15 \(페이드다운\)

나레이션 진행 중:     BGM 볼륨 = 0\.15 \(유지\)

나레이션 종료 0\.5초 후: BGM 볼륨 → 0\.5~0\.7 \(페이드업\)

나레이션 없는 구간:   BGM 볼륨 = 0\.5~0\.7 \(원래 볼륨\)

### __3\.7\.8 전체 오디오 파이프라인 요약__

\[감정곡선 엔진\] 씬별 감정/분위기 설계

      ↓  병렬 처리

├── \[Eleven Music API\]     → 감정곡선 맞춤 BGM \(인스트루멘탈\)

├── \[Eleven SFX API\]       → 씬별 효과음 \(선택\)

├── \[Eleven v3 \+ Tags\]     → 감정 태그 나레이션

│   또는

├── \[Text to Dialogue\]     → 멀티 캐릭터 대화 씬

└── \[Voice Design\]         → 새 캐릭터 목소리 \(프리셋 설정 시\)

      ↓

\[videoService\.ts\] BGM \+ SFX \+ 나레이션 믹싱 \+ 오토 덕킹

      ↓  선택적 후처리

├── \[OmniHuman LipSync\]    → 캐릭터 말하기 영상

└── \[Topaz Upscale\]        → 최종 4배 해상도 향상

## __3\.8 화풍 A/B 프리뷰 \+ 상황별 갤러리__

프리셋 생성 Step 4~5에서 운영자가 화풍을 직관적으로 선택할 수 있는 시스템입니다\.

### __Step 4: A/B 프리뷰__

같은 씬 설명\(예: '강아지가 캠핑장에서 놀고 있다'\)으로 3가지 다른 화풍의 이미지를 동시에 생성하여 나란히 보여줍니다:

- 변형 A: 감성 수채화 일러스트
- 변형 B: 미니멀 플랫 디자인
- 변형 C: 레트로 팝아트

운영자가 하나를 선택하면, 해당 화풍의 파라미터가 art\_style에 자동 저장됩니다\.

### __Step 5: 상황별 프리뷰 갤러리__

선택한 화풍으로 4~6가지 다른 상황의 이미지를 자동 생성합니다\. 같은 화풍이 다양한 상황에서도 일관되는지 확인하는 용도:

- 상황 1: 캐릭터가 실내에서 쉬는 장면
- 상황 2: 캐릭터가 야외에서 활동하는 장면
- 상황 3: 클로즈업 감정 표현 \(웃음/놀람\)
- 상황 4: 여러 캐릭터가 함께 있는 장면 \(멀티 캐릭터 테스트\)

'이 느낌이 맞아요' 확인 버튼 or '다시 생성' 버튼을 제공합니다\.

__📝 Phase 2__

__감정곡선 \+ 메타데이터 엔진__

### __목표__

3단계 감정곡선 생성 시스템과 3레이어 메타데이터 엔진을 구축하여, 콘텐츠의 감정 구조부터 제목/썸네일/태그까지 한 번에 자동화합니다\.

## __4\.1 감정곡선 1단계 — 스토리 아크 자동 선택__

모든 콘텐츠는 스토리 아크 패턴 중 하나에 속합니다\. Gemini가 주제를 분석하여 최적의 아크를 자동 선택합니다:

__아크__

__구조__

__적합한 콘텐츠__

문제→해결

고민 → 원인 → 해결책 → 효과

정보/팁 콘텐츠

반전형

예상 설정 → 뒤집기 → 진짜 결론

호기심/바이럴 콘텐츠

감동형

일상 → 점진적 감정 상승 → 클라이맥스

브랜디드/감성 콘텐츠

공포/경고형

긴장 → 충격 → 해결/교훈

사회이슈 콘텐츠

웃음형

설정 → 기대 쌓기 → 뒤집기

유머/밈 콘텐츠

교육형

궁금증 → 단계별 설명 → 아하\!

강의/가이드 콘텐츠

일상 브이로그

잔잔한 흐름 \+ 작은 포인트들

일상/라이프 콘텐츠

시리즈 연결형

이전편 요약 → 본편 → 다음편 떡밥

연재물

## __4\.2 감정곡선 2단계 — 플랫폼별 변형__

같은 스토리 아크라도 YouTube와 TikTok에서 완전히 다른 감정곡선으로 변환됩니다:

### __YouTube Shorts \(30~60초\)__

\[0\-2초\]  호기심 0\.9  — 강한 후킹 \(질문/충격 텍스트\)

\[2\-10초\] 긴장 0\.6   — 문제 제기

\[10\-25초\] 정보 0\.5  — 차분한 설명

\[25\-40초\] 공감 0\.7  — 실제 사례/감정적 연결

\[40\-55초\] 해결 0\.8  — 핵심 팁

\[55\-60초\] CTA 0\.4   — 구독/좋아요

### __TikTok \(15~30초\)__

\[0\-1초\]  충격 1\.0   — 최강 후킹 \(빠른 화면 전환\)

\[1\-5초\]  궁금증 0\.8 — 루프 유발 \('끝까지 봐'\)

\[5\-15초\] 핵심 0\.7  — 빠른 페이스 전달

\[15\-25초\] 반전 0\.9 — 공유 유발 포인트

\[25\-30초\] 루프 0\.5 — 끝→처음 자연 연결 \(반복 시청\)

__TikTok 루프 구조:__ 영상 끝이 처음과 자연스럽게 이어져서 무의식적 반복 시청을 유도합니다\. loop\_connection 파라미터로 마지막 장면 캐릭터 포즈를 첫 장면과 동일하게 설정합니다\.

## __4\.3 감정곡선 확장 데이터 구조__

각 curve\_point가 영상의 모든 요소\(비주얼, BGM, TTS, 자막\)를 동시에 컨트롤합니다:

\{

  "story\_arc": "problem\_solution",

  "platform\_variant": "youtube\_shorts",

  "total\_duration": 60,

  "curve\_points": \[\{

    "time": 0,

    "emotion": "curiosity",

    "intensity": 0\.9,

    "label": "후킹",

    "visual\_cue": "quick\_zoom\_text\_overlay",

    "bgm\_shift": "mystery\_buildup",

    "tts\_pace": "fast",

    "subtitle\_style": "big\_bold\_question"

  \}\],

  "loop\_connection": \{

    "enabled": true,

    "method": "visual\_echo"

  \},

  "imperfection\_injection": \{

    "level": 0\.3,

    "allowed\_types": \["hesitation", "topic\_drift", "emotion\_spike"\]

  \},

  "performance\_adjustments": \{

    "based\_on": "campaign\_analytics\_last\_5",

    "applied\_changes": \[

      \{"time\_range": \[13,18\], "intensity\_delta": \+0\.3,

       "reason": "이전 콘텐츠 15초 이탈률 높음"\}

    \]

  \}

\}

### __감정 → 영상 요소 자동 매핑 테이블__

__감정__

__BGM 톤__

__화면 전환__

__캐릭터 표정__

__자막 스타일__

curiosity

경쾌, 미스터리

빠름 \(0\.5~1초\)

눈 크게, 갸우뚱

? 큰 폰트

tension

어두운 베이스

느림 \(2~3초\)

미간 찡그림

빨간 하이라이트

surprise

임팩트 효과음

컷 \(0\.3초\)

입 벌림

\!\!\! 흔들림

empathy

잔잔한 피아노

천천히 \(3~4초\)

미소, 눈물

부드러운 폰트

warmth

따뜻한 어쿠스틱

디졸브 \(2초\)

환한 웃음

파스텔 배경

lingering

페이드아웃

슬로우 \(4~5초\)

먼 곳 바라봄

작은 폰트

## __4\.4 불완전함 주입 시스템 \(Eleven v3 Audio Tags 활용\)__

AI 콘텐츠의 매끄러운 거부감을 해소하기 위해 imperfection\_level\(0~1\)에 따라 자연스러운 불완전 요소를 랜덤 주입합니다\. Eleven v3 Audio Tags를 활용하면 텍스트 수준이 아닌 음성 수준에서 직접 제어할 수 있습니다:

__요소__

__v3 Audio Tag__

__예시__

말 더듬기

\[hesitantly\] \[stuttering\]

\[hesitantly\] 그, 그러니까 말이야\.\.\.

한숨/머뭇거림

\[sigh\] \[pause\]

\[sigh\] 아, 이게 뭐라 해야 하나\.\.\.

감정 과잉

\[excited\] \[shouting\]

\[excited\] 대박이야\! 진짜 대박\!

속삭임 전환

\[whispers\] \[softly\]

\[whispers\] 이건 비밀인데\.\.\.

웃음 삽입

\[laughs\] \[giggles\]

\[laughs\] 아 잠깐, 이거 웃기다

어색한 전환

\[pause\] \[clears throat\]

\[pause\] \[clears throat\] 음, 아무튼

## __4\.5 메타데이터 자동 생성 엔진 \(3레이어\)__

### __레이어 1: 대본 기반 자동 생성__

Gemini에 대본 \+ 플랫폼별 알고리즘 특성을 반영한 프롬프트를 보내서 제목/설명/태그를 자동 생성합니다:

- YouTube 제목: 30자 이내, 호기심 키워드, A/B 제목 3개 생성
- TikTok 캡션: 150자 이내, 후킹 질문, 해시태그 5~8개, 댓글 유도 문구
- 썸네일: 감정곡선 최고 intensity 씬을 베이스 이미지로 자동 선택 \+ 텍스트 오버레이

### __레이어 2: 트렌드 연동__

대본 생성 시점에 Gemini 검색으로 수집한 트렌드 키워드를 제목/태그에 자연스럽게 통합합니다\. 업로드 직전에 최신 트렌드를 한 번 더 확인하여 태그를 업데이트합니다\.

### __레이어 3: 성과 학습 기반 최적화__

이전 콘텐츠의 제목 패턴별 CTR\(클릭률\)을 축적하여, 성과 좋은 패턴을 우선 적용합니다:

\{

  "title\_patterns\_performance": \[

    \{"pattern": "숫자\+질문형", "avg\_ctr": 8\.2\},

    \{"pattern": "반전형",     "avg\_ctr": 11\.5\},

    \{"pattern": "직접정보형", "avg\_ctr": 5\.1\}

  \],

  "recommended": "반전형 제목 \+ 숫자 포함이 CTR 2배 높음"

\}

### __메타데이터 출력 구조__

\{

  "youtube": \{

    "titles": \[

      \{"text": "제목A", "pattern": "반전형", "predicted\_ctr": 10\.2\},

      \{"text": "제목B", "pattern": "숫자형", "predicted\_ctr": 7\.8\}

    \],

    "description": "자동 생성 \(검색 키워드 포함\)",

    "tags": \["태그1", "태그2"\],

    "thumbnail": \{

      "base\_scene\_id": 3,  // 감정곡선 피크 씬

      "text\_overlay": "캠핑 갔더니\\n이런 일이?\!"

    \}

  \},

  "tiktok": \{

    "caption": "후킹 텍스트 \+ 해시태그",

    "comment\_bait": "너도 이런 경험 있어? 🐶"

  \}

\}

## __4\.6 플랫폼별 자동 변환 \(Platform Adapter\)__

같은 대본이라도 YouTube와 TikTok에서는 구조 자체가 달라야 합니다:

__요소__

__YouTube Shorts__

__TikTok__

후킹

처음 2초, 질문형 텍스트

처음 1초, 트렌드 사운드 \+ 강렬 비주얼

구조

정보 전달형 \(문제→해결→CTA\)

반복 시청형 \(반전→루프\)

자막

중앙 하단, 깔끔한 폰트

전체 화면, 큰 폰트, 이모지

CTA

마지막 3초, 구독/좋아요

댓글 유도, 듀엣/스티치 유도

영상 길이

30~60초

15~30초

BGM

Eleven Music 감정곡선 연동 생성

트렌드 사운드 추천

썸네일

자동 생성 \(텍스트 오버레이\)

없음 \(영상 자체가 미리보기\)

__🚀 Phase 3__

__자동 업로드 연동__

### __목표__

생성된 MP4 영상을 YouTube와 TikTok에 자동으로 업로드합니다\. OAuth 인증, 메타데이터 설정, 업로드 상태 추적까지 포함합니다\.

## __5\.1 YouTube Data API v3 연동__

### __OAuth 2\.0 플로우__

1. 운영자가 '유튜브 연결' 버튼 클릭
2. Google OAuth 동의 화면으로 리디렉트 \(scope: youtube\.upload, youtube\.readonly\)
3. 콜백 URL \(api/youtube\-auth\.ts\)에서 access\_token \+ refresh\_token 수신
4. Supabase platform\_connections 테이블에 암호화 저장
5. refresh\_token으로 자동 갱신 \(access\_token 만료 시\)

### __업로드 파라미터__

\{

  "snippet": \{

    "title": "감정곡선 엔진이 생성한 제목",

    "description": "AI 생성 설명 \+ 해시태그 \+ 브랜드 정보",

    "tags": \["자동생성태그1", "자동생성태그2"\],

    "categoryId": "22",  // People & Blogs

    "defaultLanguage": "ko"

  \},

  "status": \{

    "privacyStatus": "private",  // 기본 비공개 → 운영자 승인 시 public

    "selfDeclaredMadeForKids": false,

    "madeForKids": false

  \},

  "notifySubscribers": true

\}

## __5\.2 TikTok Content Posting API 연동__

### __OAuth 2\.0 플로우__

TikTok은 YouTube보다 API 승인 과정이 까다롭습니다\. 개발자 앱 등록 → 검수 → 승인까지 1~2주 소요될 수 있습니다\.

1. TikTok Developer Portal에서 앱 등록 \(Content Posting API 권한 요청\)
2. 운영자가 '틱톡 연결' 클릭 → TikTok OAuth 동의
3. 콜백 \(api/tiktok\-auth\.ts\)에서 토큰 수신 및 저장
4. Video Upload 2\-step: init upload → upload video file

## __5\.3 platform\_connections 테이블__

__컬럼__

__타입__

__설명__

id

uuid \(PK\)

고유 식별자

user\_id

uuid \(FK\)

연결한 사용자

platform

enum\('youtube','tiktok'\)

플랫폼 종류

access\_token

text \(encrypted\)

액세스 토큰 \(암호화\)

refresh\_token

text \(encrypted\)

리프레시 토큰 \(암호화\)

token\_expires\_at

timestamptz

토큰 만료 시각

channel\_id

text

플랫폼 채널/계정 ID

channel\_name

text

채널명

is\_active

boolean

연결 활성 상태

created\_at

timestamptz

연결일

## __5\.4 업로드 상태 추적 \(upload\_logs\)__

__컬럼__

__타입__

__설명__

id

uuid \(PK\)

고유 식별자

content\_id

uuid \(FK\)

콘텐츠 참조

campaign\_id

uuid \(FK\)

캠페인 참조

platform

enum

업로드 플랫폼

platform\_video\_id

text

플랫폼에서 부여한 영상 ID

status

enum

'pending','uploading','published','failed','private'

error\_message

text

실패 시 에러 메시지

uploaded\_at

timestamptz

업로드 완료 시각

published\_at

timestamptz

공개 전환 시각

__⚙️ Phase 4__

__C2 PILOT 오케스트레이터__

### __목표__

운영자가 '캠페인'을 설정하면, C2 GEN이 정해진 스케줄에 따라 자동으로 콘텐츠를 생성하고 승인 대기열에 넣습니다\. 운영자는 검수만 하면 됩니다\.

## __6\.1 campaigns 테이블__

__컬럼__

__타입__

__설명__

id

uuid \(PK\)

고유 식별자

user\_id

uuid \(FK\)

생성자

brand\_preset\_id

uuid \(FK\)

적용할 브랜드 프리셋

name

text

캠페인명 \(예: HOUT 주간 틱톡\)

description

text

캠페인 설명

topic\_strategy

jsonb

주제 전략 \(키워드 풀, 트렌드 자동, 시리즈 등\)

emotion\_curve\_template

jsonb

기본 감정곡선 템플릿

target\_platforms

text\[\]

\['youtube', 'tiktok'\]

video\_engine\_mode

enum

'standard'\(Kling 2\.6\),'premium'\(Kling 3\.0\),'fast'\(PixVerse\)

schedule

jsonb

스케줄 설정 \(요일, 시간, 빈도\)

auto\_approve

boolean

자동 승인 여부 \(false 권장\)

max\_daily\_count

integer

하루 최대 생성 수

status

enum

'active','paused','completed'

total\_generated

integer

총 생성 콘텐츠 수

total\_published

integer

총 게시 콘텐츠 수

created\_at

timestamptz

생성일

## __6\.2 topic\_strategy JSONB 상세__

\{

  "mode": "hybrid",  // "keyword\_pool" | "trend\_auto" | "series" | "hybrid"

  "keyword\_pool": \["강아지 캠핑", "반려견 동반 여행", "펫 용품 리뷰"\],

  "trend\_search": \{

    "enabled": true,

    "category": "pets",

    "region": "KR",

    "min\_relevance": 0\.7  // 브랜드 관련성 최소 점수

  \},

  "series": \{

    "enabled": false,

    "template": "뭉이의 캠핑 일기 EP\.\{n\}",

    "current\_episode": 1

  \},

  "exclusions": \["정치", "종교", "경쟁사명"\]  // 제외 키워드

\}

## __6\.3 schedule JSONB 상세__

\{

  "frequency": "weekly",  // "daily" | "weekly" | "custom"

  "days": \["mon", "wed", "fri"\],

  "time": "10:00",  // KST 기준

  "timezone": "Asia/Seoul",

  "generation\_lead\_time": 24,  // 게시 N시간 전에 생성 시작

  "next\_run": "2026\-03\-10T01:00:00Z"  // UTC로 저장

\}

## __6\.4 Vercel Cron Job 설계__

vercel\.json에 cron 설정을 추가하여 주기적으로 스케줄러를 트리거합니다:

// vercel\.json

\{

  "crons": \[

    \{

      "path": "/api/scheduler\-trigger",

      "schedule": "0 \* \* \* \*"  // 매 정시 실행

    \}

  \]

\}

scheduler\-trigger\.ts의 로직:

1. 현재 시각 기준으로 next\_run이 도래한 active 캠페인들을 조회
2. 각 캠페인의 topic\_strategy에 따라 주제 선정 \(키워드 풀에서 랜덤 or 트렌드 검색\)
3. 브랜드 프리셋 로드 → 감정곡선 설계 → 대본 생성
4. 기존 C2 GEN 파이프라인 호출 \(이미지 → TTS → 영상\)
5. 완성된 콘텐츠를 approval\_queue에 삽입 \(auto\_approve=true면 바로 업로드 큐에\)
6. campaign의 next\_run을 다음 스케줄로 업데이트

## __6\.5 approval\_queue 테이블__

__컬럼__

__타입__

__설명__

id

uuid \(PK\)

고유 식별자

campaign\_id

uuid \(FK\)

캠페인 참조

content\_data

jsonb

생성된 콘텐츠 전체 데이터 \(대본, 이미지URL, 영상URL 등\)

platform\_variants

jsonb

플랫폼별 변환 결과 \(YT버전, TT버전\)

emotion\_curve\_used

jsonb

적용된 감정곡선

estimated\_credits

integer

소비된 크레딧

status

enum

'pending','approved','rejected','published'

reviewer\_id

uuid

검수자

review\_notes

text

검수 메모 \(반려 사유 등\)

approved\_at

timestamptz

승인 시각

created\_at

timestamptz

생성 시각

## __6\.6 승인 대기열 UI \(ApprovalQueue 컴포넌트\)__

운영자가 자동 생성된 콘텐츠를 검수하는 화면\. 핵심 기능:

- 대기 중인 콘텐츠 목록 \(카드형 레이아웃\)
- 각 카드에서 영상 미리보기, 대본 확인, 감정곡선 시각화
- YouTube 버전 / TikTok 버전 탭 전환으로 플랫폼별 비교
- 승인 버튼: 즉시 업로드 큐에 추가
- 반려 버튼: 사유 입력 → 재생성 옵션 \(같은 주제로 다시 or 건너뛰기\)
- 일괄 승인/반려 기능

__📊 Phase 5__

__피드백 루프 \(4축 자동 학습\)__

### __목표__

4가지 축으로 성과를 분석하고, 자동 반영과 수동 승인을 구분하여 '콘텐츠가 매 사이클마다 진화하는' 시스템을 구축합니다\.

## __7\.1 성과 수집 테이블 \+ 스케줄__

__컬럼__

__타입__

__설명__

id

uuid \(PK\)

고유 식별자

upload\_log\_id

uuid \(FK\)

업로드 로그 참조

platform

enum

수집 플랫폼

snapshot\_at

timestamptz

수집 시점 \(24h/72h/7d\)

views

integer

조회수

likes / comments / shares

integer

참여 지표

avg\_watch\_duration

float

평균 시청 시간 \(초\)

retention\_curve

jsonb

시청 유지율 곡선 데이터

top\_comments

jsonb\[\]

상위 댓글 \(감정 분석 포함\)

ctr

float

클릭률 \(썸네일→재생\)

engagement\_rate

float

참여율

__수집 시점__

__수집 항목__

__용도__

24시간 후

조회수, 좋아요, 댓글, 시청유지율, CTR

초기 반응 \+ 바이럴 가능성 판단

72시간 후

위 항목 \+ 공유수, 구독 전환

중기 성과 확정

7일 후

전체 지표 \+ 추천 알고리즘 반영 데이터

최종 성과 확정 \+ 4축 분석 실행

## __7\.2 축 1 — 시청 유지율 → 감정곡선 자동 보정__

시청 유지율 데이터를 감정곡선에 오버레이하여, 이탈 구간을 자동 감지하고 다음 콘텐츠의 감정 강도를 보정합니다:

수집: YouTube Analytics API → audience\_retention 데이터

분석: 유지율이 평균 대비 20% 이상 급락하는 시점 감지

반영: 해당 시점 ±3초 구간의 감정 intensity \+0\.2~0\.3 상향

검증: 다음 5개 콘텐츠에서 해당 구간 유지율 변화 추적

## __7\.3 축 2 — 댓글 감정 분석 → 주제/톤 방향__

상위 댓글 50개를 Gemini로 분석하여 시청자 니즈를 추출합니다:

분류 결과:

  ├── 긍정 피드백: '더 해주세요' → topic\_strategy 가중치 강화

  ├── 요청/제안: '다음엔 OO' → keyword\_pool에 자동 추가

  ├── 부정 피드백: '너무 길어요' → target\_duration 조정

  └── 감정 반응: '울었어요ㅠ' → 해당 감정곡선 패턴 성공 기록

## __7\.4 축 3 — CTR 데이터 → 메타데이터 패턴 학습__

제목 패턴별 클릭률을 축적하여 성과 좋은 패턴을 우선 적용합니다:

title\_patterns\_performance: \[

  \{pattern: '숫자\+질문형', avg\_ctr: 8\.2%\},

  \{pattern: '반전형',     avg\_ctr: 11\.5%\},  ← 최고 성과

  \{pattern: '직접정보형', avg\_ctr: 5\.1%\}

\]

→ 다음 제목 생성 시 '반전형' 패턴 우선 적용

## __7\.5 축 4 — 채널 전체 성장 → 전략적 제안__

개별 콘텐츠가 아닌 채널 전체의 30일 흐름을 분석하여 전략적 인사이트를 생성합니다:

Gemini 분석 출력 예시:

\{

  "channel\_health": "growing \(\+12%\)",

  "top\_topic": "강아지 캠핑 시리즈",

  "underperforming": "반려견 용품 리뷰",

  "suggestions": \[

    "캠핑 시리즈를 주 2회로 늘리고, 용품 리뷰는 캠핑에 녹이세요",

    "15초 구간 이탈률이 전체적으로 높습니다\. 반전 요소를 추가하세요",

    "댓글에서 고양이 버전 요청 23건 → 치치 캐릭터 캠페인 제안"

  \],

  "auto\_applied": \[

    "캠핑 키워드 가중치 1\.5배 상향 완료",

    "15초 구간 감정 intensity 기본값 \+0\.2 적용 완료"

  \],

  "requires\_approval": \[

    "치치 단독 콘텐츠 캠페인 신규 생성 → 승인하시겠습니까?"

  \]

\}

## __7\.6 자동 반영 vs 수동 승인 구분__

모든 피드백을 자동 반영하면 위험할 수 있으므로, 영향도에 따라 구분합니다:

### __자동 반영 \(운영자 승인 불필요\)__

- 감정곡선 미세 조정 \(intensity ±0\.3 이내\)
- 트렌드 키워드 태그 업데이트
- BGM 선호도 미세 조정
- 제목 패턴 가중치 조정
- 캠핑 등 성과 좋은 키워드 가중치 상향

### __수동 승인 필요 \(운영자 확인 후 적용\)__

- 새로운 캠페인 생성 제안
- 캐릭터 비중 변경 \(뭉이 중심 → 치치 중심\)
- 영상 길이 대폭 변경 \(60초 → 30초\)
- 주제 방향 전환 \(캠핑 → 실내\)
- 톤앤보이스 조정

## __7\.7 Analytics Dashboard__

운영자가 성과와 AI 인사이트를 한눈에 보는 대시보드:

- 캠페인별 성과 요약 카드 \(총 조회수, 평균 참여율, 성장 추이\)
- 시청 유지율 곡선 ← → 감정곡선 오버레이 비교 \(핵심 시각화\)
- 제목 패턴별 CTR 비교 차트
- 댓글 감정 분류 파이 차트 \(긍정/부정/요청/감정\)
- AI 전략 제안 카드 \(자동 적용 완료 \+ 승인 대기 항목\)
- 플랫폼별 비교 \(같은 콘텐츠의 YouTube vs TikTok 성과\)

# __8\. 프로덕션 안정성 \+ 상용화 준비__

기술 설계만으로는 부족합니다\. 실전에서 안정적으로 돌아가고, 나아가 상용화까지 가려면 아래 항목들이 반드시 필요합니다\.

## __8\.1 에러 핸들링 \+ 장애 복구 전략__

모든 외부 API\(Gemini, Kling, ElevenLabs, YouTube, TikTok\)는 언제든 다운될 수 있습니다\. 각 API에 대한 방어 로직이 필수입니다\.

__장애 유형__

__대응 전략__

__폴백__

Gemini API 다운

3회 재시도\(지수 백오프\) → 대기열 보류

운영자 알림 \+ 수동 대기

Kling/PixVerse 타임아웃

5회 재시도 → 엔진 자동 전환

Kling↔PixVerse 교차 폴백

ElevenLabs 할당량 초과

Gemini TTS 폴백 \(기존 구현\)

품질 저하 알림

YouTube 업로드 실패

토큰 자동 갱신 → 3회 재시도

비공개 저장 \+ 수동 업로드 알림

TikTok 업로드 실패

토큰 갱신 → 재시도

비공개 저장 \+ 수동 업로드 알림

### __파이프라인 Circuit Breaker__

특정 API가 연속 5회 실패하면 해당 서비스를 30분간 차단\(circuit open\)하고, 모든 관련 캠페인을 자동 일시정지합니다\. 30분 후 테스트 요청\(circuit half\-open\)으로 복구 여부를 확인한 뒤 재개합니다\.

### __부분 실패 처리__

6개 씬 중 2개 이미지 생성이 실패한 경우, 성공한 4개는 보존하고 실패한 2개만 재시도합니다\. 전체 파이프라인을 처음부터 다시 돌리지 않습니다\.

## __8\.2 비용 시뮬레이션 \+ 예산 상한__

자동화 캠페인이 폭주하면 하룻밤에 수십만 원이 나갈 수 있습니다\. 비용 통제 시스템이 필수입니다\.

### __캠페인별 예산 상한__

campaigns 테이블 추가 필드:

  budget\_limit\_daily: 5000,     // 일일 크레딧 상한

  budget\_limit\_monthly: 100000,  // 월간 크레딧 상한

  budget\_used\_today: 2300,

  budget\_used\_month: 45000,

  on\_budget\_exceeded: 'pause'   // 'pause' | 'alert\_only' | 'continue'

### __실시간 비용 추적 대시보드 \(Cost Center\)__

- API별 비용 분리: Gemini ₩OO / Kling ₩OO / ElevenLabs ₩OO
- 콘텐츠 1개당 평균 비용 추이 차트
- 월간 비용 예측 \(현재 속도 기준 이번 달 예상 총 비용\)
- 예산 상한 도달 시 자동 일시정지 \+ 운영자 알림

## __8\.3 운영자 알림 시스템__

소수 운영자가 다채널을 관리하므로, 대시보드를 열지 않아도 핵심 이벤트를 즉시 알 수 있어야 합니다\.

__알림 유형__

__긴급도__

__채널__

콘텐츠 생성 완료 → 승인 대기

보통

Slack/이메일 \(일일 요약\)

업로드 성공

낮음

일일 요약에 포함

업로드 실패

높음

Slack 즉시 알림

API 장애 감지

긴급

Slack \+ 이메일 즉시

크레딧/예산 80% 도달

높음

Slack 즉시

크레딧/예산 100% → 캠페인 정지

긴급

Slack \+ 이메일 즉시

피드백 인사이트 도착 \(수동 승인 필요\)

보통

Slack \(주간 요약\)

플랫폼 정책 변경 감지

높음

Slack \+ 이메일 즉시

### __구현__

services/notificationService\.ts — Slack Incoming Webhook \+ Nodemailer 이메일\. Vercel 서버리스에서 호출 가능\. 알림 설정은 channels 테이블에 notification\_config JSONB로 저장\.

## __8\.4 콘텐츠 에셋 스토리지 전략__

__에셋 유형__

__저장소__

__보존 기간__

캐릭터 레퍼런스 시트

Supabase Storage

영구

생성된 씬 이미지

Supabase Storage

90일 \(이후 저해상도 전환\)

생성된 MP4 영상

Supabase Storage / Cloudflare R2

90일 \(이후 삭제, 플랫폼에 업로드됨\)

TTS 오디오 파일

Supabase Storage

30일 \(이후 삭제\)

대본/메타데이터/감정곡선

Supabase DB \(JSONB\)

영구

성과 데이터

Supabase DB

영구

Supabase Storage의 무료 티어는 1GB, Pro 티어는 100GB입니다\. 콘텐츠 양이 많아지면 Cloudflare R2\(무료 이그레스\)로 이전을 고려합니다\.

## __8\.5 Phase별 QA 체크리스트__

각 Phase 구현 완료 후, 다음 Phase로 넘어가기 전 반드시 확인해야 할 항목들:

### __Phase 1 Done 기준__

- 채널 생성 → 프리셋 6단계 위자드 완주 → 캐릭터 등록 \(3가지 케이스 모두\) → 테스트 이미지 생성 확인
- A/B 프리뷰에서 3가지 화풍이 실제로 다르게 나오는지 확인
- 멀티 캐릭터 씬에서 캐릭터가 섞이지 않는지 최소 5회 테스트

### __Phase 2 Done 기준__

- 같은 주제로 YouTube/TikTok 버전 각각 생성 → 구조\(후킹, CTA 등\)가 실제로 다른지 확인
- 감정곡선 변경 시 BGM/자막/화면전환이 실제로 달라지는지 확인
- 메타데이터 3개 제목 생성 → 패턴이 각각 다른지 확인

### __Phase 3 Done 기준__

- YouTube 비공개 업로드 → 성공 확인 → 공개 전환 → 실제 재생 확인
- TikTok 업로드 → 성공 확인 → 실제 재생 확인
- 토큰 만료 후 자동 갱신 → 재업로드 성공 확인

### __Phase 4 Done 기준__

- 카나리아 캠페인 설정 → Vercel Cron 트리거 → 콘텐츠 자동 생성 → 승인 대기열 도착 확인
- 승인 → 자동 업로드 → 성공 확인 \(E2E 한 사이클 완주\)
- 예산 상한 도달 → 자동 정지 \+ 알림 수신 확인

### __Phase 5 Done 기준__

- 24h/72h/7d 성과 수집 Cron → 데이터 정상 저장 확인
- AI 분석 → 자동 반영 항목이 실제 캠페인에 적용됐는지 확인
- 수동 승인 항목이 대시보드에 표시되는지 확인

## __8\.6 보안 \+ 접근 권한 \+ 감사 로그__

- 채널별 접근 권한: channels\.assigned\_operators에 포함된 사용자만 해당 채널의 데이터에 접근 가능
- Supabase RLS \(Row Level Security\): 모든 테이블에 user\_id/channel\_id 기반 정책 적용
- OAuth 토큰: AES\-256 암호화 저장 \(ENCRYPTION\_KEY 환경변수\)
- 감사 로그: audit\_logs 테이블에 주요 액션 기록 \(캠페인 생성/수정, 콘텐츠 승인/반려, 업로드, 설정 변경\)
- API 키 노출 방지: 모든 외부 API 호출은 Vercel 서버리스 프록시를 통해서만 \(기존 패턴 유지\)

## __8\.7 플랫폼 정책 모니터링 \+ 자동 정지__

YouTube/TikTok의 AI 콘텐츠 정책은 수시로 변경됩니다\. 정책 위반 시 채널 정지/삭제 위험이 있으므로 방어 체계가 필요합니다\.

- 자동 업로드 빈도 제한: YouTube 일 6건, TikTok 일 10건 이내 \(보수적 기본값\)
- AI 생성 콘텐츠 라벨: 업로드 시 자동으로 AI 생성 표시 활성화
- 정책 변경 감지: 주 1회 YouTube/TikTok 개발자 블로그 자동 크롤링 → 변경 감지 시 운영자 알림
- 긴급 정지: 업로드 실패율이 30% 이상이면 해당 플랫폼 캠페인 전체 자동 일시정지
- 금지 콘텐츠 필터: 대본 생성 시 플랫폼 가이드라인 위반 키워드 자동 감지 \+ 차단

## __8\.8 상용화 준비 \(2차 목표\)__

1차\(내부 사용\)가 검증된 후 상용화로 확장할 때 필요한 준비 사항입니다\. Phase 1부터 DB 구조에 미리 반영해두면 나중에 뒤엎지 않아도 됩니다\.

### __과금 모델 \(하이브리드\)__

Starter: ₩49,000/월 — 1채널, 월 20개 콘텐츠, 표준 엔진\(Kling 2\.6\)

Pro:     ₩149,000/월 — 3채널, 월 100개 콘텐츠, 프리미엄 엔진\(Kling 3\.0\)

Business: ₩399,000/월 — 10채널, 무제한, 전용 지원

초과 사용: 건당 ₩2,000~5,000

프리미엄 엔진 추가: 건당 ₩3,000

추가 채널: 채널당 ₩30,000/월

### __멀티 테넌시 DB 준비__

현재 user\_id 기반 분리를 organization\_id로 확장합니다\. 모든 주요 테이블에 org\_id 컬럼을 Phase 1부터 미리 추가해두되, 1차에서는 단일 org로 운영합니다\. Supabase RLS 정책도 org\_id 기반으로 설정합니다\.

### __온보딩 'First 5 Minutes' 플로우__

신규 사용자가 5분 안에 첫 콘텐츠를 경험하는 플로우:

1. 계정 생성 \(30초\)
2. 첫 채널 만들기 \(30초\)
3. 프리셋 위자드 — 간소화 모드: 이름 \+ 캐릭터 1장 \+ 화풍 선택만 \(2분\)
4. 키워드 입력 → 첫 콘텐츠 생성 → '와, 이렇게 되는구나\!' \(2분\)

### __가치 대시보드__

고객에게 비용이 아닌 가치를 보여줍니다: '이번 달 50개 콘텐츠 생성, 총 조회수 12만, 평균 참여율 8\.3%, AI 추정 광고 가치 ₩2,400,000'\. ROI를 시각화하여 구독 갱신율을 높입니다\.

## __8\.9 구현 시 핵심 주의사항 \(함정 방지\)__

__함정 1 — 기능 먼저, 품질 나중:__ Phase 1~2에서 수동으로 20~30개 콘텐츠를 만들어보고, 품질이 확인된 후에 Phase 3\(자동 업로드\)로 넘어가세요\. 형편없는 콘텐츠를 자동으로 올리면 채널 알고리즘이 망가집니다\.

__함정 2 — 과도한 자동화:__ 초기에는 30% 자동 / 70% 사람으로 시작하세요\. 시스템이 검증된 후에 자동화 비율을 점진적으로 올리세요\. auto\_approve는 최소 50개 콘텐츠 운영 후에 켜세요\.

__함정 3 — 플랫폼 정책 무시:__ YouTube/TikTok의 AI 콘텐츠 정책은 수시로 변합니다\. 정책 모니터링 체계\(8\.7\)를 반드시 구축하고, 정책 변경 시 캠페인을 자동 정지하는 안전장치를 두세요\.

# __9\. 전체 DB 스키마 요약__

기존 Supabase 테이블에 추가되는 신규 테이블 전체 목록입니다\. 기존 users, projects 등의 테이블은 그대로 유지됩니다\.

__테이블명__

__Phase__

__핵심 역할__

__주요 FK__

channels

1

채널 워크스페이스 \(다채널 운영\)

users, brand\_presets

brand\_presets \(확장\)

1

브랜드 DNA \+ 캐릭터 \+ 화풍 \+ BGM

users

platform\_connections

3

OAuth 토큰 관리

users

campaigns

4

캠페인 설정 \+ 스케줄

channels, brand\_presets

approval\_queue

4

검수 대기열 \(장면별 재생성 지원\)

campaigns

upload\_logs

3

업로드 상태 추적

campaigns, approval\_queue

content\_analytics

5

성과 데이터

upload\_logs

feedback\_insights

5

AI 분석 결과

campaigns

audit\_logs

전체

감사 로그 \(누가 언제 무엇을\)

users, channels

## __테이블 관계도__

users

  ├── channels \(1:N\)

  │     └── brand\_presets \(1:1\)

  │           └── character\_profiles \(embedded jsonb\[\]\)

  ├── platform\_connections \(1:N\)

  └── campaigns \(via channels, 1:N\)

        ├── approval\_queue \(1:N\) — 장면별 재생성 지원

        │     └── upload\_logs \(1:N\)

        │           └── content\_analytics \(1:N\)

        └── feedback\_insights \(1:N\)

# __10\. API 엔드포인트 전체 목록__

기존 api/ 폴더의 auth\.ts, gemini\.ts, elevenlabs\.ts, fal\.ts에 추가되는 신규 엔드포인트입니다\.

## __9\.1 브랜드 프리셋 API \(brand\-preset\.ts\)__

__Method__

__Path__

__설명__

GET

/api/brand\-preset?user\_id=

내 프리셋 목록 조회

GET

/api/brand\-preset?id=

프리셋 상세 조회

POST

/api/brand\-preset

프리셋 생성

PUT

/api/brand\-preset

프리셋 수정

DELETE

/api/brand\-preset?id=

프리셋 삭제

## __9\.2 캠페인 API \(campaign\.ts\)__

__Method__

__Path__

__설명__

GET

/api/campaign?user\_id=

내 캠페인 목록

POST

/api/campaign

캠페인 생성

PUT

/api/campaign

캠페인 수정 \(일시정지/재개 포함\)

DELETE

/api/campaign?id=

캠페인 삭제

## __9\.3 스케줄러 API \(scheduler\-trigger\.ts\)__

__Method__

__Path__

__설명__

POST

/api/scheduler\-trigger

Vercel Cron이 호출 \(매 정시\)\. CRON\_SECRET 검증 필수

## __9\.4 플랫폼 인증 API__

__Method__

__Path__

__설명__

GET

/api/youtube\-auth

YouTube OAuth 시작 \(리디렉트\)

GET

/api/youtube\-auth/callback

YouTube OAuth 콜백 \(토큰 저장\)

GET

/api/tiktok\-auth

TikTok OAuth 시작

GET

/api/tiktok\-auth/callback

TikTok OAuth 콜백

POST

/api/youtube\-upload

YouTube 영상 업로드

POST

/api/tiktok\-upload

TikTok 영상 업로드

## __9\.5 승인 \+ 분석 API__

__Method__

__Path__

__설명__

GET

/api/approval?campaign\_id=

승인 대기 목록

POST

/api/approval/approve

콘텐츠 승인 \(업로드 큐 이동\)

POST

/api/approval/reject

콘텐츠 반려

GET

/api/analytics?campaign\_id=

캠페인 성과 조회

POST

/api/analytics/collect

수동 성과 수집 트리거

GET

/api/analytics/insights?campaign\_id=

AI 분석 인사이트 조회

# __11\. 구현 로드맵 \+ Claude Code 지시사항__

## __11\.0 선행 신청 체크리스트 \(Phase 1 시작 즉시\!\)__

아래 항목은 외부 회사의 심사/승인이 필요하므로, Phase 1 코딩 시작과 동시에 신청해야 코딩하는 동안 승인이 내려옵니다:

__신청 항목__

__예상 소요__

__필요 Phase__

__신청 방법__

YouTube Data API OAuth 앱

1~3일

Phase 3

Google Cloud Console에서 OAuth 동의 화면 설정

TikTok Content Posting API

1~2주

Phase 3

TikTok Developer Portal에서 앱 등록 \+ 검수

YouTube API 할당량 증가 \(선택\)

1~2주

Phase 5

기본 10,000유닛 → 필요시 증가 요청

__핵심:__ Phase 1 시작하는 날, 위 3가지를 전부 신청하세요\. 코딩하는 동안 승인이 도착합니다\.

## __11\.1 구현 순서 및 원칙__

이 PRD를 Claude Code에 전달할 때, 아래 원칙을 반드시 포함하세요:

1. Phase 순서대로 구현합니다\. Phase 1이 완전히 동작한 뒤 Phase 2로 넘어갑니다\.
2. 각 Phase 시작 시 해당 DB 테이블을 먼저 생성합니다 \(Supabase SQL\)\.
3. 기존 코드\(특히 prompts\.ts, App\.tsx, videoService\.ts\)를 수정할 때는 기존 기능이 깨지지 않도록 합니다\.
4. 새로운 서비스 파일은 기존 패턴\(geminiService\.ts 등\)과 동일한 코딩 스타일을 따릅니다\.
5. 모든 API 엔드포인트는 기존 auth\.ts의 인증 패턴을 따릅니다\.
6. 환경변수가 추가될 때마다 \.env\.local과 Vercel 환경변수 모두 업데이트합니다\.

## __11\.2 Phase별 Claude Code 프롬프트 가이드__

### __Phase 1 시작 시:__

"이 PRD 문서의 Phase 1 \(브랜드 프리셋 시스템\)을 구현해줘\.

1\. Supabase에 brand\_presets 테이블 생성 \(스키마는 PRD 3\.1 참조\)

2\. services/brandPresetService\.ts 생성 \(CRUD \+ 프롬프트 주입 로직\)

3\. components/BrandPresetManager\.tsx 생성 \(관리 UI\)

4\. api/brand\-preset\.ts 생성 \(REST API\)

5\. 기존 prompts\.ts에 브랜드 프리셋 연동 포인트 추가

기존 코드 스타일과 패턴을 그대로 따라줘\."

### __Phase 2 시작 시:__

"PRD Phase 2 \(스크립트 엔진 고도화\)를 구현해줘\.

1\. services/emotionCurveEngine\.ts 생성

2\. services/platformAdapterService\.ts 생성

3\. components/EmotionCurveEditor\.tsx 생성 \(시각적 에디터\)

4\. components/PlatformPreview\.tsx 생성 \(YT vs TT 비교\)

5\. 기존 geminiService\.ts의 대본 생성 로직에 감정곡선 통합

6\. 불완전함 주입 시스템 \(PRD 4\.2 참조\) 구현"

### __Phase 3 시작 시:__

"PRD Phase 3 \(자동 업로드\)를 구현해줘\.

1\. platform\_connections \+ upload\_logs 테이블 생성

2\. YouTube OAuth \+ Upload 서비스 구현

3\. TikTok OAuth \+ Upload 서비스 구현

4\. 관련 API 엔드포인트 생성

5\. 업로드 상태 추적 UI 추가"

### __Phase 4 시작 시:__

"PRD Phase 4 \(C2 PILOT 오케스트레이터\)를 구현해줘\.

1\. campaigns \+ approval\_queue 테이블 생성

2\. campaignService\.ts \+ schedulerService\.ts 구현

3\. vercel\.json에 cron job 추가

4\. api/scheduler\-trigger\.ts 구현 \(핵심 오케스트레이션 로직\)

5\. CampaignDashboard\.tsx \+ ApprovalQueue\.tsx UI 구현"

### __Phase 5 시작 시:__

"PRD Phase 5 \(피드백 루프\)를 구현해줘\.

1\. content\_analytics \+ feedback\_insights 테이블 생성

2\. analyticsService\.ts 구현 \(수집 \+ AI 분석\)

3\. 성과 수집 Cron 추가 \(24h/72h/7d 시점\)

4\. AnalyticsDashboard\.tsx 구현

5\. 피드백 → 캠페인 자동 반영 로직 구현"

## __11\.3 추가 환경변수 목록__

__변수명__

__Phase__

__용도__

YOUTUBE\_CLIENT\_ID

3

YouTube OAuth 앱 ID

YOUTUBE\_CLIENT\_SECRET

3

YouTube OAuth 시크릿

YOUTUBE\_REDIRECT\_URI

3

YouTube OAuth 콜백 URL

TIKTOK\_CLIENT\_KEY

3

TikTok 앱 키

TIKTOK\_CLIENT\_SECRET

3

TikTok 앱 시크릿

TIKTOK\_REDIRECT\_URI

3

TikTok OAuth 콜백 URL

CRON\_SECRET

4

Vercel Cron 인증 시크릿

ENCRYPTION\_KEY

3

토큰 암호화 키 \(AES\-256\)

## __11\.4 법적/윤리적 체크리스트__

- AI 생성 콘텐츠 라벨링: YouTube/TikTok 모두 AI 생성 콘텐츠 표시 옵션을 자동으로 활성화
- BGM 저작권: 현재 8종 BGM이 상업적 사용 가능한 라이선스인지 확인 필요
- 캐릭터 저작권: 브랜드 프리셋의 캐릭터가 기존 IP를 침해하지 않는지 운영자 책임 고지
- TikTok API 이용약관: 자동화 업로드에 대한 빈도 제한 준수 \(일 25건 이내 권장\)
- YouTube API 할당량: 일일 10,000 유닛 기본 할당량 모니터링 필요
- 개인정보: OAuth 토큰은 반드시 암호화 저장, 운영자 외 접근 불가

