# InputSection UI 리디자인 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** InputSection의 6개 독립 카드 레이아웃을 Hero Input + 3개 아코디언 그룹으로 재구성하여 UX와 시각 품질을 개선한다.

**Architecture:** 기존 InputSection.tsx를 리팩토링하여 HeroInput, SettingsAccordion, ImageSettingsGroup, SoundSettingsGroup, PresetGroup 컴포넌트로 분리. 기존 VoiceSettings, ReferenceImageSelector는 그대로 재사용. 아코디언은 하나만 열리는 exclusive 모드.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS (CDN), CSS custom properties (inline styles), Vite 6

**참조 목업:** `docs/mockup-c.html`
**설계서:** `docs/plans/2026-03-09-input-ui-redesign-design.md`

---

## 주의사항 (시작 전 필독)

1. **CSS 방식**: 프로젝트는 Tailwind CDN + inline `style={{}}` 혼합. CSS 모듈 없음. 기존 패턴 유지할 것.
2. **테스트 없음**: 프로젝트에 테스트 프레임워크 없음. 각 Task 완료 후 `npm run build`로 빌드 확인.
3. **기존 컴포넌트 재사용**: `VoiceSettings.tsx` (1,072줄), `ReferenceImageSelector.tsx` (272줄)은 수정 최소화, 그대로 임베드.
4. **상태 관리**: 모든 상태는 InputSection.tsx에 유지 (기존과 동일). 새 컴포넌트는 props로 전달받음.
5. **색상 통일**: 선택 상태는 `rgba(96, 165, 250, 0.08)` 배경 + `rgba(96, 165, 250, 0.6)` 테두리로 통일.
6. **목업 참조**: `docs/mockup-c.html`을 브라우저에서 열어 시각 참고할 것.

---

### Task 1: SettingsAccordion 공용 컴포넌트 생성

**Files:**
- Create: `components/input/SettingsAccordion.tsx`

**목적:** 아코디언 그룹의 공통 래퍼. 헤더 (아이콘 + 타이틀 + 접힌 요약 + 쉐브론) + 바디 (max-height 트랜지션).

**Step 1: 컴포넌트 작성**

```tsx
// components/input/SettingsAccordion.tsx
import React from 'react';

interface SettingsAccordionProps {
  icon: string;              // 이모지 아이콘
  iconGradient: string;      // CSS gradient for icon bg
  title: string;
  summary: React.ReactNode;  // 접힌 상태 2줄 요약 JSX
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const SettingsAccordion: React.FC<SettingsAccordionProps> = ({
  icon, iconGradient, title, summary, isOpen, onToggle, children
}) => {
  return (
    <div
      style={{
        border: `1px solid ${isOpen ? 'rgba(96, 165, 250, 0.3)' : 'var(--border-default)'}`,
        borderRadius: '16px',
        background: 'var(--bg-surface)',
        overflow: 'hidden',
        transition: 'all 0.3s',
        boxShadow: isOpen ? '0 2px 20px rgba(96, 165, 250, 0.05)' : 'none',
      }}
    >
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '18px 22px',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'background 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(30, 40, 70, 0.4)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Icon */}
        <div style={{
          width: '40px', height: '40px', borderRadius: '11px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', flexShrink: 0,
          background: iconGradient,
        }}>
          {icon}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {title}
          </div>
          {!isOpen && (
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {summary}
            </div>
          )}
        </div>

        {/* Chevron */}
        <div style={{
          fontSize: '13px', color: 'var(--text-muted)',
          transition: 'transform 0.3s', flexShrink: 0,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          ▼
        </div>
      </div>

      {/* Body */}
      <div style={{
        maxHeight: isOpen ? '2000px' : '0',
        overflow: 'hidden',
        transition: 'max-height 0.4s ease, padding 0.3s ease',
        padding: isOpen ? '0 22px 22px' : '0 22px 0',
      }}>
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default SettingsAccordion;
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공 (아직 사용되지 않으므로 tree-shaking 됨)

**Step 3: 커밋**

```bash
git add components/input/SettingsAccordion.tsx
git commit -m "feat: add SettingsAccordion reusable component"
```

---

### Task 2: HeroInput 컴포넌트 생성

**Files:**
- Create: `components/input/HeroInput.tsx`

**목적:** 최상단 Hero 입력 영역. 자동/수동 탭 스위치 + 키워드 input (자동) 또는 textarea (수동) + 시작 버튼.

**Step 1: 컴포넌트 작성**

```tsx
// components/input/HeroInput.tsx
import React, { useState, useEffect, useRef } from 'react';
import { GenerationStep } from '../../types';

