import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BrandPreset, PresetWizardStep, PresetWizardData } from '../../types';
import { createPreset, updatePreset, getPreset } from '../../services/brandPresetService';
import Step1BasicInfo from './Step1BasicInfo';
import Step2ToneVoice from './Step2ToneVoice';
import Step3Characters from './Step3Characters';
import Step4ArtStyle from './Step4ArtStyle';
import Step5SituationGallery from './Step5SituationGallery';
import Step6BgmPreferences from './Step6BgmPreferences';

interface PresetWizardProps {
  onClose: () => void;
  onComplete: (preset: BrandPreset) => void;
  editPreset?: BrandPreset;
  channelId?: string;
}

const STEP_LABELS = ['기본 정보', '톤앤보이스', '캐릭터', '화풍', '갤러리', 'BGM'] as const;

const initialWizardData: PresetWizardData = {
  currentStep: 1,
  name: '',
  description: '',
  tone_voice: { style: '', formality: 0.5, humor_level: 0.3 },
  character_profiles: [],
  art_style: { custom_prompt: '' },
  bgm_preferences: { genre: '', mood: 'calm', tempo_range: { min: 80, max: 120 } },
};

export default function PresetWizard({ onClose, onComplete, editPreset, channelId }: PresetWizardProps) {
  const [currentStep, setCurrentStep] = useState<PresetWizardStep>(
    editPreset?.wizard_step ? Math.min(editPreset.wizard_step, 6) as PresetWizardStep : 1
  );
  const [wizardData, setWizardData] = useState<PresetWizardData>(() => {
    if (editPreset) {
      return { ...initialWizardData, ...editPreset, currentStep: (editPreset.wizard_step || 1) as PresetWizardStep };
    }
    return { ...initialWizardData, channel_id: channelId };
  });
  const [presetId, setPresetId] = useState<string | null>(editPreset?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editPreset;

  // Load full preset data from API on edit (prop data may lack character images)
  const loadedRef = useRef(false);
  useEffect(() => {
    if (editPreset?.id && !loadedRef.current) {
      loadedRef.current = true;
      getPreset(editPreset.id).then(fullPreset => {
        if (fullPreset) {
          setWizardData(prev => ({ ...prev, ...fullPreset, currentStep: prev.currentStep }));
        }
      }).catch(() => {});
    }
  }, [editPreset?.id]);

  const handleUpdate = useCallback((partial: Partial<PresetWizardData>) => {
    setWizardData(prev => ({ ...prev, ...partial }));
  }, []);

  const saveCurrentStep = useCallback(async (): Promise<BrandPreset | null> => {
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<BrandPreset> = { ...wizardData, wizard_step: currentStep };
      delete (payload as Record<string, unknown>).currentStep;

      // Strip large base64 data to avoid 413 Content Too Large on Vercel
      // Character images are stored separately via character API
      if (payload.character_profiles) {
        payload.character_profiles = payload.character_profiles.map(cp => ({
          ...cp,
          reference_sheet: {
            ...cp.reference_sheet,
            original_upload: undefined,
            multi_angle: {
              front: cp.reference_sheet?.multi_angle?.front ? '[stored]' : undefined,
              angle_45: cp.reference_sheet?.multi_angle?.angle_45 ? '[stored]' : undefined,
              side: cp.reference_sheet?.multi_angle?.side ? '[stored]' : undefined,
              full_body: cp.reference_sheet?.multi_angle?.full_body ? '[stored]' : undefined,
            },
          },
        }));
      }

      // Strip style preview images (base64)
      if (payload.style_preview_images) {
        payload.style_preview_images = (payload.style_preview_images as string[]).map(img =>
          img.startsWith('data:') ? '[preview_stored]' : img
        );
      }

      if (!presetId) {
        if (channelId) payload.channel_id = channelId;
        const created = await createPreset(payload);
        setPresetId(created.id);
        return created;
      } else {
        const updated = await updatePreset(presetId, payload);
        return updated;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다';
      setError(msg);
      return null;
    } finally {
      setSaving(false);
    }
  }, [wizardData, currentStep, presetId, channelId]);

  const handleNext = useCallback(async () => {
    const saved = await saveCurrentStep();
    if (!saved) return;
    if (currentStep < 6) {
      const next = (currentStep + 1) as PresetWizardStep;
      setCurrentStep(next);
      setWizardData(prev => ({ ...prev, currentStep: next }));
    }
  }, [currentStep, saveCurrentStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 1) {
      const prev = (currentStep - 1) as PresetWizardStep;
      setCurrentStep(prev);
      setWizardData(p => ({ ...p, currentStep: prev }));
    }
  }, [currentStep]);

  const handleComplete = useCallback(async () => {
    const saved = await saveCurrentStep();
    if (saved) onComplete(saved);
  }, [saveCurrentStep, onComplete]);

  const handleSaveAndExit = useCallback(async () => {
    await saveCurrentStep();
    onClose();
  }, [saveCurrentStep, onClose]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const renderStep = () => {
    const stepProps = {
      data: wizardData,
      onUpdate: handleUpdate,
      presetId: presetId ?? '',
    };
    switch (currentStep) {
      case 1: return <Step1BasicInfo {...stepProps} />;
      case 2: return <Step2ToneVoice {...stepProps} />;
      case 3: return <Step3Characters {...stepProps} />;
      case 4: return <Step4ArtStyle {...stepProps} />;
      case 5: return <Step5SituationGallery {...stepProps} />;
      case 6: return <Step6BgmPreferences {...stepProps} />;
      default: return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="relative flex flex-col w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          maxHeight: 'calc(100vh - 48px)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {isEditing ? '브랜드 프리셋 수정' : '브랜드 프리셋 만들기'}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveAndExit}
              disabled={saving}
              className="px-3 py-1.5 text-[12px] rounded-lg transition-colors"
              style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-elevated)',
              }}
            >
              저장 후 나가기
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}
              aria-label="닫기"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div
          className="px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-base)' }}
        >
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            {STEP_LABELS.map((label, idx) => {
              const stepNum = (idx + 1) as PresetWizardStep;
              const isCompleted = stepNum < currentStep;
              const isCurrent = stepNum === currentStep;
              return (
                <React.Fragment key={stepNum}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full text-[12px] font-medium transition-all"
                      style={{
                        background: isCurrent
                          ? 'linear-gradient(135deg, #0891b2, #2563eb)'
                          : isCompleted
                            ? 'linear-gradient(135deg, #0891b2, #2563eb)'
                            : 'var(--bg-elevated)',
                        color: isCurrent || isCompleted ? '#fff' : 'var(--text-muted)',
                        border: !isCurrent && !isCompleted ? '1px solid var(--border-default)' : 'none',
                        boxShadow: isCurrent ? '0 0 12px rgba(8,145,178,0.4)' : 'none',
                      }}
                    >
                      {isCompleted ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3,7 6,10 11,4" />
                        </svg>
                      ) : (
                        stepNum
                      )}
                    </div>
                    <span
                      className="text-[11px] whitespace-nowrap"
                      style={{ color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)' }}
                    >
                      {label}
                    </span>
                  </div>
                  {idx < STEP_LABELS.length - 1 && (
                    <div
                      className="flex-1 h-px mx-2 mt-[-18px]"
                      style={{
                        backgroundColor: stepNum < currentStep
                          ? '#0891b2'
                          : 'var(--border-default)',
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="mx-6 mt-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2"
            style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.5v4a.75.75 0 01-1.5 0v-4a.75.75 0 011.5 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderStep()}
        </div>

        {/* Footer Navigation */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-base)' }}
        >
          <div>
            {currentStep > 1 && (
              <button
                onClick={handlePrev}
                disabled={saving}
                className="px-5 py-2 text-sm rounded-lg transition-colors hover:opacity-80"
                style={{
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-default)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                이전
              </button>
            )}
          </div>
          <div>
            {currentStep < 6 ? (
              <button
                onClick={handleNext}
                disabled={saving}
                className="px-5 py-2 text-sm font-medium rounded-lg text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                  boxShadow: '0 2px 8px rgba(8,145,178,0.3)',
                }}
              >
                {saving ? '저장 중...' : '다음'}
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="px-5 py-2 text-sm font-medium rounded-lg text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                  boxShadow: '0 2px 8px rgba(8,145,178,0.3)',
                }}
              >
                {saving ? '저장 중...' : '완료'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
