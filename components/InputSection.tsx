
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GenerationStep, ProjectSettings, ReferenceImages, DEFAULT_REFERENCE_IMAGES } from '../types';
import { CONFIG, ELEVENLABS_MODELS, ElevenLabsModelId, IMAGE_MODELS, ImageModelId, GEMINI_STYLE_CATEGORIES, GeminiStyleId, GPT_STYLE_CATEGORIES, GptStyleId, ELEVENLABS_DEFAULT_VOICES, VoiceGender, VoiceAge, VideoOrientation, getVideoOrientation, setVideoOrientation, Language, LANGUAGE_CONFIG } from '../config';
import { getElevenLabsModelId, setElevenLabsModelId, fetchElevenLabsVoices, ElevenLabsVoice, searchSharedVoices, SharedVoice } from '../services/elevenLabsService';

/** 이미지 리사이즈+압축 (413 Payload Too Large 방지, Vercel 4.5MB 제한) */
function compressImage(dataUrl: string, maxDim = 768, quality = 0.5): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl); // 실패 시 원본 반환
    img.src = dataUrl;
  });
}

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

  // ElevenLabs 설정 상태
  const [showElevenLabsSettings, setShowElevenLabsSettings] = useState(false);
  const [showVoiceIdInput, setShowVoiceIdInput] = useState(false);
  const [showDetailedSettings, setShowDetailedSettings] = useState(false);
  const [elVoiceId, setElVoiceId] = useState('');
  const [elModelId, setElModelId] = useState<ElevenLabsModelId>('eleven_multilingual_v2');
  const [elSpeed, setElSpeed] = useState<number>(() => {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED);
    return saved ? parseFloat(saved) : 1.0;
  });
  const [elStability, setElStability] = useState<number>(() => {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY);
    return saved ? parseFloat(saved) : 0.6;
  });
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  // 음성 필터 상태
  const [genderFilter, setGenderFilter] = useState<VoiceGender | null>(null);
  const [ageFilter, setAgeFilter] = useState<VoiceAge | null>(null);
  const [voiceSearchQuery, setVoiceSearchQuery] = useState('');
  // 음성 탭: 'premade' | 'library' | 'favorites'
  const [voiceTab, setVoiceTab] = useState<'premade' | 'library' | 'favorites'>('premade');
  // 즐겨찾기 음성
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<Set<string>>(new Set());
  const [favoriteVoices, setFavoriteVoices] = useState<Array<{ voice_id: string; voice_name: string; voice_meta: any }>>([]);
  // 라이브러리 검색 상태
  const [libraryVoices, setLibraryVoices] = useState<SharedVoice[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [libraryPage, setLibraryPage] = useState(0);

  // 파일 입력 ref 분리 (캐릭터/스타일)
  const characterFileInputRef = useRef<HTMLInputElement>(null);
  const styleFileInputRef = useRef<HTMLInputElement>(null);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 컴포넌트 마운트 시 저장된 설정 로드
  useEffect(() => {
    // API 키는 환경변수에서 읽음 (elApiKey 상수로 이미 설정됨)
    const savedVoiceId = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID) || '';
    const savedModelId = getElevenLabsModelId();
    const savedImageModel = localStorage.getItem(CONFIG.STORAGE_KEYS.IMAGE_MODEL) as ImageModelId || CONFIG.DEFAULT_IMAGE_MODEL;

    // Gemini 스타일 설정 로드
    const savedGeminiStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_STYLE) as GeminiStyleId || 'gemini-none';
    const savedGeminiCustomStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GEMINI_CUSTOM_STYLE) || '';
    // GPT 스타일 설정 로드
    const savedGptStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GPT_STYLE) as GptStyleId || 'gpt-none';
    const savedGptCustomStyle = localStorage.getItem(CONFIG.STORAGE_KEYS.GPT_CUSTOM_STYLE) || '';

    setElVoiceId(savedVoiceId);
    setElModelId(savedModelId);
    setImageModelId(savedImageModel);
    setGeminiStyleId(savedGeminiStyle);
    setGeminiCustomStylePrompt(savedGeminiCustomStyle);
    setGptStyleId(savedGptStyle);
    setGptCustomStylePrompt(savedGptCustomStyle);

    // 서버에서 프리셋 목록 로드 (로그인 시)
    const token = localStorage.getItem('c2gen_session_token');
    if (token) {
      fetch('/api/auth', {
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

    // 서버에 API Key가 있으면 음성 목록 자동 로드
    loadVoices();

    // 즐겨찾기 음성 로드
    if (token) {
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'favorite-voice-list', token }),
      })
        .then(r => r.json())
        .then(d => {
          if (d.favorites) {
            setFavoriteVoices(d.favorites);
            setFavoriteVoiceIds(new Set(d.favorites.map((f: any) => f.voice_id)));
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (voiceDropdownRef.current && !voiceDropdownRef.current.contains(event.target as Node)) {
        setShowVoiceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 컴포넌트 언마운트 시 오디오 정리
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // 음성 목록 불러오기 (서버 프록시 경유)
  const loadVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const voiceList = await fetchElevenLabsVoices();
      setVoices(voiceList);
    } catch (e) {
      console.error('음성 목록 로드 실패:', e);
    } finally {
      setIsLoadingVoices(false);
    }
  }, []);

  // Voice 선택 (useCallback으로 메모이제이션)
  const selectVoice = useCallback((voice: ElevenLabsVoice) => {
    setElVoiceId(voice.voice_id);
    setShowVoiceDropdown(false);
  }, []);

  // 공유 라이브러리 음성 선택
  const selectSharedVoice = useCallback((voice: SharedVoice) => {
    setElVoiceId(voice.voice_id);
    setShowVoiceDropdown(false);
  }, []);

  // 공유 라이브러리 검색 (gender를 직접 파라미터로 받아 stale closure 방지)
  const searchLibrary = useCallback(async (query: string, page: number = 0, gender?: string | null) => {
    setLibraryLoading(true);
    try {
      const result = await searchSharedVoices({
        search: query || undefined,
        gender: (gender !== undefined ? gender : genderFilter) || undefined,
        page_size: 20,
        page,
      });
      if (page === 0) {
        setLibraryVoices(result.voices);
      } else {
        setLibraryVoices(prev => [...prev, ...result.voices]);
      }
      setLibraryHasMore(result.has_more);
      setLibraryPage(page);
    } catch (e) {
      console.error('라이브러리 검색 실패:', e);
    } finally {
      setLibraryLoading(false);
    }
  }, [genderFilter]);

  // 미리듣기 테스트 문구 (선택된 나레이션 언어에 맞게 동적 변경)
  const PREVIEW_TEXT = LANGUAGE_CONFIG[language]?.sampleText || "테스트 음성입니다";

  // 즐겨찾기 토글
  const toggleFavoriteVoice = useCallback(async (voiceId: string, voiceName: string, meta?: any) => {
    const token = localStorage.getItem('c2gen_session_token');
    if (!token) return;

    const isFav = favoriteVoiceIds.has(voiceId);

    // Optimistic UI
    if (isFav) {
      setFavoriteVoiceIds(prev => { const next = new Set(prev); next.delete(voiceId); return next; });
      setFavoriteVoices(prev => prev.filter(f => f.voice_id !== voiceId));
    } else {
      setFavoriteVoiceIds(prev => new Set(prev).add(voiceId));
      setFavoriteVoices(prev => [{ voice_id: voiceId, voice_name: voiceName, voice_meta: meta || {} }, ...prev]);
    }

    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isFav ? 'favorite-voice-remove' : 'favorite-voice-add',
          token,
          voiceId,
          voiceName,
          voiceMeta: meta || {},
        }),
      });
    } catch {
      // Rollback on error
      if (isFav) {
        setFavoriteVoiceIds(prev => new Set(prev).add(voiceId));
        setFavoriteVoices(prev => [{ voice_id: voiceId, voice_name: voiceName, voice_meta: meta || {} }, ...prev]);
      } else {
        setFavoriteVoiceIds(prev => { const next = new Set(prev); next.delete(voiceId); return next; });
        setFavoriteVoices(prev => prev.filter(f => f.voice_id !== voiceId));
      }
    }
  }, [favoriteVoiceIds]);

  // API를 사용한 음성 미리듣기 (서버 프록시 경유)
  const playVoicePreviewWithApi = async (voiceId: string, voiceName: string) => {
    // 이미 재생 중인 음성이면 정지
    if (playingVoiceId === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
      return;
    }

    // 기존 재생 중지
    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPlayingVoiceId(voiceId);

    try {
      // 서버 프록시를 통한 TTS 생성
      const response = await fetch('/api/elevenlabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generatePreview',
          text: PREVIEW_TEXT,
          voiceId,
          modelId: elModelId,
        }),
      });

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
      }

      const result = await response.json();
      if (!result.audio_base64) throw new Error('오디오 데이터 없음');

      // base64 → 오디오 재생
      const audio = new Audio(`data:audio/mpeg;base64,${result.audio_base64}`);
      audioRef.current = audio;

      audio.play().catch(err => {
        console.error('음성 재생 실패:', err);
        setPlayingVoiceId(null);
      });

      audio.onended = () => {
        setPlayingVoiceId(null);
        audioRef.current = null;
      };

    } catch (error) {
      console.error('미리듣기 생성 실패:', error);
      alert(`"${voiceName}" 미리듣기 생성에 실패했습니다.`);
      setPlayingVoiceId(null);
    }
  };

  // 음성 미리듣기 (API 음성용)
  const playVoicePreview = (e: React.MouseEvent, voice: ElevenLabsVoice) => {
    e.stopPropagation();
    playVoicePreviewWithApi(voice.voice_id, voice.name);
  };

  // 기본 음성 미리듣기 (기본 음성 목록용)
  const playDefaultVoicePreview = (e: React.MouseEvent, voice: typeof ELEVENLABS_DEFAULT_VOICES[number]) => {
    e.stopPropagation();
    playVoicePreviewWithApi(voice.id, voice.name);
  };

  // ElevenLabs 설정 저장 (API 키는 환경변수에서 읽으므로 저장하지 않음)
  const saveElevenLabsSettings = () => {
    if (elVoiceId) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, elVoiceId);
    }
    setElevenLabsModelId(elModelId);
    localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED, String(elSpeed));
    localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY, String(elStability));
    setShowElevenLabsSettings(false);
  };

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
  const collectCurrentSettings = () => ({
    imageModel: imageModelId,
    geminiStyle: geminiStyleId,
    geminiCustomStyle: geminiCustomStylePrompt,
    gptStyle: gptStyleId,
    gptCustomStyle: gptCustomStylePrompt,
    elevenLabsVoiceId: elVoiceId,
    elevenLabsModel: elModelId,
    elevenLabsSpeed: elSpeed,
    elevenLabsStability: elStability,
    language,
    videoOrientation,
    suppressKorean,
  });

  // 프로젝트 저장
  const saveProject = async () => {
    if (!newProjectName.trim()) return;

    const settings = collectCurrentSettings();
    const token = localStorage.getItem('c2gen_session_token');

    if (token) {
      // 서버 저장
      try {
        const r = await fetch('/api/auth', {
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
    // TTS
    if (project.elevenLabsVoiceId) {
      setElVoiceId(project.elevenLabsVoiceId);
      localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, project.elevenLabsVoiceId);
    }
    if (project.elevenLabsModel) {
      setElModelId(project.elevenLabsModel as ElevenLabsModelId);
      setElevenLabsModelId(project.elevenLabsModel as ElevenLabsModelId);
    }
    if (project.elevenLabsSpeed !== undefined) {
      setElSpeed(project.elevenLabsSpeed);
      localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED, String(project.elevenLabsSpeed));
    }
    if (project.elevenLabsStability !== undefined) {
      setElStability(project.elevenLabsStability);
      localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY, String(project.elevenLabsStability));
    }
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
        await fetch('/api/auth', {
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
        const r = await fetch('/api/auth', {
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

  // 필터링된 기본 음성 목록 (성별 + 연령 + 검색어)
  const filteredDefaultVoices = useMemo(() => {
    let filtered = [...ELEVENLABS_DEFAULT_VOICES];
    if (genderFilter) filtered = filtered.filter(v => v.gender === genderFilter);
    if (ageFilter) filtered = filtered.filter(v => v.age === ageFilter);
    if (voiceSearchQuery.trim()) {
      const q = voiceSearchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.accent.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [genderFilter, ageFilter, voiceSearchQuery]);

  // 필터링된 API 음성 목록
  const filteredApiVoices = useMemo(() => {
    if (!genderFilter) return voices;
    return voices.filter(v => v.labels?.gender?.toLowerCase() === genderFilter);
  }, [voices, genderFilter]);

  // 선택된 음성의 이름 가져오기 (기본 음성 목록도 확인)
  const getSelectedVoiceInfo = useCallback(() => {
    if (!elVoiceId) return { name: '기본값 사용', description: '시스템 기본 음성' };

    // 기본 음성 목록에서 찾기
    const defaultVoice = ELEVENLABS_DEFAULT_VOICES.find(v => v.id === elVoiceId);
    if (defaultVoice) {
      return { name: defaultVoice.name, description: defaultVoice.description };
    }

    // API 음성 목록에서 찾기
    const apiVoice = voices.find(v => v.voice_id === elVoiceId);
    if (apiVoice) {
      return { name: apiVoice.name, description: apiVoice.labels?.description || apiVoice.category };
    }

    return { name: elVoiceId.slice(0, 12) + '...', description: '직접 입력한 ID' };
  }, [elVoiceId, voices]);

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
      if (manualScript.trim()) onGenerate("Manual Script Input", refImages, manualScript);
    }
  }, [isDisabled, activeTab, topic, characterRefImages, styleRefImages, characterStrength, styleStrength, manualScript, onGenerate]);

  // 캐릭터 참조 이미지 업로드 핸들러 (자동 압축)
  const handleCharacterImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 2 - characterRefImages.length;
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          setCharacterRefImages(prev => [...prev, compressed].slice(0, 2));
        };
        reader.readAsDataURL(file);
      });
    }
    if (characterFileInputRef.current) characterFileInputRef.current.value = '';
  }, [characterRefImages.length]);

  // 스타일 참조 이미지 업로드 핸들러 (자동 압축)
  const handleStyleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 2 - styleRefImages.length;
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          setStyleRefImages(prev => [...prev, compressed].slice(0, 2));
        };
        reader.readAsDataURL(file);
      });
    }
    if (styleFileInputRef.current) styleFileInputRef.current.value = '';
  }, [styleRefImages.length]);

  // 캐릭터 이미지 제거 핸들러
  const removeCharacterImage = useCallback((index: number) => setCharacterRefImages(prev => prev.filter((_, i) => i !== index)), []);

  // 스타일 이미지 제거 핸들러
  const removeStyleImage = useCallback((index: number) => setStyleRefImages(prev => prev.filter((_, i) => i !== index)), []);

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
        <div className="p-6 border rounded-3xl backdrop-blur-sm shadow-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 50%, transparent)', borderColor: 'var(--border-default)' }}>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>참조 이미지 설정</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>참조 이미지가 있으면 고정 프롬프트보다 우선 적용됩니다</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 캐릭터 참조 영역 */}
            <div className="p-4 rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🧑</span>
                <div>
                  <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>캐릭터 참조</h4>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>캐릭터의 외모/스타일 참조 (최대 2장)</p>
                </div>
              </div>

              {/* 캐릭터 참조 이미지가 있을 때 안내 메시지 */}
              {characterRefImages.length > 0 && (
                <div className="mb-3 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-amber-400 text-[10px] font-medium">
                    ⚠️ 캐릭터 참조 이미지 우선 → 고정 캐릭터 프롬프트 제외
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 items-center mb-3">
                {characterRefImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <div className="w-20 h-14 rounded-lg overflow-hidden border border-violet-500/50">
                      <img src={img} alt={`Character Ref ${idx}`} className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeCharacterImage(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {characterRefImages.length < 2 && (
                  <button
                    type="button"
                    onClick={() => characterFileInputRef.current?.click()}
                    className="w-20 h-14 border-2 border-dashed rounded-lg flex items-center justify-center hover:border-violet-500 hover:text-violet-400 transition-all"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
                <input
                  type="file"
                  ref={characterFileInputRef}
                  onChange={handleCharacterImageChange}
                  accept="image/*"
                  className="hidden"
                  multiple
                />
              </div>

              {/* 캐릭터 참조 강도 슬라이더 */}
              {characterRefImages.length > 0 && (
                <div className="pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>참조 강도</span>
                    <span className="text-[10px] font-bold text-violet-400">{characterStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={characterStrength}
                    onChange={(e) => setCharacterStrength(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-violet-500"
                    style={{ backgroundColor: 'var(--bg-hover)' }}
                  />
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    <span>약하게 (참고만)</span>
                    <span>강하게 (정확히)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 스타일 참조 영역 */}
            <div className="p-4 rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🎨</span>
                <div>
                  <h4 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>화풍/스타일 참조</h4>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>전체적인 화풍과 분위기 참조 (최대 2장)</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center mb-3">
                {styleRefImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <div className="w-20 h-14 rounded-lg overflow-hidden border border-fuchsia-500/50">
                      <img src={img} alt={`Style Ref ${idx}`} className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => removeStyleImage(idx)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {styleRefImages.length < 2 && (
                  <button
                    type="button"
                    onClick={() => styleFileInputRef.current?.click()}
                    className="w-20 h-14 border-2 border-dashed rounded-lg flex items-center justify-center hover:border-fuchsia-500 hover:text-fuchsia-400 transition-all"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
                <input
                  type="file"
                  ref={styleFileInputRef}
                  onChange={handleStyleImageChange}
                  accept="image/*"
                  className="hidden"
                  multiple
                />
              </div>

              {/* 스타일 참조 강도 슬라이더 */}
              {styleRefImages.length > 0 && (
                <div className="pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>참조 강도</span>
                    <span className="text-[10px] font-bold text-fuchsia-400">{styleStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={styleStrength}
                    onChange={(e) => setStyleStrength(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-fuchsia-500"
                    style={{ backgroundColor: 'var(--bg-hover)' }}
                  />
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    <span>약하게 (참고만)</span>
                    <span>강하게 (정확히)</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 🎤 ElevenLabs 음성 설정 (참조 이미지 바로 아래) */}
        <div className="p-4 border rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)', borderColor: 'var(--border-default)', overflow: 'visible' }}>
          <button
            type="button"
            onClick={() => setShowElevenLabsSettings(!showElevenLabsSettings)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>🎤 나레이션 음성 설정</h3>
                <p className="text-xs flex flex-wrap items-center gap-x-1" style={{ color: 'var(--text-muted)' }}>
                  <span>{LANGUAGE_CONFIG[language].name}</span>
                  <span>·</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{getSelectedVoiceInfo().name}</span>
                  <span>·</span>
                  <span>{ELEVENLABS_MODELS.find(m => m.id === elModelId)?.name || elModelId}</span>
                  {elSpeed !== 1.0 && <><span>·</span><span className="text-purple-400">{elSpeed.toFixed(2)}x</span></>}
                  {elStability !== 0.6 && <><span>·</span><span className="text-purple-400">{Math.round(elStability * 100)}%</span></>}
                </p>
              </div>
            </div>
            <svg className={`w-5 h-5 transition-transform ${showElevenLabsSettings ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showElevenLabsSettings && (
            <div className="mt-4 pt-4 space-y-4" style={{ borderTop: '1px solid var(--border-default)' }}>
              {/* 나레이션 언어 선택 */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>나레이션 언어</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(LANGUAGE_CONFIG) as Language[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleLanguageChange(lang)}
                      className={`p-2 rounded-xl border text-center transition-all text-xs font-bold ${
                        language === lang
                          ? 'bg-purple-600/20 border-purple-500'
                          : 'hover:opacity-80'
                      }`}
                      style={language === lang ? { color: 'var(--text-primary)' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                    >
                      {LANGUAGE_CONFIG[lang].name}
                    </button>
                  ))}
                </div>
                {language !== 'ko' && (
                  <div className="mt-2 px-3 py-1.5 rounded-lg text-[10px]" style={{ backgroundColor: 'rgba(139,92,246,0.08)', color: 'var(--text-secondary)' }}>
                    <span className="text-purple-400 font-bold">TIP</span>
                    {language === 'en'
                      ? ' — 영어 나레이션에는 Rachel(여), Adam(남) + Multilingual v2 모델 추천'
                      : ' — 일본어 나레이션에는 Rachel(여), Adam(남) + Multilingual v2 모델 추천'}
                  </div>
                )}
              </div>

              {/* Voice Selection - 확장된 UI */}
              <div ref={voiceDropdownRef} className="relative">
                <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  음성 선택
                  <span className="text-purple-400 ml-2 font-normal">
                    (프리메이드 {ELEVENLABS_DEFAULT_VOICES.length}개 + 라이브러리 수천 개)
                  </span>
                </label>

                {/* 선택된 음성 표시 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                  className="w-full rounded-xl px-4 py-3 text-left flex items-center justify-between hover:border-purple-500/50 transition-colors"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{getSelectedVoiceInfo().name}</div>
                      <div className="text-xs line-clamp-1" style={{ color: 'var(--text-muted)' }}>{getSelectedVoiceInfo().description}</div>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 드롭다운 목록 */}
                {showVoiceDropdown && (
                  <div className="absolute z-[9999] w-full mt-2 rounded-2xl shadow-2xl max-h-[29rem] overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}>
                    {/* 탭: 프리메이드 / 라이브러리 / 즐겨찾기 */}
                    <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <button
                        type="button"
                        onClick={() => setVoiceTab('premade')}
                        className={`flex-1 px-3 py-2.5 text-xs font-bold transition-all ${
                          voiceTab === 'premade' ? 'text-purple-400 border-b-2 border-purple-400' : ''
                        }`}
                        style={voiceTab === 'premade' ? { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' } : { color: 'var(--text-muted)' }}
                      >
                        프리메이드 ({ELEVENLABS_DEFAULT_VOICES.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => { setVoiceTab('library'); if (libraryVoices.length === 0) searchLibrary(''); }}
                        className={`flex-1 px-3 py-2.5 text-xs font-bold transition-all ${
                          voiceTab === 'library' ? 'text-amber-400 border-b-2 border-amber-400' : ''
                        }`}
                        style={voiceTab === 'library' ? { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' } : { color: 'var(--text-muted)' }}
                      >
                        커뮤니티 라이브러리
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoiceTab('favorites')}
                        className={`flex-1 px-3 py-2.5 text-xs font-bold transition-all ${
                          voiceTab === 'favorites' ? 'text-yellow-400 border-b-2 border-yellow-400' : ''
                        }`}
                        style={voiceTab === 'favorites' ? { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' } : { color: 'var(--text-muted)' }}
                      >
                        ★ 즐겨찾기 {favoriteVoices.length > 0 && `(${favoriteVoices.length})`}
                      </button>
                    </div>

                    {/* 프리메이드 탭 */}
                    {voiceTab === 'premade' && (
                      <>
                        {/* 검색 + 필터 */}
                        <div className="p-2 space-y-2" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', borderBottom: '1px solid var(--border-subtle)' }}>
                          {/* 검색 입력 */}
                          <input
                            type="text"
                            value={voiceSearchQuery}
                            onChange={(e) => setVoiceSearchQuery(e.target.value)}
                            placeholder="이름, 억양, 설명으로 검색..."
                            className="w-full rounded-lg px-3 py-2 text-xs focus:border-purple-500 focus:outline-none placeholder:text-[var(--text-muted)]"
                            style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                          />
                          {/* 성별 필터 */}
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setGenderFilter(null)}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === null ? 'bg-purple-600 text-white' : 'hover:opacity-80'}`}
                              style={genderFilter === null ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              전체
                            </button>
                            <button type="button" onClick={() => setGenderFilter('female')}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === 'female' ? 'bg-pink-600 text-white' : 'hover:opacity-80'}`}
                              style={genderFilter === 'female' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              여성
                            </button>
                            <button type="button" onClick={() => setGenderFilter('male')}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === 'male' ? 'bg-blue-600 text-white' : 'hover:opacity-80'}`}
                              style={genderFilter === 'male' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              남성
                            </button>
                          </div>
                          {/* 연령 필터 */}
                          <div className="flex gap-1">
                            <button type="button" onClick={() => setAgeFilter(null)}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${ageFilter === null ? 'bg-purple-600 text-white' : 'hover:opacity-80'}`}
                              style={ageFilter === null ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              전 연령
                            </button>
                            <button type="button" onClick={() => setAgeFilter('young')}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${ageFilter === 'young' ? 'bg-green-600 text-white' : 'hover:opacity-80'}`}
                              style={ageFilter === 'young' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              젊은
                            </button>
                            <button type="button" onClick={() => setAgeFilter('middle')}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${ageFilter === 'middle' ? 'bg-yellow-600 text-white' : 'hover:opacity-80'}`}
                              style={ageFilter === 'middle' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              중년
                            </button>
                            <button type="button" onClick={() => setAgeFilter('old')}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${ageFilter === 'old' ? 'bg-orange-600 text-white' : 'hover:opacity-80'}`}
                              style={ageFilter === 'old' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              시니어
                            </button>
                          </div>
                        </div>

                        {/* 음성 목록 */}
                        <div className="overflow-y-auto flex-1">
                          {/* 기본값 옵션 */}
                          <button
                            type="button"
                            onClick={() => { setElVoiceId(''); setShowVoiceDropdown(false); }}
                            className={`w-full px-4 py-2.5 text-left hover:bg-[var(--bg-elevated)] transition-colors ${!elVoiceId ? 'bg-purple-600/20' : ''}`}
                            style={{ borderBottom: '1px solid var(--border-default)' }}
                          >
                            <div className="font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>기본값 (Rachel)</div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>가장 안정적인 여�� 음성</div>
                          </button>

                          {filteredDefaultVoices.length === 0 && (
                            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                              검색 결과가 없습니다<br/>
                              <span style={{ color: 'var(--text-muted)' }}>어린이 음성은 [커뮤니티 라이브러리] 탭에서 "child"로 검색하세요</span>
                            </div>
                          )}

                          {filteredDefaultVoices.map((voice) => (
                            <div
                              key={voice.id}
                              className={`flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors ${elVoiceId === voice.id ? 'bg-purple-600/20' : ''}`}
                              style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-default) 50%, transparent)' }}
                            >
                              {/* 미리듣기 버튼 */}
                              <button
                                type="button"
                                onClick={(e) => playDefaultVoicePreview(e, voice)}
                                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                  playingVoiceId === voice.id
                                    ? 'bg-purple-500 text-white animate-pulse'
                                    : 'hover:bg-purple-600 hover:text-white'
                                }`}
                                style={playingVoiceId === voice.id ? undefined : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                title="미리듣기"
                              >
                                {playingVoiceId === voice.id ? (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                )}
                              </button>

                              {/* 음성 정보 */}
                              <button
                                type="button"
                                onClick={() => { setElVoiceId(voice.id); setShowVoiceDropdown(false); }}
                                className="flex-1 text-left min-w-0"
                              >
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{voice.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                    voice.gender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                                  }`}>
                                    {voice.gender === 'female' ? '여' : '남'}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                                    {voice.accent}
                                  </span>
                                </div>
                                <div className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{voice.description}</div>
                              </button>

                              {/* 즐겨찾기 별 */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleFavoriteVoice(voice.id, voice.name, { gender: voice.gender, accent: voice.accent, description: voice.description }); }}
                                className="flex-shrink-0 p-1 rounded transition-colors hover:bg-yellow-500/20"
                                title={favoriteVoiceIds.has(voice.id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                              >
                                <span className="text-sm">{favoriteVoiceIds.has(voice.id) ? '★' : '☆'}</span>
                              </button>

                              {elVoiceId === voice.id && (
                                <div className="text-purple-400 flex-shrink-0">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* 내 음성 라이브러리 (API 음성) */}
                          {filteredApiVoices.length > 0 && (
                            <>
                              <div className="px-3 py-2" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderBottom: '1px solid var(--border-default)' }}>
                                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                                  내 커스텀 음성
                                </div>
                              </div>
                              {filteredApiVoices.map((voice) => (
                                <div
                                  key={voice.voice_id}
                                  className={`flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors ${elVoiceId === voice.voice_id ? 'bg-purple-600/20' : ''}`}
                                  style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-default) 50%, transparent)' }}
                                >
                                  <button type="button" onClick={(e) => playVoicePreview(e, voice)}
                                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                      playingVoiceId === voice.voice_id ? 'bg-amber-500 text-white animate-pulse' : 'hover:bg-amber-600 hover:text-white'
                                    }`}
                                    style={playingVoiceId === voice.voice_id ? undefined : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                                    {playingVoiceId === voice.voice_id ? (
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                                    ) : (
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                    )}
                                  </button>
                                  <button type="button" onClick={() => selectVoice(voice)} className="flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{voice.name}</span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{voice.category}</span>
                                    </div>
                                  </button>
                                  {elVoiceId === voice.voice_id && (
                                    <div className="text-purple-400"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></div>
                                  )}
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </>
                    )}

                    {/* 라이브러리 탭 */}
                    {voiceTab === 'library' && (
                      <>
                        {/* 라이브러리 검색 */}
                        <div className="p-2 space-y-2" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <form onSubmit={(e) => { e.preventDefault(); searchLibrary(librarySearch); }} className="flex gap-2">
                            <input
                              type="text"
                              value={librarySearch}
                              onChange={(e) => setLibrarySearch(e.target.value)}
                              placeholder="음성 이름, 억양, 언어 검색..."
                              className="flex-1 rounded-lg px-3 py-2 text-xs focus:border-amber-500 focus:outline-none placeholder:text-[var(--text-muted)]"
                              style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                            />
                            <button type="submit" disabled={libraryLoading}
                              className="px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap">
                              {libraryLoading ? '...' : '검색'}
                            </button>
                          </form>
                          {/* 성별 필터 */}
                          <div className="flex gap-1">
                            <button type="button" onClick={() => { setGenderFilter(null); searchLibrary(librarySearch, 0, null); }}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === null ? 'bg-amber-600 text-white' : 'hover:opacity-80'}`}
                              style={genderFilter === null ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              전체
                            </button>
                            <button type="button" onClick={() => { setGenderFilter('female'); searchLibrary(librarySearch, 0, 'female'); }}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === 'female' ? 'bg-pink-600 text-white' : 'hover:opacity-80'}`}
                              style={genderFilter === 'female' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              여성
                            </button>
                            <button type="button" onClick={() => { setGenderFilter('male'); searchLibrary(librarySearch, 0, 'male'); }}
                              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === 'male' ? 'bg-blue-600 text-white' : 'hover:opacity-80'}`}
                              style={genderFilter === 'male' ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                              남성
                            </button>
                          </div>
                        </div>

                        {/* 라이브러리 결과 목록 */}
                        <div className="overflow-y-auto flex-1">
                          {libraryLoading && libraryVoices.length === 0 && (
                            <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>검색 중...</div>
                          )}
                          {!libraryLoading && libraryVoices.length === 0 && (
                            <div className="px-4 py-6 text-center space-y-2">
                              <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>ElevenLabs 커뮤니티 음성 검색</div>
                              <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                수천 개의 커뮤니티 음성을 검색하세요.<br/>
                                예: "child", "kid", "korean", "anime", "narrator"<br/>
                                성별 필터도 함께 사용할 수 있습니다.
                              </div>
                            </div>
                          )}
                          {libraryVoices.map((voice) => (
                            <div
                              key={voice.voice_id}
                              className={`flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors ${elVoiceId === voice.voice_id ? 'bg-amber-600/20' : ''}`}
                              style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-default) 50%, transparent)' }}
                            >
                              {/* 미리듣기 (preview_url 사용) */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (voice.preview_url) {
                                    if (playingVoiceId === voice.voice_id) {
                                      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
                                      setPlayingVoiceId(null);
                                    } else {
                                      if (audioRef.current) audioRef.current.pause();
                                      setPlayingVoiceId(voice.voice_id);
                                      const audio = new Audio(voice.preview_url);
                                      audioRef.current = audio;
                                      audio.play().catch(() => setPlayingVoiceId(null));
                                      audio.onended = () => { setPlayingVoiceId(null); audioRef.current = null; };
                                    }
                                  }
                                }}
                                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                  playingVoiceId === voice.voice_id ? 'bg-amber-500 text-white animate-pulse' : voice.preview_url ? 'hover:bg-amber-600 hover:text-white' : 'cursor-not-allowed'
                                }`}
                                style={playingVoiceId === voice.voice_id ? undefined : voice.preview_url ? { backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' } : { backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                                disabled={!voice.preview_url}
                                title={voice.preview_url ? '미리듣기' : '미리듣기 없음'}
                              >
                                {playingVoiceId === voice.voice_id ? (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                )}
                              </button>

                              <button type="button" onClick={() => selectSharedVoice(voice)} className="flex-1 text-left min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{voice.name}</span>
                                  {voice.gender && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                      voice.gender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                                    }`}>
                                      {voice.gender === 'female' ? '여' : '남'}
                                    </span>
                                  )}
                                  {voice.accent && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>{voice.accent}</span>
                                  )}
                                  {voice.language && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{voice.language}</span>
                                  )}
                                </div>
                                {voice.description && (
                                  <div className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{voice.description}</div>
                                )}
                              </button>

                              {/* 즐겨찾기 별 */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleFavoriteVoice(voice.voice_id, voice.name, { gender: voice.gender, accent: voice.accent, description: voice.description }); }}
                                className="flex-shrink-0 p-1 rounded transition-colors hover:bg-yellow-500/20"
                                title={favoriteVoiceIds.has(voice.voice_id) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                              >
                                <span className="text-sm">{favoriteVoiceIds.has(voice.voice_id) ? '★' : '☆'}</span>
                              </button>

                              {elVoiceId === voice.voice_id && (
                                <div className="text-amber-400 flex-shrink-0">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* 더 불러오기 */}
                          {libraryHasMore && (
                            <button
                              type="button"
                              onClick={() => searchLibrary(librarySearch, libraryPage + 1)}
                              disabled={libraryLoading}
                              className="w-full px-4 py-3 text-center text-xs font-bold text-amber-400 hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
                            >
                              {libraryLoading ? '로딩 중...' : '더 불러오기'}
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* 즐겨찾기 탭 */}
                    {voiceTab === 'favorites' && (
                      <div className="overflow-y-auto flex-1" style={{ maxHeight: '22rem' }}>
                        {favoriteVoices.length === 0 ? (
                          <div className="py-12 text-center">
                            <span className="text-3xl mb-3 block">☆</span>
                            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                              즐겨찾기한 음성이 없습니다.
                            </p>
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                              프리메이드/커뮤니티 음성 옆의 ☆를 눌러 추가하세요.
                            </p>
                          </div>
                        ) : (
                          favoriteVoices.map((fav) => {
                            const meta = fav.voice_meta || {};
                            return (
                              <div
                                key={fav.voice_id}
                                className={`flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors ${elVoiceId === fav.voice_id ? 'bg-purple-600/20' : ''}`}
                                style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-default) 50%, transparent)' }}
                              >
                                {/* 미리듣기 */}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); playVoicePreviewWithApi(fav.voice_id, fav.voice_name); }}
                                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                    playingVoiceId === fav.voice_id ? 'bg-purple-500 text-white animate-pulse' : 'hover:bg-purple-600 hover:text-white'
                                  }`}
                                  style={playingVoiceId === fav.voice_id ? undefined : { backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                                >
                                  {playingVoiceId === fav.voice_id ? (
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                  )}
                                </button>

                                {/* 음성 정보 */}
                                <button
                                  type="button"
                                  onClick={() => { setElVoiceId(fav.voice_id); setShowVoiceDropdown(false); }}
                                  className="flex-1 text-left min-w-0"
                                >
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{fav.voice_name}</span>
                                    {meta.gender && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                        meta.gender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                                      }`}>
                                        {meta.gender === 'female' ? '여' : '남'}
                                      </span>
                                    )}
                                    {meta.accent && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                                        {meta.accent}
                                      </span>
                                    )}
                                  </div>
                                  {meta.description && (
                                    <div className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{meta.description}</div>
                                  )}
                                </button>

                                {/* 즐겨찾기 해제 */}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleFavoriteVoice(fav.voice_id, fav.voice_name, meta); }}
                                  className="flex-shrink-0 p-1 rounded transition-colors hover:bg-red-500/20"
                                  title="즐겨찾기 해제"
                                >
                                  <span className="text-sm text-yellow-400">★</span>
                                </button>

                                {elVoiceId === fav.voice_id && (
                                  <div className="text-purple-400 flex-shrink-0">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Voice ID 직접 입력 토글 */}
                    <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <button
                        type="button"
                        onClick={() => setShowVoiceIdInput(!showVoiceIdInput)}
                        className="w-full px-3 py-2 flex items-center justify-center gap-1.5 text-[11px] hover:opacity-80 transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        Voice ID 직접 입력
                        <svg className={`w-3 h-3 transition-transform ${showVoiceIdInput ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showVoiceIdInput && (
                        <div className="px-2 pb-2 flex gap-2">
                          <input
                            type="text"
                            value={elVoiceId}
                            onChange={(e) => setElVoiceId(e.target.value)}
                            placeholder="Voice ID를 붙여넣으세요..."
                            className="flex-1 rounded-lg px-3 py-2 text-xs focus:border-purple-500 focus:outline-none font-mono placeholder:text-[var(--text-muted)]"
                            style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                          />
                          <button
                            type="button"
                            onClick={() => { if (elVoiceId.trim()) setShowVoiceDropdown(false); }}
                            disabled={!elVoiceId.trim()}
                            className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                          >
                            적용
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* TTS 모델 선택 - 자막 지원 모델만 */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>
                  TTS 모델 <span className="text-green-400 font-normal">(✅ 자막 지원만)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ELEVENLABS_MODELS.filter(m => m.supportsTimestamp).map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setElModelId(model.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        elModelId === model.id
                          ? 'bg-purple-600/20 border-purple-500'
                          : 'hover:opacity-80'
                      }`}
                      style={elModelId === model.id ? { color: 'var(--text-primary)' } : { backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{model.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">자막OK</span>
                      </div>
                      <div className="text-[10px] opacity-70 mt-0.5">{model.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 상세설정 토글 */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowDetailedSettings(!showDetailedSettings)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-xs font-bold"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    상세설정 <span className="font-normal opacity-60">(음성속도 / 리듬 안정성)</span>
                    {(elSpeed !== 1.0 || elStability !== 0.6) && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">커스텀</span>
                    )}
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${showDetailedSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showDetailedSettings && (
                  <div className="mt-3 space-y-4 pl-1">
                    {/* 음성 속도 슬라이더 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>음성 속도</label>
                        <span className="text-xs font-black text-purple-400">{elSpeed.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.7"
                        max="1.3"
                        step="0.05"
                        value={elSpeed}
                        onChange={(e) => setElSpeed(parseFloat(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        <span>0.7x (느림)</span>
                        <span>1.0x (기본)</span>
                        <span>1.3x (빠름)</span>
                      </div>
                    </div>

                    {/* 리듬 안정성 슬라이더 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>리듬 안정성</label>
                        <span className="text-xs font-black text-purple-400">{Math.round(elStability * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.3"
                        max="0.9"
                        step="0.05"
                        value={elStability}
                        onChange={(e) => setElStability(parseFloat(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                      <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        <span>낮음 (자연스러운 강약)</span>
                        <span>높음 (일정한 속도)</span>
                      </div>
                      <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                        ※ 낮추면 감정 표현 풍부, 높이면 문장 간 포즈가 명확해짐
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 저장 버튼 */}
              <button
                type="button"
                onClick={saveElevenLabsSettings}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                설정 저장
              </button>
            </div>
          )}
        </div>

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
