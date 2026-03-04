
import React, { useState, useCallback, useRef, useEffect } from 'react';
import AuthGate from './components/AuthGate';
import Header from './components/Header';
import InputSection from './components/InputSection';
import ResultTable from './components/ResultTable';
import { GeneratedAsset, GenerationStep, ScriptScene, CostBreakdown, ReferenceImages, DEFAULT_REFERENCE_IMAGES, SubtitleConfig } from './types';
import { useUndoRedo } from './hooks/useUndoRedo';
import { generateScript, generateScriptChunked, findTrendingTopics, generateAudioForScene, generateMotionPrompt } from './services/geminiService';
import { generateImage, getSelectedImageModel } from './services/imageService';
import { generateAudioWithElevenLabs } from './services/elevenLabsService';
import { generateVideo } from './services/videoService';
import { generateVideoFromImage } from './services/falService';
import { saveProject, getSavedProjects, deleteProject, importProject, migrateFromLocalStorage } from './services/projectService';
import { SavedProject } from './types';
import { CONFIG, PRICING, formatKRW } from './config';
import ProjectGallery from './components/ProjectGallery';
import * as FileSaver from 'file-saver';

const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 에러 캐치용 ErrorBoundary
class GalleryErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <div className="bg-red-900/30 border border-red-500/50 rounded-2xl p-8">
            <h2 className="text-red-400 text-xl font-bold mb-4">갤러리 로딩 오류</h2>
            <pre className="text-red-300 text-xs text-left bg-slate-900 p-4 rounded-xl overflow-auto max-h-64">
              {this.state.error.message}{'\n'}{this.state.error.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type ViewMode = 'main' | 'gallery';

// 인증 래퍼
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const handleAuthSuccess = useCallback((name: string) => {
    setIsAuthenticated(true);
    setUserName(name);
  }, []);

  const handleLogout = useCallback(async () => {
    const token = localStorage.getItem('c2gen_session_token');
    if (token) {
      try {
        await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'logout', token }),
        });
      } catch { /* ignore */ }
    }
    localStorage.removeItem('c2gen_session_token');
    localStorage.removeItem('c2gen_user_name');
    setIsAuthenticated(false);
    setUserName(null);
  }, []);

  if (!isAuthenticated) {
    return <AuthGate onSuccess={handleAuthSuccess} />;
  }

  return <AppContent userName={userName} onLogout={handleLogout} />;
};

