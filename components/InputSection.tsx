
import React, { useState, useRef, useEffect } from 'react';
import { GenerationStep } from '../types';
import { CONFIG, ELEVENLABS_MODELS, ElevenLabsModelId } from '../config';
import { getElevenLabsModelId, setElevenLabsModelId, fetchElevenLabsVoices, ElevenLabsVoice } from '../services/elevenLabsService';

interface InputSectionProps {
  onGenerate: (topic: string, referenceImages: string[], sourceText: string | null) => void;
  step: GenerationStep;
}

const InputSection: React.FC<InputSectionProps> = ({ onGenerate, step }) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [topic, setTopic] = useState('');
  const [manualScript, setManualScript] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);

  // ElevenLabs 설정 상태
  const [showElevenLabsSettings, setShowElevenLabsSettings] = useState(false);
  const [elApiKey, setElApiKey] = useState('');
  const [elVoiceId, setElVoiceId] = useState('');
  const [elModelId, setElModelId] = useState<ElevenLabsModelId>('eleven_multilingual_v2');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [showVoiceDropdown, setShowVoiceDropdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceDropdownRef = useRef<HTMLDivElement>(null);

  // 컴포넌트 마운트 시 저장된 설정 로드
  useEffect(() => {
    const savedApiKey = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY) || '';
    const savedVoiceId = localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID) || '';
    const savedModelId = getElevenLabsModelId();

    setElApiKey(savedApiKey);
    setElVoiceId(savedVoiceId);
    setElModelId(savedModelId);

    // API Key가 있으면 음성 목록 자동 로드
    if (savedApiKey) {
      loadVoices(savedApiKey);
    }
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

  // 음성 목록 불러오기
  const loadVoices = async (apiKey?: string) => {
    const key = apiKey || elApiKey;
    if (!key || key.length < 10) return;

    setIsLoadingVoices(true);
    try {
      const voiceList = await fetchElevenLabsVoices(key);
      setVoices(voiceList);
    } catch (e) {
      console.error('음성 목록 로드 실패:', e);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  // Voice 선택
  const selectVoice = (voice: ElevenLabsVoice) => {
    setElVoiceId(voice.voice_id);
    setShowVoiceDropdown(false);
  };

  // 선택된 Voice 이름 가져오기
  const getSelectedVoiceName = () => {
    if (!elVoiceId) return '기본값 사용';
    const voice = voices.find(v => v.voice_id === elVoiceId);
    return voice ? voice.name : elVoiceId.slice(0, 12) + '...';
  };

  // ElevenLabs 설정 저장
  const saveElevenLabsSettings = () => {
    if (elApiKey) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_API_KEY, elApiKey);
    }
    if (elVoiceId) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.ELEVENLABS_VOICE_ID, elVoiceId);
    }
    setElevenLabsModelId(elModelId);
    setShowElevenLabsSettings(false);
  };

  const isProcessing = step !== GenerationStep.IDLE && step !== GenerationStep.COMPLETED && step !== GenerationStep.ERROR;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;

    if (activeTab === 'auto') {
      if (topic.trim()) onGenerate(topic, referenceImages, null);
    } else {
      if (manualScript.trim()) onGenerate("Manual Script Input", referenceImages, manualScript);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const remainingSlots = 4 - referenceImages.length;
      const filesToProcess = (Array.from(files) as File[]).slice(0, remainingSlots);
      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => setReferenceImages(prev => [...prev, reader.result as string].slice(0, 4));
        reader.readAsDataURL(file);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => setReferenceImages(prev => prev.filter((_, i) => i !== index));

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 text-white">
          TubeGen <span className="text-brand-500">Studio</span>
        </h1>
        <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">졸라맨 V10.0 Concept-Based Engine</p>
      </div>

      <div className="mb-4 flex flex-col gap-4">
        {/* Global Reference Images */}
        <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-sm shadow-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1 text-left">
              <h3 className="text-white font-bold text-lg mb-1">글로벌 스타일 참조</h3>
              <p className="text-slate-500 text-xs">참조 이미지를 올리면 화풍과 색감을 그대로 계승합니다.</p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              {referenceImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <div className="w-24 h-16 rounded-xl overflow-hidden border border-slate-700">
                    <img src={img} alt={`Ref ${idx}`} className="w-full h-full object-cover" />
                  </div>
                  <button onClick={() => removeImage(idx)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              ))}
              {referenceImages.length < 4 && (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-24 h-16 border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center text-slate-500 hover:border-brand-500 hover:text-brand-500 transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></button>
              )}
              <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" multiple />
            </div>
          </div>
        </div>

        {/* ElevenLabs TTS 설정 */}
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-sm">
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
                <h3 className="text-white font-bold text-sm">ElevenLabs TTS 설정</h3>
                <p className="text-slate-500 text-xs">
                  {elApiKey ? `모델: ${ELEVENLABS_MODELS.find(m => m.id === elModelId)?.name || elModelId}` : 'API Key 미설정 (Gemini 폴백)'}
                </p>
              </div>
            </div>
            <svg className={`w-5 h-5 text-slate-500 transition-transform ${showElevenLabsSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showElevenLabsSettings && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
              {/* API Key */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={elApiKey}
                    onChange={(e) => setElApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => loadVoices()}
                    disabled={!elApiKey || elApiKey.length < 10 || isLoadingVoices}
                    className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                  >
                    {isLoadingVoices ? '로딩...' : '음성 불러오기'}
                  </button>
                </div>
              </div>

              {/* Voice ID Selection */}
              <div ref={voiceDropdownRef} className="relative">
                <label className="block text-xs font-bold text-slate-400 mb-2">
                  Voice 선택 {voices.length > 0 && <span className="text-purple-400">({voices.length}개)</span>}
                </label>

                {/* 선택 버튼 */}
                <button
                  type="button"
                  onClick={() => setShowVoiceDropdown(!showVoiceDropdown)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-left flex items-center justify-between hover:border-slate-600 transition-colors"
                >
                  <span className={elVoiceId ? 'text-white' : 'text-slate-500'}>
                    {getSelectedVoiceName()}
                  </span>
                  <svg className={`w-4 h-4 text-slate-500 transition-transform ${showVoiceDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* 드롭다운 목록 */}
                {showVoiceDropdown && (
                  <div className="absolute z-50 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                    {/* 기본값 옵션 */}
                    <button
                      type="button"
                      onClick={() => { setElVoiceId(''); setShowVoiceDropdown(false); }}
                      className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors border-b border-slate-700 ${!elVoiceId ? 'bg-purple-600/20' : ''}`}
                    >
                      <div className="font-bold text-sm text-slate-300">기본값 사용</div>
                      <div className="text-xs text-slate-500">시스템 기본 음성</div>
                    </button>

                    {voices.length === 0 ? (
                      <div className="px-4 py-6 text-center text-slate-500 text-sm">
                        {isLoadingVoices ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent animate-spin rounded-full"></div>
                            음성 목록 로딩 중...
                          </div>
                        ) : (
                          'API Key를 입력하고 "음성 불러오기" 버튼을 클릭하세요'
                        )}
                      </div>
                    ) : (
                      voices.map((voice) => (
                        <button
                          key={voice.voice_id}
                          type="button"
                          onClick={() => selectVoice(voice)}
                          className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-b-0 ${elVoiceId === voice.voice_id ? 'bg-purple-600/20' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-sm text-white">{voice.name}</div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                              {voice.category}
                            </span>
                          </div>
                          {voice.labels && (
                            <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-1">
                              {voice.labels.gender && <span>{voice.labels.gender}</span>}
                              {voice.labels.accent && <span>• {voice.labels.accent}</span>}
                              {voice.labels.age && <span>• {voice.labels.age}</span>}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-600 mt-1 font-mono">{voice.voice_id}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}

                {/* 직접 입력 옵션 */}
                <div className="mt-2">
                  <input
                    type="text"
                    value={elVoiceId}
                    onChange={(e) => setElVoiceId(e.target.value)}
                    placeholder="또는 Voice ID 직접 입력..."
                    className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2">TTS 모델</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ELEVENLABS_MODELS.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setElModelId(model.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        elModelId === model.id
                          ? 'bg-purple-600/20 border-purple-500 text-white'
                          : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{model.name}</span>
                        {model.supportsTimestamp ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold">자막</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">자막X</span>
                        )}
                      </div>
                      <div className="text-xs opacity-70 mt-1">{model.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Button */}
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
      </div>

      {/* Tabs and Submit */}
      <div className="flex justify-center mb-6">
        <div className="bg-slate-900 p-1.5 rounded-2xl border border-slate-800 flex gap-1">
          <button type="button" onClick={() => setActiveTab('auto')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'auto' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>자동 트렌드</button>
          <button type="button" onClick={() => setActiveTab('manual')} className={`px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'manual' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>수동 대본</button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        {activeTab === 'auto' ? (
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
            <div className="relative flex items-center bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden pr-2">
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={isProcessing} placeholder="경제 트렌드 키워드 입력 (예: 비트코인, 금리)..." className="block w-full bg-transparent text-slate-100 py-5 px-6 focus:ring-0 focus:outline-none placeholder-slate-600 text-lg disabled:opacity-50" />
              <button type="submit" disabled={isProcessing || !topic.trim()} className="bg-brand-600 hover:bg-brand-500 text-white font-black py-3 px-8 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap">{isProcessing ? '생성 중' : '시작'}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden">
              <textarea value={manualScript} onChange={(e) => setManualScript(e.target.value)} placeholder="직접 작성한 대본을 입력하세요. AI가 시각적 연출안을 생성합니다." className="w-full h-80 bg-transparent text-slate-100 p-8 focus:ring-0 focus:outline-none placeholder-slate-600 resize-none" disabled={isProcessing} />
            </div>
            <button type="submit" disabled={isProcessing || !manualScript.trim()} className="w-full bg-slate-100 hover:bg-white text-slate-950 font-black py-5 rounded-2xl transition-all disabled:opacity-50 uppercase tracking-widest text-sm">스토리보드 생성</button>
          </div>
        )}
      </form>
    </div>
  );
};

export default InputSection;