// 자동 대본 placeholder 예시
const PLACEHOLDER_EXAMPLES = [
  "비트코인 반감기 이후 시세 전망",
  "2026년 부동산 시장 분석",
  "테슬라 vs BYD 전기차 전쟁",
  "금리 인하가 주식시장에 미치는 영향",
  "AI 반도체 시장의 미래",
  "엔비디아 실적과 주가 전망",
  "한국 출생률 위기와 경제 영향",
  "워렌 버핏의 최신 투자 전략",
  "유튜브 수익화 완벽 가이드",
  "MZ세대 소비 트렌드 2026",
  "일본 여행 꿀팁 총정리",
  "삼성전자 반도체 사업 전망",
  "프리랜서 세금 절약 팁",
];

interface HeroInputProps {
  activeTab: 'auto' | 'manual';
  onTabChange: (tab: 'auto' | 'manual') => void;
  topic: string;
  onTopicChange: (v: string) => void;
  manualScript: string;
  onManualScriptChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  step: GenerationStep;
}

const HeroInput: React.FC<HeroInputProps> = ({
  activeTab, onTabChange, topic, onTopicChange,
  manualScript, onManualScriptChange, onSubmit, step
}) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(() => Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));
  const [placeholderFade, setPlaceholderFade] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const isDisabled = step !== 'idle' && step !== 'error';
  const isProcessing = step === 'scripting' || step === 'assets';
  const isReviewing = step === 'script_review';

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setPlaceholderFade(false);
      setTimeout(() => {
        setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
        setPlaceholderFade(true);
      }, 400);
    }, 4000);
    return () => clearInterval(intervalRef.current);
  }, []);

  return (
    <section style={{ marginBottom: '28px' }}>
      <form onSubmit={onSubmit}>
        <div
          style={{
            position: 'relative',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '20px',
            padding: '22px 26px',
            backdropFilter: 'blur(20px)',
            transition: 'all 0.3s',
          }}
          className="group"
        >
          {/* Top row: icon + input or textarea */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <span style={{ fontSize: '20px', opacity: 0.6 }}>🔍</span>
            {activeTab === 'auto' ? (
              <input
                type="text"
                value={topic}
                onChange={e => onTopicChange(e.target.value)}
                disabled={isDisabled}
                placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)',
                  caretColor: '#38bdf8',
                  opacity: isDisabled ? 0.5 : 1,
                }}
                className={`placeholder:transition-opacity placeholder:duration-[400ms] ${placeholderFade ? 'placeholder:opacity-100' : 'placeholder:opacity-0'}`}
              />
            ) : (
              <span style={{ flex: 1, fontSize: '16px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                수동 대본 입력
              </span>
            )}
          </div>

          {/* Manual script textarea (only when manual tab) */}
          {activeTab === 'manual' && (
            <div style={{
              marginBottom: '14px',
              background: 'var(--bg-elevated)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
            }}>
              <textarea
                value={manualScript}
                onChange={e => onManualScriptChange(e.target.value)}
                placeholder="직접 작성한 대본을 입력하세요. AI가 시각적 연출안을 생성합니다."
                disabled={isDisabled}
                style={{
                  width: '100%', minHeight: '200px', padding: '16px',
                  background: 'none', border: 'none', outline: 'none',
                  fontFamily: 'inherit', fontSize: '14px', fontWeight: 500,
                  color: 'var(--text-primary)', resize: 'vertical', lineHeight: 1.6,
                }}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 16px', borderTop: '1px solid var(--border-subtle)',
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {manualScript.length > 3000 ? '⚡ 청크 분할 처리됩니다' : ''}
                </span>
                <span style={{
                  fontSize: '11px', fontWeight: 700,
                  color: manualScript.length > 10000 ? '#fbbf24' : manualScript.length > 3000 ? '#60a5fa' : 'var(--text-muted)',
                }}>
                  {manualScript.length.toLocaleString()}자
                </span>
              </div>
            </div>
          )}

          {/* Bottom row: tab switch + submit button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{
              display: 'flex', gap: '2px',
              background: 'var(--bg-elevated)', borderRadius: '10px', padding: '3px',
            }}>
              {(['auto', 'manual'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onTabChange(tab)}
                  style={{
                    padding: '7px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                    border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                    color: activeTab === tab ? 'white' : 'var(--text-secondary)',
                    background: activeTab === tab ? 'linear-gradient(135deg, #60a5fa, #818cf8)' : 'none',
                  }}
                >
                  {tab === 'auto' ? '자동 대본' : '수동 대본'}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={isDisabled || (activeTab === 'auto' ? !topic.trim() : !manualScript.trim())}
              style={{
                padding: '11px 36px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #60a5fa, #818cf8)', color: 'white',
                fontSize: '15px', fontWeight: 800, border: 'none', cursor: 'pointer',
                transition: 'all 0.2s', letterSpacing: '0.5px',
                opacity: (isDisabled || (activeTab === 'auto' ? !topic.trim() : !manualScript.trim())) ? 0.5 : 1,
              }}
            >
              {isProcessing ? '생성 중' : isReviewing ? '검토 중' : '시작 →'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};

export default HeroInput;
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공

**Step 3: 커밋**

```bash
git add components/input/HeroInput.tsx
git commit -m "feat: add HeroInput component with tab switch and animated placeholder"
```

---

### Task 3: ImageSettingsGroup 컴포넌트 생성

**Files:**
- Create: `components/input/ImageSettingsGroup.tsx`

**목적:** 이미지 설정 아코디언 내부 콘텐츠. 모델 선택 → 영상 방향 → 참조 이미지 → 화풍 선택 → 커스텀 프롬프트. 기존 InputSection.tsx의 해당 JSX를 이동.

**Step 1: 컴포넌트 작성**

기존 `InputSection.tsx`에서 아래 섹션의 JSX + 로직을 추출:
- 이미지 생성 모델 선택 (line 638-1008)
- 영상 방향 선택 (line 587-636)
- ReferenceImageSelector 사용 (line 564-575)

Props로 필요한 모든 상태와 setter를 전달받음:

```tsx
// components/input/ImageSettingsGroup.tsx
import React from 'react';
import ReferenceImageSelector from './ReferenceImageSelector';
import { IMAGE_MODELS, ImageModelId, GEMINI_STYLE_CATEGORIES, GeminiStyleId, GPT_STYLE_CATEGORIES, GptStyleId, VideoOrientation } from '../../config';

interface ImageSettingsGroupProps {
  // 모델
  imageModelId: ImageModelId;
  onImageModelChange: (id: ImageModelId) => void;
  // 방향
  videoOrientation: VideoOrientation;
  onOrientationChange: (o: VideoOrientation) => void;
  // 참조 이미지
  characterRefImages: string[];
  styleRefImages: string[];
  characterStrength: number;
  styleStrength: number;
  onCharacterImagesChange: (imgs: string[]) => void;
  onStyleImagesChange: (imgs: string[]) => void;
  onCharacterStrengthChange: (v: number) => void;
  onStyleStrengthChange: (v: number) => void;
  // 화풍 (Gemini)
  geminiStyleId: GeminiStyleId;
  onGeminiStyleChange: (id: GeminiStyleId) => void;
  geminiCustomStylePrompt: string;
  onGeminiCustomStyleChange: (v: string) => void;
  // 화풍 (GPT)
  gptStyleId: GptStyleId;
  onGptStyleChange: (id: GptStyleId) => void;
  gptCustomStylePrompt: string;
  onGptCustomStyleChange: (v: string) => void;
  // 한글억제
  suppressKorean: boolean;
  onSuppressKoreanChange: (v: boolean) => void;
  // 미리보기
  previewStyleId: string | null;
  previewIndex: number;
  onPreviewStyleChange: (id: string | null) => void;
  onPreviewIndexChange: (i: number) => void;
  // 공통
  isDisabled: boolean;
}
```

이 컴포넌트의 JSX는 기존 InputSection.tsx의 이미지 모델 + 영상 방향 + 참조 이미지 + 화풍 선택 섹션을 **목업 스타일로 재배치**:

- **section-label** 스타일: `fontSize: 12px, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--text-muted)'`
- **model-option** 스타일: `padding: 14px 16px, borderRadius: 12px, border: 1.5px solid var(--border-subtle)`
- 선택 상태: `border-color: rgba(96,165,250,0.6), background: rgba(96,165,250,0.08)`
- **style-chip** 스타일: `padding: 11px 14px, borderRadius: 10px, fontSize: 13px, fontWeight: 600, textAlign: center`
- 3-col grid for style chips
- **화풍 미리보기(👁️)**: 기존 로직 그대로 유지

**핵심**: 기존 InputSection.tsx lines 587~1008의 JSX를 그대로 가져오되, 스타일만 목업 기준으로 변경. 로직은 변경 없음.

**Step 2: 빌드 확인**

Run: `npm run build`

**Step 3: 커밋**

```bash
git add components/input/ImageSettingsGroup.tsx
git commit -m "feat: add ImageSettingsGroup with model, orientation, ref images, style selection"
```

---

### Task 4: SoundSettingsGroup 컴포넌트 생성

**Files:**
- Create: `components/input/SoundSettingsGroup.tsx`

**목적:** 사운드 설정 아코디언 내부. VoiceSettings 임베드 + BGM 토글.

**Step 1: 컴포넌트 작성**

```tsx
// components/input/SoundSettingsGroup.tsx
import React from 'react';
import VoiceSettings, { VoiceSettingsHandle } from './VoiceSettings';
import { Language } from '../../config';

interface SoundSettingsGroupProps {
  voiceSettingsRef: React.RefObject<VoiceSettingsHandle | null>;
  isDisabled: boolean;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

const SoundSettingsGroup: React.FC<SoundSettingsGroupProps> = ({
  voiceSettingsRef, isDisabled, language, onLanguageChange
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* 나레이션 음성 */}
      <div>
        <div style={{
          fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' as const,
          letterSpacing: '1.5px', color: 'var(--text-muted)',
          marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ fontSize: '14px' }}>🎤</span> 나레이션 음성
        </div>
        <VoiceSettings
          ref={voiceSettingsRef}
          isDisabled={isDisabled}
          language={language}
          onLanguageChange={onLanguageChange}
        />
      </div>

      {/* BGM 설정은 기존 InputSection에 없었음 — 목업에만 있는 미래 기능.
          현재는 App.tsx에서 BGM 자동선택을 처리하므로 여기선 placeholder만.
          실제 BGM UI가 필요하면 추후 추가. */}
    </div>
  );
};

