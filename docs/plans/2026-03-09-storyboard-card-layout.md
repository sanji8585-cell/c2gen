# Storyboard Card Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 1,484-line table-based ResultTable with a card-based layout that makes images the visual focal point, uses progressive disclosure, and eliminates desktop/mobile code duplication.

**Architecture:** Extract shared sub-components (LazyImage, AudioPlayer) → Build SceneCard as the unified card component → Extract SceneToolbar → Assemble ResultCards as the drop-in replacement → Swap in App.tsx.

**Tech Stack:** React 19 + TypeScript + Tailwind CSS (CDN) + Vite 6 + CSS custom properties

**Design Reference:** `docs/mockup-storyboard-cards.html`

---

### Task 1: Extract LazyImage to shared component

**Files:**
- Create: `components/shared/LazyImage.tsx`
- Modify: `components/ResultTable.tsx` (replace inline definition with import)

**Step 1:** Create `components/shared/LazyImage.tsx` — exact copy of lines 72-100 from ResultTable.tsx, exported as default.

**Step 2:** In `ResultTable.tsx`, replace the inline `LazyImage` definition (lines 72-100) with:
```typescript
import LazyImage from './shared/LazyImage';
```

**Step 3:** Run `npm run build` — Expected: PASS

**Step 4:** Commit: `refactor: extract LazyImage to shared component`

---

### Task 2: Extract AudioPlayer to shared component

**Files:**
- Create: `components/shared/audioUtils.ts`
- Create: `components/shared/AudioPlayer.tsx`
- Modify: `components/ResultTable.tsx` (replace inline definitions with imports)

**Step 1:** Create `components/shared/audioUtils.ts` — move `decodeAudio` function (lines 52-70 from ResultTable).

**Step 2:** Create `components/shared/AudioPlayer.tsx` — exact copy of lines 101-149 from ResultTable, importing `decodeAudio` from `./audioUtils`.

**Step 3:** In `ResultTable.tsx`, replace the inline definitions with:
```typescript
import { decodeAudio } from './shared/audioUtils';
import AudioPlayer from './shared/AudioPlayer';
```
Remove lines 52-149 (decodeAudio + LazyImage + AudioPlayer).

**Step 4:** Run `npm run build` — Expected: PASS

**Step 5:** Commit: `refactor: extract AudioPlayer + decodeAudio to shared`

---

### Task 3: Build SceneCard component

**Files:**
- Create: `components/SceneCard.tsx`

**Design (from mockup):**
```
┌──────────────────────────────────────────────────────┐
│ [drag] #01 [STANDARD][POSITIVE]        [✏️][📋][➕][🗑] │  ← header
├──────────┬───────────────────────────────────────────┤
│  IMAGE   │  나레이션 텍스트 (2-3줄 truncate)          │
│  280×158 │  ──────────────────────────────────────── │
│  (hover  │  [▶ 4.5s 🔄 🔊]  줌[↗↙←→•]  전환[⟷■◁▷•] │  ← footer
│  overlay)│                                           │
├──────────┴───────────────────────────────────────────┤
│ ▸ 비주얼 프롬프트 (접힘)                                │
└──────────────────────────────────────────────────────┘
```

**SceneCardProps interface:**
```typescript
interface SceneCardProps {
  row: GeneratedAsset;
  index: number;
  isPortrait: boolean;
  isAnimating: boolean;
  isEditing: boolean;
  isExpanded: boolean;
  confirmDelete: boolean;
  // All 17 callbacks from ResultTableProps (same names as TableRowProps)
  onRegenerateImage?: (index: number) => void;
  onGenerateAnimation?: (index: number) => void;
  onEditToggle?: (index: number | null) => void;
  onUpdateAsset?: (index: number, updates: Partial<GeneratedAsset>) => void;
  onRegenerateAudio?: (index: number) => void;
  onDeleteScene?: (index: number) => void;
  onAddScene?: (afterIndex: number) => void;
  onDuplicateScene?: (index: number) => void;
  onUploadSceneImage?: (index: number, base64: string) => void;
  onSetCustomDuration?: (index: number, duration: number) => void;
  onSetZoomEffect?: (index: number, effect: string) => void;
  onSetTransition?: (index: number, transition: string) => void;
  onConfirmDeleteToggle?: (index: number | null) => void;
  onExpandToggle?: (index: number | null) => void;
  onDragStart?: (index: number) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (index: number) => void;
  onDragEnd?: () => void;
}
```

**Key behaviors:**
- Header: scene number + badges + action buttons (edit/dup/add/delete)
- Image area: LazyImage with hover overlay (regenerate/upload/animate)
- Content: narration (view: line-clamp-3, edit: textarea) + footer controls
- Footer: AudioPlayer + duration badge + zoom 5-btn + transition 5-btn
- Expandable: visual prompt (collapsed by default, expanded when editing)
- Edit mode: narration + prompt textareas, save/cancel in header
- Error state: red border + error message
- Generating state: skeleton + spinner
- `React.memo` wrapping
- `getImageMime()` for PNG/JPEG detection

**Step 1:** Create SceneCard with all states (completed, generating, error, editing).

**Step 2:** Run `npm run build` — Expected: PASS (component not yet used)

**Step 3:** Commit: `feat: add SceneCard component`

---

### Task 4: Extract SceneToolbar component

**Files:**
- Create: `components/SceneToolbar.tsx`

**Content from ResultTable:**
- Desktop toolbar (lines 955-1163) — undo/redo, failed scenes, thumbnail, preview, auto-zoom, BGM vol/ducking, subtitle settings, resolution, save/export
- Mobile mini toolbar (lines 750-815)
- Mobile bottom sheets (lines 813-955) — settings + save
- Subtitle settings panel (lines 1165-1228)
- Save menu portal (lines 705-751)

