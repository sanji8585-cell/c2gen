# c2gen 영상 렌더링 마이그레이션 완료 보고서: MediaRecorder → Mediabunny

**작성일**: 2026-03-31
**최종 수정**: 2026-04-01 (구현 완료 후 실제 코드 반영)
**상태**: **구현 완료** — Mediabunny 경로 + MediaRecorder 폴백 모두 동작 중

---

## 배경: 기존 문제

### 1. 실시간 렌더링 = 사용자 대기 시간

기존 `videoService.ts`는 MediaRecorder + canvas.captureStream(30)을 사용했습니다.

```
30초 영상 → 30초 렌더링 (실시간)
60초 영상 → 60초 렌더링
```

영상 길이만큼 무조건 기다려야 했습니다. setInterval(33ms)으로 프레임을 그리고, AudioContext로 실시간 오디오 재생하면서 MediaRecorder가 캡처하는 구조였습니다.

### 2. iOS canvas.captureStream() 빈 화면 버그

WebKit 미해결 버그 (bugs.webkit.org/show_bug.cgi?id=229611).
iOS WKWebView에서 `canvas.captureStream()`이 빈 화면(검은 프레임)을 반환하는 경우가 있습니다.
WebView 환경(토스 앱 등)에서 위험했습니다.

### 3. 출력 포맷 혼재

Android에서는 WebM, iOS에서는 MP4가 나왔습니다. WebM은 iOS에서 재생이 안 되고, 카카오톡/인스타 공유 시 호환성 문제가 있었습니다.

### 4. 백그라운드 탭 문제

setInterval은 브라우저가 백그라운드 탭에서 스로틀링합니다. 사용자가 렌더링 중 다른 탭으로 이동하면 프레임이 누락되거나 타이밍이 틀어졌습니다.

### 5. 코덱 제어 불가

MediaRecorder는 `videoBitsPerSecond` 힌트만 줄 수 있고, H.264 프로필, 키프레임 간격, 인코더 설정을 직접 제어할 수 없었습니다.

---

## 솔루션: Mediabunny (WebCodecs 기반)

### Mediabunny란

mp4-muxer + webm-muxer의 후속 라이브러리입니다. 같은 개발자(Vanilagy)가 만들었고, WebCodecs API를 활용하여 **프레임 단위 비실시간 인코딩**을 지원합니다.

- npm: `mediabunny` v1.40.x (2026년 3월, 활발히 유지보수)
- 번들: ~17KB gzipped (MP4 쓰기 기준)
- GitHub: github.com/Vanilagy/mediabunny

### 핵심 차이

| 항목 | 기존 (MediaRecorder) | Mediabunny (WebCodecs) |
|------|---------------------|----------------------|
| **렌더링 속도** | 실시간 (30초=30초) | **2~5배속** (디바이스/해상도 의존) |
| **출력 포맷** | WebM or MP4 (브라우저 따라 다름) | **항상 MP4 (H.264+AAC)** |
| **iOS 호환** | captureStream 빈 화면 버그 위험 | WebCodecs 안정 (Safari 17+) |
| **백그라운드 탭** | 스로틀링 → 프레임 누락 | 프레임 단위 처리 → 영향 없음 |
| **코덱 제어** | 힌트만 가능 | 프로필/비트레이트/키프레임 정밀 제어 |
| **하드웨어 가속** | 소프트웨어 인코딩 | 디바이스 하드웨어 H.264 인코더 |
| **오디오** | AudioContext 실시간 재생 필수 | OfflineAudioContext 사전 믹싱 (재생 불필요) |
| **번들** | 0KB | ~17KB |

---

## 구현 결과 (현재 코드 상태)

### 파일 구조 (2026-04-01 기준)

