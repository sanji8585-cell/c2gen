# Phase 2: 감정곡선 엔진 설계

## 범위
- 스토리 아크 자동 선택 (8가지)
- 플랫폼별 감정곡선 변형 (YouTube Shorts / TikTok)
- curve_points 데이터 구조
- EmotionCurveEditor 시각적 에디터 UI
- 기존 대본 생성 파이프라인 통합

## 타입 (types.ts)

```typescript
type StoryArcType = 'problem_solution' | 'reversal' | 'emotional' | 'horror_warning' | 'humor' | 'educational' | 'vlog' | 'series';

type EmotionType = 'curiosity' | 'tension' | 'surprise' | 'empathy' | 'warmth' | 'lingering' | 'excitement' | 'calm' | 'fear';

type PlatformVariant = 'youtube_shorts' | 'tiktok' | 'youtube_long';

interface EmotionCurvePoint {
  time: number;          // 초
  emotion: EmotionType;
  intensity: number;     // 0~1
  label: string;         // "후킹", "반전" 등
  visual_cue: string;    // "quick_zoom", "slow_pan" 등
  bgm_shift: string;     // "mystery_buildup", "warm_acoustic" 등
  tts_pace: 'fast' | 'normal' | 'slow';
  subtitle_style: string;
}

interface EmotionCurve {
  story_arc: StoryArcType;
  platform_variant: PlatformVariant;
  total_duration: number;
  curve_points: EmotionCurvePoint[];
}
```

## 서비스 (services/emotionCurveEngine.ts)

1. `STORY_ARCS` — 8가지 아크 정의 (구조, 적합 콘텐츠)
2. `selectStoryArc(topic)` — Gemini에 주제 분석 → 최적 아크 반환
3. `generateEmotionCurve(arc, platform, duration)` — Gemini에 아크+플랫폼 → curve_points 생성
4. `applyEmotionToScenes(curve, scenes)` — ScriptScene[]에 감정 메타 주입

## UI (components/EmotionCurveEditor.tsx)

- Canvas 기반 감정곡선 시각화
- X축: 시간, Y축: 감정 강도 (0~1)
- 드래그 가능한 포인트 (curve_points)
- 포인트 클릭 시 상세 편집 (emotion, visual_cue, bgm_shift 등)
- 아크 타입 드롭다운으로 전체 곡선 교체 가능

## 통합 포인트

- App.tsx: 대본 생성 후 감정곡선 자동 생성 → SCRIPT_REVIEW 단계에서 표시
- InputSection.tsx: 플랫폼 선택 옵션 추가 (youtube_shorts / tiktok)
- ScriptScene 타입에 emotion_meta 필드 추가
