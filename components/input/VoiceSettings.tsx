
import React, { useState, useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { CONFIG, ELEVENLABS_MODELS, ElevenLabsModelId, ELEVENLABS_DEFAULT_VOICES, VoiceGender, VoiceAge, Language, LANGUAGE_CONFIG } from '../../config';
import { getElevenLabsModelId, setElevenLabsModelId, fetchElevenLabsVoices, ElevenLabsVoice, searchSharedVoices, SharedVoice } from '../../services/elevenLabsService';

export interface VoiceSettingsProps {
  isDisabled: boolean;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export interface VoiceSettingsHandle {
  getSettings: () => {
    elevenLabsVoiceId: string;
    elevenLabsModel: ElevenLabsModelId;
    elevenLabsSpeed: number;
    elevenLabsStability: number;
  };
  loadSettings: (settings: {
    elevenLabsVoiceId?: string;
    elevenLabsModel?: string;
    elevenLabsSpeed?: number;
    elevenLabsStability?: number;
  }) => void;
}

const VoiceSettings = forwardRef<VoiceSettingsHandle, VoiceSettingsProps>(({ isDisabled, language, onLanguageChange }, ref) => {
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

  const voiceDropdownRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Expose settings to parent via imperative handle
  useImperativeHandle(ref, () => ({
    getSettings: () => ({
      elevenLabsVoiceId: elVoiceId,
      elevenLabsModel: elModelId,
      elevenLabsSpeed: elSpeed,
      elevenLabsStability: elStability,
    }),
    loadSettings: (settings) => {
      if (settings.elevenLabsVoiceId) {
        setElVoiceId(settings.elevenLabsVoiceId);
        localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, settings.elevenLabsVoiceId);
      }
      if (settings.elevenLabsModel) {
        setElModelId(settings.elevenLabsModel as ElevenLabsModelId);
        setElevenLabsModelId(settings.elevenLabsModel as ElevenLabsModelId);
      }
      if (settings.elevenLabsSpeed !== undefined) {
        setElSpeed(settings.elevenLabsSpeed);
        localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED, String(settings.elevenLabsSpeed));
      }
      if (settings.elevenLabsStability !== undefined) {
        setElStability(settings.elevenLabsStability);
        localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY, String(settings.elevenLabsStability));
      }
    },
  }), [elVoiceId, elModelId, elSpeed, elStability]);

  // 컴포넌트 마운트 시 저장된 설정 로드
  useEffect(() => {
    const controller = new AbortController();

    const savedVoiceId = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID) || '';
    const savedModelId = getElevenLabsModelId();

    setElVoiceId(savedVoiceId);
    setElModelId(savedModelId);

    // 서버에 API Key가 있으면 음성 목록 자동 로드
    loadVoices();

    // 즐겨찾기 음성 로드
    const token = localStorage.getItem('c2gen_session_token');
    if (token) {
      fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'favorite-voice-list', token }),
        signal: controller.signal,
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

    return () => controller.abort();
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
      await fetch('/api/user', {
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

  return (
    <div className="p-4 border rounded-2xl" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)', borderColor: 'var(--border-default)', overflow: 'visible' }}>
      <button
        type="button"
        onClick={() => setShowElevenLabsSettings(!showElevenLabsSettings)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>🎤 나레이션 음성 설정</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
              background: 'rgba(96,165,250,0.12)', color: '#93c5fd',
            }}>{LANGUAGE_CONFIG[language].name}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
              background: 'var(--bg-hover)', color: 'var(--text-primary)',
            }}>{getSelectedVoiceInfo().name}</span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            }}>{ELEVENLABS_MODELS.find(m => m.id === elModelId)?.name || elModelId}</span>
            {elSpeed !== 1.0 && (
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
              }}>{elSpeed.toFixed(2)}x</span>
            )}
          </div>
          <svg className={`w-5 h-5 transition-transform flex-shrink-0 ${showElevenLabsSettings ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
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
                  onClick={() => onLanguageChange(lang)}
                  className={`p-2 rounded-xl border text-center transition-all text-xs font-bold ${
                    language === lang
                      ? 'bg-blue-600/20 border-blue-500'
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
                <span className="text-blue-400 font-bold">TIP</span>
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
              <span className="text-blue-400 ml-2 font-normal">
                (프리메이드 {ELEVENLABS_DEFAULT_VOICES.length}개 + 라이브러리 수천 개)
              </span>
            </label>

            {/* 선택된 음성 표시 버튼 */}
            <button
              type="button"
              onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
              className="w-full rounded-xl px-4 py-3 text-left flex items-center justify-between hover:border-blue-500/50 transition-colors"
              style={{ backgroundColor: 'var(--bg-elevated)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
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
                      voiceTab === 'premade' ? 'text-blue-400 border-b-2 border-blue-400' : ''
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
                        className="w-full rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none placeholder:text-[var(--text-muted)]"
                        style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                      {/* 성별 필터 */}
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setGenderFilter(null)}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === null ? 'bg-blue-600 text-white' : 'hover:opacity-80'}`}
                          style={genderFilter === null ? undefined : { backgroundColor: 'color-mix(in srgb, var(--bg-hover) 50%, transparent)', color: 'var(--text-secondary)' }}>
                          전체
                        </button>
                        <button type="button" onClick={() => setGenderFilter('female')}
                          className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === 'female' ? 'bg-blue-600 text-white' : 'hover:opacity-80'}`}
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
                          className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${ageFilter === null ? 'bg-blue-600 text-white' : 'hover:opacity-80'}`}
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
                        className={`w-full px-4 py-2.5 text-left hover:bg-[var(--bg-elevated)] transition-colors ${!elVoiceId ? 'bg-blue-600/20' : ''}`}
                        style={{ borderBottom: '1px solid var(--border-default)' }}
                      >
                        <div className="font-bold text-sm" style={{ color: 'var(--text-secondary)' }}>기본값 (Rachel)</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>가장 안정적인 여성 음성</div>
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
                          className={`flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors ${elVoiceId === voice.id ? 'bg-blue-600/20' : ''}`}
                          style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-default) 50%, transparent)' }}
                        >
                          {/* 미리듣기 버튼 */}
                          <button
                            type="button"
                            onClick={(e) => playDefaultVoicePreview(e, voice)}
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              playingVoiceId === voice.id
                                ? 'bg-blue-500 text-white animate-pulse'
                                : 'hover:bg-blue-600 hover:text-white'
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
                            <div className="text-blue-400 flex-shrink-0">
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
                              className={`flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors ${elVoiceId === voice.voice_id ? 'bg-blue-600/20' : ''}`}
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
                                <div className="text-blue-400"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg></div>
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
                          className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${genderFilter === 'female' ? 'bg-blue-600 text-white' : 'hover:opacity-80'}`}
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
                            className={`flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors ${elVoiceId === fav.voice_id ? 'bg-blue-600/20' : ''}`}
                            style={{ borderBottom: '1px solid color-mix(in srgb, var(--border-default) 50%, transparent)' }}
                          >
                            {/* 미리듣기 */}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); playVoicePreviewWithApi(fav.voice_id, fav.voice_name); }}
                              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                playingVoiceId === fav.voice_id ? 'bg-blue-500 text-white animate-pulse' : 'hover:bg-blue-600 hover:text-white'
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
                              <div className="text-blue-400 flex-shrink-0">
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
                        className="flex-1 rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none font-mono placeholder:text-[var(--text-muted)]"
                        style={{ backgroundColor: 'var(--bg-surface)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                      <button
                        type="button"
                        onClick={() => { if (elVoiceId.trim()) setShowVoiceDropdown(false); }}
                        disabled={!elVoiceId.trim()}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
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
                      ? 'bg-blue-600/20 border-blue-500'
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
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">커스텀</span>
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
                    <span className="text-xs font-black text-blue-400">{elSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.05"
                    value={elSpeed}
                    onChange={(e) => setElSpeed(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
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
                    <span className="text-xs font-black text-blue-400">{Math.round(elStability * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="0.9"
                    step="0.05"
                    value={elStability}
                    onChange={(e) => setElStability(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
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
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
          >
            설정 저장
          </button>
        </div>
      )}
    </div>
  );
});

VoiceSettings.displayName = 'VoiceSettings';

export default VoiceSettings;
