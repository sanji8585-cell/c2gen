# InputSection UI 리디자인 설계서

**날짜**: 2026-03-09
**목업**: `docs/mockup-c.html`
**대상**: `components/InputSection.tsx` + 하위 컴포넌트

## 핵심 변경

1. **입력 필드를 최상단으로** — Hero Input (키워드 + 자동/수동 탭 + 시작 버튼)
2. **6개 독립 카드 → 3개 아코디언 그룹** — 이미지 설정 / 사운드 설정 / 프리셋
3. **아코디언 접힌 상태에서 2줄 요약 표시**
4. **색상 체계 통일** — brand-blue (#60a5fa) 중심, 그룹 아이콘에만 색상 구분

## 레이아웃 구조

```
Hero Input (top)
  ├─ 검색 아이콘 + input + placeholder
  └─ 자동/수동 탭 스위치 + 시작 버튼

── 설정 ── (divider)

[이미지 설정] (accordion)
  접힌 요약: "Gemini 2.5 Flash · 가로 16:9 · 캐릭터 0장 [강도 70%] · 스타일 0장 [강도 50%]"
             "화풍 없음 (기본) · 한글억제 ON"
  펼친 내용:
    1. 이미지 생성 모델 (2-col grid: Gemini / GPT)
    2. 영상 방향 (2-col: 가로 / 세로)
    3. 참조 이미지 (캐릭터 + 스타일, 강도 슬라이더)
    4. 화풍 선택 (모델에 따라 Gemini/GPT 화풍 + 미리보기 👁️)
    5. 커스텀 화풍 프롬프트 (textarea)

[사운드 설정] (accordion)
  접힌 요약: "Do Hyeon · ElevenLabs Eleven v3 · 속도 1.20x · 안정성 90%"
             "BGM AI 자동선택 ON · 볼륨 40% · 덕킹 20%"
  펼친 내용:
    1. 나레이션 음성 카드 (현재 음성 + 변경 버튼 → 드롭다운/검색)
    2. 음성 세부설정 (모델 선택, 속도 슬라이더, 안정성 슬라이더, 언어)
    3. BGM (자동선택 토글 + 볼륨/덕킹)

[프리셋] (accordion)
  접힌 요약: "2개 저장됨 · 최근: 금융 뉴스 (Gemini · 한국경제카툰 · Do Hyeon · 가로)"
  펼친 내용: 프리셋 카드 그리드 + 저장 버튼
```

## 보완 사항 (목업 대비)

1. **사운드 그룹에 VoiceSettings 세부 옵션 포함** — 속도/안정성 슬라이더, 모델 선택, 언어 선택, 음성 검색/필터
2. **GPT 모델 선택 시 GPT 화풍 표시** — 모델에 따라 조건부 렌더링 유지
3. **화풍 미리보기(👁️) 기능 유지** — 기존 preview 네비게이션 그대로
4. **GPT Image-1 참조이미지 미지원 경고** — 기존 경고 UI 유지

## 컴포넌트 구조

```
InputSection.tsx (리팩토링)
  ├─ HeroInput (새 컴포넌트)
  │    └─ 키워드 입력 + 탭 스위치 + 시작 버튼
  ├─ SettingsAccordion (새 컴포넌트)
  │    ├─ ImageSettingsGroup (새 컴포넌트)
  │    │    ├─ 모델 선택
  │    │    ├─ 영상 방향
  │    │    ├─ ReferenceImageSelector (기존)
  │    │    ├─ 화풍 선택 (Gemini/GPT 조건부)
  │    │    └─ 커스텀 프롬프트
  │    ├─ SoundSettingsGroup (새 컴포넌트)
  │    │    ├─ VoiceSettings (기존, 임베드 형태로)
  │    │    └─ BGM 설정
  │    └─ PresetGroup (새 컴포넌트)
  │         └─ 프리셋 카드 그리드
  └─ ManualScriptInput (자동/수동 탭이 수동일 때)
```

## CSS 전략

- 목업의 CSS 변수 체계 (`--bg-base`, `--bg-surface` 등) 는 기존과 동일하므로 호환
- Tailwind 클래스 → CSS 모듈 또는 인라인 스타일 (기존 패턴 유지)
- 아코디언 transition: `max-height 0.4s ease`
- 선택 상태: `rgba(96, 165, 250, 0.08)` + `border-color: rgba(96, 165, 250, 0.6)`

## 상태 관리

- 아코디언 열림 상태: `openGroup: 'image' | 'sound' | 'preset' | null`
- 기존 상태 (imageModelId, geminiStyleId, videoOrientation 등) 그대로 유지
- 접힌 요약은 기존 상태값에서 실시간 파생 (useMemo)
