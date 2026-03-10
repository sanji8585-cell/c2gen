# Engine Intent Fidelity — Easy Win 1~5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 사용자 의도 반영률을 25% → 50~60%로 끌어올리는 5가지 Easy Win 구현

**Architecture:** 기존 `prompts.ts`, `App.tsx`, `videoService.ts` 파일만 수정. 새 파일 없음. 각 Win은 독립적으로 동작하며, 기존 데이터 구조(`ScriptScene.analysis.sentiment`, `BgmMood`)를 그대로 활용.

**Tech Stack:** React 19 + TypeScript, 기존 서비스 레이어

---

## Task 1: Win 1 — 색상 팔레트 힌트 추가

**Files:**
- Modify: `services/prompts.ts:61-106` (`getFinalVisualPrompt`)

**Why:** 현재 sentiment → "Dark/cold/bright/warm lighting" 3줄이 전부. 한국 금융 색상(상승=빨강, 하락=파랑) 미구현. 색상 가이드를 추가하면 이미지 색감 일관성이 즉시 개선됨.

**Step 1: 색상 팔레트 헬퍼 함수 작성**

`getFinalVisualPrompt` 바로 위에 헬퍼 추가:

```typescript
/**
 * sentiment + 콘텐츠 맥락 기반 색상 팔레트 힌트
 */
const getColorPaletteHint = (sentiment: string, narration: string): string => {
  // 금융/경제 키워드 감지
  const isFinancial = /주식|투자|금융|경제|증시|코스피|나스닥|stock|invest|financ|market|GDP|금리|환율|부동산/i.test(narration);

  if (isFinancial) {
    // 한국 금융 색상 규칙: 상승=빨강, 하락=파랑
    if (sentiment === 'POSITIVE') return 'COLOR PALETTE: Red and gold tones (Korean financial convention: red = gains/growth). Warm reds, bright golds, energetic orange accents.';
    if (sentiment === 'NEGATIVE') return 'COLOR PALETTE: Blue and cool tones (Korean financial convention: blue = losses/decline). Deep blues, cool grays, muted steel.';
    return 'COLOR PALETTE: Neutral financial tones. Clean whites, medium grays, subtle blue-gray accents.';
  }

  // 일반 콘텐츠
  if (sentiment === 'POSITIVE') return 'COLOR PALETTE: Warm golds, bright cyans, vibrant greens. High saturation, optimistic feel.';
  if (sentiment === 'NEGATIVE') return 'COLOR PALETTE: Deep blues, cool grays, muted purples. Lower saturation, somber atmosphere.';
  return 'COLOR PALETTE: Balanced mid-tones. Natural colors, moderate saturation.';
};
```

**Step 2: getFinalVisualPrompt에 색상 팔레트 주입**

`getFinalVisualPrompt` 내부에서 mood 변수 바로 아래에 추가:

```typescript
  // 분위기
  const mood = sentiment === 'NEGATIVE' ? 'Dark, cold lighting.'
    : sentiment === 'POSITIVE' ? 'Bright, warm lighting.'
    : 'Balanced lighting.';

  // ✅ 추가: 색상 팔레트 힌트
  const colorHint = getColorPaletteHint(sentiment, scene.narration || '');
```

return 템플릿의 `MOOD: ${mood}` 줄 바로 아래에 `${colorHint}` 삽입:

```typescript
  return `
${koreanRule ? koreanRule + '\n\n' : ''}${basePrompt}

MOOD: ${mood}
${colorHint}
${charPrompt}
${keywords ? `TEXT: "${keywords}"` : ''}

${style}
${char}
${VAR_MOOD_ENFORCER}
`.trim();
```

**Step 3: 커밋**

```bash
git add services/prompts.ts
git commit -m "feat: add color palette hints based on sentiment and financial context"
```

---

## Task 2: Win 2 — BGM 감정 기반 라우팅 보정

**Files:**
- Modify: `App.tsx:716-756` (`runAutoBgm` 내부)

**Why:** 현재 `analyzeMood(narrations)`만으로 BGM 결정. 씬별 sentiment 분포를 추가 고려하면 BGM-영상 톤 매칭이 개선됨. 예: 전체적으로 POSITIVE인데 `analyzeMood`가 "tech"(차가운) 반환하면 → "inspiring"으로 보정.

**Step 1: sentiment 분포 기반 mood 보정 로직 작성**

`runAutoBgm` 함수 내부, `analyzeMood` 호출 후에 보정 로직 추가:

