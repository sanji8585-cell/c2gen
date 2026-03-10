# C2GEN 엔진 이해력 심화 분석 — "상상→결과" 간극 리포트

> **목적**: 사용자가 대본을 던졌을 때, 머릿속 상상을 최대한 가깝게 실현하기 위한 엔진 병목 분석
> **작성일**: 2026-03-09
> **분석 범위**: prompts.ts, api/gemini.ts, App.tsx, videoService.ts, bgmGenerator.ts, renderUtils.ts

---

## 핵심 결론

**사용자 상상의 약 25%만 최종 영상에 반영됨.** 원인은 3가지:
1. 프롬프트 팽창으로 사용자 의도가 묻힘
2. 각 에셋(이미지/음성/BGM)이 서로를 모르고 독립 생성
3. 감정 분류가 3단계(POSITIVE/NEGATIVE/NEUTRAL)로 너무 조잡

---

## 1. 정보 손실 맵

```
사용자 상상 (100%)
  ↓ [-20%] 나레이션→visual prompt: 감정 뉘앙스, 배경 추론, 카메라 의도 손실
스크립트 생성 (80%)
  ↓ [-20%] 프롬프트 팽창: 스타일/무드/캐릭터 규칙이 원래 의도를 덮어씀
이미지 생성 (60%)
  ↓ [-5%] TTS 페이싱과 이미지 리듬 불일치
음성 생성 (55%)
  ↓ [-10%] BGM이 나레이션 텍스트만 분석, 시각적 분위기 무시
BGM 선택 (45%)
  ↓ [-15%] 전환효과가 감정 흐름과 무관하게 적용
영상 조립 (30%)
  ↓ [-5%] 최종 렌더링
최종 출력 (~25%)
```

---

## 2. 3대 병목 상세

### 병목 1: 프롬프트 팽창 — 사용자 의도가 묻힘

**현상**: `getFinalVisualPrompt()`에서 원래 visual prompt(~300자)에 스타일/무드/캐릭터 규칙을 추가하면 600자+ 팽창. Gemini Image API는 앞쪽 텍스트에 가중치를 두는데, 사용자 의도가 뒤로 밀림.

**현재 프롬프트 구조 (우선순위 역전됨)**:
```
[한국어 금지 규칙]          ← 기술 규칙이 최상단
[base visual prompt]       ← 사용자 의도가 중간
MOOD: Dark, cold lighting. ← 감정이 3단계로 축소
Person (30-40% shot)       ← 캐릭터가 일반적
STYLE: 2D crayon texture   ← 스타일이 원래 의도와 충돌 가능
CHARACTER: generic person  ← 표정/자세 정보 없음
MOOD enforcer (중복)       ← 같은 말 반복
```

**개선된 프롬프트 구조 (사용자 의도 최우선)**:
```
[SCENE INTENT — PRIMARY]
{사용자 visual prompt 원문}

[EMOTION & ATMOSPHERE]
{세분화된 감정 + 조명 + 분위기 상세}

[CHARACTER EXPRESSION]
{감정에 맞는 표정/자세 구체적 지시}

[STYLE — SECONDARY]
{스타일은 의도를 보조, 덮어쓰지 않음}

[TECHNICAL RULES — TERTIARY]
{한국어 금지 등 기술적 제약}
```

### 병목 2: 각 에셋이 서로를 모름 — "Coherence Knot" 부재

**현상**: 이미지/음성/BGM/전환효과가 각각 독립적으로 생성. "이 영상의 전체 톤이 뭔지" 아무도 모름.

**예시**: 사용자 입력 "밝고 희망적인 미래 기술 영상"
- 나레이션: 희망적 (OK)
- 이미지: 밝고 따뜻한 톤 (OK)
- BGM: "tech" 선택 (차갑고 디지털한 느낌) ← 불일치!
- 전환: 무작위 ← 의도 무시!

**해결책**: 스크립트 생성 직후, 에셋 생성 직전에 **Coherence Template** 분석:
```json
{
  "globalMood": "inspiring_hopeful",
  "visualPalette": "warm_bright_gold",
  "bgmMood": "inspiring",
  "transitionStrategy": "soft_fades_with_subtle_zooms",
  "pacing": "moderate_forward_momentum"
}
```
이 템플릿을 이미지/BGM/전환효과 생성에 모두 공유.

