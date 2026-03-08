
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GenerationStep, ProjectSettings, ReferenceImages, DEFAULT_REFERENCE_IMAGES } from '../types';
import { CONFIG, IMAGE_MODELS, ImageModelId, GEMINI_STYLE_CATEGORIES, GeminiStyleId, GPT_STYLE_CATEGORIES, GptStyleId, VideoOrientation, getVideoOrientation, setVideoOrientation, Language, LANGUAGE_CONFIG } from '../config';
import { getElevenLabsModelId } from '../services/elevenLabsService';
import VoiceSettings, { VoiceSettingsHandle } from './input/VoiceSettings';
import ReferenceImageSelector from './input/ReferenceImageSelector';

// Gemini 스타일 맵
const GEMINI_STYLE_MAP = new Map<string, { id: string; name: string; category: string; prompt: string }>();
GEMINI_STYLE_CATEGORIES.forEach(category => {
  category.styles.forEach(style => {
    GEMINI_STYLE_MAP.set(style.id, { ...style, category: category.name });
  });
});

// 자동 대본 placeholder 예시 배열
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
  "인스타그램 릴스로 돈 버는 법",
  "애플 비전프로 리뷰",
  "전세사기 예방 가이드",
  "초보 주식투자 시작하기",
  "넷플릭스 추천 다큐 TOP 10",
  "2026 수능 영어 공부법",
  "건강한 다이어트 식단 추천",
  "프리랜서 세금 절약 팁",
];

// GPT 스타일 맵
const GPT_STYLE_MAP = new Map<string, { id: string; name: string; category: string; prompt: string }>();
GPT_STYLE_CATEGORIES.forEach(category => {
  category.styles.forEach(style => {
    GPT_STYLE_MAP.set(style.id, { ...style, category: category.name });
  });
});

