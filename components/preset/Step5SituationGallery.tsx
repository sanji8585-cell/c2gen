import React, { useState } from 'react';
import type { BrandPreset } from '../../types';

function base64ToBlobUrl(dataUrl: string): string {
  try {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mime }));
  } catch { return dataUrl; }
}

interface Step5Props {
  data: Partial<BrandPreset>;
  onUpdate: (data: Partial<BrandPreset>) => void;
  presetId: string;
}

async function generateSituationGallery(
  artStylePrompt: string,
  scenarios: string[],
  presetId?: string
): Promise<Array<{ scenario: string; image_data: string | null }>> {
  const token = localStorage.getItem('c2gen_session_token') || '';
  const res = await fetch('/api/brand-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'situation-gallery',
      token,
      art_style_prompt: artStylePrompt || 'Warm illustration style',
      scenarios,
      preset_id: presetId,
    }),
  });
  if (!res.ok) throw new Error('Situation gallery generation failed');
  const data = await res.json();
  return data.gallery || [];
}

async function generateSingleSituation(
  artStylePrompt: string,
  scenarioLabel: string
): Promise<string | null> {
  const token = localStorage.getItem('c2gen_session_token') || '';
  const res = await fetch('/api/brand-preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'situation-gallery',
      token,
      art_style_prompt: artStylePrompt || 'Warm illustration style',
      scenarios: [scenarioLabel],
    }),
  });
  if (!res.ok) throw new Error('Situation generation failed');
  const data = await res.json();
  return data.gallery?.[0]?.image_data || null;
}

const SCENARIOS = [
  { id: 'indoor', label: '캐릭터가 실내에서 쉬는 장면', icon: '🏠' },
  { id: 'outdoor', label: '캐릭터가 야외에서 활동하는 장면', icon: '🌳' },
  { id: 'closeup', label: '클로즈업 감정 표현 (웃음/놀람)', icon: '😊' },
  { id: 'group', label: '여러 캐릭터가 함께 있는 장면', icon: '👥' },
  { id: 'food', label: '캐릭터가 음식을 먹는 장면', icon: '🍽️' },
  { id: 'adventure', label: '캐릭터가 모험하는 장면', icon: '⚔️' },
] as const;

type ScenarioState = Record<string, { generating: boolean; done: boolean; imageData?: string }>;

