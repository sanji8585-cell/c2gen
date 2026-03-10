# Engine V2.0 Sprint 0 — "고급 대본" 탭 껍데기 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 기존 자동/수동 대본 코드를 한 줄도 건드리지 않고, "🎬 고급 대본" 탭을 추가하여 V2.0 기능의 진입점을 만든다.

**Architecture:** HeroInput에 3번째 탭 추가, InputSection에 고급 대본 state 관리, App.tsx에 handleGenerateAdvanced() 별도 함수 추가. 고급 대본은 초기에 수동 대본과 동일하게 동작하되, 별도 함수로 완전 격리.

**Tech Stack:** React 19 + TypeScript, 기존 컴포넌트 패턴 유지

---

## Task 1: types.ts — SceneDirectives + CharacterVoice 타입 추가

**Files:**
- Modify: `types.ts:53` (SceneAnalysis 확장) + 하단에 타입 추가
- Modify: `types.ts:107-122` (GeneratedAsset 확장)

**Step 1: SceneDirectives 인터페이스 추가**

`SceneAnalysis` 인터페이스 바로 위에 추가:

```typescript
// ── Engine V2.0 디렉티브 시스템 ──

export interface SceneDirectives {
  COMPOSITION?: 'MICRO' | 'STANDARD' | 'MACRO' | 'NO_CHAR';
  MOOD?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  BACKGROUND?: string;
  STYLE?: string;
  TEXT?: string;
  CAMERA?: string;
  COLOR?: string;
  SPEAKER?: string;
  KEEP_PREV?: boolean;
  SAME_PLACE?: boolean;
  TIME_PASS?: boolean;
}

export interface CharacterVoice {
  name: string;
  voiceId: string;
  color: string;
  gender?: 'male' | 'female';
}
```

**Step 2: SceneAnalysis에 directives 필드 추가**

기존 `SceneAnalysis` 인터페이스 끝 (line 53, `sentiment?` 뒤)에 추가:

```typescript
  directives?: SceneDirectives;  // V2.0 고급 대본 디렉티브
```

**Step 3: GeneratedAsset에 화자 필드 추가**

기존 `GeneratedAsset` 인터페이스 끝 (line 121, `audioMuted?` 뒤)에 추가:

```typescript
  speakerName?: string;   // V2.0 화자 이름
  speakerColor?: string;  // V2.0 화자 자막 색상
```

**Step 4: ScriptMode 타입 추가**

`GenerationStep` enum 앞에 추가:

```typescript
export type ScriptMode = 'auto' | 'manual' | 'advanced';
```

**Step 5: 커밋**

```bash
git add types.ts
git commit -m "feat(v2): add SceneDirectives, CharacterVoice, ScriptMode types"
```

---

## Task 2: config.ts — 디렉티브 매핑 테이블 추가

**Files:**
- Modify: `config.ts` (파일 끝에 추가)

**Step 1: 매핑 테이블 3개 + Gemini 음성 맵 추가**

`config.ts` 파일 끝에 추가:

```typescript
// ══════════════════════════════════════════
// Engine V2.0 — 디렉티브 매핑 테이블
// ══════════════════════════════════════════

/** 다국어 디렉티브 키 → 내부 키 */
export const DIRECTIVE_KEY_MAP: Record<string, string> = {
  // 한국어
  '구도': 'COMPOSITION', '분위기': 'MOOD', '배경': 'BACKGROUND',
  '스타일': 'STYLE', '텍스트': 'TEXT', '카메라': 'CAMERA',
  '색상': 'COLOR', '화자': 'SPEAKER',
  '이전씬유지': 'KEEP_PREV', '같은장소': 'SAME_PLACE', '시간경과': 'TIME_PASS',
  // English
  'composition': 'COMPOSITION', 'mood': 'MOOD', 'background': 'BACKGROUND',
  'style': 'STYLE', 'text': 'TEXT', 'camera': 'CAMERA',
  'color': 'COLOR', 'speaker': 'SPEAKER',
  'keep-prev': 'KEEP_PREV', 'same-place': 'SAME_PLACE', 'time-pass': 'TIME_PASS',
  // 日本語
  '構図': 'COMPOSITION', '雰囲気': 'MOOD', '背景': 'BACKGROUND',
  'スタイル': 'STYLE', 'テキスト': 'TEXT', 'カメラ': 'CAMERA',
  '色': 'COLOR', '話者': 'SPEAKER',
  '前シーン維持': 'KEEP_PREV', '同じ場所': 'SAME_PLACE', '時間経過': 'TIME_PASS',
};

/** 다국어 구도 값 → 내부 값 */
export const COMPOSITION_VALUE_MAP: Record<string, string> = {
  '클로즈업': 'MACRO', 'close-up': 'MACRO', 'クローズアップ': 'MACRO',
  '미디엄샷': 'STANDARD', 'medium': 'STANDARD', 'ミディアム': 'STANDARD',
  '와이드샷': 'MICRO', 'wide': 'MICRO', 'ワイド': 'MICRO',
  '캐릭터없음': 'NO_CHAR', 'no-char': 'NO_CHAR', 'キャラなし': 'NO_CHAR',
};

/** 다국어 분위기 값 → 내부 값 */
export const MOOD_VALUE_MAP: Record<string, string> = {
  '밝음': 'POSITIVE', 'bright': 'POSITIVE', '明るい': 'POSITIVE',
  '어두움': 'NEGATIVE', 'dark': 'NEGATIVE', '暗い': 'NEGATIVE',
  '중립': 'NEUTRAL', 'neutral': 'NEUTRAL', '中立': 'NEUTRAL',
};

/** Gemini TTS 폴백 음성 매핑 (언어 → 성별 → 음성명) */
export const GEMINI_VOICE_MAP: Record<string, Record<string, string>> = {
  ko: { male: 'Charon', female: 'Kore' },
  en: { male: 'Fenrir', female: 'Aoede' },
  ja: { male: 'Charon', female: 'Kore' },
};
```