export default SoundSettingsGroup;
```

**참고:** 현재 BGM 설정은 InputSection이 아닌 App.tsx/ResultTable에서 관리됨. 목업의 BGM UI는 향후 추가 가능하지만, 이번 리디자인에서는 VoiceSettings 임베드가 핵심.

**Step 2: 빌드 확인**

Run: `npm run build`

**Step 3: 커밋**

```bash
git add components/input/SoundSettingsGroup.tsx
git commit -m "feat: add SoundSettingsGroup wrapping VoiceSettings"
```

---

### Task 5: PresetGroup 컴포넌트 생성

**Files:**
- Create: `components/input/PresetGroup.tsx`

**목적:** 프리셋 아코디언 내부. 기존 InputSection.tsx의 프리셋 관리 JSX (lines 452-562) 이동.

**Step 1: 컴포넌트 작성**

기존 InputSection.tsx에서 프리셋 관련 JSX를 추출. 목업 스타일로 변경:
- 2-col 그리드 카드 레이아웃
- 카드: `padding: 14px 16px, borderRadius: 12px, bg: var(--bg-elevated)`
- "현재 설정 저장" 카드: dashed border

Props:
```tsx
interface PresetGroupProps {
  projects: ProjectSettings[];
  onSave: (name: string) => void;
  onLoad: (project: ProjectSettings) => void;
  onUpdate: (project: ProjectSettings) => void;
  onDelete: (id: string) => void;
}
```

**Step 2: 빌드 확인**

Run: `npm run build`

**Step 3: 커밋**

```bash
git add components/input/PresetGroup.tsx
git commit -m "feat: add PresetGroup with card grid layout"
```

---

### Task 6: InputSection.tsx 리팩토링 — 새 레이아웃 조립

**Files:**
- Modify: `components/InputSection.tsx` (전체 JSX return 부분 재작성)

**목적:** 기존 JSX를 새 컴포넌트들로 교체. 상태는 그대로 유지.

**Step 1: import 추가 및 상태 추가**

```tsx
// 새 import 추가
import HeroInput from './input/HeroInput';
import SettingsAccordion from './input/SettingsAccordion';
import ImageSettingsGroup from './input/ImageSettingsGroup';
import SoundSettingsGroup from './input/SoundSettingsGroup';
import PresetGroup from './input/PresetGroup';