// 메인 앱 콘텐츠
const AppContent: React.FC<{ userName: string | null; onLogout: () => void }> = ({ userName, onLogout }) => {
  const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
  const [generatedData, setGeneratedData] = useState<GeneratedAsset[]>([]);
  const [progressMessage, setProgressMessage] = useState('');
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  // 참조 이미지 상태 (강도 포함)
  const [currentReferenceImages, setCurrentReferenceImages] = useState<ReferenceImages>(DEFAULT_REFERENCE_IMAGES);
  const [needsKey, setNeedsKey] = useState(false);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(new Set());

  // 갤러리 뷰 관련
  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [, setCurrentTopic] = useState<string>('');

  // 씬 편집 관련
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // BGM 관련
  const [bgmData, setBgmData] = useState<string | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.25);
  const [bgmDuckingEnabled, setBgmDuckingEnabled] = useState(false);
  const [bgmDuckingAmount, setBgmDuckingAmount] = useState(0.3);

  // 비용 추적
  const [, setCurrentCost] = useState<CostBreakdown | null>(null);
  const costRef = useRef<CostBreakdown>({
    images: 0, tts: 0, videos: 0, total: 0,
    imageCount: 0, ttsCharacters: 0, videoCount: 0
  });

  // Undo/Redo 시스템
  const { pushState: pushUndoState, undo: undoState, redo: redoState, canUndo, canRedo, clear: clearHistory } = useUndoRedo<GeneratedAsset[]>(30, 300);

  const usedTopicsRef = useRef<string[]>([]);
  const assetsRef = useRef<GeneratedAsset[]>([]);
  const isAbortedRef = useRef(false);
  const isProcessingRef = useRef(false);

  const checkApiKeyStatus = useCallback(async () => {
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setNeedsKey(!hasKey);
      return hasKey;
    }
    return true;
  }, []);

  useEffect(() => {
    checkApiKeyStatus();
    // localStorage → IndexedDB 마이그레이션 및 프로젝트 로드
    (async () => {
      await migrateFromLocalStorage(); // 기존 데이터 이전
      const projects = await getSavedProjects();
      setSavedProjects(projects);
    })();
    return () => { isAbortedRef.current = true; };
  }, [checkApiKeyStatus]);

  // 프로젝트 목록 새로고침
  const refreshProjects = useCallback(async () => {
    const projects = await getSavedProjects();
    setSavedProjects(projects);
  }, []);

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setNeedsKey(false);
    }
  };

  const updateAssetAt = (index: number, updates: Partial<GeneratedAsset>) => {
    if (isAbortedRef.current) return;
    if (assetsRef.current[index]) {
      assetsRef.current[index] = { ...assetsRef.current[index], ...updates };
      setGeneratedData([...assetsRef.current]);
    }
  };

  // 비용 추가 헬퍼
  const addCost = (type: 'image' | 'tts' | 'video', amount: number, count: number = 1) => {
    if (type === 'image') {
      costRef.current.images += amount;
      costRef.current.imageCount += count;
    } else if (type === 'tts') {
      costRef.current.tts += amount;
      costRef.current.ttsCharacters += count;
    } else if (type === 'video') {
      costRef.current.videos += amount;
      costRef.current.videoCount += count;
    }
    costRef.current.total = costRef.current.images + costRef.current.tts + costRef.current.videos;
    setCurrentCost({ ...costRef.current });
  };

  // 비용 초기화
  const resetCost = () => {
    costRef.current = {
      images: 0, tts: 0, videos: 0, total: 0,
      imageCount: 0, ttsCharacters: 0, videoCount: 0
    };
    setCurrentCost(null);
  };

  // Undo용 에셋 스냅샷 (얕은 복제 - base64 문자열은 참조 공유)
  const snapshotAssets = () => assetsRef.current.map(a => ({ ...a }));

  // Undo/Redo 핸들러
  const handleUndo = useCallback(() => {
    const prev = undoState(snapshotAssets());
    if (prev) {
      assetsRef.current = prev;
      setGeneratedData([...prev]);
    }
  }, [undoState]);

  const handleRedo = useCallback(() => {
    const next = redoState(snapshotAssets());
    if (next) {
      assetsRef.current = next;
      setGeneratedData([...next]);
    }
  }, [redoState]);

  // Ctrl+Z / Ctrl+Y 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 입력 중(textarea/input)에는 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const handleAbort = () => {
    isAbortedRef.current = true;
    isProcessingRef.current = false;
    setProgressMessage("🛑 작업 중단됨.");
    setStep(GenerationStep.COMPLETED);
  };

  const handleGenerate = useCallback(async (
    topic: string,
    refImgs: ReferenceImages,
    sourceText: string | null
  ) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    isAbortedRef.current = false;

    setStep(GenerationStep.SCRIPTING);
    setProgressMessage('V9.2 Ultra 엔진 부팅 중...');

    try {
      const hasKey = await checkApiKeyStatus();
      if (!hasKey && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }

      setGeneratedData([]);
      assetsRef.current = [];
      setCurrentReferenceImages(refImgs);
      setCurrentTopic(topic); // 저장용 토픽 기록
      resetCost(); // 비용 초기화
      clearHistory(); // Undo 히스토리 초기화

      // 참조 이미지 존재 여부 계산
      const hasRefImages = (refImgs.character?.length || 0) + (refImgs.style?.length || 0) > 0;
      console.log(`[App] 참조 이미지 - 캐릭터: ${refImgs.character?.length || 0}개, 스타일: ${refImgs.style?.length || 0}개`);

      let targetTopic = topic;

      if (topic === "Manual Script Input" && sourceText) {
        setProgressMessage('대본 분석 및 시각화 설계 중...');
      } else if (sourceText) {
        setProgressMessage('외부 콘텐츠 분석 중...');
        targetTopic = "Custom Analysis Topic";
      } else {
        setProgressMessage(`글로벌 경제 트렌드 탐색 중...`);
        const trends = await findTrendingTopics(topic, usedTopicsRef.current);
        if (isAbortedRef.current) return;
        targetTopic = trends[0].topic;
        usedTopicsRef.current.push(targetTopic);
      }

      setProgressMessage(`스토리보드 및 메타포 생성 중...`);

      // 긴 대본(3000자 초과) 감지 시 청크 분할 처리
      const inputLength = sourceText?.length || 0;
      const CHUNK_THRESHOLD = 3000; // 3000자 초과 시 청크 분할

      let scriptScenes: ScriptScene[];
      if (inputLength > CHUNK_THRESHOLD) {
        // 긴 대본: 청크 분할 처리 (10,000자 이상 대응)
        console.log(`[App] 긴 대본 감지: ${inputLength.toLocaleString()}자 → 청크 분할 처리`);
        setProgressMessage(`긴 대본(${inputLength.toLocaleString()}자) 청크 분할 처리 중...`);
        scriptScenes = await generateScriptChunked(
          targetTopic,
          hasRefImages,
          sourceText!,
          2500, // 청크당 2500자
          setProgressMessage // 진행 상황 콜백
        );
      } else {
        // 일반 대본: 기존 방식
        scriptScenes = await generateScript(targetTopic, hasRefImages, sourceText);
      }
      if (isAbortedRef.current) return;
      
      const initialAssets = scriptScenes.map(scene => ({
        ...scene, imageData: null, audioData: null, audioDuration: null, subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const
      }));
      assetsRef.current = initialAssets;
      setGeneratedData(initialAssets);
      setStep(GenerationStep.ASSETS);

      const runAudio = async () => {
          const TTS_DELAY = 1500; // ElevenLabs API Rate Limit 대응: 1.5초 딜레이
          const MAX_TTS_RETRIES = 2; // 최대 재시도 횟수

          for (let i = 0; i < initialAssets.length; i++) {
              if (isAbortedRef.current) break;

              setProgressMessage(`씬 ${i + 1}/${initialAssets.length} 음성 생성 중...`);
              let success = false;

              // 재시도 로직
              for (let attempt = 0; attempt <= MAX_TTS_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;

                  try {
                      if (attempt > 0) {
                          console.log(`[TTS] 씬 ${i + 1} 재시도 중... (${attempt}/${MAX_TTS_RETRIES})`);
                          await wait(3000); // 재시도 시 3초 대기
                      }

                      // ElevenLabs에서 오디오 + 자막 타임스탬프 동시 획득
                      const elSpeed = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED) || '1.0');
                      const elStability = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY) || '0.6');
                      const elResult = await generateAudioWithElevenLabs(
                        assetsRef.current[i].narration,
                        undefined, undefined, undefined,
                        { speed: elSpeed, stability: elStability }
                      );
                      if (isAbortedRef.current) break;

                      if (elResult.audioData) {
                        // ElevenLabs 성공: 오디오 + 자막 + 길이 데이터 저장
                        updateAssetAt(i, {
                          audioData: elResult.audioData,
                          subtitleData: elResult.subtitleData,
                          audioDuration: elResult.estimatedDuration
                        });
                        // TTS 비용 추가
                        const charCount = assetsRef.current[i].narration.length;
                        addCost('tts', charCount * PRICING.TTS.perCharacter, charCount);
                        success = true;
                        console.log(`[TTS] 씬 ${i + 1} 음성 생성 완료`);
                      } else {
                        throw new Error('ElevenLabs 응답 없음');
                      }
                  } catch (e: any) {
                      console.error(`[TTS] 씬 ${i + 1} 실패 (시도 ${attempt + 1}):`, e.message);

                      // Rate Limit 에러인 경우 더 긴 대기
                      if (e.message?.includes('429') || e.message?.includes('rate')) {
                          await wait(5000); // 5초 대기 후 재시도
                      }
                  }
              }

              // 모든 재시도 실패 시 Gemini 폴백
              if (!success && !isAbortedRef.current) {
                  try {
                      console.log(`[TTS] 씬 ${i + 1} Gemini 폴백 시도...`);
                      const fallbackAudio = await generateAudioForScene(assetsRef.current[i].narration);
                      updateAssetAt(i, { audioData: fallbackAudio });
                  } catch (fallbackError) {
                      console.error(`[TTS] 씬 ${i + 1} Gemini 폴백도 실패:`, fallbackError);
                  }
              }

              // 다음 씬 전에 딜레이 (Rate Limit 방지)
              if (i < initialAssets.length - 1 && !isAbortedRef.current) {
                  await wait(TTS_DELAY);
              }
          }
      };

      const runImages = async () => {
          const MAX_RETRIES = 2;
          const CONCURRENCY = 5; // 동시 생성 수
          const imageModel = getSelectedImageModel();
          const imagePrice = PRICING.IMAGE[imageModel as keyof typeof PRICING.IMAGE] || 0.01;

          const generateSingleImage = async (i: number) => {
              if (isAbortedRef.current) return;
              updateAssetAt(i, { status: 'generating' });

              let success = false;
              let lastError: any = null;

              for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;

                  try {
                      if (attempt > 0) {
                          setProgressMessage(`씬 ${i + 1} 이미지 재생성 시도 중... (${attempt}/${MAX_RETRIES})`);
                          await wait(2000);
                      }

                      const img = await generateImage(assetsRef.current[i], refImgs);
                      if (isAbortedRef.current) break;

                      if (img) {
                          updateAssetAt(i, { imageData: img, status: 'completed' });
                          addCost('image', imagePrice, 1);
                          success = true;
                      } else {
                          throw new Error('이미지 데이터가 비어있습니다');
                      }
                  } catch (e: any) {
                      lastError = e;
                      console.error(`씬 ${i + 1} 이미지 생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);

                      if (e.message?.includes("API key not valid") || e.status === 400) {
                          setNeedsKey(true);
                          break;
                      }
                  }
              }

              if (!success && !isAbortedRef.current) {
                  const errMsg = lastError?.message || '알 수 없는 오류';
                  updateAssetAt(i, { status: 'error', errorMessage: errMsg });
                  console.error(`씬 ${i + 1} 이미지 생성 최종 실패:`, errMsg);
              }
          };

          // 동시성 풀: CONCURRENCY개씩 병렬 처리
          const indices = initialAssets.map((_, i) => i);
          for (let start = 0; start < indices.length; start += CONCURRENCY) {
              if (isAbortedRef.current) break;
              const batch = indices.slice(start, start + CONCURRENCY);
              setProgressMessage(`이미지 생성 중... (${start + 1}~${Math.min(start + CONCURRENCY, indices.length)}/${indices.length})`);
              await Promise.all(batch.map(i => generateSingleImage(i)));
          }
      };

      setProgressMessage(`시각 에셋 및 오디오 합성 중...`);
      // 이미지와 오디오 먼저 병렬 생성
      await Promise.all([runAudio(), runImages()]);

      // 애니메이션 변환은 이제 수동으로 (이미지 호버 시 버튼 클릭)
      // 자동 변환 비활성화 - 사용자가 원하는 이미지만 선택적으로 변환 가능
      
      if (isAbortedRef.current) return;
      setStep(GenerationStep.COMPLETED);

      // 비용 요약 메시지 (원화)
      const cost = costRef.current;
      const costMsg = `이미지 ${cost.imageCount}장 ${formatKRW(cost.images)} + TTS ${cost.ttsCharacters}자 ${formatKRW(cost.tts)} = 총 ${formatKRW(cost.total)}`;
      setProgressMessage(`생성 완료! ${costMsg}`);

      // 자동 저장 (비용 정보 포함)
      try {
        const savedProject = await saveProject(targetTopic, assetsRef.current, undefined, costRef.current);
        refreshProjects();
        setProgressMessage(`"${savedProject.name}" 저장됨 | ${costMsg}`);
      } catch (e) {
        console.error('프로젝트 자동 저장 실패:', e);
      }

    } catch (error: any) {
      if (!isAbortedRef.current) {
        setStep(GenerationStep.ERROR);
        setProgressMessage(`오류: ${error.message}`);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [checkApiKeyStatus, refreshProjects]);

  // 이미지 재생성 핸들러 (useCallback으로 메모이제이션)
  const handleRegenerateImage = useCallback(async (idx: number) => {
    if (isProcessingRef.current) return;

    const MAX_RETRIES = 2;
    updateAssetAt(idx, { status: 'generating' });
    setProgressMessage(`씬 ${idx + 1} 이미지 재생성 중...`);

    let success = false;
    let lastError: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
      if (isAbortedRef.current) break;

      try {
        if (attempt > 0) {
          setProgressMessage(`씬 ${idx + 1} 이미지 재생성 재시도 중... (${attempt}/${MAX_RETRIES})`);
          await wait(2000);
        }

        const img = await generateImage(assetsRef.current[idx], currentReferenceImages);

        if (img && !isAbortedRef.current) {
          updateAssetAt(idx, { imageData: img, status: 'completed', errorMessage: undefined });
          // 이미지 비용 추가
          const imageModel = getSelectedImageModel();
          const imagePrice = PRICING.IMAGE[imageModel as keyof typeof PRICING.IMAGE] || 0.01;
          addCost('image', imagePrice, 1);
          setProgressMessage(`씬 ${idx + 1} 이미지 재생성 완료! (+${formatKRW(imagePrice)})`);
          success = true;
        } else if (!img) {
          throw new Error('이미지 데이터가 비어있습니다');
        }
      } catch (e: any) {
        lastError = e;
        console.error(`씬 ${idx + 1} 재생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);

        if (e.message?.includes("API key not valid") || e.status === 400) {
          setNeedsKey(true);
          break;
        }
      }
    }

    if (!success && !isAbortedRef.current) {
      const errMsg = lastError?.message || '알 수 없는 오류';
      updateAssetAt(idx, { status: 'error', errorMessage: errMsg });
      setProgressMessage(`씬 ${idx + 1} 생성 실패: ${errMsg.slice(0, 60)}`);
    }
  }, [currentReferenceImages]);

  // 애니메이션 생성 핸들러 (useCallback으로 메모이제이션)
  const handleGenerateAnimation = useCallback(async (idx: number) => {
    if (animatingIndices.has(idx)) return; // 이 씬은 이미 변환 중
    if (!assetsRef.current[idx]?.imageData) {
      alert('이미지가 먼저 생성되어야 합니다.');
      return;
    }

    try {
      // Set에 현재 인덱스 추가
      setAnimatingIndices(prev => new Set(prev).add(idx));
      setProgressMessage(`씬 ${idx + 1} 움직임 분석 중...`);

      // AI가 대본과 이미지를 분석해서 움직임 프롬프트 생성
      const motionPrompt = await generateMotionPrompt(
        assetsRef.current[idx].narration,
        assetsRef.current[idx].visualPrompt
      );

      setProgressMessage(`씬 ${idx + 1} 영상 변환 중...`);
      const videoUrl = await generateVideoFromImage(
        assetsRef.current[idx].imageData!,
        motionPrompt
      );

      if (videoUrl) {
        updateAssetAt(idx, {
          videoData: videoUrl,
          videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
        });
        // 영상 비용 추가
        addCost('video', PRICING.VIDEO.perVideo, 1);
        setProgressMessage(`씬 ${idx + 1} 영상 변환 완료! (+${formatKRW(PRICING.VIDEO.perVideo)})`);
      } else {
        setProgressMessage(`씬 ${idx + 1} 영상 변환 실패`);
      }
    } catch (e: any) {
      console.error('영상 변환 실패:', e);
      setProgressMessage(`씬 ${idx + 1} 오류: ${e.message}`);
    } finally {
      // Set에서 현재 인덱스 제거
      setAnimatingIndices(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  }, [animatingIndices]);

  const triggerVideoExport = async (enableSubtitles: boolean = true, subtitleConfig?: Partial<SubtitleConfig>, sceneGap?: number) => {
    if (isVideoGenerating) return;
    try {
      setIsVideoGenerating(true);
      const suffix = enableSubtitles ? 'sub' : 'nosub';
      const timestamp = Date.now();

      const result = await generateVideo(
        assetsRef.current,
        (msg) => setProgressMessage(`[Render] ${msg}`),
        isAbortedRef,
        { enableSubtitles, bgmData, bgmVolume, subtitleConfig, sceneGap, bgmDuckingEnabled, bgmDuckingAmount }
      );

      if (result) {
        // 영상 저장 (자막은 영상에 하드코딩됨)
        saveAs(result.videoBlob, `c2gen_${suffix}_${timestamp}.mp4`);
        setProgressMessage(`✨ MP4 렌더링 완료! (${enableSubtitles ? '자막 O' : '자막 X'})`);
      }
    } catch (error: any) {
      setProgressMessage(`렌더링 실패: ${error.message}`);
    } finally {
      setIsVideoGenerating(false);
    }
  };

  // 씬 편집 저장 핸들러
  const handleUpdateAsset = useCallback((idx: number, updates: Partial<GeneratedAsset>) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, updates);
    setEditingIndex(null);
  }, [pushUndoState]);

  // 단일 씬 TTS 재생성 핸들러
  const handleRegenerateAudio = useCallback(async (idx: number) => {
    updateAssetAt(idx, { status: 'generating' });
    setProgressMessage(`씬 ${idx + 1} 음성 재생성 중...`);
    try {
      const elSpeed = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED) || '1.0');
      const elStability = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY) || '0.6');
      const result = await generateAudioWithElevenLabs(
        assetsRef.current[idx].narration,
        undefined, undefined, undefined,
        { speed: elSpeed, stability: elStability }
      );
      if (result.audioData && !isAbortedRef.current) {
        updateAssetAt(idx, {
          audioData: result.audioData,
          subtitleData: result.subtitleData,
          audioDuration: result.estimatedDuration,
          status: 'completed'
        });
        const chars = assetsRef.current[idx].narration.length;
        addCost('tts', chars * PRICING.TTS.perCharacter, chars);
        setProgressMessage(`씬 ${idx + 1} 음성 재생성 완료!`);
      }
    } catch (e: any) {
      updateAssetAt(idx, { status: 'error' });
      setProgressMessage(`씬 ${idx + 1} 음성 재생성 실패: ${e.message}`);
    }
  }, []);

  // 씬 순서 변경 핸들러
  const handleReorderScenes = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    pushUndoState(snapshotAssets());
    const newAssets = [...assetsRef.current];
    const [moved] = newAssets.splice(fromIdx, 1);
    newAssets.splice(toIdx, 0, moved);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
  }, []);

  // 씬 삭제 핸들러
  const handleDeleteScene = useCallback((idx: number) => {
    pushUndoState(snapshotAssets());
    const newAssets = assetsRef.current.filter((_, i) => i !== idx);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
    setEditingIndex(null);
  }, []);

  // 씬 추가 핸들러 (afterIdx 위치 다음에 삽입, undefined면 맨 끝)
  const handleAddScene = useCallback((afterIdx?: number) => {
    pushUndoState(snapshotAssets());
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : assetsRef.current.length;
    const newAsset: GeneratedAsset = {
      sceneNumber: insertAt + 1,
      narration: '',
      visualPrompt: '',
      imageData: null,
      audioData: null,
      audioDuration: null,
      subtitleData: null,
      videoData: null,
      videoDuration: null,
      status: 'pending',
      customDuration: 5,
    };
    const newAssets = [...assetsRef.current];
    newAssets.splice(insertAt, 0, newAsset);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
    setEditingIndex(insertAt);
  }, []);

  // 씬 이미지 직접 업로드 핸들러
  const handleUploadSceneImage = useCallback((idx: number, base64: string) => {
    updateAssetAt(idx, { imageData: base64, videoData: null, status: 'completed' });
  }, []);

  // 씬 재생 시간 조절 핸들러
  const handleSetCustomDuration = useCallback((idx: number, duration: number) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { customDuration: duration });
  }, [pushUndoState]);

  // 씬별 줌/팬 효과 핸들러
  const handleSetZoomEffect = useCallback((idx: number, effect: string) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { zoomEffect: effect as GeneratedAsset['zoomEffect'] });
  }, [pushUndoState]);

  // 씬 복제 핸들러
  const handleDuplicateScene = useCallback((idx: number) => {
    pushUndoState(snapshotAssets());
    const original = assetsRef.current[idx];
    const insertAt = idx + 1;
    const newAsset: GeneratedAsset = { ...original, sceneNumber: insertAt + 1 };
    const newAssets = [...assetsRef.current];
    newAssets.splice(insertAt, 0, newAsset);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
  }, []);

  // 자동 줌 패턴 일괄 적용 핸들러
  const handleAutoZoom = useCallback((pattern: string) => {
    pushUndoState(snapshotAssets());
    const len = assetsRef.current.length;
    const dynamicCycle: GeneratedAsset['zoomEffect'][] = ['zoomIn', 'panLeft', 'zoomOut', 'panRight'];

    for (let i = 0; i < len; i++) {
      let effect: GeneratedAsset['zoomEffect'];
      switch (pattern) {
        case 'alternating':
          effect = i % 2 === 0 ? 'zoomIn' : 'zoomOut';
          break;
        case 'dynamic':
          effect = dynamicCycle[i % 4];
          break;
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
        case 'static':
          effect = 'none';
          break;
        default:
          return;
      }
      assetsRef.current[i] = { ...assetsRef.current[i], zoomEffect: effect };
    }
    setGeneratedData([...assetsRef.current]);
  }, [pushUndoState]);

  // 씬별 전환 효과 핸들러
  const handleSetTransition = useCallback((idx: number, transition: string) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { transition: transition as GeneratedAsset['transition'] });
  }, [pushUndoState]);

  // 전체 씬 전환 효과 일괄 설정
  const handleSetDefaultTransition = useCallback((transition: string) => {
    pushUndoState(snapshotAssets());
    assetsRef.current = assetsRef.current.map(a => ({
      ...a,
      transition: transition as GeneratedAsset['transition']
    }));
    setGeneratedData([...assetsRef.current]);
  }, [pushUndoState]);

  // 실패한 씬 일괄 재생성 핸들러
  const handleRegenerateFailedScenes = useCallback(async () => {
    const failedIndices = assetsRef.current
      .map((asset, idx) => ({ asset, idx }))
      .filter(({ asset }) => asset.status === 'error')
      .map(({ idx }) => idx);

    if (failedIndices.length === 0) return;
    setProgressMessage(`실패한 ${failedIndices.length}개 씬 재생성 중...`);

    for (const idx of failedIndices) {
      if (isAbortedRef.current) break;
      await handleRegenerateImage(idx);
    }
    setProgressMessage(`실패 씬 재생성 완료!`);
  }, [handleRegenerateImage]);

  // 프로젝트 JSON 가져오기 핸들러
  const handleImportProject = async (project: SavedProject) => {
    try {
      await importProject(project);
      await refreshProjects();
      setProgressMessage(`"${project.name}" 프로젝트 가져오기 완료`);
    } catch (e: any) {
      setProgressMessage(`프로젝트 가져오기 실패: ${e.message}`);
    }
  };

  // 프로젝트 삭제 핸들러
  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    await refreshProjects();
  };

  // 프로젝트 불러오기 핸들러
  const handleLoadProject = (project: SavedProject) => {
    // 저장된 에셋을 현재 상태로 로드
    assetsRef.current = project.assets;
    setGeneratedData([...project.assets]);
    setCurrentTopic(project.topic);
    setStep(GenerationStep.COMPLETED);
    setProgressMessage(`"${project.name}" 프로젝트 불러옴`);
    setViewMode('main'); // 메인 뷰로 전환
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header />

      {/* 유저 정보 바 */}
      {userName && (
        <div className="bg-slate-900/50 border-b border-slate-800/50">
          <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-end gap-3">
            <span className="text-[11px] text-slate-400">
              <span className="text-cyan-400 font-medium">{userName}</span> 님
            </span>
            <button
              onClick={onLogout}
              className="text-[10px] px-2.5 py-1 bg-slate-800/80 hover:bg-red-900/40 text-slate-500 hover:text-red-400 rounded-md border border-slate-700/50 transition-all"
            >
              로그아웃
            </button>
          </div>
        </div>
      )}

      {/* 네비게이션 탭 */}
      <div className="border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-1">
          <button
            onClick={() => setViewMode('main')}
            className={`px-4 py-3 text-sm font-bold transition-colors relative ${
              viewMode === 'main'
                ? 'text-brand-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            스토리보드 생성
            {viewMode === 'main' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
            )}
          </button>
          <button
            onClick={() => setViewMode('gallery')}
            className={`px-4 py-3 text-sm font-bold transition-colors relative flex items-center gap-2 ${
              viewMode === 'gallery'
                ? 'text-brand-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            저장된 프로젝트
            {savedProjects.length > 0 && (
              <span className="px-1.5 py-0.5 bg-slate-700 text-xs rounded-full">
                {savedProjects.length}
              </span>
            )}
            {viewMode === 'gallery' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
            )}
          </button>
        </div>
      </div>

      {needsKey && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4 flex items-center justify-center gap-4 animate-in fade-in slide-in-from-top-4">
          <span className="text-amber-400 text-xs font-bold">Gemini 3 Pro 엔진을 위해 API 키 설정이 필요합니다.</span>
          <button onClick={handleOpenKeySelector} className="px-3 py-1 bg-amber-500 text-slate-950 text-[10px] font-black rounded-lg hover:bg-amber-400 transition-colors uppercase">API 키 설정</button>
        </div>
      )}

      {/* 갤러리 뷰 */}
      {viewMode === 'gallery' && (
        <GalleryErrorBoundary>
          <ProjectGallery
            projects={savedProjects}
            onBack={() => setViewMode('main')}
            onDelete={handleDeleteProject}
            onRefresh={refreshProjects}
            onLoad={handleLoadProject}
            onImport={handleImportProject}
          />
        </GalleryErrorBoundary>
      )}

      {/* 메인 뷰 */}
      {viewMode === 'main' && (
      <main className="py-8">
        <InputSection onGenerate={handleGenerate} step={step} />
        
        {step !== GenerationStep.IDLE && (
          <div className="max-w-7xl mx-auto px-4 text-center mb-12">
             <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl border bg-slate-900 border-slate-800 shadow-2xl">
                {step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS ? (
                  <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent animate-spin rounded-full"></div>
                ) : <div className={`w-2 h-2 rounded-full ${step === GenerationStep.ERROR ? 'bg-red-500' : 'bg-green-500'}`}></div>}
                <span className="text-sm font-bold text-slate-300">{progressMessage}</span>
                {(step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS) && (
                  <button onClick={handleAbort} className="ml-2 px-3 py-1 rounded-lg bg-red-600/20 text-red-500 text-[10px] font-black uppercase tracking-widest border border-red-500/30">Stop</button>
                )}
             </div>
          </div>
        )}

        <ResultTable
            data={generatedData}
            editingIndex={editingIndex}
            onEditToggle={setEditingIndex}
            onUpdateAsset={handleUpdateAsset}
            onRegenerateAudio={handleRegenerateAudio}
            onReorderScenes={handleReorderScenes}
            onDeleteScene={handleDeleteScene}
            onAddScene={handleAddScene}
            onUploadSceneImage={handleUploadSceneImage}
            onSetCustomDuration={handleSetCustomDuration}
            onSetZoomEffect={handleSetZoomEffect}
            onSetTransition={handleSetTransition}
            onSetDefaultTransition={handleSetDefaultTransition}
            onAutoZoom={handleAutoZoom}
            onRegenerateImage={handleRegenerateImage}
            onDuplicateScene={handleDuplicateScene}
            onRegenerateFailedScenes={handleRegenerateFailedScenes}
            onExportVideo={triggerVideoExport}
            isExporting={isVideoGenerating}
            animatingIndices={animatingIndices}
            onGenerateAnimation={handleGenerateAnimation}
            bgmData={bgmData}
            bgmVolume={bgmVolume}
            onBgmChange={setBgmData}
            onBgmVolumeChange={setBgmVolume}
            bgmDuckingEnabled={bgmDuckingEnabled}
            bgmDuckingAmount={bgmDuckingAmount}
            onBgmDuckingToggle={setBgmDuckingEnabled}
            onBgmDuckingAmountChange={setBgmDuckingAmount}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
        />
      </main>
      )}
    </div>
  );
};

export default App;
