# Mediabunny 마이그레이션 — 구현 완료 기록

**작성일**: 2026-03-31
**최종 수정**: 2026-04-01 (구현 완료 후 실제 코드 반영)
**상태**: **구현 완료**

---

## 구현된 구조

```
videoService.ts (1,160줄)
├── 공통 유틸 (1~393줄) — 455줄, 양 경로에서 공유
├── generateVideoWithMediabunny() (397~686줄) — WebCodecs 경로, ~290줄
├── generateVideoLegacy() (690~1140줄) — MediaRecorder 폴백, ~450줄
└── generateVideo() (1144~1160줄) — 분기 + 에러 폴백
```

**변경 범위**:
- `services/videoService.ts` — Mediabunny 렌더링 함수 추가 + 기존 코드 폴백으로 유지
- `services/renderUtils.ts` — 변경 없음 (Canvas 유틸 공유)
- `services/mp4Faststart.ts` — 삭제됨 (Mediabunny `fastStart: 'in-memory'`로 대체)
- `package.json` — `mediabunny` + `@mediabunny/aac-encoder` 추가됨

---

## 오디오 믹싱 (OfflineAudioContext)

구현 위치: `videoService.ts:502~544`

```
OfflineAudioContext(2, totalSamples, 44100)
├── 나레이션 AudioBuffer들을 타임라인에 배치 (509~515줄)
├── BGM + loop + GainNode + 덕킹 ramp (518~541줄)
└── startRendering() → mixedAudioBuffer (544줄)
```

**알려진 제한**: 전체 오디오를 단일 AudioBuffer로 할당하므로 장시간 오디오에서 메모리 부담.
- 3분 = ~60MB, 10분 = ~200MB
- 향후 개선: 30초 단위 청크 분할 렌더링 검토

---

## 프레임 렌더링 루프

구현 위치: `videoService.ts:585~670`

```typescript
for (frame = 0; frame < totalFrames; frame++) {
  elapsed = frame / 30;
  currentScene = findScene(elapsed);
  drawSceneFrame(ctx, ...);       // 공유 유틸
  renderSubtitle(ctx, ...);       // 공유 유틸
  renderTransition(ctx, ...);     // 공유 유틸 (씬 간 전환)
  await videoSource.add(elapsed, 1/30);

  // 매 5% 진행마다 UI 양보
  if (percent > lastPercent + 4) {
    onProgress(`고속 렌더링 중: ${percent}%`);
    await new Promise(r => setTimeout(r, 0));
  }
}
```

---

## 폴백 전략

구현 위치: `videoService.ts:1144~1160`

```
VideoEncoder 존재?
├── YES → isConfigSupported(H.264)?
│   ├── YES → generateVideoWithMediabunny()
│   │   └── 실패 시 → generateVideoLegacy() (catch 폴백)
│   └── NO → generateVideoLegacy()
└── NO → generateVideoLegacy()
```

---

## 남은 과제

| 우선순위 | 항목 | 상태 |
|---------|------|------|
| HIGH | 오디오 청크 분할 (3분+ 영상 메모리 대응) | 미구현 |
| MEDIUM | Web Worker + OffscreenCanvas (메인 스레드 해방) | 미구현 |
| LOW | VideoDecoder 기반 영상 씬 프레임 추출 (seek 대체) | 미구현 |

---

## 테스트 매트릭스

| 환경 | 기대 경로 | 테스트 상태 |
|------|----------|-----------|
| Chrome Desktop (최신) | Mediabunny | ✅ 검증 |
| Chrome Android | Mediabunny | 미검증 |
| Safari 26+ (iOS) | Mediabunny | 미검증 |
| Safari 17~25 (iOS) | Mediabunny + AAC 폴리필 | 미검증 |
| Firefox Desktop 130+ | Mediabunny | 미검증 |
| Firefox Android | Legacy (MediaRecorder) | 미검증 |
| 토스 앱 WebView (Android) | Mediabunny (Chrome 기반) | 미검증 |
| 4K 해상도 (모바일) | isConfigSupported 분기 | 미검증 |
| 렌더링 중 취소 (abortRef) | 리소스 정리 | 미검증 |
