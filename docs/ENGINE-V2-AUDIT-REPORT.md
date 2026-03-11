# C2GEN Engine V2.0 — 전면 실사 보고서

> **작성일**: 2026-03-11
> **검토 방식**: 8개 전문 에이전트 병렬 투입, 코드 레벨 실행 경로 추적
> **대상 커밋**: `0cc4fe3` (수정 후 최종 상태)

---

## I. 현재 구현 상태 총괄

### 확실히 작동하는 것 ✅

| 기능 | 근거 |
|------|------|
| 고급 탭 UI (3탭 전환) | auto/manual/advanced 탭 정상 동작 |
| 디렉티브 파서 (11종 키, 3개 언어) | `parseDirectives()` — 괄호 추출, 키 매핑, 나레이션 정제 모두 정상 |
| 일반 괄호 보호 (`GDP(국내총생산)`) | DIRECTIVE_KEY_MAP에 없으면 무시 |
| 디렉티브 → Gemini 이미지 프롬프트 반영 | `getFinalVisualPrompt()`에서 COMPOSITION, MOOD, BACKGROUND, STYLE, TEXT, CAMERA, COLOR 모두 적용 |
| 디렉티브 → GPT Image-1 프롬프트 반영 | `api/openai.ts:134`에서 directives 전달 (수정 완료) |
| AI 대본 어시스턴트 (의도→디렉티브 대본) | 의도 입력 → Gemini 변환 → textarea 표시 → 편집 가능 → 생성 |
| 다중 음성 TTS (고급모드) | 4단계 매칭 (정확→부분→성별→순서) → ElevenLabs voiceId 라우팅 |
| 화자별 자막 색상 (MP4 렌더링) | `videoService.ts` canvas `fillStyle`에 speakerColor 적용 |
| 화자별 자막 색상 (프리뷰) | `renderUtils.ts` + `PreviewPlayer.tsx`에 speakerColor 연결 (수정 완료) |
| CharacterVoiceManager UI | 화자 추가/삭제, 색상/성별/음성/속도/안정성 설정 |
| BGM 오토 덕킹 (다중 화자) | 화자 무관하게 나레이션 구간 자동 덕킹 |
| Level 1 일관성 (프롬프트 전파) | `propagateSceneContext()`로 `[CONTINUITY]` 텍스트 주입 |
| Level 2 일관성 (이미지 참조) | `prevSceneImage`를 다음 씬에 전달 (수정 완료) |
| 일관성 모드 자동 활성화 | 토글만 켜면 디렉티브 없이도 순차+참조 동작 (수정 완료) |
| 디버그 패널 (디렉티브 뱃지 + 적용 프롬프트) | 씬별 파싱 결과, 적용 후 프롬프트 표시 |
| SRT 화자 라벨 | `[화자명] 텍스트` 형식 자동 추가 (수정 완료) |
| 디렉티브 가이드 모달 | 📖 버튼 → 전체 문법 + 예시 표시 (신규 구현) |
| AI Assist 에러 토스트 | 실패/크레딧부족 사용자 알림 (수정 완료) |
| Gemini TTS 폴백 성별 라우팅 | 화자 성별에 맞는 음성 사용 (수정 완료) |
| COLOR 디렉티브 시 자동 팔레트 억제 | 충돌 방지 (수정 완료) |

### 작동하지 않는 것 ❌

| 기능 | 원인 |
|------|------|
| 일반모드(자동/수동)에서 다중 음성 | **의도적 설계** — 고급 탭 전용 기능 |
| Flux 이미지 경로 | `IMAGE_MODELS`에서 제거됨 — 데드 코드 |
| CharacterVoiceManager 내 음성 미리듣기 | 재생 버튼 없음 |
| CharacterVoiceManager 내 음성 검색 | 즐겨찾기 드롭다운만 — ElevenLabs 라이브러리 검색 미통합 |

### 애매한 것 (부분 작동) ⚠️

| 기능 | 설명 |
|------|------|
| 디렉티브-씬 인덱스 매핑 | 원본 줄 N → 씬 N 매핑. Gemini가 씬 수를 다르게 반환하면 잘못된 디렉티브 부착 |
| TTS 개별 재생성 음성 매칭 | 3단계만 구현 (4차 순서 폴백 없음) + 성별 키워드 목록 축소 |
| 디버그 패널 프롬프트 비교 | "적용 후"만 표시 — "적용 전" 원본과 나란히 비교 안 됨 |
| 디버그 패널 화자 표시 | TTS 생성 후에만 보임 — SCRIPT_REVIEW 단계에서는 항상 빈 상태 |
| 스크립트 재생성 후 디렉티브 | 재생성 시 디렉티브 소실. 의도적일 수 있으나 사용자 기대와 불일치 |

