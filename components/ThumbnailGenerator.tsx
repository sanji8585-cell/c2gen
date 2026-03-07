import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { THUMBNAIL_PLATFORMS, LANGUAGE_CONFIG, type ThumbnailPlatform, type Language, CONFIG } from '../config';
import { generateThumbnailImage } from '../services/geminiService';
import { overlayTitleOnImage, TEXT_STYLE_PRESETS, getStyleSampleImageUrl } from '../services/thumbnailService';
import { THUMBNAIL_IMAGE_STYLES } from '../services/prompts';

interface Props {
  topic: string;
  sceneImages: string[];
  onClose: () => void;
}

type ImageSource = 'ai' | 'scene';

interface GeneratedItem {
  id: string;
  styleId: string;
  styleName: string;
  imageData: string; // base64
}

const ThumbnailGenerator: React.FC<Props> = ({ topic, sceneImages, onClose }) => {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<ThumbnailPlatform>('youtube');
  const [title, setTitle] = useState(topic);
  const [subtitle, setSubtitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTitle, setShowTitle] = useState(true);

  const [imageSource, setImageSource] = useState<ImageSource>(sceneImages.length > 0 ? 'scene' : 'ai');
  const [aiStyle, setAiStyle] = useState<string>('cinematic');
  const [textStyleId, setTextStyleId] = useState<string>('bold-white');
  const [textPosition, setTextPosition] = useState<'top' | 'center' | 'bottom'>('bottom');
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1.0);

  // 생성 히스토리
  const [generatedHistory, setGeneratedHistory] = useState<GeneratedItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  const language = (localStorage.getItem(CONFIG.STORAGE_KEYS.LANGUAGE) as Language) || 'ko';
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const currentTextStyle = TEXT_STYLE_PRESETS.find(s => s.id === textStyleId) || TEXT_STYLE_PRESETS[0];

  const dims = THUMBNAIL_PLATFORMS[platform];
  const aspectRatio = dims.width / dims.height;

  // AI 스타일 변경 시: 해당 스타일 히스토리 있으면 복원, 없으면 샘플 프리뷰 표시
  useEffect(() => {
    if (imageSource !== 'ai') return;
    const existing = generatedHistory.find(h => h.styleId === aiStyle);
    if (existing) {
      setBaseImage(existing.imageData);
      setActiveHistoryId(existing.id);
      if (!showTitle || !title.trim()) setFinalImage(existing.imageData);
    } else {
      setBaseImage(null);
      setFinalImage(null);
      setActiveHistoryId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiStyle]);

  // 실시간 미리보기 갱신
  useEffect(() => {
    if (!baseImage || !showTitle || !title.trim()) {
      if (baseImage && !showTitle) setFinalImage(baseImage);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const overlaid = await overlayTitleOnImage(baseImage, {
          style: currentTextStyle,
          title,
          subtitle: subtitle.trim() || undefined,
          platform,
          language,
          fontSizeMultiplier,
          positionOverride: textPosition,
        });
        setFinalImage(overlaid);
      } catch {}
    }, 200);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [baseImage, showTitle, title, subtitle, textStyleId, textPosition, fontSizeMultiplier, platform, language, currentTextStyle]);

  // AI 이미지 생성
  const handleGenerateAI = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const imageData = await generateThumbnailImage(topic, platform, aiStyle);
      if (!imageData) {
        setError(t('thumbnail.errorGenerateFailed'));
        return;
      }

      // 히스토리에 추가
      const styleDef = THUMBNAIL_IMAGE_STYLES[aiStyle];
      const newItem: GeneratedItem = {
        id: `${Date.now()}_${aiStyle}`,
        styleId: aiStyle,
        styleName: styleDef?.nameKo || aiStyle,
        imageData,
      };
      setGeneratedHistory(prev => [newItem, ...prev]);
      setActiveHistoryId(newItem.id);

      setBaseImage(imageData);
      if (!showTitle || !title.trim()) setFinalImage(imageData);
    } catch (e: any) {
      setError(e.message || t('thumbnail.errorGenerateFailed'));
    } finally {
      setLoading(false);
    }
  }, [topic, platform, aiStyle, showTitle, title]);

  // 히스토리에서 선택
  const handleSelectHistory = useCallback((item: GeneratedItem) => {
    setActiveHistoryId(item.id);
    setBaseImage(item.imageData);
    setError(null);
    if (!showTitle || !title.trim()) setFinalImage(item.imageData);
  }, [showTitle, title]);

  // 씬 이미지 선택
  const handleSelectScene = useCallback((imageData: string) => {
    setBaseImage(imageData);
    setActiveHistoryId(null);
    setError(null);
    if (!showTitle || !title.trim()) setFinalImage(imageData);
  }, [showTitle, title]);

  // 다운로드
  const handleDownload = useCallback(() => {
    if (!finalImage) return;
    const link = document.createElement('a');
    link.href = `data:image/jpeg;base64,${finalImage}`;
    link.download = `thumbnail_${platform}_${dims.width}x${dims.height}.jpg`;
    link.click();
  }, [finalImage, platform, dims]);

  const selectedAiStyle = THUMBNAIL_IMAGE_STYLES[aiStyle];
  // 아직 이미지가 없고 AI모드일 때 샘플 프리뷰 표시
  const showSamplePreview = !baseImage && !loading && imageSource === 'ai';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div
        className="w-full max-h-[92vh] overflow-hidden rounded-2xl border flex flex-col"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', maxWidth: '960px' }}
        onClick={e => e.stopPropagation()} /* 유지: 내부 클릭 전파 방지 */
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{t('thumbnail.title')}</h2>
          <button onClick={() => { if (window.confirm(t('thumbnail.closeConfirm', '창을 닫으면 작업 내용이 사라집니다. 닫으시겠습니까?'))) onClose(); }} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-4 py-1.5 text-[11px] font-medium flex items-center gap-1.5 border-b" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
          <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          {t('thumbnail.closeWarning', '창을 닫으면 작업 내용이 사라집니다. 완료 후 다운로드하세요.')}
        </div>
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* 좌측: 컨트롤 패널 */}
          <div className="lg:w-[340px] flex-shrink-0 overflow-y-auto p-4 space-y-3 border-r" style={{ borderColor: 'var(--border-subtle)', scrollbarWidth: 'thin' }}>

            {/* 플랫폼 선택 */}
            <Section label={t('thumbnail.platform')}>
              <div className="flex gap-1.5">
                {(Object.keys(THUMBNAIL_PLATFORMS) as ThumbnailPlatform[]).map(p => (
                  <button key={p} onClick={() => setPlatform(p)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${platform === p ? 'ring-2' : 'hover:opacity-80'}`}
                    style={{
                      backgroundColor: platform === p ? 'var(--brand-500)' : 'var(--bg-elevated)',
                      color: platform === p ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {THUMBNAIL_PLATFORMS[p].label}
                    <span className="block text-[9px] opacity-60">{THUMBNAIL_PLATFORMS[p].width}x{THUMBNAIL_PLATFORMS[p].height}</span>
                  </button>
                ))}
              </div>
            </Section>

            {/* 이미지 소스 */}
            <Section label={t('thumbnail.imageSource')}>
              <div className="flex gap-1.5">
                <button onClick={() => setImageSource('ai')}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all ${imageSource === 'ai' ? 'ring-2' : ''}`}
                  style={{
                    backgroundColor: imageSource === 'ai' ? 'var(--brand-500)' : 'var(--bg-elevated)',
                    color: imageSource === 'ai' ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {t('thumbnail.aiGenerate')} <span className="text-[9px] opacity-60">({t('thumbnail.credits16')})</span>
                </button>
                <button onClick={() => setImageSource('scene')}
                  disabled={sceneImages.length === 0}
                  className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all ${imageSource === 'scene' ? 'ring-2' : ''} ${sceneImages.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={{
                    backgroundColor: imageSource === 'scene' ? 'var(--brand-500)' : 'var(--bg-elevated)',
                    color: imageSource === 'scene' ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {t('thumbnail.sceneImage')} <span className="text-[9px] opacity-60">{sceneImages.length > 0 ? `(${t('thumbnail.free')})` : `(${t('thumbnail.none')})`}</span>
                </button>
              </div>
            </Section>

            {/* AI 스타일 (AI 모드) */}
            {imageSource === 'ai' && (
              <Section label={t('thumbnail.aiImageStyle')}>
                <div className="grid grid-cols-3 gap-1">
                  {Object.entries(THUMBNAIL_IMAGE_STYLES).map(([id, s]) => (
                    <button key={id} onClick={() => setAiStyle(id)}
                      className={`px-1.5 py-1.5 rounded-lg text-[10px] font-medium transition-all text-center leading-tight ${aiStyle === id ? 'ring-2 ring-offset-1' : 'hover:opacity-90'}`}
                      style={{
                        backgroundColor: aiStyle === id ? 'var(--brand-500)' : 'var(--bg-elevated)',
                        color: aiStyle === id ? '#fff' : 'var(--text-secondary)',
                        ringColor: 'var(--brand-400)',
                      }}
                    >
                      {s.nameKo}
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* 씬 이미지 선택 (씬 모드) */}
            {imageSource === 'scene' && sceneImages.length > 0 && (
              <Section label={t('thumbnail.sceneImageSelect')}>
                <div className="flex gap-1.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: 'thin' }}>
                  {sceneImages.map((img, i) => (
                    <button key={i} onClick={() => handleSelectScene(img)}
                      className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${baseImage === img && !activeHistoryId ? 'ring-2 scale-105' : 'opacity-70 hover:opacity-100'}`}
                      style={{ borderColor: baseImage === img && !activeHistoryId ? 'var(--brand-400)' : 'transparent' }}
                    >
                      <img src={`data:image/png;base64,${img}`} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {error && <p className="text-xs text-center" style={{ color: '#f87171' }}>{error}</p>}

            <hr style={{ borderColor: 'var(--border-subtle)' }} />

            {/* 텍스트 오버레이 */}
            <Section label={t('thumbnail.textOverlay')} right={
              <label className="flex items-center gap-1 text-[10px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={showTitle} onChange={() => setShowTitle(!showTitle)} className="rounded w-3.5 h-3.5" />
                {t('thumbnail.enable')}
              </label>
            }>
              {showTitle && (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('thumbnail.style')}</label>
                    <div className="grid grid-cols-4 gap-1">
                      {TEXT_STYLE_PRESETS.map(s => (
                        <button key={s.id} onClick={() => setTextStyleId(s.id)}
                          className={`px-1 py-1.5 rounded-lg text-[9px] font-medium transition-all ${textStyleId === s.id ? 'ring-2' : ''}`}
                          style={{
                            backgroundColor: textStyleId === s.id ? 'var(--brand-500)' : 'var(--bg-elevated)',
                            color: textStyleId === s.id ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          {s.nameKo}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('thumbnail.titleLabel')}</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                      placeholder={t('thumbnail.titlePlaceholder')}
                      className="w-full px-2.5 py-1.5 rounded-lg text-sm border focus:outline-none"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('thumbnail.subtitle')}</label>
                    <input type="text" value={subtitle} onChange={e => setSubtitle(e.target.value)}
                      placeholder={t('thumbnail.subtitlePlaceholder')}
                      className="w-full px-2.5 py-1.5 rounded-lg text-sm border focus:outline-none"
                      style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('thumbnail.position')}</label>
                      <div className="flex gap-1">
                        {(['top', 'center', 'bottom'] as const).map(pos => (
                          <button key={pos} onClick={() => setTextPosition(pos)}
                            className={`flex-1 px-1 py-1 rounded text-[10px] font-medium transition-all ${textPosition === pos ? 'ring-1' : ''}`}
                            style={{
                              backgroundColor: textPosition === pos ? 'var(--brand-500)' : 'var(--bg-elevated)',
                              color: textPosition === pos ? '#fff' : 'var(--text-secondary)',
                            }}
                          >
                            {pos === 'top' ? t('thumbnail.posTop') : pos === 'center' ? t('thumbnail.posCenter') : t('thumbnail.posBottom')}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-muted)' }}>{t('thumbnail.size')}</label>
                      <input type="range" min={0.7} max={1.5} step={0.05} value={fontSizeMultiplier}
                        onChange={e => setFontSizeMultiplier(Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ accentColor: 'var(--brand-500)' }}
                      />
                      <div className="flex justify-between text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        <span>{t('thumbnail.small')}</span><span>{t('thumbnail.large')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Section>
          </div>

          {/* 우측: 미리보기 + 히스토리 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 메인 프리뷰 */}
            <div className="flex-1 p-4 flex flex-col items-center justify-center overflow-y-auto">
              {finalImage ? (
                <div className="w-full space-y-3">
                  <div
                    className="relative mx-auto rounded-lg overflow-hidden border"
                    style={{ maxWidth: '100%', aspectRatio: String(aspectRatio), borderColor: 'var(--border-subtle)' }}
                  >
                    <img src={`data:image/jpeg;base64,${finalImage}`} alt="Thumbnail preview" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex gap-2">
                    {imageSource === 'ai' && (
                      <button onClick={handleGenerateAI} disabled={loading}
                        className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          color: '#fff',
                          boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)',
                        }}
                      >
                        {loading ? t('thumbnail.generating') : `✨ ${t('thumbnail.regenerate')}`}
                      </button>
                    )}
                    <button onClick={handleDownload}
                      className="flex-1 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{ backgroundColor: '#059669', color: '#fff', boxShadow: '0 4px 16px rgba(5, 150, 105, 0.3)' }}
                    >
                      {t('thumbnail.download')} ({dims.width}x{dims.height})
                    </button>
                  </div>
                </div>
              ) : loading ? (
                <div className="text-center">
                  <div className="w-12 h-12 border-3 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--brand-500)', borderTopColor: 'transparent' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('thumbnail.generatingAiImage')}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{t('thumbnail.style')}: {selectedAiStyle?.nameKo}</p>
                </div>
              ) : showSamplePreview ? (
                /* AI 생성 샘플 프리뷰 (사전 생성된 실제 AI 이미지) */
                <div className="w-full flex flex-col items-center gap-4">
                  <div
                    className="w-full rounded-xl overflow-hidden border-2 relative"
                    style={{ aspectRatio: String(aspectRatio), maxWidth: '100%', borderColor: 'var(--border-subtle)' }}
                  >
                    <img
                      src={getStyleSampleImageUrl(aiStyle)}
                      alt={`${selectedAiStyle?.nameKo} style sample`}
                      className="w-full h-full object-cover"
                    />
                    {/* 스타일 이름 배지 */}
                    <div className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
                      {selectedAiStyle?.nameKo} {t('thumbnail.styleSample')}
                    </div>
                  </div>

                  {/* ★★★ 초강조 이미지 생성 버튼 ★★★ */}
                  <button onClick={handleGenerateAI} disabled={loading}
                    className="w-full py-4 rounded-2xl text-lg font-black tracking-wide transition-all disabled:opacity-50 shadow-2xl hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)',
                      color: '#fff',
                      fontSize: '18px',
                      letterSpacing: '0.5px',
                      boxShadow: '0 8px 32px rgba(99, 102, 241, 0.4), 0 0 0 2px rgba(139, 92, 246, 0.3)',
                      border: '2px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    ✨ {t('thumbnail.generateThisStyle')}
                  </button>
                  <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
                    {t('thumbnail.sampleDescription', { style: selectedAiStyle?.nameKo })}
                  </p>
                </div>
              ) : (
                <div className="text-center" style={{ color: 'var(--text-muted)' }}>
                  <svg className="w-16 h-16 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
                  </svg>
                  <p className="text-sm mb-4">{t('thumbnail.selectSceneImage')}</p>
                  {imageSource === 'scene' && sceneImages.length === 0 && (
                    <button onClick={() => { setImageSource('ai'); }}
                      className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
                    >
                      {t('thumbnail.switchToAi')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 히스토리 바 — 생성된 이미지가 2개 이상일 때 표시 */}
            {generatedHistory.length > 0 && (
              <div className="flex-shrink-0 border-t p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {t('thumbnail.generatedImages', { count: generatedHistory.length })}
                  </label>
                  {generatedHistory.length > 1 && (
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      {t('thumbnail.clickToCompare')}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
                  {generatedHistory.map(item => (
                    <button key={item.id} onClick={() => handleSelectHistory(item)}
                      className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all relative group ${activeHistoryId === item.id ? 'ring-2 scale-105' : 'opacity-60 hover:opacity-100'}`}
                      style={{
                        width: '80px',
                        height: `${Math.round(80 / aspectRatio)}px`,
                        borderColor: activeHistoryId === item.id ? 'var(--brand-400)' : 'transparent',
                        ringColor: 'var(--brand-400)',
                      }}
                    >
                      <img src={`data:image/jpeg;base64,${item.imageData}`} alt={item.styleName} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 text-[8px] font-medium text-white text-center py-0.5"
                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                      >
                        {item.styleName}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Section: React.FC<{ label: string; right?: React.ReactNode; children: React.ReactNode }> = ({ label, right, children }) => (
  <div>
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      {right}
    </div>
    {children}
  </div>
);

export default ThumbnailGenerator;
