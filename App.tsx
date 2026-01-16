
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import InputSection from './components/InputSection';
import ResultTable from './components/ResultTable';
import { GeneratedAsset, GenerationStep, ScriptScene } from './types';
import { generateScript, generateImageForScene, findTrendingTopics, generateAudioForScene, generateMotionPrompt } from './services/geminiService';
import { generateAudioWithElevenLabs } from './services/elevenLabsService';
import { generateVideo, VideoGenerationResult } from './services/videoService';
import { downloadSrtFromRecorded } from './services/srtService';
import { generateVideoFromImage, getFalApiKey } from './services/falService';
import { CONFIG } from './config';
import * as FileSaver from 'file-saver';

const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
  const [generatedData, setGeneratedData] = useState<GeneratedAsset[]>([]);
  const [progressMessage, setProgressMessage] = useState('');
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [currentReferenceImages, setCurrentReferenceImages] = useState<string[]>([]);
  const [needsKey, setNeedsKey] = useState(false);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(new Set());
  
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
    return () => { isAbortedRef.current = true; };
  }, [checkApiKeyStatus]);

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

  const handleAbort = () => {
    isAbortedRef.current = true;
    isProcessingRef.current = false;
    setProgressMessage("🛑 작업 중단됨.");
    setStep(GenerationStep.COMPLETED);
  };

  const handleGenerate = useCallback(async (
    topic: string,
    refImgs: string[],
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
      const scriptScenes = await generateScript(targetTopic, refImgs.length > 0, sourceText);
      if (isAbortedRef.current) return;
      
      const initialAssets = scriptScenes.map(scene => ({
        ...scene, imageData: null, audioData: null, audioDuration: null, subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const
      }));
      assetsRef.current = initialAssets;
      setGeneratedData(initialAssets);
      setStep(GenerationStep.ASSETS);

      const runAudio = async () => {
          for (let i = 0; i < initialAssets.length; i++) {
              if (isAbortedRef.current) break;
              try {
                  // ElevenLabs에서 오디오 + 자막 타임스탬프 동시 획득
                  const elResult = await generateAudioWithElevenLabs(
                    assetsRef.current[i].narration
                  );
                  if (isAbortedRef.current) break;

                  if (elResult.audioData) {
                    // ElevenLabs 성공: 오디오 + 자막 + 길이 데이터 저장
                    updateAssetAt(i, {
                      audioData: elResult.audioData,
                      subtitleData: elResult.subtitleData,
                      audioDuration: elResult.estimatedDuration
                    });
                  } else {
                    // ElevenLabs 실패 시 Gemini 폴백 (자막 없음)
                    const fallbackAudio = await generateAudioForScene(assetsRef.current[i].narration);
                    updateAssetAt(i, { audioData: fallbackAudio });
                  }
              } catch (e) { console.error(e); }
          }
      };

      const runImages = async () => {
          const MAX_RETRIES = 2; // 최대 재시도 횟수
          
          for (let i = 0; i < initialAssets.length; i++) {
              if (isAbortedRef.current) break;
              updateAssetAt(i, { status: 'generating' });
              
              let success = false;
              let lastError: any = null;
              
              // 재시도 로직 (최초 시도 + 재시도)
              for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;
                  
                  try {
                      if (attempt > 0) {
                          setProgressMessage(`씬 ${i + 1} 이미지 재생성 시도 중... (${attempt}/${MAX_RETRIES})`);
                          await wait(2000); // 재시도 전 대기
                      }
                      
                      // Scene 객체 전체를 넘겨서 prompts.ts가 분석 정보를 활용하도록 함
                      const img = await generateImageForScene(assetsRef.current[i], refImgs);
                      if (isAbortedRef.current) break;
                      
                      if (img) {
                          updateAssetAt(i, { imageData: img, status: 'completed' });
                          success = true;
                      } else {
                          throw new Error('이미지 데이터가 비어있습니다');
                      }
                  } catch (e: any) { 
                      lastError = e;
                      console.error(`씬 ${i + 1} 이미지 생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);
                      
                      // API 키 오류는 재시도하지 않음
                      if (e.message?.includes("API key not valid") || e.status === 400) {
                          setNeedsKey(true);
                          break;
                      }
                  }
              }
              
              // 모든 시도 실패 시 에러 상태로 설정
              if (!success && !isAbortedRef.current) {
                  updateAssetAt(i, { status: 'error' });
                  console.error(`씬 ${i + 1} 이미지 생성 최종 실패:`, lastError?.message);
              }
              
              await wait(50);
          }
      };

      // 앞 N개 씬을 애니메이션으로 변환하는 함수
      const runAnimations = async () => {
        const falApiKey = getFalApiKey();
        if (!falApiKey) {
          console.log('[Animation] FAL API 키 없음, 애니메이션 변환 건너뜀');
          return;
        }

        const animationCount = Math.min(CONFIG.ANIMATION.ENABLED_SCENES, initialAssets.length);
        setProgressMessage(`앞 ${animationCount}개 씬 애니메이션 변환 중...`);

        for (let i = 0; i < animationCount; i++) {
          if (isAbortedRef.current) break;

          // 이미지가 있어야 변환 가능
          if (!assetsRef.current[i]?.imageData) {
            console.log(`[Animation] 씬 ${i + 1} 이미지 없음, 건너뜀`);
            continue;
          }

          try {
            setProgressMessage(`씬 ${i + 1}/${animationCount} 애니메이션 생성 중...`);

            // 시각적 프롬프트에서 움직임 힌트 추출
            const motionPrompt = `Gentle subtle motion: ${assetsRef.current[i].visualPrompt.slice(0, 200)}`;

            const videoUrl = await generateVideoFromImage(
              assetsRef.current[i].imageData!,
              motionPrompt,
              falApiKey
            );

            if (videoUrl && !isAbortedRef.current) {
              updateAssetAt(i, {
                videoData: videoUrl,
                videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
              });
              console.log(`[Animation] 씬 ${i + 1} 영상 변환 완료`);
            }
          } catch (e: any) {
            console.error(`[Animation] 씬 ${i + 1} 변환 실패:`, e.message);
          }

          // API rate limit 방지
          if (i < animationCount - 1) {
            await wait(1500);
          }
        }
      };

      setProgressMessage(`시각 에셋 및 오디오 합성 중...`);
      // 이미지와 오디오 먼저 병렬 생성
      await Promise.all([runAudio(), runImages()]);

      // 애니메이션 변환은 이제 수동으로 (이미지 호버 시 버튼 클릭)
      // 자동 변환 비활성화 - 사용자가 원하는 이미지만 선택적으로 변환 가능
      
      if (isAbortedRef.current) return;
      setStep(GenerationStep.COMPLETED);
      setProgressMessage("V9.2 시스템 모든 에셋 생성 완료!");

    } catch (error: any) {
      if (!isAbortedRef.current) {
        setStep(GenerationStep.ERROR);
        setProgressMessage(`오류: ${error.message}`);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [checkApiKeyStatus]);

  const triggerVideoExport = async (enableSubtitles: boolean = true) => {
    if (isVideoGenerating) return;
    try {
      setIsVideoGenerating(true);
      const suffix = enableSubtitles ? 'sub' : 'nosub';
      const timestamp = Date.now();

      const result = await generateVideo(
        assetsRef.current,
        (msg) => setProgressMessage(`[Render] ${msg}`),
        isAbortedRef,
        { enableSubtitles }
      );

      if (result) {
        // 영상 저장 (자막은 영상에 하드코딩됨)
        saveAs(result.videoBlob, `tubegen_v92_${suffix}_${timestamp}.mp4`);
        setProgressMessage(`✨ MP4 렌더링 완료! (${enableSubtitles ? '자막 O' : '자막 X'})`);
      }
    } catch (error: any) {
      setProgressMessage(`렌더링 실패: ${error.message}`);
    } finally {
      setIsVideoGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header />
      
      {needsKey && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4 flex items-center justify-center gap-4 animate-in fade-in slide-in-from-top-4">
          <span className="text-amber-400 text-xs font-bold">Gemini 3 Pro 엔진을 위해 API 키 설정이 필요합니다.</span>
          <button onClick={handleOpenKeySelector} className="px-3 py-1 bg-amber-500 text-slate-950 text-[10px] font-black rounded-lg hover:bg-amber-400 transition-colors uppercase">API 키 설정</button>
        </div>
      )}

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
            onRegenerateImage={async (idx) => {
              if (isProcessingRef.current) return;
              
              const MAX_RETRIES = 2;
              updateAssetAt(idx, { status: 'generating' });
              setProgressMessage(`씬 ${idx + 1} 이미지 재생성 중...`);
              
              let success = false;
              
              for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
                if (isAbortedRef.current) break;
                
                try {
                  if (attempt > 0) {
                    setProgressMessage(`씬 ${idx + 1} 이미지 재생성 재시도 중... (${attempt}/${MAX_RETRIES})`);
                    await wait(2000);
                  }
                  
                  const img = await generateImageForScene(assetsRef.current[idx], currentReferenceImages);
                  
                  if (img && !isAbortedRef.current) {
                    updateAssetAt(idx, { imageData: img, status: 'completed' });
                    setProgressMessage(`씬 ${idx + 1} 이미지 재생성 완료!`);
                    success = true;
                  } else if (!img) {
                    throw new Error('이미지 데이터가 비어있습니다');
                  }
                } catch (e: any) {
                  console.error(`씬 ${idx + 1} 재생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, e.message);
                  
                  if (e.message?.includes("API key not valid") || e.status === 400) {
                    setNeedsKey(true);
                    break;
                  }
                }
              }
              
              if (!success && !isAbortedRef.current) {
                updateAssetAt(idx, { status: 'error' });
                setProgressMessage(`씬 ${idx + 1} 이미지 생성 실패. 다시 시도해주세요.`);
              }
            }}
            onExportVideo={triggerVideoExport}
            isExporting={isVideoGenerating}
            animatingIndices={animatingIndices}
            onGenerateAnimation={async (idx) => {
              const falKey = getFalApiKey();
              if (!falKey) {
                alert('FAL API 키를 먼저 등록해주세요.\n설정 패널에서 "FAL.ai 애니메이션 엔진"을 열어 키를 입력하세요.');
                return;
              }
              if (animatingIndices.has(idx)) return; // 이 씬은 이미 변환 중
              if (!assetsRef.current[idx]?.imageData) {
                alert('이미지가 먼저 생성되어야 합니다.');
                return;
              }

              try {
                // Set에 현재 인덱스 추가
                setAnimatingIndices(prev => new Set(prev).add(idx));
                setProgressMessage(`씬 ${idx + 1} 움직임 분석 중... (${animatingIndices.size + 1}개 진행중)`);

                // AI가 대본과 이미지를 분석해서 움직임 프롬프트 생성
                const motionPrompt = await generateMotionPrompt(
                  assetsRef.current[idx].narration,
                  assetsRef.current[idx].visualPrompt
                );

                setProgressMessage(`씬 ${idx + 1} 영상 변환 중...`);
                const videoUrl = await generateVideoFromImage(
                  assetsRef.current[idx].imageData!,
                  motionPrompt,
                  falKey
                );

                if (videoUrl) {
                  updateAssetAt(idx, {
                    videoData: videoUrl,
                    videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
                  });
                  setProgressMessage(`씬 ${idx + 1} 영상 변환 완료!`);
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
            }}
        />
      </main>
    </div>
  );
};

export default App;