```
services/videoService.ts (1,160줄)
├── 공통 유틸 (1~393줄)
│   ├── Mediabunny 동적 import (6~10줄)
│   ├── decodeAudio() — 오디오 디코딩 (15~34줄)
│   ├── SubtitleChunk/PreparedScene 타입 (36~59줄)
│   ├── createSubtitleChunks() — 자막 청크 변환 (66~120줄)
│   ├── getCurrentChunk() — 현재 자막 탐색 (122~142줄)
│   ├── renderSubtitle() — 자막 Canvas 렌더링 (144~260줄)
│   ├── calcZoomPan() — 줌/패닝 효과 (262~300줄)
│   ├── drawSceneFrame() — 씬 프레임 Canvas 렌더링 (302~340줄)
│   ├── renderTransition() — 전환 효과 (342~388줄)
│   └── export 인터페이스 (370~393줄)
│
├── generateVideoWithMediabunny() (397~686줄) — WebCodecs 경로
│   ├── 에셋 준비 (423~492줄) — 이미지/비디오/오디오 디코딩
│   ├── OfflineAudioContext 사전 믹싱 (502~544줄) — 나레이션 + BGM + 덕킹
│   ├── Mediabunny Output 설정 (556~574줄) — CanvasSource + AudioBufferSource
│   ├── for 루프 프레임 렌더링 (585~670줄) — 비실시간
│   └── finalize + Blob 반환 (678~686줄)
│
├── generateVideoLegacy() (690~1140줄) — MediaRecorder 폴백
│   ├── 에셋 준비 (동일 패턴)
│   ├── AudioContext + MediaRecorder 설정
│   ├── 오디오 실시간 스케줄링 + BGM 덕킹
│   └── setInterval(renderFrame, 33ms) 실시간 루프
│
└── generateVideo() (1144~1160줄) — 메인 export (분기)
    ├── VideoEncoder 존재 + isConfigSupported → Mediabunny
    ├── Mediabunny 실패 시 → Legacy 폴백
    └── VideoEncoder 미존재 → Legacy 직행
```

### 호환성 (검증된 정보)

| 환경 | VideoEncoder | AudioEncoder |
|------|-------------|-------------|
| Chrome 94+ (Desktop/Android) | ✅ | ✅ |
| Safari 17+ (iOS/macOS) | ✅ | ❌ (Safari 26+에서 추가) |
| Safari 26+ (iOS 26/macOS Tahoe) | ✅ | ✅ |
| Firefox 130+ (Desktop만) | ✅ | ✅ |
| Firefox Android | ❌ | ❌ |
| 토스 앱 WebView (Android) | Chrome 기반 → ✅ | ✅ |

**주의사항**:
- Safari 17~25에서는 AAC AudioEncoder 미지원 → `@mediabunny/aac-encoder` WASM 폴리필 (~200KB) 필요
- Firefox Android는 WebCodecs 미지원 → MediaRecorder 폴백
- 구형 iOS (A12 이하)는 H.264 하드웨어 인코딩 720p까지만 지원

### 폴백 전략 (구현됨)

```typescript
// videoService.ts:1144~1160
export const generateVideo = async (...) => {
  if (typeof VideoEncoder !== 'undefined') {
    // H.264 코덱 지원 여부까지 확인
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42E01E', width: dims.width, height: dims.height, bitrate
    });
    if (support.supported) {
      try {
        return await generateVideoWithMediabunny(...);
      } catch (e) {
        // Mediabunny 실패 시 → MediaRecorder 폴백
        return generateVideoLegacy(...);
      }
    }
  }
  return generateVideoLegacy(...);  // WebCodecs 미지원 브라우저
};
```

---

## 알려진 제한사항

| 항목 | 설명 | 완화 방법 |
|------|------|----------|
| OfflineAudioContext 메모리 | 3분 오디오 = ~60MB RAM, 10분 = ~200MB | 장기적으로 청크 분할 필요 |
| 영상 씬 seek 부정확 | video.currentTime은 키프레임 단위 | 5초 이하 짧은 클립이므로 시각적 영향 미미 |
| 메인 스레드 블로킹 | for 루프 중 UI 멈춤 | 매 5% 진행마다 setTimeout(0) 양보 |
| 4K 모바일 인코딩 | 구형 디바이스에서 하드웨어 미지원 가능 | isConfigSupported 체크로 폴백 |
| VideoFrame 누수 | 에러 시 GPU 메모리 미해제 위험 | try/finally + output.cancel() 보장 |

---

## 참고 자료

- Mediabunny 공식: https://mediabunny.dev/
- Mediabunny GitHub: https://github.com/Vanilagy/mediabunny
- WebCodecs Can I Use: https://caniuse.com/webcodecs
- mp4-muxer → Mediabunny 마이그레이션 가이드: https://vanilagy.github.io/mp4-muxer/MIGRATION-GUIDE.html
- WebKit captureStream 버그: https://bugs.webkit.org/show_bug.cgi?id=229611