// 상태 추가 (기존 state 블록에)
const [openGroup, setOpenGroup] = useState<'image' | 'sound' | 'preset' | null>('image');
```

**Step 2: 접힌 요약 useMemo 추가**

```tsx
const imageSummary = useMemo(() => {
  const modelName = IMAGE_MODELS.find(m => m.id === imageModelId)?.name || imageModelId;
  const orient = videoOrientation === 'landscape' ? '가로 16:9' : '세로 9:16';
  const charCount = characterRefImages.length;
  const styleCount = styleRefImages.length;

  // 현재 선택된 화풍 이름
  let styleName = '없음 (기본)';
  if (imageModelId === 'gemini-2.5-flash-image' && geminiStyleId !== 'gemini-none') {
    const found = GEMINI_STYLE_MAP.get(geminiStyleId);
    styleName = found ? found.name : geminiStyleId;
  } else if (imageModelId === 'gpt-image-1' && gptStyleId !== 'gpt-none') {
    const found = GPT_STYLE_MAP.get(gptStyleId);
    styleName = found ? found.name : gptStyleId;
  }

  return (
    <>
      <div>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{modelName}</span>
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        {orient}
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        캐릭터 {charCount}장
        <span style={{
          display: 'inline-block', padding: '1px 7px', borderRadius: '5px',
          fontSize: '11px', fontWeight: 600, marginLeft: '4px',
          background: 'var(--bg-hover)', color: 'var(--text-secondary)',
        }}>강도 {characterStrength}%</span>
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        스타일 {styleCount}장
        <span style={{
          display: 'inline-block', padding: '1px 7px', borderRadius: '5px',
          fontSize: '11px', fontWeight: 600, marginLeft: '4px',
          background: 'var(--bg-hover)', color: 'var(--text-secondary)',
        }}>강도 {styleStrength}%</span>
      </div>
      <div>
        화풍 <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{styleName}</span>
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        <span style={{
          display: 'inline-block', padding: '1px 7px', borderRadius: '5px',
          fontSize: '11px', fontWeight: 600,
          background: suppressKorean ? 'rgba(52, 211, 153, 0.12)' : 'var(--bg-hover)',
          color: suppressKorean ? '#6ee7b7' : 'var(--text-secondary)',
        }}>한글억제 {suppressKorean ? 'ON' : 'OFF'}</span>
      </div>
    </>
  );
}, [imageModelId, videoOrientation, characterRefImages.length, styleRefImages.length,
    characterStrength, styleStrength, geminiStyleId, gptStyleId, suppressKorean]);