**Step 2: 커밋**

```bash
git add config.ts
git commit -m "feat(v2): add directive key/value mapping tables and voice map"
```

---

## Task 3: HeroInput.tsx — 3번째 탭 추가

**Files:**
- Modify: `components/input/HeroInput.tsx`

**핵심 원칙:** 기존 auto/manual 탭 렌더링 코드는 한 줄도 수정하지 않음. 타입만 확장하고 탭 배열에 'advanced'를 추가.

**Step 1: Props 타입 확장**

```typescript
// 기존:
interface HeroInputProps {
  activeTab: 'auto' | 'manual';
  onTabChange: (tab: 'auto' | 'manual') => void;
  ...
}

// 변경:
interface HeroInputProps {
  activeTab: 'auto' | 'manual' | 'advanced';
  onTabChange: (tab: 'auto' | 'manual' | 'advanced') => void;
  topic: string;
  onTopicChange: (v: string) => void;
  manualScript: string;
  onManualScriptChange: (v: string) => void;
  advancedScript: string;                          // 신규
  onAdvancedScriptChange: (v: string) => void;     // 신규
  onSubmit: (e: React.FormEvent) => void;
  step: GenerationStep;
}
```

**Step 2: 탭 배열 확장**

기존 `(['auto', 'manual'] as const)` → `(['auto', 'manual', 'advanced'] as const)`

label 맵핑:
```typescript
const label = tab === 'auto' ? '자동' : tab === 'manual' ? '수동' : '🎬 고급';
```

**Step 3: canSubmit 로직 확장**

```typescript
const canSubmit = !isDisabled && (
  activeTab === 'auto' ? topic.trim().length > 0
  : activeTab === 'manual' ? manualScript.trim().length > 0
  : advancedScript.trim().length > 0
);
```

**Step 4: 고급 대본 textarea 추가**

기존 `{activeTab === 'manual' && (...)}` 블록 아래에 추가 (기존 manual 블록은 건드리지 않음):

```tsx
{activeTab === 'advanced' && (
  <div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <span style={{ fontSize: 20, opacity: 0.6, flexShrink: 0, marginTop: 2 }}>🎬</span>
      <div style={{ flex: 1 }}>
        <textarea
          value={advancedScript}
          onChange={e => onAdvancedScriptChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={isDisabled}
          placeholder="고급 대본을 입력하세요... 디렉티브 예: (배경: 어두운 사무실)(화자: 남자)"
          style={{
            width: '100%',
            minHeight: 200,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 12,
            padding: 16,
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text-primary)',
            caretColor: '#38bdf8',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{
          textAlign: 'right',
          marginTop: 6,
          fontSize: 12,
          fontWeight: 500,
          color: advancedScript.length >= 10000 ? '#f59e0b' : advancedScript.length >= 3000 ? '#60a5fa' : 'var(--text-tertiary)',
          transition: 'color 0.2s ease',
        }}>
          {advancedScript.length.toLocaleString()}자
        </div>
      </div>
    </div>
  </div>
)}
```

**Step 5: auto 입력 영역 표시 조건 수정**

기존: `{activeTab === 'auto' && (...)}`
이건 이미 정확하므로 변경 불필요.

marginTop 조건:
```typescript
marginTop: activeTab === 'auto' ? 16 : 0,
marginBottom: activeTab !== 'auto' ? 16 : 0,
```

**Step 6: 커밋**

```bash
git add components/input/HeroInput.tsx
git commit -m "feat(v2): add advanced script tab to HeroInput"
```

---

## Task 4: InputSection.tsx — 고급 대본 state + 제출 로직

**Files:**
- Modify: `components/InputSection.tsx`