```typescript
          const moodResult = await analyzeMood(narrations);
          if (isAbortedRef.current) return;

          // ✅ 추가: sentiment 분포 기반 BGM mood 보정
          let detectedMood = moodResult.mood as BgmMood;
          const sentiments = initialAssets.map(a => a.analysis?.sentiment).filter(Boolean);
          if (sentiments.length > 0) {
            const posRatio = sentiments.filter(s => s === 'POSITIVE').length / sentiments.length;
            const negRatio = sentiments.filter(s => s === 'NEGATIVE').length / sentiments.length;

            // POSITIVE 60%+ 인데 차가운 mood면 → inspiring으로 보정
            if (posRatio >= 0.6 && ['tech', 'dark', 'dramatic'].includes(detectedMood)) {
              detectedMood = 'inspiring';
            }
            // NEGATIVE 60%+ 인데 밝은 mood면 → dramatic으로 보정
            if (negRatio >= 0.6 && ['upbeat', 'inspiring', 'calm'].includes(detectedMood)) {
              detectedMood = 'dramatic';
            }
          }
```

기존 `const detectedMood = moodResult.mood as BgmMood;` 줄을 삭제하고 위 블록으로 교체.

**Step 2: 커밋**

```bash
git add App.tsx
git commit -m "feat: add sentiment-based BGM mood correction in runAutoBgm"
```

---

## Task 3: Win 3 — 프롬프트 우선순위 재배치

**Files:**
- Modify: `services/prompts.ts:95-105` (return 템플릿)

**Why:** 현재 프롬프트 구조는 `koreanRule` → `basePrompt` → `mood` → `char` → `style` → `VAR_MOOD_ENFORCER`. Gemini Image API는 앞쪽 텍스트에 가중치를 더 두므로, 사용자 의도(`basePrompt`)를 최상단에, 기술 규칙을 최하단에 배치해야 함.

**Step 1: return 템플릿 구조 변경**

기존 return 블록:
```typescript
  return `
${koreanRule ? koreanRule + '\n\n' : ''}${basePrompt}

MOOD: ${mood}
${colorHint}
${charPrompt}
${keywords ? `TEXT: "${keywords}"` : ''}

${style}
${char}
${VAR_MOOD_ENFORCER}
`.trim();
```

새 구조 (사용자 의도 최상단, 기술 규칙 최하단):
```typescript
  return `
[SCENE INTENT]
${basePrompt}

[EMOTION & ATMOSPHERE]
MOOD: ${mood}
${colorHint}

[CHARACTER]
${charPrompt}
${char}
${keywords ? `\n[ON-SCREEN TEXT]\nTEXT: "${keywords}"` : ''}

[STYLE]
${style}

[RULES]
${koreanRule || ''}
${VAR_MOOD_ENFORCER}
`.trim();
```

**핵심 변경:**
1. `basePrompt` (사용자 의도)가 무조건 최상단
2. 감정/분위기/색상이 그 다음
3. 캐릭터/스타일이 중간
4. 한국어 금지 규칙 + MOOD enforcer가 최하단

**Step 2: 커밋**

```bash
git add services/prompts.ts
git commit -m "feat: reorder prompt structure — user intent first, rules last"
```

---

## Task 4: Win 4 — 감정 기반 전환효과 개선

**Files:**
- Modify: `App.tsx:1233-1241` (`handleAutoZoom` sentiment case)

**Why:** 현재 sentiment 패턴은 4가지 경우만 처리. POSITIVE+정적(잔잔한 희망), NEGATIVE+동적(불안/긴장) 등 더 세밀한 매핑이 필요. 리포트 권고사항 반영.

**Step 1: sentiment case 분기 확장**

기존:
```typescript
        case 'sentiment': {
          const asset = assetsRef.current[i];
          const sentiment = asset.analysis?.sentiment;
          const motionType = asset.analysis?.motion_type;
          if (sentiment === 'POSITIVE' && motionType === '동적') effect = 'zoomIn';
          else if (sentiment === 'NEGATIVE' && motionType === '정적') effect = 'zoomOut';
          else if (motionType === '동적') effect = i % 2 === 0 ? 'panLeft' : 'panRight';
          else effect = 'zoomIn';
          break;
        }
```

개선:
```typescript
        case 'sentiment': {
          const asset = assetsRef.current[i];
          const sentiment = asset.analysis?.sentiment;
          const motionType = asset.analysis?.motion_type;
          // 리포트 Easy Win 4: 감정 기반 전환효과 세분화
          if (sentiment === 'POSITIVE' && motionType === '동적') {
            effect = 'zoomIn';           // 희망, 성장, 에너지
          } else if (sentiment === 'POSITIVE' && motionType === '정적') {
            effect = 'zoomIn';           // 잔잔한 희망, 부드러운 접근
          } else if (sentiment === 'NEGATIVE' && motionType === '정적') {
            effect = 'none';             // 고요한 무거움, 정적 긴장
          } else if (sentiment === 'NEGATIVE' && motionType === '동적') {
            effect = i % 2 === 0 ? 'panLeft' : 'panRight'; // 불안, 긴장감
          } else if (motionType === '동적') {
            effect = i % 2 === 0 ? 'panLeft' : 'panRight'; // NEUTRAL 동적
          } else {
            effect = 'zoomIn';           // NEUTRAL 기본
          }
          break;
        }
```

