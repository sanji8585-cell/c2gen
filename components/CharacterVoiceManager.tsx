import React, { useState, useEffect } from 'react';
import { CharacterVoice } from '../types';

const STORAGE_KEY = 'tubegen_character_voices';

const PRESET_VOICES: { label: string; voices: Omit<CharacterVoice, 'voiceId'>[] }[] = [
  {
    label: '남녀 대화',
    voices: [
      { name: '남자', color: '#4A90D9', gender: 'male' },
      { name: '여자', color: '#E85D75', gender: 'female' },
    ],
  },
  {
    label: '뉴스 앵커+리포터',
    voices: [
      { name: '앵커', color: '#7B8794', gender: 'male' },
      { name: '리포터', color: '#E85D75', gender: 'female' },
    ],
  },
  {
    label: '나레이터+인터뷰이',
    voices: [
      { name: '나레이터', color: '#7B8794', gender: 'male' },
      { name: '인터뷰이', color: '#4A90D9', gender: 'male' },
    ],
  },
];

const DEFAULT_COLORS = ['#4A90D9', '#E85D75', '#50C878', '#FFB347', '#7B68EE'];

interface CharacterVoiceManagerProps {
  compact?: boolean; // true: 고급 대본 탭 내 인라인 표시
}

const CharacterVoiceManager: React.FC<CharacterVoiceManagerProps> = ({ compact = true }) => {
  const [voices, setVoices] = useState<CharacterVoice[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(voices));
  }, [voices]);

  const addVoice = () => {
    const newVoice: CharacterVoice = {
      name: `화자${voices.length + 1}`,
      voiceId: '',
      color: DEFAULT_COLORS[voices.length % DEFAULT_COLORS.length],
      gender: voices.length % 2 === 0 ? 'male' : 'female',
    };
    setVoices([...voices, newVoice]);
  };

  const removeVoice = (idx: number) => {
    setVoices(voices.filter((_, i) => i !== idx));
  };

  const updateVoice = (idx: number, field: keyof CharacterVoice, value: string) => {
    setVoices(voices.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const applyPreset = (preset: typeof PRESET_VOICES[0]) => {
    setVoices(preset.voices.map(v => ({ ...v, voiceId: '' })));
  };

  if (compact && !isExpanded && voices.length === 0) {
    return (
      <div style={{ marginBottom: 8 }}>
        <button type="button" onClick={() => setIsExpanded(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          border: '1px dashed var(--border-default)',
          background: 'transparent', color: 'var(--text-secondary)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
          transition: 'all 0.2s',
        }}>
          🎙️ 화자 설정 (다중 음성)
        </button>
      </div>
    );
  }

  return (
    <div style={{
      marginBottom: 12, padding: 12, borderRadius: 10,
      border: '1px solid var(--border-default)',
      background: 'var(--bg-elevated)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>🎙️ 화자 설정</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {/* Presets */}
          {PRESET_VOICES.map(p => (
            <button key={p.label} type="button" onClick={() => applyPreset(p)} style={{
              padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)',
              fontSize: 10, cursor: 'pointer',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Voice list */}
      {voices.map((voice, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {/* Color dot */}
          <input type="color" value={voice.color} onChange={e => updateVoice(idx, 'color', e.target.value)}
            style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
          {/* Name */}
          <input type="text" value={voice.name} onChange={e => updateVoice(idx, 'name', e.target.value)}
            placeholder="이름" style={{
              flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
            }} />
          {/* Voice ID */}
          <input type="text" value={voice.voiceId} onChange={e => updateVoice(idx, 'voiceId', e.target.value)}
            placeholder="Voice ID (ElevenLabs)" style={{
              flex: 2, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
              fontFamily: 'monospace',
            }} />
          {/* Gender toggle */}
          <button type="button" onClick={() => updateVoice(idx, 'gender', voice.gender === 'male' ? 'female' : 'male')}
            style={{
              padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
            }}>
            {voice.gender === 'male' ? '♂' : '♀'}
          </button>
          {/* Remove */}
          <button type="button" onClick={() => removeVoice(idx)} style={{
            padding: '4px 6px', borderRadius: 4, border: 'none',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
          }}>×</button>
        </div>
      ))}

      {/* Add button */}
      <button type="button" onClick={addVoice} style={{
        width: '100%', padding: '5px', borderRadius: 6,
        border: '1px dashed var(--border-default)',
        background: 'transparent', color: 'var(--text-secondary)',
        fontSize: 11, cursor: 'pointer',
      }}>+ 화자 추가</button>

      {compact && voices.length > 0 && (
        <button type="button" onClick={() => { setVoices([]); setIsExpanded(false); }} style={{
          marginTop: 6, padding: '3px 8px', borderRadius: 4, border: 'none',
          background: 'transparent', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer',
        }}>화자 설정 초기화</button>
      )}
    </div>
  );
};

export default CharacterVoiceManager;