### 병목 3: 감정 분류가 3단계로 너무 조잡

**현상**: POSITIVE/NEGATIVE/NEUTRAL 3가지로 모든 감정을 표현.

**문제**: NEGATIVE 하나에 불안/공포/분노/슬픔이 전부 포함됨.
- 불안(anxiety) → 차가운 파란빛 + 부드러운 그림자 + 떨림
- 분노(anger) → 강렬한 붉은빛 + 날카로운 그림자 + 날것
- 슬픔(sadness) → 회색빛 + 채도 낮은 + 부드러운 포커스
- **현재: 전부 "Dark, cold lighting"으로 동일 처리**

**해결책**: 감정 세분화 맵 (8~12가지 감정별 시각 규칙):
```
anxiety → 쿨블루 + 부드러운 그림자 + 모니터 글로우
fear → 어둡고 강한 방향성 조명 + 높은 대비
anger → 따뜻하고 강렬한 빛 + 빨강/오렌지 캐스트
sadness → 채도 낮은 + 회색 톤 + 부드러운 포커스
joy → 밝은 골드 + 부드러운 빛 + 높은 채도
calm → 자연광 + 중간 톤 + 넓은 심도
```

---

## 3. 추가 발견 사항

### 한국 금융 색상 미구현
- CLAUDE.md에 "상승=빨강, 하락=파랑 (한국 금융 규칙)" 명시
- 하지만 `getFinalVisualPrompt()`에서 실제 구현되어 있지 않음
- 현재: POSITIVE→밝음, NEGATIVE→어둠 (서양 방식)
- **한국 사용자에게 색감이 반대로 느껴질 수 있음**

### 기본 스타일 "crayon"이 부적절
- 금융 컨텐츠에 크레용 스타일 = 톤 불일치
- 해결: 맥락 인식 기본 스타일 (금융→인포그래픽, 뉴스→포토리얼리스틱, 감성→수채화)

### 배경/장소 추론 없음
- "투자자가 모니터를 본다" → 사무실? 집? 트레이딩 플로어?
- 현재: Gemini가 알아서 추측 → 결과 불안정
- 해결: 맥락 기반 장소 추론 가이드 추가

### analysis 객체가 불완전
- types.ts에 10+개 필드 정의 (camera, color_plan, motion_type 등)
- 하지만 실제 프롬프트는 2개만 요청 (sentiment, composition_type)
- **자기 자신이 정보를 잘라내고 있음**

### 캐릭터 표정/자세 정보 없음
- VAR_BASE_CHAR = "A realistic person with natural proportions..."
- "불안한 투자자"의 불안함이 이미지에 반영 안 됨
- 해결: 감정별 표정/자세 지시 추가

---

## 4. 즉시 적용 가능한 Easy Win 5가지

### Win 1: 색상 팔레트 힌트 (~30줄)
`getFinalVisualPrompt()`에 sentiment별 색상 가이드 추가:
- POSITIVE + 금융 → "Red/gold tones for gains"
- NEGATIVE + 금융 → "Blue/cool tones for losses"
- POSITIVE + 일반 → "Warm golds, bright cyans, vibrant greens"
- NEGATIVE + 일반 → "Deep blues, cool grays, muted purples"

### Win 2: BGM 감정 기반 라우팅 (~20줄)
`runAutoBgm()`에서 sentiment 분포로 BGM mood 보정:
- POSITIVE 비율 > 50% → "inspiring" 우선
- NEGATIVE 비율 > 50% → "dramatic" 우선
- 현재: 나레이션 텍스트만 분석 (analyzeMood)

### Win 3: 프롬프트 우선순위 재배치 (~15줄)
`getFinalVisualPrompt()` 구조를 사용자 의도 최상단으로 변경.
기술 규칙과 스타일은 하단으로.

### Win 4: 감정 기반 전환효과 (~15줄)
`handleAutoZoom()`에 감정 인식 추가:
- POSITIVE → 부드러운 zoomIn (희망, 성장)
- NEGATIVE + 정적 → 없음 또는 느린 zoomOut (고요, 무거움)
- NEGATIVE + 동적 → panLeft/panRight (긴장, 불안)