```

사운드 요약은 VoiceSettings에서 getSettings()로 가져와 표시:
```tsx
const soundSummary = useMemo(() => {
  // VoiceSettings의 현재 설정값은 ref로 접근
  // 접힌 상태에서도 보여야 하므로, localStorage에서 직접 읽거나
  // 별도 상태로 트래킹 필요 → 간단히 localStorage 읽기
  const voiceId = localStorage.getItem('tubegen_el_voice') || '';
  const model = localStorage.getItem('tubegen_el_model') || 'eleven_multilingual_v2';
  const speed = localStorage.getItem('tubegen_el_speed') || '1.00';
  const stability = localStorage.getItem('tubegen_el_stability') || '0.60';

  // ELEVENLABS_DEFAULT_VOICES에서 이름 찾기는 무거우므로 간단히
  const modelLabel = model === 'eleven_v3' ? 'Eleven v3' : model === 'eleven_turbo_v2_5' ? 'Turbo v2.5' : 'Multilingual v2';

  return (
    <>
      <div>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>ElevenLabs</span>
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        {modelLabel}
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        속도 <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{parseFloat(speed).toFixed(2)}x</span>
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        안정성 <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(parseFloat(stability) * 100)}%</span>
      </div>
    </>
  );
}, [openGroup]); // openGroup 변경 시 리렌더되어 최신값 읽음
```

프리셋 요약:
```tsx
const presetSummary = useMemo(() => {
  if (projects.length === 0) return <div>저장된 프리셋 없음</div>;
  const latest = projects[0];
  return (
    <div>
      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{projects.length}개</span> 저장됨
      <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
      최근: <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{latest.name}</span>
    </div>
  );
}, [projects]);
```

**Step 3: JSX return 전체 재작성**

기존 return문의 JSX를 아래 구조로 교체:

```tsx
return (
  <div style={{ maxWidth: '920px', margin: '0 auto', padding: '32px 24px' }}>
    {/* Hero Input */}
    <HeroInput
      activeTab={activeTab}
      onTabChange={setActiveTab}
      topic={topic}
      onTopicChange={setTopic}
      manualScript={manualScript}
      onManualScriptChange={setManualScript}
      onSubmit={handleSubmit}
      step={step}
    />

    {/* Settings Divider */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      margin: '24px 0 16px',
    }}>
      <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
      <span style={{
        fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '2px', color: 'var(--text-muted)',
      }}>설정</span>
      <div style={{ flex: 1, height: '1px', background: 'var(--border-default)' }} />
    </div>

    {/* Accordion Groups */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* 이미지 설정 */}
      <SettingsAccordion
        icon="🖼️"
        iconGradient="linear-gradient(135deg, #60a5fa, #818cf8)"
        title="이미지 설정"
        summary={imageSummary}
        isOpen={openGroup === 'image'}
        onToggle={() => setOpenGroup(openGroup === 'image' ? null : 'image')}
      >
        <ImageSettingsGroup
          imageModelId={imageModelId}
          onImageModelChange={selectImageModel}
          videoOrientation={videoOrientation}
          onOrientationChange={handleOrientationChange}
          characterRefImages={characterRefImages}
          styleRefImages={styleRefImages}
          characterStrength={characterStrength}
          styleStrength={styleStrength}
          onCharacterImagesChange={setCharacterRefImages}
          onStyleImagesChange={setStyleRefImages}
          onCharacterStrengthChange={setCharacterStrength}
          onStyleStrengthChange={setStyleStrength}
          geminiStyleId={geminiStyleId}
          onGeminiStyleChange={selectGeminiStyle}
          geminiCustomStylePrompt={geminiCustomStylePrompt}
          onGeminiCustomStyleChange={saveGeminiCustomStyle}
          gptStyleId={gptStyleId}
          onGptStyleChange={selectGptStyle}
          gptCustomStylePrompt={gptCustomStylePrompt}
          onGptCustomStyleChange={saveGptCustomStyle}
          suppressKorean={suppressKorean}
          onSuppressKoreanChange={(v) => {
            setSuppressKorean(v);
            localStorage.setItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN, String(v));
          }}
          previewStyleId={previewStyleId}
          previewIndex={previewIndex}
          onPreviewStyleChange={setPreviewStyleId}
          onPreviewIndexChange={setPreviewIndex}
          isDisabled={isDisabled}
        />
      </SettingsAccordion>

      {/* 사운드 설정 */}
      <SettingsAccordion
        icon="🔊"
        iconGradient="linear-gradient(135deg, #34d399, #38bdf8)"
        title="사운드 설정"
        summary={soundSummary}
        isOpen={openGroup === 'sound'}
        onToggle={() => setOpenGroup(openGroup === 'sound' ? null : 'sound')}
      >
        <SoundSettingsGroup
          voiceSettingsRef={voiceSettingsRef}
          isDisabled={isDisabled}
          language={language}
          onLanguageChange={handleLanguageChange}
        />
      </SettingsAccordion>

      {/* 프리셋 */}
      <SettingsAccordion
        icon="📁"
        iconGradient="linear-gradient(135deg, #fbbf24, #f97316)"
        title="프리셋"
        summary={presetSummary}
        isOpen={openGroup === 'preset'}
        onToggle={() => setOpenGroup(openGroup === 'preset' ? null : 'preset')}
      >
        <PresetGroup
          projects={projects}
          onSave={saveProject}
          onLoad={loadProject}
          onUpdate={updateProject}
          onDelete={deleteProject}
        />
      </SettingsAccordion>
    </div>
  </div>
);
```

**Step 4: 기존 JSX 제거**

기존 return문의 타이틀 (`<h1>C2 GEN</h1>`), 6개 카드, 하단 탭/인풋 JSX 전체를 삭제. 위의 새 JSX로 교체.

**Step 5: 미사용 import 정리**

PLACEHOLDER_EXAMPLES는 HeroInput으로 이동했으므로 제거. 기타 미사용 변수/import 정리.

**Step 6: 빌드 확인**

Run: `npm run build`
Expected: 빌드 성공, 에러 없음

**Step 7: 브라우저 확인**

Run: `npm run dev`
- 브라우저에서 http://localhost:3000 열기
- Hero Input이 최상단에 표시되는지 확인
- 아코디언 3개가 토글되는지 확인
- 접힌 요약이 올바르게 표시되는지 확인
- 기존 기능 (모델 선택, 화풍 선택, 음성 변경 등) 모두 동작 확인

**Step 8: 커밋**

```bash
git add components/InputSection.tsx
git commit -m "refactor: restructure InputSection with HeroInput + accordion groups"
```

---

### Task 7: 시각 스타일 정리 및 색상 통일

**Files:**
- Modify: `components/input/ImageSettingsGroup.tsx`
- Modify: `components/input/VoiceSettings.tsx` (최소 변경)

**목적:** 기존 색상 혼재 (violet, emerald, teal 등)를 brand-blue (#60a5fa) 중심으로 통일.

**Step 1: ImageSettingsGroup 색상 통일**

- 모델 선택 상태: `bg-blue-600/20 border-blue-500` → `rgba(96,165,250,0.08)` + `rgba(96,165,250,0.6)`
- 영상 방향 선택: `bg-violet-600/20 border-violet-500` → 동일하게 blue로 통일
- 화풍 선택 상태: `bg-emerald-500` → `rgba(96,165,250,0.12)` + `rgba(96,165,250,0.45)` + 텍스트 `#93c5fd`
- 한글억제 토글: amber 유지 (기능적 구분을 위해)
- GPT 화풍: `bg-violet-500` → blue로 통일