**SceneToolbarProps interface:**
```typescript
interface SceneToolbarProps {
  data: GeneratedAsset[];
  failedScenesCount: number;
  // Preview
  showPreview: boolean;
  onTogglePreview: () => void;
  // Subtitle state + setters
  subtitlePos: 'top' | 'center' | 'bottom';
  onSubtitlePosChange: (v: 'top' | 'center' | 'bottom') => void;
  subtitleFontSize: number;
  onSubtitleFontSizeChange: (v: number) => void;
  subtitleBgOpacity: number;
  onSubtitleBgOpacityChange: (v: number) => void;
  subtitleTextColor: string;
  onSubtitleTextColorChange: (v: string) => void;
  sceneGap: number;
  onSceneGapChange: (v: number) => void;
  selectedResolution: ResolutionTier;
  onResolutionChange: (v: ResolutionTier) => void;
  autoZoomPattern: string;
  onAutoZoomPatternChange: (v: string) => void;
  // Passthrough from ResultTableProps
  canUndo?: boolean; canRedo?: boolean;
  onUndo?: () => void; onRedo?: () => void;
  onRegenerateFailedScenes?: () => void;
  onOpenThumbnail?: () => void;
  onSaveProject?: () => void;
  onAutoZoom?: (pattern: string) => void;
  onSetDefaultTransition?: (transition: string) => void;
  onExportVideo?: (...args: any[]) => void;
  isExporting?: boolean;
  userPlan?: string;
  // BGM
  bgmData?: string | null;
  bgmVolume?: number;
  bgmDuckingEnabled?: boolean;
  bgmDuckingAmount?: number;
  onBgmVolumeChange?: (v: number) => void;
  onBgmDuckingToggle?: (v: boolean) => void;
  onBgmDuckingAmountChange?: (v: number) => void;
  // Derived
  currentSubtitleConfig: Partial<SubtitleConfig>;
}
```

**Step 1:** Create SceneToolbar with all desktop/mobile toolbar JSX.

**Step 2:** Run `npm run build` — Expected: PASS

**Step 3:** Commit: `feat: add SceneToolbar component`

---

### Task 5: Assemble ResultCards (drop-in replacement)

**Files:**
- Create: `components/ResultCards.tsx`

**Same `ResultTableProps` interface as ResultTable.tsx** — identical props, drop-in replacement.

**Composition:**
```
ResultCards
  ├── Save menu portal (fixed z-9999)
  ├── SceneToolbar
  ├── PreviewPlayer (conditional)
  └── data.map → SceneCard × N
      └── + 씬 추가 button
```

**State (copied from ResultTable):**
- confirmDeleteIndex, expandedIndex (replaces expandedCardPrompt)
- showSubtitleSettings, subtitlePos, subtitleFontSize, subtitleBgOpacity, subtitleTextColor
- sceneGap (localStorage persistent), showPreview, selectedResolution
- showSaveMenu, autoZoomPattern, showMobileSettings, savingProject, saveSuccess
- showMobileSaveMenu, dragIndexRef, saveButtonRef

**Key logic:**
- When editingIndex changes to non-null → force expandedIndex to same value
- confirmDeleteIndex 3-second auto-cancel timeout
- dragIndexRef for HTML5 drag-and-drop
- handleResolutionChange with localStorage persistence

**Step 1:** Create ResultCards composing SceneToolbar + SceneCard.

**Step 2:** Run `npm run build` — Expected: PASS

**Step 3:** Commit: `feat: add ResultCards component`

---

### Task 6: Swap in App.tsx + Final verification

**Files:**
- Modify: `App.tsx` (change import + JSX tag)

**Step 1:** In App.tsx:
```typescript
// Change line 8:
import ResultCards from './components/ResultCards';
// Change line ~1811:
<ResultCards  // was <ResultTable
```

**Step 2:** Run `npm run build` — Expected: PASS

**Step 3:** Manual QA checklist:
- [ ] 씬 카드 렌더링 (이미지 + 나레이션)
- [ ] 이미지 호버 오버레이 (재생성/업로드/영상)
- [ ] 편집 모드 (textarea 표시, 저장/취소)
- [ ] 비주얼 프롬프트 접기/펴기
- [ ] TTS 재생/정지/재생성/음소거
- [ ] 줌/트랜지션 버튼
- [ ] 드래그 앤 드롭 재정렬
- [ ] 씬 추가/복제/삭제 (2탭 확인)
- [ ] 툴바: undo/redo, 미리보기, 자막설정, BGM, 해상도
- [ ] 내보내기: ZIP, SRT, MP4
- [ ] 모바일 레이아웃
- [ ] 프로젝트 저장

**Step 4:** Commit: `feat: replace ResultTable with card-based ResultCards`

**Step 5:** Deploy: `git push && npx vercel --prod`

---

### Task 7: Cleanup

**Files:**
- Delete: `components/ResultTable.tsx` (1,484 lines removed)
- Delete old plan file if exists

**Step 1:** Delete ResultTable.tsx.

**Step 2:** Run `npm run build` — ensure no remaining imports.

**Step 3:** Commit: `chore: remove old ResultTable (replaced by ResultCards)`

---

## Verification

1. `npm run build` passes at every task
2. All 17 callback props work identically to before
3. Desktop and mobile use the same SceneCard component
4. Image is the visual focal point (280px wide, 16:9)
5. Action buttons appear on hover (progressive disclosure)
6. Visual prompt collapsed by default
7. Edit mode expands card with textareas
8. No functionality regression from current ResultTable