---

## II. 수정 완료 항목 (2026-03-11)

### 커밋 1: `be143bd` — 확실한 버그 5건 수정

| # | 파일 | 수정 내용 |
|---|------|----------|
| 1 | `App.tsx:496` | `sceneDirectivesRef.current = {}` 초기화 추가 — 모드 간 디렉티브 오염 차단 |
| 2 | `api/gemini.ts:588-644` | `generateAdvancedScript`에 `checkAndDeductCredits(5)` + `logUsage` + `settings` null 체크 |
| 3 | `App.tsx:810-814` | `assetsRef` 직접 쓰기 → `updateAssetAt()` 변경으로 React 상태 동기화 |
| 4 | `api/openai.ts:134` | `getFinalVisualPrompt`에 5번째 인자 `scene?.analysis?.directives` 추가 |
| 5 | `DirectiveDebugPanel.tsx:17-19` | `suppressKorean` props 없을 시 localStorage 폴백 |

### 커밋 2: `0cc4fe3` — 전면 업그레이드

| 기능 | 변경 파일 |
|------|----------|
| 디렉티브 매핑 40개+ 추가 | `config.ts` — DIRECTIVE_KEY_MAP, COMPOSITION_VALUE_MAP, MOOD_VALUE_MAP |
| Level 2 일관성 연결 | `imageService.ts` (options 타입 확장) + `App.tsx` (prevSceneImage 전달) |
| 일관성 모드 자동 활성화 | `App.tsx` — consistency 토글만으로 순차+참조 동작 |
| Gemini TTS 성별 폴백 | `geminiService.ts` (gender/language 파라미터) + `App.tsx` (폴백 호출 시 전달) |
| 프리뷰 화자 색상 | `renderUtils.ts` + `PreviewPlayer.tsx` — speakerColor 추가 |
| SRT 화자 라벨 | `srtService.ts` — `[화자명] 텍스트` 형식 |
| AI Assist 에러 토스트 | `App.tsx` — 크레딧 부족 구분 메시지 |
| 디렉티브 가이드 모달 | `DirectiveGuideModal.tsx` (신규) + `HeroInput.tsx` (📖 버튼) |
| COLOR 팔레트 억제 | `prompts.ts` — 디렉티브 COLOR 지정 시 자동 팔레트 비활성 |
| 일본어 TTS 음성 분리 | `config.ts` — ja: Iapetus/Despina |

---

## III. 디렉티브 매핑 확장 내역

### DIRECTIVE_KEY_MAP (키 별명 추가)

| 추가 키 | 매핑 | 언어 |
|--------|------|------|
| `샷`, `화풍`, `화면`, `배경색`, `앵글`, `색깔`, `색조`, `나레이터` | 각 내부 키 | 한국어 |
| `shot`, `tone`, `bg`, `scene`, `angle`, `colour`, `narrator`, `keep`, `continue` | 각 내부 키 | English |
| `ショット`, `場面`, `色合い`, `ナレーター` | 각 내부 키 | 日本語 |

### COMPOSITION_VALUE_MAP (구도 값 확장)

| 추가 값 | 매핑 | 비고 |
|---------|------|------|
| `클로즈 업`, `close up`, `closeup`, `cu`, `ecu` | MACRO | 공백/약어 변형 |
| `미디엄`, `medium shot`, `mid shot`, `ms`, `바스트샷` | STANDARD | |
| `와이드`, `wide shot`, `full shot`, `ws`, `fs`, `풀샷`, `전신샷` | MICRO | |
| `none`, `no char`, `object only` | NO_CHAR | |

### MOOD_VALUE_MAP (분위기 값 확장: 9개 → 40개+)

**POSITIVE**: 밝음, 희망적, 희망, 설렘, 신나는, 경쾌한, 활기찬, 따뜻한, bright, hopeful, happy, warm, energetic, exciting, positive, 明るい, 希望

**NEGATIVE**: 어두움, 긴장, 긴장감, 무거움, 공포, 슬픔, 우울, 불안, 극적인, dark, tense, dramatic, anxious, sad, gloomy, melancholy, negative, 暗い, 緊張, 恐怖, 悲しい, ドラマティック

**NEUTRAL**: 중립, 차분한, 잔잔한, 진지한, neutral, calm, serious, 中立, 穏やか