**핵심 변경:**
- `POSITIVE + 정적` → `zoomIn` (기존: 기본 fallback `zoomIn` → 명시적으로)
- `NEGATIVE + 정적` → `none` (기존: `zoomOut` → 고요한 무거움은 움직임 없이)
- `NEGATIVE + 동적` → `panLeft/panRight` (기존: 매칭 안 됨 → 이제 불안/긴장 표현)

**Step 2: 커밋**

```bash
git add App.tsx
git commit -m "feat: refine sentiment-based zoom effects for better emotional matching"
```

---

## Task 5: Win 5 — 자막 밀도 기반 BGM 자동 덕킹

**Files:**
- Modify: `services/videoService.ts:680-698` (덕킹 로직)

**Why:** 현재 덕킹은 `bgmDuckingEnabled` 옵션이 꺼져 있으면 전혀 동작하지 않음. 자막(나레이션)이 있는 모든 씬에서 자동으로 BGM 볼륨을 낮추면 음성 명료도가 크게 향상됨.

**Step 1: 자동 덕킹 로직 추가**

기존 코드 (수동 덕킹만):
```typescript
      // 자동 덕킹: 나레이션 구간에서 BGM 볼륨 자동 감소
      const duckingEnabled = options?.bgmDuckingEnabled ?? false;
      if (duckingEnabled) {
        const duckingAmount = options?.bgmDuckingAmount ?? 0.3;
        const duckVolume = baseVolume * duckingAmount;
        const RAMP_TIME = 0.3;

        preparedScenes.forEach(scene => {
          if (scene.audioBuffer) {
            const duckStart = masterStartTime + scene.startTime;
            bgmGain.gain.setValueAtTime(baseVolume, duckStart);
            bgmGain.gain.linearRampToValueAtTime(duckVolume, duckStart + RAMP_TIME);

            const duckEnd = masterStartTime + scene.endTime;
            bgmGain.gain.setValueAtTime(duckVolume, duckEnd);
            bgmGain.gain.linearRampToValueAtTime(baseVolume, duckEnd + RAMP_TIME);
          }
        });
      }
```

개선 코드:
```typescript
      // 자동 덕킹: 수동 설정 OR 나레이션 있으면 항상 적용
      const manualDucking = options?.bgmDuckingEnabled ?? false;
      const hasAnyNarration = preparedScenes.some(scene => scene.audioBuffer);
      const shouldDuck = manualDucking || hasAnyNarration;

      if (shouldDuck) {
        // 수동 설정값 우선, 자동일 때는 60% 볼륨 (40% 감소)
        const duckingAmount = manualDucking
          ? (options?.bgmDuckingAmount ?? 0.3)
          : 0.6;
        const duckVolume = baseVolume * duckingAmount;
        const RAMP_TIME = 0.3;

        preparedScenes.forEach(scene => {
          if (scene.audioBuffer) {
            const duckStart = masterStartTime + scene.startTime;
            bgmGain.gain.setValueAtTime(baseVolume, duckStart);
            bgmGain.gain.linearRampToValueAtTime(duckVolume, duckStart + RAMP_TIME);

            const duckEnd = masterStartTime + scene.endTime;
            bgmGain.gain.setValueAtTime(duckVolume, duckEnd);
            bgmGain.gain.linearRampToValueAtTime(baseVolume, duckEnd + RAMP_TIME);
          }
        });
      }
```

**핵심 변경:**
- 나레이션이 있는 씬이 하나라도 있으면 자동 덕킹 활성화
- 자동 덕킹 시 BGM 볼륨을 60%로 감소 (수동보다 완만)
- 수동 설정이 있으면 수동 설정값 우선

**Step 2: 커밋**

```bash
git add services/videoService.ts
git commit -m "feat: auto-duck BGM when narration present, manual settings override"
```

---

## 구현 순서 요약

| Task | Win | 파일 | 변경량 | 의존성 |
|------|-----|------|--------|--------|
| 1 | 색상 팔레트 힌트 | `prompts.ts` | ~20줄 | 없음 |
| 2 | BGM 감정 라우팅 | `App.tsx` | ~15줄 | 없음 |
| 3 | 프롬프트 재배치 | `prompts.ts` | ~15줄 | Task 1 후 (같은 파일) |
| 4 | 감정 전환효과 | `App.tsx` | ~10줄 | 없음 |
| 5 | 자동 덕킹 | `videoService.ts` | ~10줄 | 없음 |

**Task 1→3 순서 필수** (같은 return 템플릿 수정). 나머지는 독립적이므로 병렬 가능.
