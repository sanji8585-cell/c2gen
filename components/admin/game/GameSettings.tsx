import React, { useState, useEffect, useCallback } from 'react';
import { gameFetch } from '../adminUtils';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

interface LevelConfig {
  level: number;
  xpThreshold: number;
  title: string;
  emoji: string;
  color: string;
  rewards: {
    credits: number;
    xp_multiplier: number;
    gacha_tickets: number;
  };
}

interface XpRates {
  script: number;
  image_per: number;
  audio_per: number;
  video_per: number;
  daily_bonus: number;
  streak_multiplier: number;
  combo_multiplier: number;
  max_combo_multiplier: number;
}

interface GachaSettings {
  pull_interval: number;
  rarity_rates: {
    common: number;
    uncommon: number;
    rare: number;
    epic: number;
    legendary: number;
  };
  pity: {
    epic_threshold: number;
    legendary_threshold: number;
  };
}

interface PrestigeSettings {
  enabled: boolean;
  multiplier_per_prestige: number;
  max_prestige: number;
}

interface GameConfig {
  levels: LevelConfig[];
  xp_rates: XpRates;
  gacha: GachaSettings;
  prestige: PrestigeSettings;
}

const DEFAULT_CONFIG: GameConfig = {
  levels: [
    { level: 1, xpThreshold: 0, title: '초보 크리에이터', emoji: '\uD83C\uDF31', color: '#94a3b8', rewards: { credits: 0, xp_multiplier: 1.0, gacha_tickets: 0 } },
    { level: 2, xpThreshold: 100, title: '견습 크리에이터', emoji: '\uD83C\uDF3F', color: '#4ade80', rewards: { credits: 10, xp_multiplier: 1.0, gacha_tickets: 1 } },
    { level: 3, xpThreshold: 300, title: '숙련 크리에이터', emoji: '\uD83C\uDF3E', color: '#22d3ee', rewards: { credits: 20, xp_multiplier: 1.1, gacha_tickets: 2 } },
  ],
  xp_rates: {
    script: 50, image_per: 10, audio_per: 15, video_per: 25,
    daily_bonus: 20, streak_multiplier: 0.1, combo_multiplier: 0.05, max_combo_multiplier: 2.0,
  },
  gacha: {
    pull_interval: 3600,
    rarity_rates: { common: 50, uncommon: 25, rare: 15, epic: 8, legendary: 2 },
    pity: { epic_threshold: 20, legendary_threshold: 50 },
  },
  prestige: { enabled: false, multiplier_per_prestige: 0.1, max_prestige: 10 },
};

const RARITY_LABELS: Record<string, string> = {
  common: '일반', uncommon: '비일반', rare: '레어', epic: '에픽', legendary: '전설',
};

const RARITY_COLORS: Record<string, string> = {
  common: '#94a3b8', uncommon: '#4ade80', rare: '#38bdf8', epic: '#a855f7', legendary: '#f59e0b',
};

const XP_RATE_LABELS: Record<string, string> = {
  script: '스크립트 생성', image_per: '이미지당', audio_per: '오디오당', video_per: '영상당',
  daily_bonus: '일일 보너스', streak_multiplier: '연속 보너스 배율', combo_multiplier: '콤보 배율', max_combo_multiplier: '최대 콤보 배율',
};