**Step 2: VoiceSettings 최소 변경**

VoiceSettings는 이미 독립 컴포넌트이므로 큰 변경 불필요. 필요 시:
- 카드 배경을 `var(--bg-elevated)` 통일
- 선택 강조색만 blue 계열로 맞춤

**Step 3: 빌드 + 시각 확인**

Run: `npm run build && npm run dev`
Expected: 전체 UI가 blue 계열로 통일된 모습

**Step 4: 커밋**

```bash
git add components/input/ImageSettingsGroup.tsx components/input/VoiceSettings.tsx
git commit -m "style: unify selection colors to brand-blue across settings"
```

---

### Task 8: App.tsx에서 타이틀 제거 + max-width 조정

**Files:**
- Modify: `App.tsx` (InputSection 사용 부분)

**목적:** InputSection이 이제 자체적으로 max-width와 레이아웃을 관리하므로, App.tsx에서 중복 래퍼 제거 확인.

**Step 1: App.tsx 확인**

App.tsx에서 `<InputSection>` 주변에 추가 래퍼나 타이틀이 있는지 확인. 있다면 정리.

**Step 2: Header.tsx와의 시각적 조화 확인**

새 InputSection이 Header와 자연스럽게 연결되는지 확인. 필요 시 상단 여백 조정.

