# WORKLOG - imagemaker 브랜치 작업 현황

> 마지막 업데이트: 2026-03-06
> 브랜치: `imagemaker`
> 이전 커밋 (main 기준): 6개 커밋 누적

---

## 1. 이번 작업에서 추가/변경된 것 (요약)

### A. 게이미피케이션 시스템 (신규)
전체 앱에 게임 요소를 추가하는 대규모 작업.

| 구분 | 파일 | 설명 |
|------|------|------|
| 타입 | `types/gamification.ts` | 게임 관련 타입 정의 (레벨, XP, 업적, 퀘스트, 가챠 등) |
| DB 스키마 | `docs/gamification-schema.sql` | Supabase 테이블/RPC/시드 데이터 (레벨 30단계, 업적 20종, 퀘스트 7종, 가챠 아이템 25+종) |
| DB 스키마 | `supabase-credit-schema.sql` | 크레딧 관련 DB 스키마 |
| 서비스 | `services/gamificationService.ts` | 게이미피케이션 API 연동 (XP, 레벨업, 업적 체크, 가챠) |
| 훅 | `hooks/useGameState.ts` | 게임 상태 관리 React 훅 |
| UI | `components/GameOverlay.tsx` | 레벨업/업적 알림 오버레이 (831줄) |
| UI | `components/AchievementShowcase.tsx` | 업적 진열장 (394줄) |
| UI | `components/DailyQuestPanel.tsx` | 일일 퀘스트 패널 (309줄) |
| UI | `components/InventoryModal.tsx` | 인벤토리 (가챠 아이템 관리, 608줄) |
| UI | `components/LeaderboardWidget.tsx` | 리더보드 위젯 (174줄) |
| UI | `components/UserProfile.tsx` | 유저 프로필 (레벨, 칭호, 배지, 575줄) |
| UI | `components/EventBanner.tsx` | 이벤트 배너 (129줄) |
| 관리자 | `components/admin/AdminGamification.tsx` | 게이미피케이션 관리 탭 |
| 관리자 | `components/admin/game/*.tsx` | 게임 관리 하위 컴포넌트 7개 (업적, 퀘스트, 가챠, 이벤트, 설정 등) |

### B. 결제/크레딧 시스템 (신규)
| 파일 | 설명 |
|------|------|
| `api/payments.ts` | Toss Payments 연동 API (결제 승인, 웹훅) |
| `components/CreditShop.tsx` | 크레딧 충전 모달 (358줄) |
| `components/PaymentSuccess.tsx` | 결제 완료 페이지 |
| `components/admin/AdminCredits.tsx` | 관리자 크레딧 관리 (296줄) |

### C. 플레이그라운드 (신규)
| 파일 | 설명 |
|------|------|
| `api/playground.ts` | 플레이그라운드 API |
| `services/playgroundService.ts` | 플레이그라운드 서비스 |
| `components/Playground.tsx` | 플레이그라운드 UI (727줄) |

### D. 썸네일 생성기 (신규)
| 파일 | 설명 |
|------|------|
| `services/thumbnailService.ts` | Canvas 기반 썸네일 생성 (525줄) |
| `components/ThumbnailGenerator.tsx` | 썸네일 생성 모달 (476줄) |

### E. BGM/사운드 (신규)
| 파일 | 설명 |
|------|------|
| `services/bgmGenerator.ts` | AI 분위기 분석 → BGM 자동 선택 (497줄) |
| `services/soundService.ts` | 효과음 서비스 (172줄) |

### F. 기존 파일 주요 변경
| 파일 | 변경 내용 |
|------|-----------|
| `App.tsx` | +1199줄 — 게이미피케이션, BGM, 썸네일, 다국어 통합 |
| `api/auth.ts` | +2016줄 — 사용자 관리 대폭 확장 (크레딧, 세션, 활동 로그, 관리자 기능) |
| `components/InputSection.tsx` | +734줄 — 언어 선택기, 참조 이미지 UI 개선 |
| `components/admin/*.tsx` | 관리자 대시보드 전체 리뉴얼 (분석, 로그, 유저 상세, 프로젝트 뷰어) |
| `config.ts` | +304줄 — BGM 라이브러리, 언어 설정, 가격 정보 추가 |
| `services/prompts.ts` | +254줄 — V10.0 프롬프트 엔진 (다국어, 색상 시스템, 구도) |
| `types.ts` | +50줄 — 새로운 타입 추가 |
| `index.html` | +186줄 — 메타태그, 폰트, 스타일 업데이트 |

### G. 기타 신규 파일
| 파일 | 설명 |
|------|------|
| `api/openai.ts` | OpenAI API 프록시 (선택적) |
| `hooks/useTheme.ts` | 다크모드 테마 훅 |
| `components/AuthModal.tsx` | 인증 모달 (리팩토링) |
| `components/admin/AdminActivityLogs.tsx` | 활동 로그 뷰어 |
| `scripts/generate-previews.mjs` | 프리뷰 생성 스크립트 |
| `scripts/generate-samples.mjs` | 샘플 생성 스크립트 |

---

## 2. 아직 완료되지 않은 것 (TODO)

- [ ] 게이미피케이션 DB 스키마 Supabase에 실제 적용 (`docs/gamification-schema.sql` 실행)
- [ ] Toss Payments 실제 API 키 연동 및 테스트
- [ ] Google/Kakao OAuth 소셜 로그인 활성화
- [ ] `public/bgm/` 폴더에 실제 BGM MP3 파일 추가
- [ ] 프로덕션 빌드 테스트 (`npm run build`)
- [ ] Vercel 배포 테스트

---

## 3. 집 PC 세팅 가이드

```bash
# 1. 클론 (처음) 또는 풀 (이미 있으면)
git clone https://github.com/sanji8585-cell/c2gen.git
cd c2gen
git checkout imagemaker

# 또는 이미 클론했으면:
cd c2gen
git fetch origin
git checkout imagemaker
git pull origin imagemaker

# 2. 의존성 설치
npm install

# 3. 환경변수 설정 (.env.local 생성)
# 이 파일은 git에 포함 안 됨 — 직접 만들어야 함
cat > .env.local << 'EOF'
GEMINI_API_KEY=여기에_키
FAL_API_KEY=여기에_키
ELEVENLABS_API_KEY=여기에_키
SUPABASE_URL=여기에_URL
SUPABASE_SERVICE_ROLE_KEY=여기에_키
EOF

# 4. 개발 서버 실행
npm run dev
```

---

## 4. 주요 파일 구조 (참고)

```
├── api/               # Vercel 서버리스 API
│   ├── auth.ts        # 인증/사용자 관리
│   ├── gemini.ts      # Gemini AI 프록시
│   ├── fal.ts         # fal.ai 프록시
│   ├── elevenlabs.ts  # TTS 프록시
│   ├── payments.ts    # 결제 (Toss)
│   └── playground.ts  # 플레이그라운드
├── components/        # React 컴포넌트
│   ├── admin/         # 관리자 대시보드
│   │   └── game/      # 게임 관리 하위 컴포넌트
│   ├── GameOverlay.tsx    # 게임 오버레이
│   ├── CreditShop.tsx     # 크레딧 충전
│   └── ...
├── services/          # 비즈니스 로직
├── hooks/             # React 훅
├── types/             # 타입 정의
├── docs/              # DB 스키마 등 문서
├── scripts/           # 유틸리티 스크립트
├── CLAUDE.md          # AI 코딩 가이드 (프로젝트 전체 설명)
└── WORKLOG.md         # ← 이 파일 (작업 현황)
```