export default function Step5SituationGallery({ data, onUpdate, presetId }: Step5Props) {
  // Load saved gallery images from art_style.situation_gallery
  const savedGallery: Array<{ scenario: string; image_data: string | null }> =
    (data.art_style as any)?.situation_gallery || [];

  const initStates: ScenarioState = {};
  SCENARIOS.forEach((s, i) => {
    const saved = savedGallery[i];
    if (saved?.image_data && saved.image_data !== '[saved]') {
      initStates[s.id] = {
        generating: false,
        done: true,
        imageData: saved.image_data.startsWith('data:') ? base64ToBlobUrl(saved.image_data) : saved.image_data,
      };
    } else {
      initStates[s.id] = { generating: false, done: false };
    }
  });

  const [scenarioStates, setScenarioStates] = useState<ScenarioState>(initStates);
  const [allGenerating, setAllGenerating] = useState(false);
  const [confirmed, setConfirmed] = useState(!!(data.art_style as any)?.gallery_confirmed);
  const [error, setError] = useState<string | null>(null);

  const styleName = data.art_style?.style_id || '선택된 스타일 없음';

  const handleGenerate = async (id: string) => {
    const scenario = SCENARIOS.find((s) => s.id === id);
    if (!scenario) return;
    setScenarioStates((prev) => ({ ...prev, [id]: { generating: true, done: false } }));
    try {
      const artPrompt = data.art_style?.custom_prompt || '';
      const rawImage = await generateSingleSituation(artPrompt, scenario.label);
      const imageData = rawImage?.startsWith('data:') ? base64ToBlobUrl(rawImage) : rawImage;
      setScenarioStates((prev) => ({ ...prev, [id]: { generating: false, done: true, imageData } }));
    } catch {
      setScenarioStates((prev) => ({ ...prev, [id]: { generating: false, done: false } }));
    }
  };

  const handleGenerateAll = async () => {
    setAllGenerating(true);
    setError(null);
    const newStates: ScenarioState = {};
    SCENARIOS.forEach((s) => {
      newStates[s.id] = { generating: true, done: false };
    });
    setScenarioStates(newStates);

    try {
      const artPrompt = data.art_style?.custom_prompt || '';
      const galleryResult = await generateSituationGallery(
        artPrompt,
        SCENARIOS.map((s) => s.label),
        presetId
      );
      const doneStates: ScenarioState = {};
      SCENARIOS.forEach((s, i) => {
        const img = galleryResult[i]?.image_data || null;
        doneStates[s.id] = {
          generating: false,
          done: true,
          imageData: img?.startsWith('data:') ? base64ToBlobUrl(img) : (img || undefined),
        };
      });
      setScenarioStates(doneStates);
    } catch {
      setError('갤러리 생성에 실패했습니다. 다시 시도해주세요.');
      const resetStates: ScenarioState = {};
      SCENARIOS.forEach((s) => {
        resetStates[s.id] = { generating: false, done: false };
      });
      setScenarioStates(resetStates);
    } finally {
      setAllGenerating(false);
    }
  };

  const handleConfirm = () => {
    setConfirmed(true);
    // Gallery images are already saved to DB by the API during generation.
    // This button just marks user confirmation in the art_style JSONB.
    const currentArtStyle = data.art_style || {};
    onUpdate({
      art_style: { ...currentArtStyle, gallery_confirmed: true },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          상황별 갤러리
        </h2>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          다양한 상황에서 선택한 스타일({styleName})이 어떻게 보이는지 확인하세요.
        </p>
      </div>

      {/* Generate All */}
      <button
        onClick={handleGenerateAll}
        disabled={allGenerating}
        className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #0891b2, #2563eb)' }}
      >
        {allGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            전체 생성 중...
          </span>
        ) : (
          '전체 생성 (96 크레딧)'
        )}
      </button>

      {error && (
        <p className="text-[12px] text-center" style={{ color: '#f87171' }}>{error}</p>
      )}

      {/* Scenario Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {SCENARIOS.map((scenario) => {
          const state = scenarioStates[scenario.id];
          return (
            <div
              key={scenario.id}
              className="rounded-xl overflow-hidden transition-all hover:shadow-lg"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Image area */}
              <div
                className="relative w-full flex items-center justify-center"
                style={{ aspectRatio: '16/10', background: 'var(--bg-base)' }}
              >
                {state?.generating ? (
                  <div
                    className="absolute inset-0 animate-pulse"
                    style={{
                      background:
                        'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%)',
                      backgroundSize: '200% 100%',
                    }}
                  />
                ) : state?.done && state.imageData ? (
                  <img
                    src={state.imageData}
                    alt={scenario.label}
                    className="w-full h-full object-cover"
                  />
                ) : state?.done ? (
                  <div className="flex flex-col items-center gap-1 px-3">
                    <span className="text-2xl">{scenario.icon}</span>
                    <p className="text-[12px] text-center" style={{ color: 'var(--text-muted)' }}>
                      이미지 생성 실패
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-3xl opacity-30">{scenario.icon}</span>
                    <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      미리보기 없음
                    </p>
                  </div>
                )}
              </div>

              {/* Description + button */}
              <div className="p-3 flex flex-col gap-2">
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {scenario.label}
                </p>
                <button
                  onClick={() => handleGenerate(scenario.id)}
                  disabled={state?.generating || allGenerating}
                  className="w-full py-1.5 rounded-md text-[12px] font-medium transition-all hover:opacity-80 disabled:opacity-40"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {state?.generating ? '생성 중...' : '생성'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        disabled={confirmed}
        className="w-full py-3 rounded-xl font-bold text-sm transition-all"
        style={{
          background: confirmed
            ? 'var(--bg-surface)'
            : 'linear-gradient(135deg, #0891b2, #2563eb)',
          color: confirmed ? 'var(--text-muted)' : '#fff',
          border: confirmed ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        {confirmed ? '확인 완료' : '이 느낌이 맞아요'}
      </button>
    </div>
  );
}