**Step 3: 빌드 + 최종 시각 확인**

Run: `npm run build && npm run dev`

**Step 4: 커밋**

```bash
git add App.tsx
git commit -m "refactor: clean up App.tsx wrapper for redesigned InputSection"
```

---

### Task 9: 최종 통합 테스트

**Files:** 없음 (수동 테스트)

**Step 1: 기능 테스트 체크리스트**

브라우저에서 아래 시나리오 모두 확인:

- [ ] 자동 대본 모드: 키워드 입력 → 시작 → 생성 시작
- [ ] 수동 대본 모드: 대본 입력 → 시작 → 생성 시작
- [ ] 이미지 모델 변경 (Gemini ↔ GPT) → 화풍 목록 변경
- [ ] 영상 방향 변경 (가로 ↔ 세로)
- [ ] 참조 이미지 업로드/삭제 + 강도 슬라이더
- [ ] 화풍 선택 + 미리보기 (👁️)
- [ ] 커스텀 화풍 프롬프트 입력
- [ ] 한글억제 ON/OFF
- [ ] 음성 변경 + 속도/안정성 슬라이더
- [ ] 프리셋 저장/불러오기/삭제
- [ ] 아코디언: 하나만 열림, 접힌 요약 정확
- [ ] localStorage 새로고침 후 설정 유지