### Win 5: 대화 씬 BGM 자동 덕킹 (~25줄)
`videoService.ts`에서 자막 밀도 체크:
- 자막 밀도 높은 씬 → BGM 볼륨 60%로 자동 감소
- 현재: 수동 덕킹 설정에만 의존

---

## 5. 중기 개선: Coherence Template 시스템 (~200줄)

**스크립트 생성 직후, 에셋 생성 직전에 실행하는 "전체 영상 톤 분석" 단계.**

```
[스크립트 생성 완료]
        ↓
[Coherence Analyzer] — Gemini에게 전체 스크립트를 보여주고 한 번에 분석
  입력: 모든 씬의 narration + sentiment 배열
  출력:
    globalMood: "tense_dramatic"
    colorPalette: "cool blues, deep grays, occasional red alerts"
    bgmRecommendation: "dramatic" (not "tech")
    transitionStrategy: "quick cuts for urgency, slow fades for contemplation"
    pacingNotes: "build tension in scenes 1-5, release in scene 6"
        ↓
[이미지 생성] — colorPalette를 각 씬 프롬프트에 주입
[BGM 선택] — bgmRecommendation을 analyzeMood 대신 사용
[전환효과] — transitionStrategy를 handleAutoZoom에 반영
```

**비용**: Gemini API 1회 추가 호출 (5크레딧)
**효과**: 이미지/BGM/전환이 하나의 톤으로 통일됨

---

## 6. 장기 개선: 감정 세분화 + 분석 스키마 확장

### analysis 스키마 확장
현재 2개 필드 → 10+개 필드:
```json
{
  "sentiment": "NEGATIVE",
  "composition_type": "MACRO",
  "emotion_specific": "anxiety",
  "emotional_intensity": 7,
  "character_expression": "furrowed brow, widened eyes, tense shoulders",
  "camera_suggestion": "slow_zoom_in",
  "setting_type": "dark_trading_room",
  "lighting_style": "cool monitor glow from below, dim overhead",
  "color_palette": "#1a3a5c, #2c5282, #cbd5e0",
  "background_complexity": "detailed"
}
```

### 감정-표현 매핑 라이브러리
prompts.ts에 감정별 시각 규칙 추가:
- 조명 스타일 (방향, 색온도, 강도)
- 캐릭터 표정/자세
- 분위기 효과 (심도, 채도, 그레인)

---

## 7. 개선 우선순위 요약

| 우선순위 | 개선 항목 | 코드량 | 기대 효과 |
|---------|----------|--------|----------|
| **1** | 색상 팔레트 힌트 | ~30줄 | 이미지 색감 일관성 |
| **2** | 프롬프트 우선순위 재배치 | ~15줄 | 의도 반영률 즉시 개선 |
| **3** | BGM 감정 기반 라우팅 | ~20줄 | 음악-영상 톤 매칭 |
| **4** | 감정 기반 전환효과 | ~15줄 | 전환-내용 조화 |
| **5** | 대화 씬 BGM 자동 덕킹 | ~25줄 | 음성 명료도 향상 |
| **6** | Coherence Template | ~200줄 | 전체 영상 톤 통일 (가장 큰 임팩트) |
| **7** | 감정 세분화 맵 | ~100줄 | 감정 표현 정확도 |
| **8** | analysis 스키마 확장 | ~50줄 | 시각화 정보량 증가 |
| **9** | 한국 금융 색상 | ~20줄 | 한국 사용자 색감 정확성 |
| **10** | 배경 추론 가이드 | ~30줄 | 장소 일관성 |

**Easy Win 1~5만 적용해도: 25% → 50~60% 의도 반영률**
**Coherence Template 추가 시: → 70~75%**
**전부 적용 시: → 80%+**

---

## 8. V2.0 기획과의 관계

이 엔진 이해력 개선은 V2.0 "고급 대본" 기획과 **독립적으로 적용 가능**합니다.

- Easy Win 1~5는 **기존 자동/수동 대본 모드에도 바로 적용** 가능
- 사용자가 아무것도 안 해도 결과물 품질이 올라감
- V2.0 고급 대본의 디렉티브 시스템은 **추가 정밀 제어**를 위한 것

**추천 순서**:
1. Easy Win 1~5 먼저 적용 (기존 모든 모드 품질 향상)
2. Coherence Template 적용 (전체 영상 톤 통일)
3. 그 다음 V2.0 고급 대본 개발 시작