interface InputSectionProps {
  onGenerate: (topic: string, referenceImages: ReferenceImages, sourceText: string | null) => void;
  step: GenerationStep;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, step }) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [topic, setTopic] = useState('');
  const [manualScript, setManualScript] = useState('');

  // 랜덤 placeholder 페이드 전환
  const [placeholderIndex, setPlaceholderIndex] = useState(() => Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));
  const [placeholderFade, setPlaceholderFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderFade(false);
      setTimeout(() => {
        setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
        setPlaceholderFade(true);
      }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // 참조 이미지 상태 분리 (캐릭터/스타일)
  const [characterRefImages, setCharacterRefImages] = useState<string[]>([]);
  const [styleRefImages, setStyleRefImages] = useState<string[]>([]);
  // 참조 강도 상태 (0~100)
  const [characterStrength, setCharacterStrength] = useState(DEFAULT_REFERENCE_IMAGES.characterStrength);
  const [styleStrength, setStyleStrength] = useState(DEFAULT_REFERENCE_IMAGES.styleStrength);

  // 영상 방향 설정
  const [videoOrientation, setVideoOrientationState] = useState<VideoOrientation>(getVideoOrientation);

  const handleOrientationChange = useCallback((orientation: VideoOrientation) => {
    setVideoOrientationState(orientation);
    setVideoOrientation(orientation);
  }, []);

  // 나레이션 언어 설정
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem(CONFIG.STORAGE_KEYS.LANGUAGE) as Language) || 'ko';
  });

  const handleLanguageChange = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(CONFIG.STORAGE_KEYS.LANGUAGE, lang);
  }, []);

  // 이미지 모델 설정
  const [imageModelId, setImageModelId] = useState<ImageModelId>('gemini-2.5-flash-image');
  // Gemini 스타일 설정
  const [geminiStyleId, setGeminiStyleId] = useState<GeminiStyleId>('gemini-none');
  const [geminiCustomStylePrompt, setGeminiCustomStylePrompt] = useState('');
  // GPT 스타일 설정
  const [gptStyleId, setGptStyleId] = useState<GptStyleId>('gpt-none');
  const [gptCustomStylePrompt, setGptCustomStylePrompt] = useState('');
  // 한글 억제 설정
  const [suppressKorean, setSuppressKorean] = useState(() => localStorage.getItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN) === 'true');

  // 화풍 미리보기 (정적 이미지)
  const [previewStyleId, setPreviewStyleId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  // 프로젝트 관리
  const [projects, setProjects] = useState<ProjectSettings[]>([]);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // VoiceSettings ref
  const voiceSettingsRef = useRef<VoiceSettingsHandle>(null);


  // 컴포넌트 마운트 시 저장된 설정 로드
  useEffect(() => {
    const savedImageModel = localStorage.getItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL) as ImageModelId || CONFIG.DEFAULT_IMAGE_MODEL;

    // Gemini 스타일 설정 로드
    const savedGeminiStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE) as GeminiStyleId || 'gemini-none';
    const savedGeminiCustomStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE) || '';
    // GPT 스타일 설정 로드
    const savedGptStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GPT_STYLE) as GptStyleId || 'gpt-none';
    const savedGptCustomStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GPT_CUSTOM_STYLE) || '';

    setImageModelId(savedImageModel);
    setGeminiStyleId(savedGeminiStyle);
    setGeminiCustomStylePrompt(savedGeminiCustomStyle);
    setGptStyleId(savedGptStyle);
    setGptCustomStylePrompt(savedGptCustomStyle);

    // 서버에서 프리셋 목록 로드 (로그인 시)
    const token = localStorage.getItem('c2gen_session_token');
    if (token) {
      fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preset-list', token }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.presets) {
            setProjects(d.presets.map((p: any) => ({
              id: p.id,
              name: p.name,
              createdAt: new Date(p.created_at).getTime(),
              updatedAt: new Date(p.updated_at).getTime(),
              ...p.settings,
            })));
          }
        })
        .catch(e => console.error('프리셋 로드 실패:', e));
    } else {
      // 비로그인: localStorage 폴백
      const savedProjects = localStorage.getItem(CONFIG.STORAGE_KEYS.PROJECTS);
      if (savedProjects) {
        try { setProjects(JSON.parse(savedProjects)); } catch {}
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 이미지 모델 선택 (useCallback으로 메모이제이션)
  const selectImageModel = useCallback((modelId: ImageModelId) => {
    setImageModelId(modelId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL, modelId);
  }, []);

  // Gemini 스타일 선택 (useCallback으로 메모이제이션)
  const selectGeminiStyle = useCallback((styleId: GeminiStyleId) => {
    setGeminiStyleId(styleId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE, styleId);
  }, []);

  // Gemini 커스텀 스타일 저장 (useCallback으로 메모이제이션)
  const saveGeminiCustomStyle = useCallback((prompt: string) => {
    setGeminiCustomStylePrompt(prompt);
    localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE, prompt);
  }, []);

  // GPT 스타일 선택
  const selectGptStyle = useCallback((styleId: GptStyleId) => {
    setGptStyleId(styleId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.GPT_STYLE, styleId);
  }, []);

  // GPT 커스텀 스타일 저장
  const saveGptCustomStyle = useCallback((prompt: string) => {
    setGptCustomStylePrompt(prompt);
    localStorage.setItem(CONFIG.STORAGE_KEYS.GPT_CUSTOM_STYLE, prompt);
  }, []);

  // 미리보기 장면 카테고리 라벨
  const PREVIEW_LABELS = ['과학 / 기술', '라이프스타일 / 푸드', '금융 / 경제'];

  // 화풍 미리보기 토글 (정적 이미지)
  const toggleStylePreview = useCallback((styleId: string) => {
    if (previewStyleId === styleId) {
      setPreviewStyleId(null);
    } else {
      setPreviewStyleId(styleId);
      setPreviewIndex(0);
    }
  }, [previewStyleId]);

  // 현재 설정을 settings 객체로 수집
  const collectCurrentSettings = () => {
    const voiceSettings = voiceSettingsRef.current?.getSettings() || {
      elevenLabsVoiceId: localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID) || '',
      elevenLabsModel: getElevenLabsModelId(),
      elevenLabsSpeed: parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED) || '1.0'),
      elevenLabsStability: parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY) || '0.6'),
    };
    return {
      imageModel: imageModelId,
      geminiStyle: geminiStyleId,
      geminiCustomStyle: geminiCustomStylePrompt,
      gptStyle: gptStyleId,
      gptCustomStyle: gptCustomStylePrompt,
      ...voiceSettings,
      language,
      videoOrientation,
      suppressKorean,
    };
  };

  // 프로젝트 저장
  const saveProject = async () => {
    if (!newProjectName.trim()) return;

    const settings = collectCurrentSettings();
    const token = localStorage.getItem('c2gen_session_token');

    if (token) {
      // 서버 저장
      try {
        const r = await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'preset-save', token, preset: { name: newProjectName.trim(), settings } }),
        });
        const d = await r.json();
        if (d.error) { alert(d.error); return; }
        const saved: ProjectSettings = {
          id: d.preset.id,
          name: d.preset.name,
          createdAt: new Date(d.preset.created_at).getTime(),
          updatedAt: new Date(d.preset.updated_at).getTime(),
          ...d.preset.settings,
        };
        setProjects(prev => [saved, ...prev]);
        setNewProjectName('');
      } catch (e: any) {
        alert(`저장 실패: ${e.message}`);
      }
    } else {
      // 비로그인: localStorage 폴백
      const newProject: ProjectSettings = {
        id: Date.now().toString(),
        name: newProjectName.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...settings,
      };
      const updatedProjects = [newProject, ...projects];
      setProjects(updatedProjects);
      localStorage.setItem(CONFIG.STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
      setNewProjectName('');
    }
  };

  // 프로젝트 불러오기
  const loadProject = (project: ProjectSettings) => {
    // 이미지 모델
    if (project.imageModel) {
      setImageModelId(project.imageModel as ImageModelId);
      localStorage.setItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL, project.imageModel);
    }
    // Gemini 화풍
    if (project.geminiStyle) {
      setGeminiStyleId(project.geminiStyle as GeminiStyleId);
      localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE, project.geminiStyle);
    }
    if (project.geminiCustomStyle !== undefined) {
      setGeminiCustomStylePrompt(project.geminiCustomStyle || '');
      localStorage.setItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE, project.geminiCustomStyle || '');
    }
    // GPT 화풍
    if (project.gptStyle) {
      setGptStyleId(project.gptStyle as GptStyleId);
      localStorage.setItem(CONFIG.STORAGE_KEYS.GPT_STYLE, project.gptStyle);
    }
    if (project.gptCustomStyle !== undefined) {
      setGptCustomStylePrompt(project.gptCustomStyle || '');
      localStorage.setItem(CONFIG.STORAGE_KEYS.GPT_CUSTOM_STYLE, project.gptCustomStyle || '');
    }
    // TTS (delegate to VoiceSettings)
    voiceSettingsRef.current?.loadSettings({
      elevenLabsVoiceId: project.elevenLabsVoiceId,
      elevenLabsModel: project.elevenLabsModel,
      elevenLabsSpeed: project.elevenLabsSpeed,
      elevenLabsStability: project.elevenLabsStability,
    });
    // 언어
    if (project.language) {
      handleLanguageChange(project.language as Language);
    }
    // 영상 방향
    if (project.videoOrientation) {
      handleOrientationChange(project.videoOrientation as VideoOrientation);
    }
    // 한글 억제
    if (project.suppressKorean !== undefined) {
      setSuppressKorean(project.suppressKorean);
      localStorage.setItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN, String(project.suppressKorean));
    }

    setShowProjectManager(false);
  };

  // 프로젝트 삭제
  const deleteProject = async (projectId: string) => {
    if (!confirm('이 프리셋을 삭제하시겠습니까?')) return;

    const token = localStorage.getItem('c2gen_session_token');
    if (token) {
      try {
        await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'preset-delete', token, presetId: projectId }),
        });
      } catch (e) {
        console.error('프리셋 삭제 실패:', e);
      }
    }

    const updatedProjects = projects.filter(p => p.id !== projectId);
    setProjects(updatedProjects);
    if (!token) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
    }
  };

  // 프로젝트 업데이트 (덮어쓰기)
  const updateProject = async (project: ProjectSettings) => {
    const settings = collectCurrentSettings();
    const token = localStorage.getItem('c2gen_session_token');

    if (token) {
      try {
        const r = await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'preset-save', token, preset: { id: project.id, name: project.name, settings } }),
        });
        const d = await r.json();
        if (d.error) { alert(d.error); return; }
        const updated: ProjectSettings = {
          id: d.preset.id,
          name: d.preset.name,
          createdAt: new Date(d.preset.created_at).getTime(),
          updatedAt: new Date(d.preset.updated_at).getTime(),
          ...d.preset.settings,
        };
        setProjects(prev => prev.map(p => p.id === project.id ? updated : p));
      } catch (e: any) {
        alert(`업데이트 실패: ${e.message}`);
      }
    } else {
      const updatedProject: ProjectSettings = {
        ...project,
        updatedAt: Date.now(),
        ...settings,
      };
      const updatedProjects = projects.map(p => p.id === project.id ? updatedProject : p);
      setProjects(updatedProjects);
      localStorage.setItem(CONFIG.STORAGE_KEYS.PROJECTS, JSON.stringify(updatedProjects));
    }
  };

  // 선택된 Gemini 스타일 정보 가져오기 (useMemo로 캐싱 - O(1) 조회)
  const selectedGeminiStyle = useMemo(() => {
    if (geminiStyleId === 'gemini-none') {
      return { id: 'gemini-none', name: '없음', category: '기본', prompt: '' };
    }
    if (geminiStyleId === 'gemini-custom') {
      return { id: 'gemini-custom', name: '커스텀', category: '직접 입력', prompt: geminiCustomStylePrompt };
    }
    return GEMINI_STYLE_MAP.get(geminiStyleId) || null;
  }, [geminiStyleId, geminiCustomStylePrompt]);

  // 선택된 GPT 스타일 정보
  const selectedGptStyle = useMemo(() => {
    if (gptStyleId === 'gpt-none') {
      return { id: 'gpt-none', name: '없음', category: '기본', prompt: '' };
    }
    if (gptStyleId === 'gpt-custom') {
      return { id: 'gpt-custom', name: '커스텀', category: '직접 입력', prompt: gptCustomStylePrompt };
    }
    return GPT_STYLE_MAP.get(gptStyleId) || null;
  }, [gptStyleId, gptCustomStylePrompt]);

  const isProcessing = step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS;
  const isReviewing = step === GenerationStep.SCRIPT_REVIEW;
  const isDisabled = isProcessing || isReviewing;

  // 폼 제출 핸들러 (useCallback으로 메모이제이션)
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabled) return;

    // ReferenceImages 타입으로 전달 (강도 포함)
    const refImages: ReferenceImages = {
      character: characterRefImages,
      style: styleRefImages,
      characterStrength,
      styleStrength
    };

    if (activeTab === 'auto') {
      if (topic.trim()) onGenerate(topic, refImages, null);
    } else {
      if (manualScript.trim()) {
        const autoTopic = manualScript.trim().split('\n')[0].slice(0, 50).trim() || '직접 입력 대본';
        onGenerate(autoTopic, refImages, manualScript);
      }
    }
  }, [isDisabled, activeTab, topic, characterRefImages, styleRefImages, characterStrength, styleStrength, manualScript, onGenerate]);


  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
          C2 <span className="text-green-400">GEN</span>
        </h1>
        <p className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>AI Content Studio</p>
      </div>

      <div className="mb-4 flex flex-col gap-4">
        {/* 프로젝트 관리 */}
        <div className="p-4 border rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)', borderColor: 'var(--border-default)' }}>
          <button
            type="button"
            onClick={() => setShowProjectManager(!showProjectManager)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>프리셋 관리</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {projects.length > 0 ? `${projects.length}개 저장됨 (클라우드 동기화)` : '모델, 화풍, 음성 등 전체 설정을 저장'}
                </p>
              </div>
            </div>
            <svg className={`w-5 h-5 transition-transform ${showProjectManager ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showProjectManager && (
            <div className="mt-4 pt-4 space-y-4" style={{ borderTop: '1px solid var(--border-default)' }}>
              {/* 새 프로젝트 저장 */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>새 프리셋 저장</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="프리셋 이름 입력..."
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none placeholder:text-[var(--text-muted)]"
                    style={{ backgroundColor: 'var(--bg-elevated)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    onKeyDown={(e) => e.key === 'Enter' && saveProject()}
                  />
                  <button
                    type="button"
                    onClick={saveProject}
                    disabled={!newProjectName.trim()}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                  >
                    저장
                  </button>
                </div>
              </div>

              {/* 저장된 프로젝트 목록 */}
              {projects.length > 0 && (
                <div>
                  <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>저장된 프리셋</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between p-3 rounded-xl"
                        style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{project.name}</div>
                          <div className="text-[10px] flex flex-wrap gap-1" style={{ color: 'var(--text-muted)' }}>
                            <span>{new Date(project.updatedAt).toLocaleDateString('ko-KR')}</span>
                            <span>•</span>
                            <span>{project.imageModel === 'gpt-image-1' ? 'GPT' : 'Gemini'}</span>
                            {project.language && project.language !== 'ko' && <span>• {project.language.toUpperCase()}</span>}
                            {project.videoOrientation === 'portrait' && <span>• 세로</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => loadProject(project)}
                            className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                          >
                            불러오기
                          </button>
                          <button
                            type="button"
                            onClick={() => updateProject(project)}
                            className="px-2 py-1 text-[10px] hover:opacity-80 rounded-lg transition-colors"
                            style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)' }}
                          >
                            덮어쓰기
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteProject(project.id)}
                            className="px-2 py-1 text-[10px] bg-red-600/50 hover:bg-red-500 text-white rounded-lg transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projects.length === 0 && (
                <p className="text-center text-xs py-4" style={{ color: 'var(--text-muted)' }}>
                  저장된 프리셋이 없습니다.<br />
                  현재 설정을 프리셋으로 저장하면 어디서든 불러올 수 있습니다.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 참조 이미지 설정 (캐릭터/스타일 분리) */}
        <ReferenceImageSelector
          characterRefImages={characterRefImages}
          styleRefImages={styleRefImages}
          characterStrength={characterStrength}
          styleStrength={styleStrength}
          onCharacterImagesChange={setCharacterRefImages}
          onStyleImagesChange={setStyleRefImages}
          onCharacterStrengthChange={setCharacterStrength}
          onStyleStrengthChange={setStyleStrength}
          isDisabled={isDisabled}
        />

        {/* 🎤 ElevenLabs 음성 설정 (참조 이미지 바로 아래) */}
        <VoiceSettings
          ref={voiceSettingsRef}
          isDisabled={isDisabled}
          language={language}
          onLanguageChange={handleLanguageChange}
        />

        {/* 나레이션 언어 선택 — TTS 설정 안으로 이동됨 */}

        {/* 영상 방향 선택 (가로 / 세로) */}
        <div className="p-4 border rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>영상 방향</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>이미지·영상 비율이 함께 변경됩니다</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleOrientationChange('landscape')}
              className={`p-4 rounded-xl border text-left transition-all ${
                videoOrientation === 'landscape'
                  ? 'bg-violet-600/20 border-violet-500'
                  : 'hover:opacity-80'
              }`}
              style={videoOrientation === 'landscape' ? { color: 'var(--text-primary)' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                {/* 가로 화면 아이콘 */}
                <div className="w-8 h-5 border-2 border-current rounded-sm flex-shrink-0" />
                <span className="font-bold text-sm">가로 (16:9)</span>
              </div>
              <p className="text-xs opacity-60">유튜브·일반 영상</p>
            </button>
            <button
              type="button"
              onClick={() => handleOrientationChange('portrait')}
              className={`p-4 rounded-xl border text-left transition-all ${
                videoOrientation === 'portrait'
                  ? 'bg-violet-600/20 border-violet-500'
                  : 'hover:opacity-80'
              }`}
              style={videoOrientation === 'portrait' ? { color: 'var(--text-primary)' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                {/* 세로 화면 아이콘 */}
                <div className="w-5 h-8 border-2 border-current rounded-sm flex-shrink-0" />
                <span className="font-bold text-sm">세로 (9:16)</span>
              </div>
              <p className="text-xs opacity-60">쇼츠·릴스·틱톡</p>
            </button>
          </div>
        </div>

        {/* 이미지 생성 모델 선택 */}
        <div className="p-4 border rounded-2xl backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>이미지 생성 모델</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>모델별 품질과 가격 비교</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {IMAGE_MODELS.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => selectImageModel(model.id)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  imageModelId === model.id
                    ? 'bg-blue-600/20 border-blue-500'
                    : 'hover:opacity-80'
                }`}
                style={imageModelId === model.id ? { color: 'var(--text-primary)' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">{model.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                    {model.provider}
                  </span>
                </div>
                <div className="text-xs opacity-70 mb-2">{model.description}</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-400 font-bold">${model.pricePerImage.toFixed(4)}/장</span>
                  <span style={{ color: 'var(--text-muted)' }}>{model.speed}</span>
                </div>
              </button>
            ))}
          </div>

          {/* GPT Image-1 안내 */}
          {imageModelId === 'gpt-image-1' && (
            <div className="mt-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 text-sm mt-0.5">⚠</span>
                  <div className="text-xs text-amber-300/80">
                    <span className="font-bold text-amber-300">GPT Image-1</span>은 참조 이미지(캐릭터/스타일)를 지원하지 않습니다. 텍스트 프롬프트만으로 이미지를 생성합니다.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Gemini 화풍 선택 */}
          {imageModelId === 'gemini-2.5-flash-image' && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {/* 화풍 선택 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎨</span>
                  <label className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Gemini 화풍 선택</label>
                </div>
                {selectedGeminiStyle && selectedGeminiStyle.id !== 'gemini-none' && (
                  <span className="text-xs text-emerald-400">
                    {selectedGeminiStyle?.category} &gt; {selectedGeminiStyle?.name}
                  </span>
                )}
              </div>

              {/* 화풍 없음 + 한글억제 옵션 */}
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => selectGeminiStyle('gemini-none')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    geminiStyleId === 'gemini-none'
                      ? 'ring-2'
                      : 'hover:opacity-80'
                  }`}
                  style={geminiStyleId === 'gemini-none' ? { backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', boxShadow: '0 0 0 2px var(--text-secondary)' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-secondary)' }}
                >
                  🚫 화풍 없음 (기본)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !suppressKorean;
                    setSuppressKorean(next);
                    localStorage.setItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN, String(next));
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    suppressKorean ? 'ring-2' : 'hover:opacity-80'
                  }`}
                  style={suppressKorean ? { backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', boxShadow: '0 0 0 2px #f59e0b' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-secondary)' }}
                  title="AI 이미지 생성 시 한글 텍스트를 억제하고 영어만 렌더링합니다"
                >
                  {suppressKorean ? '🔤' : '🔤'} 한글억제 {suppressKorean ? 'ON' : 'OFF'}
                </button>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {suppressKorean ? '이미지 내 텍스트가 영어로만 표시됩니다' : ''}
                </span>
              </div>

              {/* 카테고리별 스타일 카드 */}
              {GEMINI_STYLE_CATEGORIES.map((category) => (
                <div key={category.id} className="mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    {category.name}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {category.styles.map((style) => (
                      <div key={style.id} className="relative">
                        <button
                          type="button"
                          onClick={() => selectGeminiStyle(style.id as GeminiStyleId)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                            geminiStyleId === style.id
                              ? 'bg-emerald-500 text-white'
                              : 'hover:opacity-80'
                          }`}
                          style={geminiStyleId === style.id ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}
                        >
                          <div className="text-xs font-medium">{style.name}</div>
                          <div className={`text-[9px] mt-0.5 ${geminiStyleId === style.id ? 'text-emerald-100' : ''}`} style={geminiStyleId === style.id ? undefined : { color: 'var(--text-muted)' }}>
                            {style.description}
                          </div>
                        </button>
                        <button
                          type="button"
                          title="미리보기"
                          onClick={(e) => { e.stopPropagation(); selectGeminiStyle(style.id as GeminiStyleId); toggleStylePreview(style.id); }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] hover:scale-110 transition-transform"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)' }}
                        >
                          {previewStyleId === style.id ? '✕' : '👁️'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* 커스텀 스타일 (직접 입력) */}
              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => selectGeminiStyle('gemini-custom')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      geminiStyleId === 'gemini-custom'
                        ? 'bg-teal-500 text-white'
                        : 'hover:opacity-80'
                    }`}
                    style={geminiStyleId === 'gemini-custom' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}
                  >
                    ✏️ 커스텀 화풍
                  </button>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>직접 화풍 설명 입력</span>
                </div>

                {geminiStyleId === 'gemini-custom' && (
                  <div className="mt-2">
                    <textarea
                      value={geminiCustomStylePrompt}
                      onChange={(e) => saveGeminiCustomStyle(e.target.value)}
                      placeholder="예: 부드러운 수채화 느낌, 파스텔 색감, 몽환적 분위기 / Watercolor style, soft edges..."
                      className="w-full h-24 rounded-xl px-4 py-3 text-sm focus:border-teal-500 focus:outline-none resize-none placeholder:text-[var(--text-muted)]"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      한국어든 영어든, 마음 가는 대로 적어주세요. 제가 3개국어를 할줄 알아요 :)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GPT 화풍 선택 */}
          {imageModelId === 'gpt-image-1' && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🎨</span>
                  <label className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>GPT 화풍 선택</label>
                </div>
                {selectedGptStyle && selectedGptStyle.id !== 'gpt-none' && (
                  <span className="text-xs text-violet-400">
                    {selectedGptStyle?.category} &gt; {selectedGptStyle?.name}
                  </span>
                )}
              </div>

              {/* 화풍 없음 + 한글억제 옵션 */}
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => selectGptStyle('gpt-none')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    gptStyleId === 'gpt-none'
                      ? 'ring-2'
                      : 'hover:opacity-80'
                  }`}
                  style={gptStyleId === 'gpt-none' ? { backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', boxShadow: '0 0 0 2px var(--text-secondary)' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-secondary)' }}
                >
                  🚫 화풍 없음 (기본)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !suppressKorean;
                    setSuppressKorean(next);
                    localStorage.setItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN, String(next));
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    suppressKorean ? 'ring-2' : 'hover:opacity-80'
                  }`}
                  style={suppressKorean ? { backgroundColor: 'var(--bg-hover)', color: 'var(--text-primary)', boxShadow: '0 0 0 2px #f59e0b' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-secondary)' }}
                  title="AI 이미지 생성 시 한글 텍스트를 억제하고 영어만 렌더링합니다"
                >
                  {suppressKorean ? '🔤' : '🔤'} 한글억제 {suppressKorean ? 'ON' : 'OFF'}
                </button>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {suppressKorean ? '이미지 내 텍스트가 영어로만 표시됩니다' : ''}
                </span>
              </div>

              {/* 카테고리별 스타일 카드 */}
              {GPT_STYLE_CATEGORIES.map((category) => (
                <div key={category.id} className="mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                    {category.name}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {category.styles.map((style) => (
                      <div key={style.id} className="relative">
                        <button
                          type="button"
                          onClick={() => selectGptStyle(style.id as GptStyleId)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                            gptStyleId === style.id
                              ? 'bg-violet-500 text-white'
                              : 'hover:opacity-80'
                          }`}
                          style={gptStyleId === style.id ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}
                        >
                          <div className="text-xs font-medium">{style.name}</div>
                          <div className={`text-[9px] mt-0.5 ${gptStyleId === style.id ? 'text-violet-100' : ''}`} style={gptStyleId === style.id ? undefined : { color: 'var(--text-muted)' }}>
                            {style.description}
                          </div>
                        </button>
                        <button
                          type="button"
                          title="미리보기"
                          onClick={(e) => { e.stopPropagation(); selectGptStyle(style.id as GptStyleId); toggleStylePreview(style.id); }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] hover:scale-110 transition-transform"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)' }}
                        >
                          {previewStyleId === style.id ? '✕' : '👁️'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* 커스텀 스타일 (직접 입력) */}
              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => selectGptStyle('gpt-custom')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      gptStyleId === 'gpt-custom'
                        ? 'bg-violet-500 text-white'
                        : 'hover:opacity-80'
                    }`}
                    style={gptStyleId === 'gpt-custom' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}
                  >
                    ✏️ 커스텀 화풍
                  </button>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>직접 화풍 설명 입력</span>
                </div>

                {gptStyleId === 'gpt-custom' && (
                  <div className="mt-2">
                    <textarea
                      value={gptCustomStylePrompt}
                      onChange={(e) => saveGptCustomStyle(e.target.value)}
                      placeholder="예: 풍부한 질감의 유화풍, 극적인 명암 대비 / Oil painting, rich textures..."
                      className="w-full h-24 rounded-xl px-4 py-3 text-sm focus:border-violet-500 focus:outline-none resize-none placeholder:text-[var(--text-muted)]"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      한국어든 영어든, 마음 가는 대로 적어주세요. 제가 3개국어를 할줄 알아요 :)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 화풍 미리보기 영역 (정적 이미지) */}
          {previewStyleId && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🖼️</span>
                  <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>화풍 미리보기</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                    {PREVIEW_LABELS[previewIndex]}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewStyleId(null)}
                  className="text-xs px-2 py-1 rounded hover:opacity-80"
                  style={{ color: 'var(--text-muted)' }}
                >
                  닫기 ✕
                </button>
              </div>
              <div className="rounded-xl overflow-hidden relative" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <img
                  src={`/previews/${previewStyleId}-${previewIndex + 1}.jpg`}
                  alt={`${previewStyleId} 미리보기 ${previewIndex + 1}`}
                  className="w-full h-auto rounded-xl"
                  style={{ maxHeight: '300px', objectFit: 'contain' }}
                  onError={(e) => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLImageElement).alt = '미리보기 이미지가 아직 준비되지 않았습니다'; }}
                />
                {/* 좌우 네비게이션 */}
                <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(prev => prev <= 0 ? 2 : prev - 1)}
                    className="pointer-events-auto w-8 h-8 rounded-full flex items-center justify-center text-sm hover:scale-110 transition-transform"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)', color: 'var(--text-primary)' }}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(prev => prev >= 2 ? 0 : prev + 1)}
                    className="pointer-events-auto w-8 h-8 rounded-full flex items-center justify-center text-sm hover:scale-110 transition-transform"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)', color: 'var(--text-primary)' }}
                  >
                    ▶
                  </button>
                </div>
                {/* 인디케이터 */}
                <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPreviewIndex(i)}
                      className="w-2 h-2 rounded-full transition-all"
                      style={{ backgroundColor: i === previewIndex ? 'var(--text-primary)' : 'color-mix(in srgb, var(--text-muted) 50%, transparent)' }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-center py-1.5" style={{ color: 'var(--text-muted)' }}>
                AI는 매번 다른 이미지를 생성합니다. 미리보기는 화풍 참고용이며 실제 결과와 다를 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs and Submit */}
      <div className="flex justify-center mb-6">
        <div className="p-1.5 rounded-2xl flex gap-1" style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
          <button type="button" onClick={() => setActiveTab('auto')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'auto' ? 'bg-brand-600 text-white' : ''}`} style={activeTab === 'auto' ? undefined : { color: 'var(--text-muted)' }}>자동 대본</button>
          <button type="button" onClick={() => setActiveTab('manual')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'manual' ? 'bg-brand-600 text-white' : ''}`} style={activeTab === 'manual' ? undefined : { color: 'var(--text-muted)' }}>수동 대본</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        {activeTab === 'auto' ? (
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative flex items-center rounded-2xl overflow-hidden pr-2" style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={isDisabled} placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]} className={`block w-full bg-transparent py-5 px-6 focus:ring-0 focus:outline-none text-lg disabled:opacity-50 placeholder:text-[var(--text-muted)] placeholder:transition-opacity placeholder:duration-[400ms] ${placeholderFade ? 'placeholder:opacity-100' : 'placeholder:opacity-0'}`} style={{ color: 'var(--text-primary)' }} />
              <button type="submit" disabled={isDisabled || !topic.trim()} className="bg-brand-600 hover:bg-brand-500 text-white font-black py-3 px-8 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap animate-wiggle">{isProcessing ? '생성 중' : isReviewing ? '검토 중' : '시작'}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}>
              <textarea value={manualScript} onChange={(e) => setManualScript(e.target.value)} placeholder="직접 작성한 대본을 입력하세요. AI가 시각적 연출안을 생성합니다." className="w-full h-80 bg-transparent p-8 focus:ring-0 focus:outline-none resize-none placeholder:text-[var(--text-muted)]" style={{ color: 'var(--text-primary)' }} disabled={isDisabled} />

              {/* 글자 수 카운터 및 청크 분할 안내 */}
              <div className="px-8 pb-4 flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-3">
                  {/* 글자 수 표시 */}
                  <span className={`text-xs font-mono ${
                    manualScript.length > 10000 ? 'text-amber-400' :
                    manualScript.length > 3000 ? 'text-blue-400' :
                    ''
                  }`} style={manualScript.length <= 3000 ? { color: 'var(--text-muted)' } : undefined}>
                    {manualScript.length.toLocaleString()}자
                  </span>

                  {/* 예상 씬 개수 (100자당 약 1씬) */}
                  {manualScript.length > 100 && (
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      (예상 씬: ~{Math.max(5, Math.ceil(manualScript.length / 100))}개)
                    </span>
                  )}
                </div>

                {/* 청크 분할 안내 */}
                <div className="text-[10px]">
                  {manualScript.length > 10000 ? (
                    <span className="text-amber-400 font-medium">
                      ⚡ 대용량 모드: 자동 청크 분할 (최대 15,000자)
                    </span>
                  ) : manualScript.length > 3000 ? (
                    <span className="text-blue-400 font-medium">
                      📦 청크 분할 처리됨 (3,000자+)
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>
                      일반 처리 (~3,000자)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button type="submit" disabled={isDisabled || !manualScript.trim()} className="w-full hover:opacity-90 font-black py-5 rounded-2xl transition-all disabled:opacity-50 uppercase tracking-widest text-sm animate-wiggle" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-base)' }}>{isProcessing ? '생성 중' : isReviewing ? '검토 중' : '스토리보드 생성'}</button>
          </div>
        )}
      </form>
    </div>
  );
};

export default InputSection;
