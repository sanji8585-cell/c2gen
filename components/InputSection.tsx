
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GenerationStep, ProjectSettings, ReferenceImages, DEFAULT_REFERENCE_IMAGES } from '../types';
import { CONFIG, IMAGE_MODELS, ImageModelId, GEMINI_STYLE_CATEGORIES, GeminiStyleId, GPT_STYLE_CATEGORIES, GptStyleId, VideoOrientation, getVideoOrientation, setVideoOrientation, Language } from '../config';
import { getElevenLabsModelId } from '../services/elevenLabsService';
import { VoiceSettingsHandle } from './input/VoiceSettings';
import HeroInput from './input/HeroInput';
import SettingsAccordion from './input/SettingsAccordion';
import ImageSettingsGroup from './input/ImageSettingsGroup';
import SoundSettingsGroup from './input/SoundSettingsGroup';
import PresetGroup from './input/PresetGroup';

// Gemini 스타일 맵
const GEMINI_STYLE_MAP = new Map<string, { id: string; name: string; category: string; prompt: string }>();
GEMINI_STYLE_CATEGORIES.forEach(category => {
  category.styles.forEach(style => {
    GEMINI_STYLE_MAP.set(style.id, { ...style, category: category.name });
  });
});

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
  bgmData: string | null;
  onBgmDataChange: (data: string | null) => void;
  bgmVolume: number;
  onBgmVolumeChange: (v: number) => void;
  bgmDuckingEnabled: boolean;
  onBgmDuckingToggle: (v: boolean) => void;
  bgmDuckingAmount: number;
  onBgmDuckingAmountChange: (v: number) => void;
}