**Step 2: 반응형 테스트**

- 모바일 (375px): 스택 레이아웃, 터치 아코디언
- 태블릿 (768px): 2-col 그리드
- 데스크탑 (1200px): max-width 920px 중앙 정렬

**Step 3: 최종 빌드**

Run: `npm run build`
Expected: 빌드 성공, 경고 없음

**Step 4: 최종 커밋**

```bash
git add -A
git commit -m "feat: complete InputSection UI redesign - hero input + accordion groups"
```

---

## 파일 요약

| 작업 | 파일 | 유형 |
|------|------|------|
| Task 1 | `components/input/SettingsAccordion.tsx` | 생성 |
| Task 2 | `components/input/HeroInput.tsx` | 생성 |
| Task 3 | `components/input/ImageSettingsGroup.tsx` | 생성 |
| Task 4 | `components/input/SoundSettingsGroup.tsx` | 생성 |
| Task 5 | `components/input/PresetGroup.tsx` | 생성 |
| Task 6 | `components/InputSection.tsx` | 수정 (JSX 재작성) |
| Task 7 | `ImageSettingsGroup.tsx`, `VoiceSettings.tsx` | 수정 (색상) |
| Task 8 | `App.tsx` | 수정 (래퍼 정리) |
| Task 9 | — | 수동 테스트 |