const GameSettings: React.FC<Props> = ({ adminToken, onToast }) => {
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // DB의 levels 객체(병렬 배열)를 LevelConfig[]로 변환
  const parseLevelsFromDB = (raw: any): LevelConfig[] => {
    if (Array.isArray(raw)) return raw; // 이미 배열이면 그대로
    if (raw && Array.isArray(raw.thresholds)) {
      return raw.thresholds.map((t: number, i: number) => ({
        level: i + 1,
        xpThreshold: t,
        title: raw.titles?.[i] || `레벨 ${i + 1}`,
        emoji: raw.emojis?.[i] || '⭐',
        color: raw.colors?.[i] || '#94a3b8',
        rewards: raw.rewards?.[i] || { credits: 0, xp_multiplier: 1.0, gacha_tickets: 0 },
      }));
    }
    return DEFAULT_CONFIG.levels;
  };

  // LevelConfig[]를 DB 형식(병렬 배열 객체)으로 변환
  const levelsToDBFormat = (levels: LevelConfig[]) => ({
    thresholds: levels.map(l => l.xpThreshold),
    titles: levels.map(l => l.title),
    emojis: levels.map(l => l.emoji),
    colors: levels.map(l => l.color),
    rewards: levels.map(l => l.rewards),
  });

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { ok, data } = await gameFetch({ action: 'game-getConfig', adminToken });
      if (ok && data.config) {
        const gachaRaw = data.config.gachaSettings || data.config.gacha_settings || {};
        const prestigeRaw = data.config.prestigeSettings || data.config.prestige_settings || {};
        const xpRaw = data.config.xpRates || data.config.xp_rates || {};
        setConfig({
          levels: parseLevelsFromDB(data.config.levels),
          xp_rates: { ...DEFAULT_CONFIG.xp_rates, ...xpRaw },
          gacha: {
            pull_interval: gachaRaw.pull_interval ?? DEFAULT_CONFIG.gacha.pull_interval,
            rarity_rates: { ...DEFAULT_CONFIG.gacha.rarity_rates, ...(gachaRaw.rarity_rates || {}) },
            pity: { ...DEFAULT_CONFIG.gacha.pity, ...(gachaRaw.pity || {}) },
          },
          prestige: { ...DEFAULT_CONFIG.prestige, ...prestigeRaw },
        });
      }
    } catch {
      onToast('error', '게임 설정을 불러올 수 없습니다.');
    }
    setLoading(false);
  }, [adminToken, onToast]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const saveSection = useCallback(async (key: string, value: any) => {
    setSaving(key);
    try {
      const { ok, data } = await gameFetch({ action: 'game-updateConfig', adminToken, key, value });
      if (ok) {
        onToast('success', data.message || '저장되었습니다.');
      } else {
        onToast('error', data.message || '저장에 실패했습니다.');
      }
    } catch {
      onToast('error', '서버 연결에 실패했습니다.');
    }
    setSaving(null);
  }, [adminToken, onToast]);

  // ── 레벨 설정 핸들러 ──
  const updateLevel = (idx: number, field: string, value: any) => {
    setConfig(prev => {
      const levels = [...prev.levels];
      if (field.startsWith('rewards.')) {
        const rField = field.split('.')[1];
        levels[idx] = { ...levels[idx], rewards: { ...levels[idx].rewards, [rField]: value } };
      } else {
        levels[idx] = { ...levels[idx], [field]: value };
      }
      return { ...prev, levels };
    });
  };

  const addLevel = () => {
    setConfig(prev => {
      const last = prev.levels[prev.levels.length - 1];
      return {
        ...prev,
        levels: [...prev.levels, {
          level: (last?.level || 0) + 1,
          xpThreshold: (last?.xpThreshold || 0) + 500,
          title: '새 레벨',
          emoji: '\u2B50',
          color: '#94a3b8',
          rewards: { credits: 0, xp_multiplier: 1.0, gacha_tickets: 0 },
        }],
      };
    });
  };

  const removeLevel = (idx: number) => {
    if (config.levels.length <= 1) return;
    setConfig(prev => ({ ...prev, levels: prev.levels.filter((_, i) => i !== idx) }));
  };

  // ── XP 비율 핸들러 ──
  const updateXpRate = (key: string, value: number) => {
    setConfig(prev => ({ ...prev, xp_rates: { ...prev.xp_rates, [key]: value } }));
  };

  // ── 뽑기 핸들러 ──
  const updateGacha = (field: string, value: any) => {
    setConfig(prev => {
      if (field === 'pull_interval') return { ...prev, gacha: { ...prev.gacha, pull_interval: value } };
      if (field.startsWith('rarity_rates.')) {
        const rarity = field.split('.')[1];
        return { ...prev, gacha: { ...prev.gacha, rarity_rates: { ...prev.gacha.rarity_rates, [rarity]: value } } };
      }
      if (field.startsWith('pity.')) {
        const pField = field.split('.')[1];
        return { ...prev, gacha: { ...prev.gacha, pity: { ...prev.gacha.pity, [pField]: value } } };
      }
      return prev;
    });
  };

  const rarityTotal = Object.values(config.gacha.rarity_rates).reduce((a, b) => a + b, 0);

  // ── 프레스티지 핸들러 ──
  const updatePrestige = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, prestige: { ...prev.prestige, [field]: value } }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent animate-spin rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. 레벨 설정 ── */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">레벨 설정</h3>
          <div className="flex gap-2">
            <button onClick={addLevel} className="px-3 py-1.5 bg-green-600/20 border border-green-600/30 rounded-lg text-[11px] text-green-400 hover:bg-green-600/30 transition-all">
              + 레벨 추가
            </button>
            <button onClick={() => saveSection('levels', levelsToDBFormat(config.levels))} disabled={saving === 'levels'} className="px-3 py-1.5 bg-cyan-600/20 border border-cyan-600/30 rounded-lg text-[11px] text-cyan-400 hover:bg-cyan-600/30 transition-all disabled:opacity-50">
              {saving === 'levels' ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-slate-600 sm:hidden mb-1">&larr; 좌우로 스크롤하세요 &rarr;</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 px-2 font-medium">Lv</th>
                <th className="text-left py-2 px-2 font-medium">XP 기준</th>
                <th className="text-left py-2 px-2 font-medium">칭호</th>
                <th className="text-left py-2 px-2 font-medium">이모지</th>
                <th className="text-left py-2 px-2 font-medium">색상</th>
                <th className="text-left py-2 px-2 font-medium">크레딧</th>
                <th className="text-left py-2 px-2 font-medium">XP 배율</th>
                <th className="text-left py-2 px-2 font-medium">뽑기권</th>
                <th className="text-left py-2 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {config.levels.map((lv, idx) => (
                <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-1.5 px-2">
                    <span className="text-slate-300 font-mono">{lv.level}</span>
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="number" value={lv.xpThreshold} onChange={e => updateLevel(idx, 'xpThreshold', parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 bg-slate-800/60 border border-slate-700/50 rounded text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500/50" />
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="text" value={lv.title} onChange={e => updateLevel(idx, 'title', e.target.value)}
                      className="w-32 px-2 py-1 bg-slate-800/60 border border-slate-700/50 rounded text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500/50" />
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="text" value={lv.emoji} onChange={e => updateLevel(idx, 'emoji', e.target.value)}
                      className="w-12 px-2 py-1 bg-slate-800/60 border border-slate-700/50 rounded text-slate-200 text-[11px] text-center focus:outline-none focus:border-cyan-500/50" />
                  </td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1">
                      <input type="color" value={lv.color} onChange={e => updateLevel(idx, 'color', e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-slate-700/50 bg-transparent" />
                      <span className="text-slate-500 text-[10px]">{lv.color}</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="number" value={lv.rewards.credits} onChange={e => updateLevel(idx, 'rewards.credits', parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 bg-slate-800/60 border border-slate-700/50 rounded text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500/50" />
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="number" step="0.1" value={lv.rewards.xp_multiplier} onChange={e => updateLevel(idx, 'rewards.xp_multiplier', parseFloat(e.target.value) || 1)}
                      className="w-16 px-2 py-1 bg-slate-800/60 border border-slate-700/50 rounded text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500/50" />
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="number" value={lv.rewards.gacha_tickets} onChange={e => updateLevel(idx, 'rewards.gacha_tickets', parseInt(e.target.value) || 0)}
                      className="w-14 px-2 py-1 bg-slate-800/60 border border-slate-700/50 rounded text-slate-200 text-[11px] focus:outline-none focus:border-cyan-500/50" />
                  </td>
                  <td className="py-1.5 px-2">
                    <button onClick={() => removeLevel(idx)} disabled={config.levels.length <= 1}
                      className="text-red-400/60 hover:text-red-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-[11px]">
                      X
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">총 {config.levels.length}개 레벨</p>
      </section>

      {/* ── 2. XP 비율 ── */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">XP 비율</h3>
          <button onClick={() => saveSection('xp_rates', config.xp_rates)} disabled={saving === 'xp_rates'} className="px-3 py-1.5 bg-cyan-600/20 border border-cyan-600/30 rounded-lg text-[11px] text-cyan-400 hover:bg-cyan-600/30 transition-all disabled:opacity-50">
            {saving === 'xp_rates' ? '저장 중...' : '저장'}
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(config.xp_rates).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <label className="text-[10px] text-slate-500 block">{XP_RATE_LABELS[key] || key}</label>
              <input type="number" step={key.includes('multiplier') ? '0.05' : '1'} value={value}
                onChange={e => updateXpRate(key, parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. 뽑기 설정 ── */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">뽑기 설정</h3>
          <button onClick={() => saveSection('gacha_settings', config.gacha)} disabled={saving === 'gacha_settings'} className="px-3 py-1.5 bg-cyan-600/20 border border-cyan-600/30 rounded-lg text-[11px] text-cyan-400 hover:bg-cyan-600/30 transition-all disabled:opacity-50">
            {saving === 'gacha_settings' ? '저장 중...' : '저장'}
          </button>
        </div>

        {/* 뽑기 간격 */}
        <div className="mb-4">
          <label className="text-[10px] text-slate-500 block mb-1">뽑기 간격 (초)</label>
          <input type="number" value={config.gacha.pull_interval}
            onChange={e => updateGacha('pull_interval', parseInt(e.target.value) || 0)}
            className="w-40 px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
          <span className="text-[10px] text-slate-600 ml-2">({Math.floor(config.gacha.pull_interval / 3600)}시간 {Math.floor((config.gacha.pull_interval % 3600) / 60)}분)</span>
        </div>

        {/* 등급별 확률 */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-slate-400">등급별 확률</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
              Math.abs(rarityTotal - 100) < 0.01 ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}>
              합계: {rarityTotal.toFixed(1)}%
            </span>
          </div>
          <div className="space-y-2">
            {Object.entries(config.gacha.rarity_rates).map(([rarity, rate]) => (
              <div key={rarity} className="flex items-center gap-3">
                <span className="text-[11px] w-16 text-right" style={{ color: RARITY_COLORS[rarity] }}>
                  {RARITY_LABELS[rarity]}
                </span>
                <input type="range" min="0" max="100" step="0.5" value={rate}
                  onChange={e => updateGacha(`rarity_rates.${rarity}`, parseFloat(e.target.value))}
                  className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: RARITY_COLORS[rarity] }} />
                <input type="number" step="0.5" value={rate}
                  onChange={e => updateGacha(`rarity_rates.${rarity}`, parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 bg-slate-800/60 border border-slate-700/50 rounded text-slate-200 text-[11px] text-right focus:outline-none focus:border-cyan-500/50" />
                <span className="text-[10px] text-slate-600">%</span>
              </div>
            ))}
          </div>
        </div>

        {/* 천장(피티) */}
        <div>
          <span className="text-[11px] text-slate-400 block mb-2">천장 (피티)</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500">에픽 천장 (회)</label>
              <input type="number" value={config.gacha.pity.epic_threshold}
                onChange={e => updateGacha('pity.epic_threshold', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500">전설 천장 (회)</label>
              <input type="number" value={config.gacha.pity.legendary_threshold}
                onChange={e => updateGacha('pity.legendary_threshold', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. 프레스티지 ── */}
      <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200">프레스티지</h3>
          <button onClick={() => saveSection('prestige_settings', config.prestige)} disabled={saving === 'prestige_settings'} className="px-3 py-1.5 bg-cyan-600/20 border border-cyan-600/30 rounded-lg text-[11px] text-cyan-400 hover:bg-cyan-600/30 transition-all disabled:opacity-50">
            {saving === 'prestige_settings' ? '저장 중...' : '저장'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">활성화</label>
            <button onClick={() => updatePrestige('enabled', !config.prestige.enabled)}
              className={`px-4 py-2 rounded-lg text-[11px] border transition-all ${
                config.prestige.enabled
                  ? 'bg-green-600/20 text-green-400 border-green-600/30'
                  : 'bg-slate-800/60 text-slate-500 border-slate-700/50'
              }`}>
              {config.prestige.enabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">프레스티지당 배율</label>
            <input type="number" step="0.05" value={config.prestige.multiplier_per_prestige}
              onChange={e => updatePrestige('multiplier_per_prestige', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 block">최대 프레스티지</label>
            <input type="number" value={config.prestige.max_prestige}
              onChange={e => updatePrestige('max_prestige', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
          </div>
        </div>
      </section>
    </div>
  );
};

export default GameSettings;