---

## IV. 아키텍처 진단

### 일관성 모드 파이프라인 (수정 후)

```
사용자가 "🔗 일관성" 토글 ON
    ↓
[스크립트 생성] — 기존과 동일
    ↓
[이미지 생성] — 순차 for loop (await 대기)
  씬1 → generateImage(scene1, refs) → 이미지1 반환
  씬2 → generateImage(scene2, refs, { prevSceneImage: 이미지1 }) → 이미지2 반환
  씬3 → generateImage(scene3, refs, { prevSceneImage: 이미지2 }) → 이미지3 반환
    ↓
[API 레이어] api/gemini.ts
  prevSceneImage → inlineData 첨부 + [CONTINUITY REFERENCE] 프롬프트 주입
```

### 다중 음성 파이프라인

```
[고급 대본 입력]
  "오늘 시장이 불안해. (화자: 남자)(배경: 트레이딩룸)"
    ↓
[parseDirectives] → SPEAKER: "남자", BACKGROUND: "트레이딩룸"
    ↓
[TTS 생성] — 4단계 매칭
  1차: 정확한 이름 매칭 (v.name === "남자")
  2차: 부분 매칭 (includes)
  3차: 성별 키워드 (남자|남성|male|아빠|형|...)
  4차: 순서 기반 폴백 (이전 씬과 다른 화자 → 다른 voice 선택)
    ↓
[ElevenLabs TTS] — voiceIdForScene으로 호출
    ↓
[폴백 시] Gemini TTS — gender/language 전달 → GEMINI_VOICE_MAP 라우팅
    ↓
[영상 렌더링] — speakerColor로 자막 색상 적용
[SRT 내보내기] — [화자명] 텍스트 형식
```

### 코드 품질 이슈 (잔존)

| 이슈 | 심각도 | 위치 |
|------|--------|------|
| production console.log 8개 (voiceId 노출 포함) | 중간 | App.tsx 다수 |
| localStorage 동일 키 씬당 2-3회 파싱 | 낮음 | App.tsx:750, 789 |
| `renderUtils.ts` vs `videoService.ts`에 `renderSubtitle` 이중 구현 | 중간 | 분기 관리 필요 |

---

## V. 향후 업그레이드 제안

### Tier 3: 사용자 경험 혁신 (대규모, 높은 가치)

| # | 제안 | 예상 효과 | 난이도 |
|---|------|----------|--------|
| 1 | **의미 기반 디렉티브-씬 매핑** — 인덱스 대신 나레이션 텍스트 유사도로 매핑 | 씬 수 불일치 시에도 정확한 디렉티브 부착 | ★★★ |
| 2 | **일반 모드에서도 다중 음성** — Gemini가 자동으로 화자를 감지하여 등록된 음성에 매핑 | 고급모드 진입 없이도 대화형 콘텐츠 가능 | ★★★ |
| 3 | **디렉티브 자동완성** — textarea에서 `(` 입력 시 드롭다운으로 키/값 자동완성 | 디렉티브 오타/미인식 근본적 해결 | ★★★ |
| 4 | **프롬프트 비교 뷰** — 원본 vs 디렉티브 적용 diff 표시 | 디렉티브 효과 즉시 확인, 학습 도구 역할 | ★★☆ |
| 5 | **CharacterVoiceManager 미리듣기** — 샘플 문장으로 음성 미리 확인 | 화자 설정 시행착오 감소 | ★★☆ |

---

## VI. Sprint별 구현 완료도

| Sprint | 내용 | 상태 | 비고 |
|--------|------|------|------|
| **0** | 고급 탭 UI + handleGenerateAdvanced 래퍼 | **완료** | |
| **1** | 디렉티브 파서 + 기본 적용 | **완료** | 매핑 40개+ 확장 완료 |
| **1.5** | AI 대본 어시스턴트 | **완료** | 크레딧 차감 + 에러 토스트 추가 |
| **2** | 다중 음성 (Multi-Voice) | **완료** | TTS 라우팅 + 자막 색상 + SRT 라벨 + 폴백 성별 |
| **3** | 일관성 Level 1 (프롬프트) | **완료** | propagateSceneContext 정상 동작 |
| **4** | 일관성 Level 2 (이미지 참조) | **완료** | prevSceneImage 연결 + 자동 활성화 |
| **5** | 검증 시스템 + 폴리싱 | **부분 완료** | 디버그 패널 ✅, 가이드 모달 ✅, 프롬프트 비교 뷰 ❌, 다국어 UI ❌ |
