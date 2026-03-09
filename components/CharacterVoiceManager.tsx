import React, { useState, useEffect, useRef } from 'react';
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

interface FavoriteVoice {
  voice_id: string;
  voice_name: string;
  voice_meta?: any;
}

interface CharacterVoiceManagerProps {
  compact?: boolean;
}

const CharacterVoiceManager: React.FC<CharacterVoiceManagerProps> = ({ compact = true }) => {
  const [voices, setVoices] = useState<CharacterVoice[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [favoriteVoices, setFavoriteVoices] = useState<FavoriteVoice[]>([]);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(voices));
  }, [voices]);

  // 즐겨찾기 음성 로드
  useEffect(() => {
    const token = localStorage.getItem('c2gen_session_token');
    if (!token) return;
    fetch('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'favorite-voice-list', token }),
    })
      .then(r => r.json())
      .then(d => { if (d.favorites) setFavoriteVoices(d.favorites); })
      .catch(() => {});
  }, []);

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (openDropdown === null) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openDropdown]);

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
    if (openDropdown === idx) setOpenDropdown(null);
  };

  const updateVoice = (idx: number, field: keyof CharacterVoice, value: string) => {
    setVoices(voices.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const selectFavoriteVoice = (idx: number, fav: FavoriteVoice) => {
    setVoices(voices.map((v, i) => i === idx ? { ...v, voiceId: fav.voice_id } : v));
    setOpenDropdown(null);
  };

  const applyPreset = (preset: typeof PRESET_VOICES[0]) => {
    setVoices(preset.voices.map(v => ({ ...v, voiceId: '' })));
  };

  // 빈 Voice ID 경고 체크
  const hasEmptyVoiceId = voices.some(v => !v.voiceId);

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
          {/* Color */}
          <input type="color" value={voice.color} onChange={e => updateVoice(idx, 'color', e.target.value)}
            style={{ width: 24, height: 24, border: 'none', borderRadius: 4, cursor: 'pointer', padding: 0 }} />
          {/* Name */}
          <input type="text" value={voice.name} onChange={e => updateVoice(idx, 'name', e.target.value)}
            placeholder="이름" style={{
              flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-default)',
              background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, outline: 'none',
            }} />
          {/* Voice selector — 즐겨찾기 드롭다운 or 직접 입력 */}
          <div style={{ flex: 2, position: 'relative' }} ref={openDropdown === idx ? dropdownRef : undefined}>
            <div style={{ display: 'flex', gap: 2 }}>
              <button type="button" onClick={() => setOpenDropdown(openDropdown === idx ? null : idx)}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${voice.voiceId ? 'var(--border-default)' : 'rgba(245,158,11,0.4)'}`,
                  background: 'var(--bg-surface)', color: voice.voiceId ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 11, textAlign: 'left', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                {voice.voiceId
                  ? (favoriteVoices.find(f => f.voice_id === voice.voiceId)?.voice_name || voice.voiceId.slice(0, 12) + '...')
                  : '음성 선택 ▾'}
              </button>
              {voice.voiceId && (
                <button type="button" onClick={() => updateVoice(idx, 'voiceId', '')} style={{
                  padding: '4px 6px', borderRadius: 4, border: 'none',
                  background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                }}>×</button>
              )}
            </div>
            {/* Dropdown */}
            {openDropdown === idx && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                marginTop: 4, borderRadius: 8, border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                maxHeight: 200, overflowY: 'auto',
              }}>
                {favoriteVoices.length > 0 ? (
                  <>
                    <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-default)' }}>
                      즐겨찾기 음성
                    </div>
                    {favoriteVoices.map(fav => (
                      <button key={fav.voice_id} type="button"
                        onClick={() => selectFavoriteVoice(idx, fav)}
                        style={{
                          width: '100%', padding: '7px 10px', border: 'none', textAlign: 'left',
                          background: voice.voiceId === fav.voice_id ? 'rgba(96,165,250,0.1)' : 'transparent',
                          color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                        <span>{fav.voice_name}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fav.voice_id.slice(0, 8)}...</span>
                      </button>
                    ))}
                  </>
                ) : (
                  <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                    즐겨찾기 음성이 없습니다<br/>
                    <span style={{ fontSize: 10 }}>사운드 설정 {'>'} 나레이션 {'>'} 즐겨찾기 탭에서 음성을 추가하면 여기서 선택할수 있어요</span>
                  </div>
                )}
                {/* 직접 입력 구분선 */}
                <div style={{ borderTop: '1px solid var(--border-default)', padding: '6px 10px' }}>
                  <input type="text" value={voice.voiceId} placeholder="직접 Voice ID 입력..."
                    onChange={e => updateVoice(idx, 'voiceId', e.target.value)}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border-default)',
                      background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 10, outline: 'none',
                      fontFamily: 'monospace', boxSizing: 'border-box',
                    }} />
                </div>
              </div>
            )}
          </div>
          {/* Gender */}
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

      {/* Voice ID 미설정 경고 */}
      {hasEmptyVoiceId && voices.length > 0 && (
        <div style={{
          padding: '6px 10px', marginBottom: 6, borderRadius: 6,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          fontSize: 10, color: '#f59e0b', lineHeight: 1.5,
        }}>
          ⚠️ 음성이 선택되지 않은 화자는 기본 음성으로 생성됩니다.
          {favoriteVoices.length === 0 && (
            <span style={{ display: 'block', marginTop: 2, color: 'var(--text-muted)' }}>
              사운드 설정 &gt; 나레이션 &gt; 즐겨찾기 탭에서 음성을 추가하면 여기서 선택할수 있어요
            </span>
          )}
        </div>
      )}

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