const InputSection: React.FC<InputSectionProps> = ({
  onGenerate, step,
  bgmData, onBgmDataChange,
  bgmVolume, onBgmVolumeChange,
  bgmDuckingEnabled, onBgmDuckingToggle,
  bgmDuckingAmount, onBgmDuckingAmountChange,
}) => {
  const [activeTab, setActiveTab] = useState<'auto' | 'manual'>('auto');
  const [topic, setTopic] = useState('');
  const [manualScript, setManualScript] = useState('');

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
  const [newProjectName, setNewProjectName] = useState('');

  // VoiceSettings ref
  const voiceSettingsRef = useRef<VoiceSettingsHandle>(null);

  // 아코디언 그룹 상태
  const [openGroup, setOpenGroup] = useState<'image' | 'sound' | 'preset' | null>('image');


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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(`저장 실패: ${msg}`);
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
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(`업데이트 실패: ${msg}`);
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

    // 설정 패널 모두 닫기
    setOpenGroup(null);

    if (activeTab === 'auto') {
      if (topic.trim()) onGenerate(topic, refImages, null);
    } else {
      if (manualScript.trim()) {
        const autoTopic = manualScript.trim().split('\n')[0].slice(0, 50).trim() || '직접 입력 대본';
        onGenerate(autoTopic, refImages, manualScript);
      }
    }
  }, [isDisabled, activeTab, topic, characterRefImages, styleRefImages, characterStrength, styleStrength, manualScript, onGenerate]);

  // --- Accordion summaries ---
  const imageSummary = useMemo(() => {
    const modelName = IMAGE_MODELS.find(m => m.id === imageModelId)?.name || imageModelId;
    const orient = videoOrientation === 'landscape' ? '가로 16:9' : '세로 9:16';
    const charCount = characterRefImages.length;
    const styleCount = styleRefImages.length;
    let styleName = '없음 (기본)';
    if (imageModelId === 'gemini-2.5-flash-image' && geminiStyleId !== 'gemini-none') {
      const found = GEMINI_STYLE_MAP.get(geminiStyleId);
      styleName = found ? found.name : geminiStyleId;
    } else if (imageModelId === 'gpt-image-1' && gptStyleId !== 'gpt-none') {
      const found = GPT_STYLE_MAP.get(gptStyleId);
      styleName = found ? found.name : gptStyleId;
    }
    return (
      <>
        <div>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{modelName}</span>
          <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
          {orient}
          <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
          캐릭터 {charCount}장
          <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600, marginLeft: 4, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>강도 {characterStrength}%</span>
          <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
          스타일 {styleCount}장
          <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600, marginLeft: 4, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>강도 {styleStrength}%</span>
        </div>
        <div>
          화풍 <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{styleName}</span>
          <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
          <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: suppressKorean ? 'rgba(52,211,153,0.12)' : 'var(--bg-hover)', color: suppressKorean ? '#6ee7b7' : 'var(--text-secondary)' }}>한글억제 {suppressKorean ? 'ON' : 'OFF'}</span>
        </div>
      </>
    );
  }, [imageModelId, videoOrientation, characterRefImages.length, styleRefImages.length, characterStrength, styleStrength, geminiStyleId, gptStyleId, suppressKorean]);

  const soundSummary = useMemo(() => {
    const model = localStorage.getItem('tubegen_el_model') || 'eleven_multilingual_v2';
    const speed = localStorage.getItem('tubegen_el_speed') || '1.00';
    const modelLabels: Record<string, string> = { 'eleven_v3': 'Eleven v3', 'eleven_multilingual_v2': 'Multilingual v2' };
    const modelLabel = modelLabels[model] || model;
    const dot = <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>;
    const autoBgmOn = localStorage.getItem('tubegen_auto_bgm') === 'true';
    const hasBgmFile = !!bgmData;
    const vol = Math.round(bgmVolume * 100);
    return (
      <div>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{modelLabel}</span>
        {parseFloat(speed) !== 1.0 && <>{dot}속도 <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{parseFloat(speed).toFixed(2)}x</span></>}
        {dot}
        {hasBgmFile
          ? <span style={{ fontWeight: 700, color: '#60a5fa' }}>BGM 업로드됨</span>
          : autoBgmOn
            ? <span style={{ color: '#60a5fa' }}>AI BGM 자동</span>
            : <span style={{ color: 'var(--text-muted)' }}>BGM 없음</span>
        }
        {(hasBgmFile || autoBgmOn) && <>
          {dot}<span>볼륨 {vol}%</span>
          {bgmDuckingEnabled && <>{dot}<span style={{ color: '#60a5fa' }}>덕킹 {Math.round(bgmDuckingAmount * 100)}%</span></>}
        </>}
      </div>
    );
  }, [openGroup, bgmData, bgmVolume, bgmDuckingEnabled, bgmDuckingAmount]);

  const presetSummary = useMemo(() => {
    if (projects.length === 0) return <div>저장된 프리셋 없음</div>;
    const latest = projects[0];
    return (
      <div>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{projects.length}개</span> 저장됨
        <span style={{ margin: '0 4px', color: 'var(--text-muted)', fontSize: '10px' }}>·</span>
        최근: <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{latest.name}</span>
      </div>
    );
  }, [projects]);

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px' }}>
      {/* Hero Input */}
      <HeroInput
        activeTab={activeTab}
        onTabChange={setActiveTab}
        topic={topic}
        onTopicChange={setTopic}
        manualScript={manualScript}
        onManualScriptChange={setManualScript}
        onSubmit={handleSubmit}
        step={step}
      />

      {/* Settings Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 2, color: 'var(--text-muted)' }}>설정</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      </div>

      {/* Accordion Groups */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
        <SettingsAccordion
          icon="📁"
          iconGradient="linear-gradient(135deg, #fbbf24, #f97316)"
          title="프리셋"
          summary={presetSummary}
          isOpen={openGroup === 'preset'}
          onToggle={() => setOpenGroup(prev => prev === 'preset' ? null : 'preset')}
        >
          <PresetGroup
            projects={projects}
            onSave={saveProject}
            onLoad={loadProject}
            onUpdate={updateProject}
            onDelete={deleteProject}
            newProjectName={newProjectName}
            onNewProjectNameChange={setNewProjectName}
          />
        </SettingsAccordion>

        <SettingsAccordion
          icon="🖼️"
          iconGradient="linear-gradient(135deg, #60a5fa, #818cf8)"
          title="이미지 설정"
          summary={imageSummary}
          isOpen={openGroup === 'image'}
          onToggle={() => setOpenGroup(prev => prev === 'image' ? null : 'image')}
        >
          <ImageSettingsGroup
            imageModelId={imageModelId}
            onImageModelChange={selectImageModel}
            videoOrientation={videoOrientation}
            onOrientationChange={handleOrientationChange}
            characterRefImages={characterRefImages}
            styleRefImages={styleRefImages}
            characterStrength={characterStrength}
            styleStrength={styleStrength}
            onCharacterImagesChange={setCharacterRefImages}
            onStyleImagesChange={setStyleRefImages}
            onCharacterStrengthChange={setCharacterStrength}
            onStyleStrengthChange={setStyleStrength}
            geminiStyleId={geminiStyleId}
            onGeminiStyleChange={selectGeminiStyle}
            geminiCustomStylePrompt={geminiCustomStylePrompt}
            onGeminiCustomStyleChange={saveGeminiCustomStyle}
            gptStyleId={gptStyleId}
            onGptStyleChange={selectGptStyle}
            gptCustomStylePrompt={gptCustomStylePrompt}
            onGptCustomStyleChange={saveGptCustomStyle}
            suppressKorean={suppressKorean}
            onSuppressKoreanChange={(v: boolean) => { setSuppressKorean(v); localStorage.setItem(CONFIG.STORAGE_KEYS.SUPPRESS_KOREAN, String(v)); }}
            previewStyleId={previewStyleId}
            previewIndex={previewIndex}
            onPreviewStyleChange={setPreviewStyleId}
            onPreviewIndexChange={setPreviewIndex}
            isDisabled={isDisabled}
          />
        </SettingsAccordion>

        <SettingsAccordion
          icon="🔊"
          iconGradient="linear-gradient(135deg, #34d399, #38bdf8)"
          title="사운드 설정"
          summary={soundSummary}
          isOpen={openGroup === 'sound'}
          onToggle={() => setOpenGroup(prev => prev === 'sound' ? null : 'sound')}
        >
          <SoundSettingsGroup
            voiceSettingsRef={voiceSettingsRef}
            isDisabled={isDisabled}
            language={language}
            onLanguageChange={handleLanguageChange}
            bgmData={bgmData}
            onBgmDataChange={onBgmDataChange}
            bgmVolume={bgmVolume}
            onBgmVolumeChange={onBgmVolumeChange}
            bgmDuckingEnabled={bgmDuckingEnabled}
            onBgmDuckingToggle={onBgmDuckingToggle}
            bgmDuckingAmount={bgmDuckingAmount}
            onBgmDuckingAmountChange={onBgmDuckingAmountChange}
          />
        </SettingsAccordion>
      </div>
    </div>
  );
};

export default InputSection;