**핵심 원칙:** 기존 auto/manual 분기의 handleSubmit 로직은 그대로 유지. advanced 분기만 추가.

**Step 1: state 추가**

기존 `const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');` 변경:

```typescript
const [activeTab, setActiveTab] = useState<'auto' | 'manual' | 'advanced'>('auto');
```

고급 대본 텍스트 state 추가 (manualScript 아래):

```typescript
const [advancedScript, setAdvancedScript] = useState('');
```

**Step 2: onGenerate props 확장**

```typescript
interface InputSectionProps {
  onGenerate: (topic: string, referenceImages: ReferenceImages, sourceText: string | null) => void;
  onGenerateAdvanced?: (topic: string, referenceImages: ReferenceImages, sourceText: string) => void;  // 신규
  // ... 나머지 기존 props
}
```

컴포넌트 destructuring에도 `onGenerateAdvanced` 추가.

**Step 3: handleSubmit에 advanced 분기 추가**

기존 handleSubmit 끝에 추가 (else 분기):

```typescript
    if (activeTab === 'auto') {
      if (topic.trim()) onGenerate(topic, refImages, null);
    } else if (activeTab === 'manual') {
      if (manualScript.trim()) {
        const autoTopic = manualScript.trim().split('\n')[0].slice(0, 50).trim() || '직접 입력 대본';
        onGenerate(autoTopic, refImages, manualScript);
      }
    } else if (activeTab === 'advanced' && onGenerateAdvanced) {
      if (advancedScript.trim()) {
        const autoTopic = advancedScript.trim().split('\n')[0].slice(0, 50).trim() || '고급 대본';
        onGenerateAdvanced(autoTopic, refImages, advancedScript);
      }
    }
```

**Step 4: HeroInput에 새 props 전달**

```tsx
<HeroInput
  activeTab={activeTab}
  onTabChange={setActiveTab}
  topic={topic}
  onTopicChange={setTopic}
  manualScript={manualScript}
  onManualScriptChange={setManualScript}
  advancedScript={advancedScript}
  onAdvancedScriptChange={setAdvancedScript}
  onSubmit={handleSubmit}
  step={step}
/>
```

**Step 5: 커밋**

```bash
git add components/InputSection.tsx
git commit -m "feat(v2): add advanced script state and submission in InputSection"
```

---

## Task 5: App.tsx — handleGenerateAdvanced() 별도 함수 + 연결

**Files:**
- Modify: `App.tsx`

**핵심 원칙:** 기존 handleGenerate(), handleApproveScript()는 한 줄도 수정하지 않는다.

**Step 1: handleGenerateAdvanced 함수 추가**

기존 `handleGenerate` 함수 아래에 별도 함수 추가. 초기에는 수동 대본과 동일하게 기존 handleGenerate를 그대로 호출하는 래퍼:

```typescript
  // ── Engine V2.0: 고급 대본 전용 핸들러 ──
  // Sprint 0: 수동 대본과 동일하게 동작 (래퍼)
  // Sprint 1~5에서 디렉티브 파싱, 다중 음성, 일관성 모드 등 점진적 확장
  const handleGenerateAdvanced = useCallback(async (
    topic: string,
    refImgs: ReferenceImages,
    sourceText: string,
  ) => {
    // Sprint 0: 기존 수동 대본 플로우로 위임
    await handleGenerate(topic, refImgs, sourceText);
  }, [handleGenerate]);
```

**Step 2: InputSection에 onGenerateAdvanced 전달**

기존 `<InputSection onGenerate={handleGenerate} ...>` 에 prop 추가:

```tsx
<InputSection
  onGenerate={handleGenerate}
  onGenerateAdvanced={handleGenerateAdvanced}
  // ... 나머지 기존 props
/>
```

**Step 3: 빌드 검증**

```bash
npx vite build
```

**Step 4: 커밋**

```bash
git add App.tsx components/InputSection.tsx
git commit -m "feat(v2): add handleGenerateAdvanced and wire to InputSection"
```

---

## 구현 순서 요약

| Task | 파일 | 내용 | 기존 모드 영향 |
|------|------|------|---------------|
| 1 | `types.ts` | SceneDirectives, CharacterVoice, ScriptMode 타입 | 없음 (타입 추가만) |
| 2 | `config.ts` | 디렉티브 매핑 테이블 | 없음 (상수 추가만) |
| 3 | `HeroInput.tsx` | 3번째 탭 + 고급 textarea | 없음 (기존 탭 코드 미수정) |
| 4 | `InputSection.tsx` | 고급 state + 제출 로직 | 없음 (기존 분기 미수정) |
| 5 | `App.tsx` | handleGenerateAdvanced 래퍼 | 없음 (기존 함수 미수정) |

**Task 1→2는 독립, Task 3→4→5는 순차.**
