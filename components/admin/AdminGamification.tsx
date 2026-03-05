import React, { useState } from 'react';
import GameSettings from './game/GameSettings';
import AchievementManager from './game/AchievementManager';
import QuestManager from './game/QuestManager';
import GachaManager from './game/GachaManager';
import EventManager from './game/EventManager';
import UserGameData from './game/UserGameData';
import BulkActions from './game/BulkActions';

type SubTab = 'settings' | 'achievements' | 'quests' | 'gacha' | 'events' | 'userData' | 'bulk';

interface Props {
  adminToken: string;
  onToast: (type: 'success' | 'error', message: string) => void;
}

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'settings', label: '게임 설정', icon: '\u2699\uFE0F' },
  { id: 'achievements', label: '업적 관리', icon: '\uD83C\uDFC6' },
  { id: 'quests', label: '퀘스트 관리', icon: '\uD83D\uDCCB' },
  { id: 'gacha', label: '뽑기 관리', icon: '\uD83C\uDFB0' },
  { id: 'events', label: '이벤트 관리', icon: '\uD83C\uDF89' },
  { id: 'userData', label: '유저 게임 데이터', icon: '\uD83D\uDC64' },
  { id: 'bulk', label: '일괄 작업', icon: '\uD83D\uDCE6' },
];

const AdminGamification: React.FC<Props> = ({ adminToken, onToast }) => {
  const [activeTab, setActiveTab] = useState<SubTab>('settings');

  return (
    <div className="space-y-4">
      {/* 서브 탭 네비게이션 */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-900/80 border border-slate-800 rounded-xl">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 서브 탭 콘텐츠 */}
      {activeTab === 'settings' && <GameSettings adminToken={adminToken} onToast={onToast} />}
      {activeTab === 'achievements' && <AchievementManager adminToken={adminToken} onToast={onToast} />}
      {activeTab === 'quests' && <QuestManager adminToken={adminToken} onToast={onToast} />}
      {activeTab === 'gacha' && <GachaManager adminToken={adminToken} onToast={onToast} />}
      {activeTab === 'events' && <EventManager adminToken={adminToken} onToast={onToast} />}
      {activeTab === 'userData' && <UserGameData adminToken={adminToken} onToast={onToast} />}
      {activeTab === 'bulk' && <BulkActions adminToken={adminToken} onToast={onToast} />}
    </div>
  );
};

export default AdminGamification;
