
import React, { useState, useCallback, useRef, useEffect } from 'react';
import AdminDashboard from './components/admin/AdminDashboard';
import AuthGate from './components/AuthGate';
import AuthModal from './components/AuthModal';
import Header from './components/Header';
import InputSection from './components/InputSection';
import ResultTable from './components/ResultTable';
import { GeneratedAsset, GenerationStep, ScriptScene, CostBreakdown, ReferenceImages, DEFAULT_REFERENCE_IMAGES, SubtitleConfig } from './types';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useTheme } from './hooks/useTheme';
import { generateScript, generateScriptChunked, findTrendingTopics, generateAudioForScene, generateMotionPrompt, analyzeMood } from './services/geminiService';
import ThumbnailGenerator from './components/ThumbnailGenerator';
import { generateImage, getSelectedImageModel } from './services/imageService';
import { generateAudioWithElevenLabs } from './services/elevenLabsService';
import { generateVideo } from './services/videoService';
import { generateVideoFromImage } from './services/falService';
import { generateAmbientBgm } from './services/bgmGenerator';
// projectService는 useProjectManagement 훅으로 이동
import { useGameState } from './hooks/useGameState';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useProjectManagement } from './hooks/useProjectManagement';
import GameOverlay from './components/GameOverlay';
import DailyQuestPanel from './components/DailyQuestPanel';
import EventBanner from './components/EventBanner';
import AchievementShowcase from './components/AchievementShowcase';
import InventoryModal from './components/InventoryModal';
import LeaderboardWidget from './components/LeaderboardWidget';
// AvatarFrame moved into Header component
import CompletionScreen from './components/CompletionScreen';
import { useTranslation } from 'react-i18next';

import { SavedProject } from './types';
import { CONFIG, PRICING, formatKRW, ResolutionTier, Language, BGM_LIBRARY, LANGUAGE_CONFIG, BgmMood } from './config';
import ProjectGallery from './components/ProjectGallery';
import Playground from './components/Playground';
import CreditShop from './components/CreditShop';
import UserProfile from './components/UserProfile';
import PaymentSuccess from './components/PaymentSuccess';
import * as FileSaver from 'file-saver';

const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
import { AI_PERSONALITY, PRO_TIPS, launchConfetti, getStorytellingPhase, getTimeGreeting, wait } from './constants/uiConstants';

import { GalleryErrorBoundary, GlobalErrorBoundary, setupGlobalErrorReporting } from './components/ErrorBoundaries';
setupGlobalErrorReporting();

type ViewMode = 'main' | 'gallery' | 'playground';

// 인증 래퍼
const App: React.FC = () => {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <AuthProvider>
      <AppRouter isDark={isDark} onToggleTheme={toggleTheme} />
    </AuthProvider>
  );
};

// 라우팅 (관리자/일반 분기)
const AppRouter: React.FC<{ isDark: boolean; onToggleTheme: () => void }> = ({ isDark, onToggleTheme }) => {
  const auth = useAuth();
  const isAdminPath = window.location.pathname === '/admin';

  if (auth.isAdmin && auth.adminToken) {
    return <AdminDashboard adminToken={auth.adminToken} onLogout={auth.handleAdminLogout} />;
  }
  if (isAdminPath) {
    return <AuthGate onSuccess={auth.handleAuthSuccess} onAdminSuccess={auth.handleAdminSuccess} mode="page" initialTab="admin" />;
  }
  return <AppContent isDark={isDark} onToggleTheme={onToggleTheme} />;
};

// 메인 앱 콘텐츠
const AppContent: React.FC<{
  isDark: boolean; onToggleTheme: () => void;
}> = ({ isDark, onToggleTheme }) => {
  const { isAuthenticated, userName, showAuthModal, setShowAuthModal, handleAuthSuccess, handleAdminSuccess, handleLogout, setUserName } = useAuth();
  const { t } = useTranslation();
  const [announcements, setAnnouncements] = useState<{id:string;title:string;content:string;type:string}[]>([]);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('c2gen_dismissed_announcements') || '[]')); } catch { return new Set(); }
  });

  useEffect(() => {
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getActiveAnnouncements' }),
    }).then(r => r.json()).then(d => { if (d.announcements) setAnnouncements(d.announcements); }).catch(() => {});
  }, []);

  const dismissAnnouncement = useCallback((id: string) => {
    setDismissedAnnouncements(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem('c2gen_dismissed_announcements', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const visibleAnnouncements = announcements.filter(a => !dismissedAnnouncements.has(a.id));

  const [step, setStep] = useState<GenerationStep>(GenerationStep.IDLE);
  const [generatedData, setGeneratedData] = useState<GeneratedAsset[]>([]);
  const [progressMessage, setProgressMessage] = useState('');
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  // 참조 이미지 상태 (강도 포함)
  const [currentReferenceImages, setCurrentReferenceImages] = useState<ReferenceImages>(DEFAULT_REFERENCE_IMAGES);
  const [needsKey, setNeedsKey] = useState(false);
  const [animatingIndices, setAnimatingIndices] = useState<Set<number>>(new Set());

  // 갤러리 뷰 관련
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.has('post') ? 'playground' : 'main';
  });
  const projectMgmt = useProjectManagement();
  const [currentTopic, setCurrentTopic] = useState<string>('');

  // 씬 편집 관련
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // 썸네일 모달
  const [showThumbnailGenerator, setShowThumbnailGenerator] = useState(false);

  // BGM 관련
  const [bgmData, setBgmData] = useState<string | null>(null);
  const [bgmVolume, setBgmVolume] = useState(0.25);
  const [bgmDuckingEnabled, setBgmDuckingEnabled] = useState(false);
  const [bgmDuckingAmount, setBgmDuckingAmount] = useState(0.3);

  // 크레딧 시스템
  const [userCredits, setUserCredits] = useState<number>(0);
  const [userPlan, setUserPlan] = useState<string>('free');
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);

  // RPG 게이미피케이션 (v2 — 서버 기반)
  const game = useGameState(isAuthenticated);

  // Fun & Gamification 상태
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [funTip, setFunTip] = useState('');
  const [completionCompliment, setCompletionCompliment] = useState<string | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [sessionCombo, setSessionCombo] = useState(0);
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  const [showIdleParticles] = useState(false); // 유휴 파티클 비활성화
  const generationStartRef = useRef<number>(0);
  const [completionData, setCompletionData] = useState<{
    cost: any; sceneCount: number; xpGained: number; combo: number;
    elapsedSeconds: number; questProgress?: { completed: number; total: number }; gachaTickets?: number;
  } | null>(null);
  // Tip of the Day
  const [showTipOfDay, setShowTipOfDay] = useState(false);
  const [tipOfDay, setTipOfDay] = useState<typeof PRO_TIPS[0] | null>(null);
  // Game Overlay (v2)
  const [overlayLevelUp, setOverlayLevelUp] = useState<{level:number;title:string;emoji:string;color:string;reward?:{credits:number;gacha_tickets:number}}|null>(null);
  const [overlayAchievement, setOverlayAchievement] = useState<{name:string;icon:string;description:string;category:string;rewardXp:number;rewardCredits:number}|null>(null);
  const [overlayGacha, setOverlayGacha] = useState<{item:{name:string;emoji:string;rarity:string;itemType:string};isNew:boolean}|null>(null);
  const [overlayMilestone, setOverlayMilestone] = useState<{emoji:string;title:string;xp:number;credits:number}|null>(null);
  const [consumablePopup, setConsumablePopup] = useState<{type:'credit_voucher'|'xp_booster';credits?:number;multiplier?:number;until?:string}|null>(null);
  // 모달 상태
  const [showAchievements, setShowAchievements] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  // Konami
  const [konamiActive, setKonamiActive] = useState(false);
  const konamiRef = useRef<string[]>([]);
  const avatarLoadedRef = useRef(false);
  const sessionComboRef = useRef(0);
  // 항상 최신 game 상태를 ref로 유지 (stale closure 방지)
  const gameRef = useRef({ isAuthenticated, synced: game.synced, recordAction: game.recordAction, setOverlayAchievement });
  useEffect(() => {
    gameRef.current = { isAuthenticated, synced: game.synced, recordAction: game.recordAction, setOverlayAchievement };
  });
  useEffect(() => { sessionComboRef.current = sessionCombo; }, [sessionCombo]);

  const fetchCredits = useCallback(async () => {
    const token = localStorage.getItem('c2gen_session_token');
    if (!token) return;
    try {
      const r = await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'getCredits', token }),
      });
      const d = await r.json();
      if (d.credits !== undefined) setUserCredits(d.credits);
      if (d.plan) setUserPlan(d.plan);
      // 아바타 URL 로드 (프로필 API)
      if (!avatarLoadedRef.current) {
        fetch('/api/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'getProfile', token }) })
          .then(r => r.json()).then(p => { if (p.avatarUrl) { setUserAvatarUrl(p.avatarUrl); avatarLoadedRef.current = true; } }).catch(() => {});
      }
    } catch { /* ignore */ }
  }, []);

  // 비용 추적
  const [, setCurrentCost] = useState<CostBreakdown | null>(null);
  const costRef = useRef<CostBreakdown>({
    images: 0, tts: 0, videos: 0, total: 0,
    imageCount: 0, ttsCharacters: 0, videoCount: 0
  });

  // Undo/Redo 시스템
  const { pushState: pushUndoState, undo: undoState, redo: redoState, canUndo, canRedo, clear: clearHistory } = useUndoRedo<GeneratedAsset[]>(30, 300);

  const usedTopicsRef = useRef<string[]>([]);
  const assetsRef = useRef<GeneratedAsset[]>([]);
  const isAbortedRef = useRef(false);
  const isProcessingRef = useRef(false);
  const pendingGenContextRef = useRef<{
    targetTopic: string;
    refImgs: ReferenceImages;
    language: Language;
    hasRefImages: boolean;
    sourceText: string | null;
  } | null>(null);

  const checkApiKeyStatus = useCallback(async () => {
    if ((window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      setNeedsKey(!hasKey);
      return hasKey;
    }
    return true;
  }, []);

  useEffect(() => {
    checkApiKeyStatus();
    fetchCredits(); // 크레딧 잔액 로드
    // 클라우드에서 프로젝트 목록 로드
    refreshProjects();

    // 결제 성공 리다이렉트 처리
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const orderId = urlParams.get('orderId');
    if (paymentStatus === 'success' && orderId) {
      setPaymentOrderId(orderId);
      // URL에서 결제 파라미터 제거
      window.history.replaceState({}, '', window.location.pathname);
    }

    return () => { isAbortedRef.current = true; };
  }, [checkApiKeyStatus, fetchCredits]);

  // 로그인 성공 시 크레딧 & 프로젝트 갱신
  useEffect(() => {
    if (isAuthenticated) {
      fetchCredits();
      refreshProjects();
      // useGameState 훅이 자동으로 게이미피케이션 동기화 처리
    }
  }, [isAuthenticated, fetchCredits]);


  // Fun tip 인터벌 (생성 중일 때만, AI 인격 시스템)
  useEffect(() => {
    if (step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS) {
      const pool = step === GenerationStep.SCRIPTING ? AI_PERSONALITY.SCRIPTING : AI_PERSONALITY.ASSETS;
      setFunTip(pool[Math.floor(Math.random() * pool.length)]);
      const iv = setInterval(() => {
        setFunTip(pool[Math.floor(Math.random() * pool.length)]);
      }, 3000);
      return () => clearInterval(iv);
    } else if (step === GenerationStep.ERROR) {
      setFunTip(AI_PERSONALITY.ERROR[Math.floor(Math.random() * AI_PERSONALITY.ERROR.length)]);
    } else {
      setFunTip('');
    }
  }, [step]);

  // 오늘의 팁 (하루 1회)
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('tubegen_tip_date') === today) return;
    const seenIds = JSON.parse(localStorage.getItem('tubegen_tip_seen') || '[]') as number[];
    const unseen = PRO_TIPS.filter(t => !seenIds.includes(t.id));
    if (unseen.length === 0) return;
    const tip = unseen[Math.floor(Math.random() * unseen.length)];
    setTipOfDay(tip); setShowTipOfDay(true);
    localStorage.setItem('tubegen_tip_date', today);
  }, []);

  // 코나미 코드
  useEffect(() => {
    const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    const handler = (e: KeyboardEvent) => {
      konamiRef.current.push(e.key);
      if (konamiRef.current.length > 10) konamiRef.current.shift();
      if (JSON.stringify(konamiRef.current) === JSON.stringify(KONAMI)) {
        setKonamiActive(true);
        document.documentElement.classList.add('retro-mode');
        const overlay = document.createElement('div'); overlay.className = 'scanline-overlay'; overlay.id = 'konami-scanline'; document.body.appendChild(overlay);
        // 레트로 8-bit 파워업 사운드
        try {
          const ctx = new AudioContext();
          const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6 아르페지오
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square'; // 8-bit 사운드
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.15);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.08);
            osc.stop(ctx.currentTime + i * 0.08 + 0.15);
          });
          // 마무리 화음
          setTimeout(() => {
            [523.25, 783.99, 1046.50].forEach(freq => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'square';
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.1, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(); osc.stop(ctx.currentTime + 0.4);
            });
          }, 350);
        } catch {}
        setTimeout(() => { setKonamiActive(false); document.documentElement.classList.remove('retro-mode'); document.getElementById('konami-scanline')?.remove(); }, 10000);
        konamiRef.current = [];
        // 업적 트리거 (ref로 최신 값 참조 — stale closure 방지)
        const { isAuthenticated: auth, synced, recordAction, setOverlayAchievement: setOverlay } = gameRef.current;
        if (auth && synced) {
          recordAction('special_konami', 1).then(result => {
            if (result?.achievementsUnlocked?.length > 0) {
              const a = result.achievementsUnlocked[0];
              setTimeout(() => setOverlay({ name: a.name, icon: a.icon, description: a.description, category: a.category, rewardXp: a.rewardXp, rewardCredits: a.rewardCredits }), 1000);
            }
          });
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { savedProjects, refreshProjects, handleDeleteProject: pmDeleteProject, handleImportProject: pmImportProject, handleLoadProject: pmLoadProject, handleSaveProject: pmSaveProject } = projectMgmt;

  const handleOpenKeySelector = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setNeedsKey(false);
    }
  };

  const updateAssetAt = (index: number, updates: Partial<GeneratedAsset>) => {
    if (isAbortedRef.current) return;
    if (assetsRef.current[index]) {
      assetsRef.current[index] = { ...assetsRef.current[index], ...updates };
      setGeneratedData([...assetsRef.current]);
    }
  };

  // 비용 추가 헬퍼
  const addCost = (type: 'image' | 'tts' | 'video', amount: number, count: number = 1) => {
    if (type === 'image') {
      costRef.current.images += amount;
      costRef.current.imageCount += count;
    } else if (type === 'tts') {
      costRef.current.tts += amount;
      costRef.current.ttsCharacters += count;
    } else if (type === 'video') {
      costRef.current.videos += amount;
      costRef.current.videoCount += count;
    }
    costRef.current.total = costRef.current.images + costRef.current.tts + costRef.current.videos;
    setCurrentCost({ ...costRef.current });
  };

  // 비용 초기화
  const resetCost = () => {
    costRef.current = {
      images: 0, tts: 0, videos: 0, total: 0,
      imageCount: 0, ttsCharacters: 0, videoCount: 0
    };
    setCurrentCost(null);
  };

  // Undo용 에셋 스냅샷 (얕은 복제 - base64 문자열은 참조 공유)
  const snapshotAssets = () => assetsRef.current.map(a => ({ ...a }));

  // Undo/Redo 핸들러
  const handleUndo = useCallback(() => {
    const prev = undoState(snapshotAssets());
    if (prev) {
      assetsRef.current = prev;
      setGeneratedData([...prev]);
    }
  }, [undoState]);

  const handleRedo = useCallback(() => {
    const next = redoState(snapshotAssets());
    if (next) {
      assetsRef.current = next;
      setGeneratedData([...next]);
    }
  }, [redoState]);

  // Ctrl+Z / Ctrl+Y 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 입력 중(textarea/input)에는 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const handleAbort = () => {
    isAbortedRef.current = true;
    isProcessingRef.current = false;
    setProgressMessage(`🛑 ${t('progress.aborted')}`);
    setStep(GenerationStep.COMPLETED);
  };

  const handleGenerate = useCallback(async (
    topic: string,
    refImgs: ReferenceImages,
    sourceText: string | null
  ) => {
    if (isProcessingRef.current) return;

    // 비회원이면 로그인 모달 표시
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    // 크레딧 잔액 확인 (최소 10크레딧 필요, 운영자 제외)
    if (userPlan !== 'operator' && userCredits < 10) {
      setProgressMessage(t('progress.creditsInsufficient'));
      setShowCreditShop(true);
      return;
    }

    isProcessingRef.current = true;
    isAbortedRef.current = false;
    generationStartRef.current = Date.now();

    setStep(GenerationStep.SCRIPTING);
    setProgressMessage(t('progress.booting'));

    try {
      const hasKey = await checkApiKeyStatus();
      if (!hasKey && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }

      setGeneratedData([]);
      assetsRef.current = [];
      setCurrentReferenceImages(refImgs);
      setCurrentTopic(topic); // 저장용 토픽 기록
      resetCost(); // 비용 초기화
      clearHistory(); // Undo 히스토리 초기화

      // 참조 이미지 존재 여부 계산
      const hasRefImages = (refImgs.character?.length || 0) + (refImgs.style?.length || 0) > 0;
      // 언어 설정 읽기
      const language = (localStorage.getItem(CONFIG.STORAGE_KEYS.LANGUAGE) as Language) || 'ko';

      let targetTopic = topic;

      if (topic === "Manual Script Input" && sourceText) {
        // 수동 대본: 대본 첫 줄/첫 부분을 프로젝트명으로 사용
        const firstLine = sourceText.split('\n').find(l => l.trim().length > 0)?.trim() || '수동 대본';
        targetTopic = firstLine.slice(0, 50);
        setProgressMessage(t('progress.analyzingScript'));
      } else if (sourceText) {
        setProgressMessage(t('progress.analyzingContent'));
        targetTopic = "Custom Analysis Topic";
      } else {
        const trendMsgs = [
          `"${topic}" 관련 인터넷을 샅샅이 뒤지는 중...`,
          `AI가 "${topic}"에 꽂혔습니다. 잠시만요...`,
          `"${topic}" 트렌드 탐색 중... 커피 한 잔 드세요 ☕`,
          `전 세계 "${topic}" 덕후들의 관심사 분석 중...`,
          `"${topic}" 콘텐츠 제조 공장 가동 중 🏭`,
          `창작의 신이 "${topic}" 스크립트를 집필 중 ✨`,
          `"${topic}" 데이터 우주에서 보석 캐는 중 💎`,
          `AI 뇌세포 풀가동 중... 주제: "${topic}" 🧠`,
          `"${topic}" 관련 트렌드, 지금 발굴 중 ⛏️`,
          `곧 완성됩니다. "${topic}" 설계도 작성 중...`,
          `"${topic}" 전문가 AI가 투입되었습니다 🎯`,
          `"${topic}"... 흥미롭군요. 분석 들어갑니다 🔍`,
          `"${topic}" 콘텐츠 요리 중입니다. 불 조절 중 🍳`,
          `"${topic}" 시나리오 작가 모드 ON 🎬`,
          `"${topic}"에 진심인 AI가 여기 있습니다 💪`,
        ];
        setProgressMessage(trendMsgs[Math.floor(Math.random() * trendMsgs.length)]);
        const trends = await findTrendingTopics(topic, usedTopicsRef.current, language);
        if (isAbortedRef.current) return;
        targetTopic = trends[0].topic;
        usedTopicsRef.current.push(targetTopic);
      }

      setProgressMessage(`${t('progress.storyboard')} (${LANGUAGE_CONFIG[language].name})`);

      // 긴 대본(3000자 초과) 감지 시 청크 분할 처리
      const inputLength = sourceText?.length || 0;
      const CHUNK_THRESHOLD = 3000; // 3000자 초과 시 청크 분할

      let scriptScenes: ScriptScene[];
      if (inputLength > CHUNK_THRESHOLD) {
        // 긴 대본: 청크 분할 처리 (10,000자 이상 대응)
        setProgressMessage(String(t('progress.longScript', { count: inputLength.toLocaleString() } as any)));
        scriptScenes = await generateScriptChunked(
          targetTopic,
          hasRefImages,
          sourceText!,
          2500, // 청크당 2500자
          setProgressMessage, // 진행 상황 콜백
          language
        );
      } else {
        // 일반 대본: 기존 방식
        scriptScenes = await generateScript(targetTopic, hasRefImages, sourceText, language);
      }
      if (isAbortedRef.current) return;
      
      const initialAssets = scriptScenes.map(scene => ({
        ...scene, imageData: null, audioData: null, audioDuration: null, subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const
      }));
      assetsRef.current = initialAssets;
      setGeneratedData(initialAssets);

      // 스크립트 검토 단계에서 멈춤 — 사용자가 확인/편집 후 "생성 시작" 클릭
      pendingGenContextRef.current = { targetTopic, refImgs, language, hasRefImages, sourceText };
      setStep(GenerationStep.SCRIPT_REVIEW);
      setProgressMessage(t('progress.scriptDone', { count: initialAssets.length }));

    } catch (error: unknown) {
      if (!isAbortedRef.current) {
        const msg = error instanceof Error ? error.message : String(error);
        setStep(GenerationStep.ERROR);
        setProgressMessage(`오류: ${msg}`);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [checkApiKeyStatus, userCredits, userPlan, isAuthenticated, setShowAuthModal]);

  // ── Phase 2: 스크립트 승인 → 에셋 생성 ──
  const handleApproveScript = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!pendingGenContextRef.current) return;

    isProcessingRef.current = true;
    isAbortedRef.current = false;

    const { refImgs, language } = pendingGenContextRef.current;
    const targetTopic = pendingGenContextRef.current.targetTopic;

    // 사용자가 편집했을 수 있으므로 최신 데이터 사용
    const initialAssets = [...assetsRef.current];

    setStep(GenerationStep.ASSETS);
    resetCost();

    try {
      const runAudio = async () => {
          const TTS_CONCURRENCY = 5; // 동시 TTS 생성 수 (ElevenLabs 동시 요청 제한)
          const MAX_TTS_RETRIES = 2;
          let completedCount = 0;

          const generateSingleAudio = async (i: number) => {
              if (isAbortedRef.current) return;
              let success = false;

              for (let attempt = 0; attempt <= MAX_TTS_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;

                  try {
                      if (attempt > 0) {
                          await wait(1500);
                      }

                      const elSpeed = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED) || '1.0');
                      const elStability = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY) || '0.6');
                      const elResult = await generateAudioWithElevenLabs(
                        assetsRef.current[i].narration,
                        undefined, undefined, undefined,
                        { speed: elSpeed, stability: elStability }
                      );
                      if (isAbortedRef.current) break;

                      if (elResult.audioData) {
                        updateAssetAt(i, {
                          audioData: elResult.audioData,
                          subtitleData: elResult.subtitleData,
                          audioDuration: elResult.estimatedDuration
                        });
                        const charCount = assetsRef.current[i].narration.length;
                        addCost('tts', charCount * PRICING.TTS.perCharacter, charCount);
                        success = true;
                        completedCount++;
                      } else {
                        throw new Error('ElevenLabs 응답 없음');
                      }
                  } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : String(e);
                      console.error(`[TTS] 씬 ${i + 1} 실패 (시도 ${attempt + 1}):`, msg);
                      if (msg.includes('429') || msg.includes('rate')) {
                          await wait(3000);
                      }
                  }
              }

              if (!success && !isAbortedRef.current) {
                  try {
                      const fallbackAudio = await generateAudioForScene(assetsRef.current[i].narration);
                      updateAssetAt(i, { audioData: fallbackAudio });
                      completedCount++;
                  } catch (fallbackError) {
                      console.error(`[TTS] 씬 ${i + 1} Gemini 폴백도 실패:`, fallbackError);
                  }
              }
          };

          // 동시성 풀: TTS_CONCURRENCY개씩 병렬 처리
          const indices = initialAssets.map((_, i) => i);
          for (let start = 0; start < indices.length; start += TTS_CONCURRENCY) {
              if (isAbortedRef.current) break;
              const batch = indices.slice(start, start + TTS_CONCURRENCY);
              const batchEnd = Math.min(start + TTS_CONCURRENCY, indices.length);
              setProgressMessage(t('progress.generatingAudio', { range: `${start + 1}~${batchEnd}`, total: indices.length }));
              await Promise.all(batch.map(i => generateSingleAudio(i)));
          }
      };

      const runImages = async () => {
          const MAX_RETRIES = 2;
          const CONCURRENCY = 5; // 동시 생성 수
          const imageModel = getSelectedImageModel();
          const imagePrice = PRICING.IMAGE[imageModel as keyof typeof PRICING.IMAGE] || 0.01;

          const generateSingleImage = async (i: number) => {
              if (isAbortedRef.current) return;
              updateAssetAt(i, { status: 'generating' });

              let success = false;
              let lastError: any = null;

              for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;

                  try {
                      if (attempt > 0) {
                          setProgressMessage(`씬 ${i + 1} 이미지 재생성 시도 중... (${attempt}/${MAX_RETRIES})`);
                          await wait(2000);
                      }

                      const img = await generateImage(assetsRef.current[i], refImgs);
                      if (isAbortedRef.current) break;

                      if (img) {
                          updateAssetAt(i, { imageData: img, status: 'completed' });
                          addCost('image', imagePrice, 1);
                          success = true;
                      } else {
                          throw new Error('이미지 데이터가 비어있습니다');
                      }
                  } catch (e: unknown) {
                      lastError = e;
                      const msg = e instanceof Error ? e.message : String(e);
                      console.error(`씬 ${i + 1} 이미지 생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, msg);

                      if (msg.includes("API key not valid") || (e as any).status === 400) {
                          setNeedsKey(true);
                          break;
                      }
                  }
              }

              if (!success && !isAbortedRef.current) {
                  const errMsg = lastError?.message || '알 수 없는 오류';
                  updateAssetAt(i, { status: 'error', errorMessage: errMsg });
                  console.error(`씬 ${i + 1} 이미지 생성 최종 실패:`, errMsg);
              }
          };

          // 동시성 풀: CONCURRENCY개씩 병렬 처리
          const indices = initialAssets.map((_, i) => i);
          for (let start = 0; start < indices.length; start += CONCURRENCY) {
              if (isAbortedRef.current) break;
              const batch = indices.slice(start, start + CONCURRENCY);
              setProgressMessage(t('progress.generatingImages', { range: `${start + 1}~${Math.min(start + CONCURRENCY, indices.length)}`, total: indices.length }));
              await Promise.all(batch.map(i => generateSingleImage(i)));
          }
      };

      // BGM 자동 선택 (비차단, 병렬)
      const runAutoBgm = async () => {
        try {
          const autoBgmEnabled = localStorage.getItem('tubegen_auto_bgm') === 'true';
          if (!autoBgmEnabled || bgmData) return; // 비활성화 또는 이미 BGM 있으면 스킵

          const narrations = initialAssets.map(a => a.narration);
          const moodResult = await analyzeMood(narrations);
          if (isAbortedRef.current) return;

          const matchedTrack = BGM_LIBRARY.find(t => t.mood === moodResult.mood) || BGM_LIBRARY[0];
          // 1차: public/bgm/ 폴더 파일 시도, 2차: Web Audio API로 자동 생성
          let base64: string | null = null;
          try {
            const response = await fetch(matchedTrack.url);
            if (response.ok) {
              const blob = await response.blob();
              base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(',')[1]);
                reader.readAsDataURL(blob);
              });
            }
          } catch { /* 파일 없으면 자동 생성으로 폴백 */ }

          if (!base64) {
            base64 = await generateAmbientBgm(moodResult.mood as BgmMood);
          }

          if (!isAbortedRef.current && base64) setBgmData(base64);
        } catch (e) {
          console.warn('[AutoBGM] 자동 BGM 선택 실패:', e);
        }
      };

      setProgressMessage(t('progress.generatingAssets'));
      // 이미지, 오디오, BGM 병렬 생성
      await Promise.all([runAudio(), runImages(), runAutoBgm()]);

      // 애니메이션 변환은 이제 수동으로 (이미지 호버 시 버튼 클릭)
      // 자동 변환 비활성화 - 사용자가 원하는 이미지만 선택적으로 변환 가능
      
      if (isAbortedRef.current) return;

      // 카운트다운 이펙트 (완료 전 빌드업)
      for (let n = 3; n >= 1; n--) { setCountdownNumber(n); await wait(700); }
      setCountdownNumber(null);

      setStep(GenerationStep.COMPLETED);

      // confetti + 칭찬 + 리액션
      launchConfetti();
      setCompletionCompliment(AI_PERSONALITY.COMPLETED[Math.floor(Math.random() * AI_PERSONALITY.COMPLETED.length)]);
      setShowReactions(true);
      setTimeout(() => { setCompletionCompliment(null); setShowReactions(false); }, 8000);

      // 콤보
      setSessionCombo(prev => {
        const nc = prev + 1;
        if (nc >= 2) { setToastMessage(`${nc}연속 생성! ${'🔥'.repeat(Math.min(nc, 5))}`); setTimeout(() => setToastMessage(null), 3000); }
        return nc;
      });

      // 서버 기반 게이미피케이션 — gameRef로 최신 상태 참조 (stale closure 방지)
      const imgCount = assetsRef.current.filter(a => a.imageData).length;
      const audioCount = assetsRef.current.filter(a => a.audioData).length;
      const videoCount = assetsRef.current.filter(a => a.videoData).length;
      const { isAuthenticated: authNow, synced: syncedNow, recordAction: recordNow } = gameRef.current;

      if (authNow && syncedNow) {
        // 서버에 recordAction → 모든 결과를 응답으로 받음
        const result = await recordNow('generation_complete', 1, {
          imageCount: imgCount, audioCount, videoCount,
          sessionCombo: sessionComboRef.current + 1,
        });
        if (result) {
          const newLvl = result.newLevel ?? result.oldLevel;

          // 레벨업 오버레이
          if (result.newLevel && result.newLevel > result.oldLevel) {
            setTimeout(() => {
              launchConfetti(); setTimeout(() => launchConfetti(), 400);
              setOverlayLevelUp({
                level: result.newLevel!,
                title: result.levelTitle || '',
                emoji: result.levelEmoji || '🌟',
                color: result.levelColor || '#06b6d4',
                reward: result.levelReward || undefined,
              });
            }, 4000);
          }

          // 업적 해금 오버레이
          if (result.achievementsUnlocked?.length > 0) {
            const a = result.achievementsUnlocked[0];
            setTimeout(() => {
              setOverlayAchievement({
                name: a.name, icon: a.icon, description: a.description,
                category: a.category, rewardXp: a.rewardXp, rewardCredits: a.rewardCredits,
              });
            }, result.newLevel ? 9500 : 4000);
          }

          // 뽑기 결과 오버레이
          if (result.gachaResult) {
            setTimeout(() => {
              setOverlayGacha({
                item: result.gachaResult!.item,
                isNew: result.gachaResult!.isNew,
              });
            }, result.newLevel ? 14000 : result.achievementsUnlocked?.length ? 8500 : 5000);
          }

          // 마일스톤 오버레이
          if (result.milestoneReached) {
            setTimeout(() => {
              setOverlayMilestone(result.milestoneReached!);
            }, 4500);
          }

          // 결과 화면 데이터 설정
          const elapsed = Math.round((Date.now() - generationStartRef.current) / 1000);
          const questCompleted = result.questProgress?.filter((q: any) => q.justCompleted).length || 0;
          const questTotal = result.questProgress?.length || 0;
          setCompletionData({
            cost: { ...costRef.current },
            sceneCount: assetsRef.current.length,
            xpGained: result.xpGained || 0,
            combo: sessionComboRef.current + 1,
            elapsedSeconds: elapsed,
            questProgress: questTotal > 0 ? { completed: questCompleted, total: questTotal } : undefined,
            gachaTickets: result.gachaResult ? 1 : undefined,
          });
        } else {
          // 비로그인 또는 recordAction 실패 시에도 결과 화면 표시
          const elapsed = Math.round((Date.now() - generationStartRef.current) / 1000);
          setCompletionData({
            cost: { ...costRef.current },
            sceneCount: assetsRef.current.length,
            xpGained: 0,
            combo: sessionComboRef.current + 1,
            elapsedSeconds: elapsed,
          });
        }
      } else {
        // 비로그인 시 결과 화면
        const elapsed = Math.round((Date.now() - generationStartRef.current) / 1000);
        setCompletionData({
          cost: { ...costRef.current },
          sceneCount: assetsRef.current.length,
          xpGained: 0,
          combo: sessionComboRef.current + 1,
          elapsedSeconds: elapsed,
        });
      }

      // 다이나믹 테마 악센트
      const firstImg = assetsRef.current.find(a => a.imageData);
      if (firstImg?.imageData) {
        try {
          const img = new Image();
          img.onload = () => {
            const cv = document.createElement('canvas'); cv.width = 4; cv.height = 4;
            const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0, 4, 4);
            const d = ctx.getImageData(0, 0, 4, 4).data;
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; }
            const n = d.length / 4;
            document.documentElement.style.setProperty('--accent-dynamic', `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`);
          };
          img.src = firstImg.imageData.startsWith('data:') ? firstImg.imageData : `data:image/png;base64,${firstImg.imageData}`;
        } catch {}
      }

      // 크레딧 잔액 갱신
      fetchCredits();

      // 비용 요약 메시지 (원화)
      const cost = costRef.current;
      const costMsg = `이미지 ${cost.imageCount}장 ${formatKRW(cost.images)} + TTS ${cost.ttsCharacters}자 ${formatKRW(cost.tts)} = 총 ${formatKRW(cost.total)}`;
      setProgressMessage(`${t('progress.generationComplete')} ${costMsg}`);

      // 자동 저장 비활성화 — 사용자가 "프로젝트 저장" 버튼으로 수동 저장

    } catch (error: unknown) {
      if (!isAbortedRef.current) {
        const msg = error instanceof Error ? error.message : String(error);
        setStep(GenerationStep.ERROR);
        setProgressMessage(`오류: ${msg}`);
      }
    } finally {
      isProcessingRef.current = false;
      pendingGenContextRef.current = null;
    }
  }, [refreshProjects, bgmData, fetchCredits]);

  // ── 스크립트 다시 생성 (무료 — 텍스트 생성만) ──
  const handleRegenerateScript = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!pendingGenContextRef.current) return;

    isProcessingRef.current = true;
    isAbortedRef.current = false;
    setStep(GenerationStep.SCRIPTING);
    setProgressMessage('스크립트 다시 생성 중...');

    try {
      const { targetTopic, hasRefImages, sourceText, language } = pendingGenContextRef.current;
      const inputLength = sourceText?.length || 0;
      const CHUNK_THRESHOLD = 3000;

      let scriptScenes: ScriptScene[];
      if (inputLength > CHUNK_THRESHOLD) {
        scriptScenes = await generateScriptChunked(
          targetTopic, hasRefImages, sourceText!, 2500, setProgressMessage, language
        );
      } else {
        scriptScenes = await generateScript(targetTopic, hasRefImages, sourceText, language);
      }
      if (isAbortedRef.current) return;

      const newAssets = scriptScenes.map(scene => ({
        ...scene, imageData: null, audioData: null, audioDuration: null,
        subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const
      }));
      assetsRef.current = newAssets;
      setGeneratedData(newAssets);
      setStep(GenerationStep.SCRIPT_REVIEW);
      setProgressMessage(t('progress.scriptRegenDone', { count: newAssets.length }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setStep(GenerationStep.ERROR);
      setProgressMessage(`스크립트 재생성 오류: ${msg}`);
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

  // 이미지 재생성 핸들러 (useCallback으로 메모이제이션)
  const handleRegenerateImage = useCallback(async (idx: number) => {
    if (isProcessingRef.current) return;

    const MAX_RETRIES = 2;
    updateAssetAt(idx, { status: 'generating' });
    setProgressMessage(`씬 ${idx + 1} 이미지 재생성 중...`);

    let success = false;
    let lastError: any = null;

    for (let attempt = 0; attempt <= MAX_RETRIES && !success; attempt++) {
      if (isAbortedRef.current) break;

      try {
        if (attempt > 0) {
          setProgressMessage(`씬 ${idx + 1} 이미지 재생성 재시도 중... (${attempt}/${MAX_RETRIES})`);
          await wait(2000);
        }

        const img = await generateImage(assetsRef.current[idx], currentReferenceImages);

        if (img && !isAbortedRef.current) {
          updateAssetAt(idx, { imageData: img, status: 'completed', errorMessage: undefined });
          // 이미지 비용 추가
          const imageModel = getSelectedImageModel();
          const imagePrice = PRICING.IMAGE[imageModel as keyof typeof PRICING.IMAGE] || 0.01;
          addCost('image', imagePrice, 1);
          setProgressMessage(`씬 ${idx + 1} 이미지 재생성 완료! (+${formatKRW(imagePrice)})`);
          success = true;
        } else if (!img) {
          throw new Error('이미지 데이터가 비어있습니다');
        }
      } catch (e: unknown) {
        lastError = e;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`씬 ${idx + 1} 재생성 실패 (시도 ${attempt + 1}/${MAX_RETRIES + 1}):`, msg);

        if (msg.includes("API key not valid") || (e as any).status === 400) {
          setNeedsKey(true);
          break;
        }
      }
    }

    if (!success && !isAbortedRef.current) {
      const errMsg = lastError?.message || '알 수 없는 오류';
      updateAssetAt(idx, { status: 'error', errorMessage: errMsg });
      setProgressMessage(`씬 ${idx + 1} 생성 실패: ${errMsg.slice(0, 60)}`);
    }
  }, [currentReferenceImages]);

  // 애니메이션 생성 핸들러 (useCallback으로 메모이제이션)
  const handleGenerateAnimation = useCallback(async (idx: number) => {
    if (animatingIndices.has(idx)) return; // 이 씬은 이미 변환 중
    if (!assetsRef.current[idx]?.imageData) {
      alert('이미지가 먼저 생성되어야 합니다.');
      return;
    }

    try {
      // Set에 현재 인덱스 추가
      setAnimatingIndices(prev => new Set(prev).add(idx));
      setProgressMessage(`씬 ${idx + 1} 움직임 분석 중...`);

      // AI가 대본과 이미지를 분석해서 움직임 프롬프트 생성
      const motionPrompt = await generateMotionPrompt(
        assetsRef.current[idx].narration,
        assetsRef.current[idx].visualPrompt
      );

      setProgressMessage(`씬 ${idx + 1} 영상 변환 중...`);
      const videoUrl = await generateVideoFromImage(
        assetsRef.current[idx].imageData!,
        motionPrompt
      );

      if (videoUrl) {
        updateAssetAt(idx, {
          videoData: videoUrl,
          videoDuration: CONFIG.ANIMATION.VIDEO_DURATION
        });
        // 영상 비용 추가
        addCost('video', PRICING.VIDEO.perVideo, 1);
        setProgressMessage(`씬 ${idx + 1} 영상 변환 완료! (+${formatKRW(PRICING.VIDEO.perVideo)})`);
        // 자동 저장 비활성화 — 사용자가 "프로젝트 저장" 버튼으로 수동 저장
        // 영상 퀘스트 진행
        const { isAuthenticated: authV, synced: syncV, recordAction: recordV } = gameRef.current;
        if (authV && syncV) recordV('generation_complete', 1, { videoCount: 1 }).catch(() => {});
      } else {
        setProgressMessage(`씬 ${idx + 1} 영상 변환 실패`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('영상 변환 실패:', e);
      setProgressMessage(`씬 ${idx + 1} 오류: ${msg}`);
    } finally {
      // Set에서 현재 인덱스 제거
      setAnimatingIndices(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  }, [animatingIndices]);

  const triggerVideoExport = async (enableSubtitles: boolean = true, subtitleConfig?: Partial<SubtitleConfig>, sceneGap?: number, resolution?: ResolutionTier) => {
    if (isVideoGenerating) return;
    try {
      setIsVideoGenerating(true);
      const suffix = enableSubtitles ? 'sub' : 'nosub';
      const resSuffix = resolution ?? '720p';
      const timestamp = Date.now();

      // 언어별 자막 폰트 자동 적용
      const language = (localStorage.getItem(CONFIG.STORAGE_KEYS.LANGUAGE) as Language) || 'ko';
      const langFont = LANGUAGE_CONFIG[language].subtitleFont;
      const mergedSubtitleConfig = subtitleConfig
        ? { fontFamily: langFont, ...subtitleConfig }
        : { fontFamily: langFont };

      const result = await generateVideo(
        assetsRef.current,
        (msg) => setProgressMessage(`[Render] ${msg}`),
        isAbortedRef,
        { enableSubtitles, bgmData, bgmVolume, subtitleConfig: mergedSubtitleConfig, sceneGap, bgmDuckingEnabled, bgmDuckingAmount, resolution }
      );

      if (result) {
        saveAs(result.videoBlob, `c2gen_${suffix}_${resSuffix}_${timestamp}.mp4`);
        setProgressMessage(`✨ ${t('progress.renderComplete')} (${enableSubtitles ? '자막 O' : '자막 X'}, ${resSuffix.toUpperCase()})`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      setProgressMessage(`${t('progress.renderFailed')}: ${msg}`);
    } finally {
      setIsVideoGenerating(false);
    }
  };

  // 씬 편집 저장 핸들러
  const handleUpdateAsset = useCallback((idx: number, updates: Partial<GeneratedAsset>) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, updates);
    setEditingIndex(null);
  }, [pushUndoState]);

  // 단일 씬 TTS 재생성 핸들러
  const handleRegenerateAudio = useCallback(async (idx: number) => {
    updateAssetAt(idx, { status: 'generating' });
    setProgressMessage(`씬 ${idx + 1} 음성 재생성 중...`);
    try {
      const elSpeed = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED) || '1.0');
      const elStability = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY) || '0.6');
      const result = await generateAudioWithElevenLabs(
        assetsRef.current[idx].narration,
        undefined, undefined, undefined,
        { speed: elSpeed, stability: elStability }
      );
      if (result.audioData && !isAbortedRef.current) {
        updateAssetAt(idx, {
          audioData: result.audioData,
          subtitleData: result.subtitleData,
          audioDuration: result.estimatedDuration,
          status: 'completed'
        });
        const chars = assetsRef.current[idx].narration.length;
        addCost('tts', chars * PRICING.TTS.perCharacter, chars);
        setProgressMessage(`씬 ${idx + 1} 음성 재생성 완료!`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateAssetAt(idx, { status: 'error' });
      setProgressMessage(`씬 ${idx + 1} 음성 재생성 실패: ${msg}`);
    }
  }, []);

  // 씬 순서 변경 핸들러
  const handleReorderScenes = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    pushUndoState(snapshotAssets());
    const newAssets = [...assetsRef.current];
    const [moved] = newAssets.splice(fromIdx, 1);
    newAssets.splice(toIdx, 0, moved);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
  }, [pushUndoState]);

  // 씬 삭제 핸들러
  const handleDeleteScene = useCallback((idx: number) => {
    pushUndoState(snapshotAssets());
    const newAssets = assetsRef.current.filter((_, i) => i !== idx);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
    setEditingIndex(null);
  }, [pushUndoState]);

  // 씬 추가 핸들러 (afterIdx 위치 다음에 삽입, undefined면 맨 끝)
  const handleAddScene = useCallback((afterIdx?: number) => {
    pushUndoState(snapshotAssets());
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : assetsRef.current.length;
    const newAsset: GeneratedAsset = {
      sceneNumber: insertAt + 1,
      narration: '',
      visualPrompt: '',
      imageData: null,
      audioData: null,
      audioDuration: null,
      subtitleData: null,
      videoData: null,
      videoDuration: null,
      status: 'pending',
      customDuration: 5,
    };
    const newAssets = [...assetsRef.current];
    newAssets.splice(insertAt, 0, newAsset);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
    setEditingIndex(insertAt);
  }, [pushUndoState]);

  // 씬 이미지 직접 업로드 핸들러
  const handleUploadSceneImage = useCallback((idx: number, base64: string) => {
    updateAssetAt(idx, { imageData: base64, videoData: null, status: 'completed' });
  }, []);

  // 씬 재생 시간 조절 핸들러
  const handleSetCustomDuration = useCallback((idx: number, duration: number) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { customDuration: duration });
  }, [pushUndoState]);

  // 씬별 줌/팬 효과 핸들러
  const handleSetZoomEffect = useCallback((idx: number, effect: string) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { zoomEffect: effect as GeneratedAsset['zoomEffect'] });
  }, [pushUndoState]);

  // 씬 복제 핸들러
  const handleDuplicateScene = useCallback((idx: number) => {
    pushUndoState(snapshotAssets());
    const original = assetsRef.current[idx];
    const insertAt = idx + 1;
    const newAsset: GeneratedAsset = { ...original, sceneNumber: insertAt + 1 };
    const newAssets = [...assetsRef.current];
    newAssets.splice(insertAt, 0, newAsset);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
  }, [pushUndoState]);

  // 자동 줌 패턴 일괄 적용 핸들러
  const handleAutoZoom = useCallback((pattern: string) => {
    pushUndoState(snapshotAssets());
    const len = assetsRef.current.length;
    const dynamicCycle: GeneratedAsset['zoomEffect'][] = ['zoomIn', 'panLeft', 'zoomOut', 'panRight'];

    for (let i = 0; i < len; i++) {
      let effect: GeneratedAsset['zoomEffect'];
      switch (pattern) {
        case 'alternating':
          effect = i % 2 === 0 ? 'zoomIn' : 'zoomOut';
          break;
        case 'dynamic':
          effect = dynamicCycle[i % 4];
          break;
        case 'sentiment': {
          const asset = assetsRef.current[i];
          const sentiment = asset.analysis?.sentiment;
          const motionType = asset.analysis?.motion_type;
          if (sentiment === 'POSITIVE' && motionType === '동적') effect = 'zoomIn';
          else if (sentiment === 'NEGATIVE' && motionType === '정적') effect = 'zoomOut';
          else if (motionType === '동적') effect = i % 2 === 0 ? 'panLeft' : 'panRight';
          else effect = 'zoomIn';
          break;
        }
        case 'static':
          effect = 'none';
          break;
        default:
          return;
      }
      assetsRef.current[i] = { ...assetsRef.current[i], zoomEffect: effect };
    }
    setGeneratedData([...assetsRef.current]);
  }, [pushUndoState]);

  // 씬별 전환 효과 핸들러
  const handleSetTransition = useCallback((idx: number, transition: string) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { transition: transition as GeneratedAsset['transition'] });
  }, [pushUndoState]);

  // 전체 씬 전환 효과 일괄 설정
  const handleSetDefaultTransition = useCallback((transition: string) => {
    pushUndoState(snapshotAssets());
    assetsRef.current = assetsRef.current.map(a => ({
      ...a,
      transition: transition as GeneratedAsset['transition']
    }));
    setGeneratedData([...assetsRef.current]);
  }, [pushUndoState]);

  // 실패한 씬 일괄 재생성 핸들러
  const handleRegenerateFailedScenes = useCallback(async () => {
    const failedIndices = assetsRef.current
      .map((asset, idx) => ({ asset, idx }))
      .filter(({ asset }) => asset.status === 'error')
      .map(({ idx }) => idx);

    if (failedIndices.length === 0) return;
    setProgressMessage(`실패한 ${failedIndices.length}개 씬 재생성 중...`);

    for (const idx of failedIndices) {
      if (isAbortedRef.current) break;
      await handleRegenerateImage(idx);
    }
    setProgressMessage(`실패 씬 재생성 완료!`);
  }, [handleRegenerateImage]);

  // 프로젝트 핸들러 (훅 래핑)
  const handleImportProject = async (project: SavedProject) => {
    try {
      await pmImportProject(project);
      setProgressMessage(`"${project.name}" 프로젝트 가져오기 완료`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setProgressMessage(`프로젝트 가져오기 실패: ${msg}`);
    }
  };

  const handleDeleteProject = (id: string) => pmDeleteProject(id);

  const handleLoadProject = async (project: SavedProject) => {
    setProgressMessage(`"${project.name}" 불러오는 중...`);
    const result = await pmLoadProject(project);
    if (!result) { setProgressMessage(`"${project.name}" 불러오기 실패`); return; }
    assetsRef.current = result.assets;
    setGeneratedData([...result.assets]);
    setCurrentTopic(result.topic);
    setStep(GenerationStep.COMPLETED);
    setProgressMessage(result.hasAudio ? `"${project.name}" 프로젝트 불러옴` : `"${project.name}" 불러옴 (TTS 재생성 필요)`);
    setViewMode('main');
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <Header
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        levelInfo={isAuthenticated && game.synced ? game.levelInfo : null}
        equipped={isAuthenticated && game.synced ? game.equipped : null}
        userName={isAuthenticated ? userName || undefined : undefined}
        onLogoAchievement={() => {
          if (isAuthenticated && game.synced) {
            game.recordAction('special_logo_click', 1).then(result => {
              if (result?.achievementsUnlocked?.length > 0) {
                const a = result.achievementsUnlocked[0];
                setTimeout(() => setOverlayAchievement({ name: a.name, icon: a.icon, description: a.description, category: a.category, rewardXp: a.rewardXp, rewardCredits: a.rewardCredits }), 500);
              }
            });
          }
        }}
        isAuthenticated={isAuthenticated}
        credits={userCredits}
        plan={userPlan}
        onShowCreditShop={() => setShowCreditShop(true)}
        onShowProfile={() => setShowUserProfile(true)}
        onShowAuthModal={() => setShowAuthModal(true)}
        onLogout={handleLogout}
        activeTab={viewMode}
        onTabChange={setViewMode}
        projectCount={savedProjects.length}
        onShowAchievements={() => setShowAchievements(true)}
        onShowInventory={() => setShowInventory(true)}
        onShowLeaderboard={() => setShowLeaderboard(true)}
        avatarUrl={userAvatarUrl}
      />

      {/* 공지사항 배너 */}
      {visibleAnnouncements.length > 0 && (
        <div className="border-b" style={{ borderColor: 'var(--border-default)' }}>
          <div className="max-w-7xl mx-auto px-4 py-2 space-y-1.5">
            {visibleAnnouncements.map(a => {
              const styles = a.type === 'urgent'
                ? 'bg-red-900/30 border-red-700/50 text-red-300'
                : a.type === 'warning'
                ? 'bg-yellow-900/30 border-yellow-700/50 text-yellow-300'
                : 'bg-cyan-900/30 border-cyan-700/50 text-cyan-300';
              return (
                <div key={a.id} className={`flex items-start gap-3 px-3 py-2 rounded-lg border text-[12px] ${styles}`}>
                  <span className="flex-shrink-0 mt-0.5">{a.type === 'urgent' ? '!' : a.type === 'warning' ? '!' : 'i'}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{a.title}</span>
                    {a.content && <span className="ml-1.5 opacity-80">{a.content}</span>}
                  </div>
                  <button onClick={() => dismissAnnouncement(a.id)} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity text-[10px]">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {needsKey && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4 flex items-center justify-center gap-4 animate-in fade-in slide-in-from-top-4">
          <span className="text-amber-400 text-xs font-bold">{t('progress.needApiKey')}</span>
          <button onClick={handleOpenKeySelector} className="px-3 py-1 bg-amber-500 text-[10px] font-black rounded-lg hover:bg-amber-400 transition-colors uppercase" style={{ color: 'var(--bg-base)' }}>{t('progress.apiKeySetup')}</button>
        </div>
      )}

      {/* 갤러리 뷰 */}
      {viewMode === 'gallery' && (
        isAuthenticated ? (
          <GalleryErrorBoundary>
            <ProjectGallery
              projects={savedProjects}
              onBack={() => setViewMode('main')}
              onDelete={handleDeleteProject}
              onRefresh={refreshProjects}
              onLoad={handleLoadProject}
              onImport={handleImportProject}
            />
          </GalleryErrorBoundary>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-16 text-center">
            <div className="rounded-2xl border p-8" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <div className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
                <svg className="w-7 h-7" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{t('auth.loginRequired')}</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{t('auth.loginRequiredDesc')}</p>
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg transition-all"
              >
                {t('auth.loginOrRegister')}
              </button>
            </div>
          </div>
        )
      )}

      {/* 놀이터 뷰 */}
      {viewMode === 'playground' && (
        <Playground
          isAuthenticated={isAuthenticated}
          onShowAuthModal={() => setShowAuthModal(true)}
          savedProjects={savedProjects}
        />
      )}

      {/* 메인 뷰 */}
      {viewMode === 'main' && (
      <main className="py-8">
        <InputSection onGenerate={handleGenerate} step={step} />

        {step === GenerationStep.IDLE && generatedData.length === 0 && (
          <div className="max-w-7xl mx-auto px-4 text-center py-4">
            <p className="text-sm animate-fade-sub" style={{ color: 'var(--text-muted)' }}>{getTimeGreeting(game.synced ? game.userState?.streakCount ?? 0 : 0)}</p>
          </div>
        )}

        {showTipOfDay && tipOfDay && step === GenerationStep.IDLE && (
          <div className="max-w-xl mx-auto px-4 mb-4">
            <div className="relative rounded-xl border p-4 animate-bounce-in" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <button onClick={() => { if (tipOfDay) { const seen = JSON.parse(localStorage.getItem('tubegen_tip_seen') || '[]') as number[]; seen.push(tipOfDay.id); localStorage.setItem('tubegen_tip_seen', JSON.stringify(seen)); } setShowTipOfDay(false); }} className="absolute top-2 right-3 text-xs opacity-50 hover:opacity-100" style={{ color: 'var(--text-muted)' }}>✕</button>
              <div className="flex items-start gap-3">
                <span className="text-xl">💡</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{t('tipOfDay')}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{tipOfDay.text}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step !== GenerationStep.IDLE && (
          <div className="max-w-7xl mx-auto px-4 text-center mb-12">
             <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl border shadow-2xl" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
                {step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS ? (
                  <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent animate-spin rounded-full"></div>
                ) : step === GenerationStep.SCRIPT_REVIEW ? (
                  <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></div>
                ) : step === GenerationStep.ERROR ? (
                  <div className="animate-gentle-shake text-red-500">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  </div>
                ) : <div className="w-2 h-2 rounded-full bg-green-500"></div>}
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{(() => {
                  const m = progressMessage.match(/(\d+)\/(\d+)/);
                  if (!m) return progressMessage;
                  const parts = progressMessage.split(m[0]);
                  return <>{parts[0]}<span key={m[1]} className="inline-block animate-number-pop text-green-400 font-black">{m[0]}</span>{parts.slice(1).join(m[0])}</>;
                })()}</span>
                {(step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS) && (
                  <button onClick={handleAbort} className="ml-2 px-3 py-1 rounded-lg bg-red-600/20 text-red-500 text-[10px] font-black uppercase tracking-widest border border-red-500/30">Stop</button>
                )}
             </div>
             {funTip && (step === GenerationStep.SCRIPTING || step === GenerationStep.ASSETS || step === GenerationStep.ERROR) && (
               <p className="mt-3 text-sm font-medium animate-fade-sub" style={{ color: step === GenerationStep.ERROR ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{funTip}</p>
             )}
             {step === GenerationStep.ASSETS && generatedData.length > 0 && (() => {
               const done = generatedData.filter(d => d.imageData).length;
               const phase = getStorytellingPhase(done, generatedData.length);
               return (
                 <div className="mt-2 flex items-center justify-center gap-2">
                   <span className="text-lg">{phase.icon}</span>
                   <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{phase.text}</span>
                   <span key={done} className="text-xs font-bold text-green-400 animate-number-pop inline-block">✓ {done}/{generatedData.length} 씬 완성</span>
                 </div>
               );
             })()}
          </div>
        )}

        {/* 썸네일 생성 버튼 — ResultTable 툴바로 이동됨 */}

        {/* 스크립트 검토 배너 */}
        {step === GenerationStep.SCRIPT_REVIEW && generatedData.length > 0 && (() => {
          const sc = generatedData.length;
          const imgModel = getSelectedImageModel();
          const imgPer = imgModel === 'gpt-image-1' ? 21 : 16;
          const totalChars = generatedData.reduce((s, d) => s + (d.narration?.length || 0), 0);
          const scriptCost = 5;
          const imgTotal = sc * imgPer;
          const ttsTotal = Math.max(15, Math.ceil(totalChars / 1000) * 15);
          const est = scriptCost + imgTotal + ttsTotal;
          const isInsufficientCredits = userPlan !== 'operator' && userCredits < est;

          return (
          <div className="max-w-7xl mx-auto px-4 mb-6 text-center">
              {/* 견적서 카드 */}
              {(() => {
                // 음식 비유 시스템
                const krwEst = est * 10;
                const foodTiers: { max: number; label: string; quotes: string[] }[] = [
                  { max: 100, label: '콜라 한 캔 🥤', quotes: [
                    '이거 콜라 한 캔도 안 하네 ㅋㅋ 🥤',
                    '동전 몇 개로 콘텐츠를 만든다고? 🪙',
                  ]},
                  { max: 150, label: '삼각김밥 하나 🍙', quotes: [
                    '삼각김밥 하나 참으면 되는 거잖아 🍙',
                    '편의점 들를 뻔한 돈으로 뚝딱! 🏪',
                  ]},
                  { max: 200, label: '햄버거 반개 🍔', quotes: [
                    '햄버거 반개 값이라니...! 살도 빼고 개이득! 🍔',
                    '라면 보다도 싸다고?? 라면 다 먹기 전에 만들어 준다고!? 🍜',
                  ]},
                  { max: 300, label: '떡볶이 한 접시 🍢', quotes: [
                    '떡볶이 한 접시 값이면 끝! 매운 건 참자 🍢',
                    '분식집 한 번 안 가면 되는 거지 뭐~ 🍢',
                  ]},
                  { max: 400, label: '아메리카노 한 잔 ☕', quotes: [
                    '아아 한 잔 참으면 되는 거잖아~ ☕',
                    '오늘 커피 한 잔 스킵하면 콘텐츠 완성! ☕',
                  ]},
                  { max: 500, label: '컵라면 + 김밥 세트 🍜', quotes: [
                    '편의점 세트 하나 아끼면 OK 🍜',
                    '야식 한 번 참으면 되는 가격 🍜',
                  ]},
                  { max: 700, label: '볶음밥 한 그릇 🍳', quotes: [
                    '볶음밥 한 그릇 포기하면... 충분해! 🍳',
                    '김밥천국 한 끼면 해결되는 가격 🍳',
                  ]},
                  { max: 1000, label: '짜장면 한 그릇 🍜', quotes: [
                    '짜장면 한 그릇이냐 콘텐츠냐, 고민할 것도 없지 🍜',
                    '배달 한 번 안 시키면 되는 거지~ 🍜',
                  ]},
                  { max: 1500, label: '햄버거 세트 🍔', quotes: [
                    '빅맥 세트 하나 참으면 프로 콘텐츠 완성! 🍔',
                    '패스트푸드 한 끼 vs 콘텐츠 한 편... 현명한 선택 🍔',
                  ]},
                  { max: 2000, label: '치킨 한 마리 🍗', quotes: [
                    '치킨 한 마리 vs 프로 콘텐츠... 어렵다 🍗',
                    '오늘 치킨 대신 콘텐츠 어때? 🍗',
                  ]},
                  { max: 3000, label: '피자 라지 🍕', quotes: [
                    '피자 한 판이면 콘텐츠가 나오는 세상 🍕',
                    '배달 피자 한 판 vs 프로 영상... 고민되네 🍕',
                  ]},
                  { max: Infinity, label: '스시 오마카세 🍣', quotes: [
                    '오마카세 한 끼 생각하면 오히려 싼 거 아냐? 🍣',
                    '맛집 한 번 참으면 대작이 탄생! 🍣',
                  ]},
                ];
                const tier = foodTiers.find(t => est <= t.max) || foodTiers[foodTiers.length - 1];
                const quote = tier.quotes[Math.floor(Math.random() * tier.quotes.length)];
                return (
                  <div className="mx-auto max-w-lg mb-5 rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(139,92,246,0.06) 100%)' }}>
                    <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
                      <span className="text-base">📋</span>
                      <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#f59e0b' }}>{t('scriptReview.estimatedCost')}</span>
                      <span className="ml-auto text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        {tier.label}
                      </span>
                    </div>
                    <div className="px-5 py-2.5 text-center" style={{ borderBottom: '1px solid rgba(245,158,11,0.1)' }}>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('scriptReview.description', { count: sc })}
                      </p>
                    </div>
                    <div className="px-5 py-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(139,92,246,0.15)' }}>📝</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{t('scriptReview.scriptGeneration')}</span>
                        </div>
                        <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{scriptCost}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(96,165,250,0.15)' }}>🖼️</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{t('scriptReview.imagesCount', { count: sc })} <span className="text-[10px] opacity-60">({imgModel === 'gpt-image-1' ? 'GPT' : 'Gemini'} @{imgPer})</span></span>
                        </div>
                        <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{imgTotal}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px]" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>🔊</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{t('scriptReview.ttsChars')} <span className="text-[10px] opacity-60">({totalChars}{t('completion.unit.chars')})</span></span>
                        </div>
                        <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{ttsTotal}</span>
                      </div>
                      <div className="border-t pt-2 mt-1 flex items-center justify-between" style={{ borderColor: 'rgba(245,158,11,0.2)' }}>
                        <span className="text-sm font-black" style={{ color: '#f59e0b' }}>{t('scriptReview.estimatedTotal')}</span>
                        <span className="text-lg font-black tabular-nums" style={{ color: '#f59e0b' }}>{est} <span className="text-xs font-bold">{t('common.credits')}</span></span>
                      </div>
                    </div>
                    <div className="px-5 py-2.5 text-center" style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderTop: '1px solid rgba(245,158,11,0.1)' }}>
                      <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
                        "{quote}"
                      </p>
                    </div>
                  </div>
                );
              })()}
              {/* 크레딧 부족 경고 */}
              {isInsufficientCredits && (
                <div className="mx-auto max-w-md mb-4 px-4 py-3 rounded-xl bg-red-900/30 border border-red-500/50 text-center">
                  <p className="text-sm font-bold text-red-400 mb-1">
                    {t('scriptReview.insufficientCredits')}
                  </p>
                  <p className="text-xs text-red-300/80">
                    {t('scriptReview.insufficientDesc', { est, balance: userCredits.toLocaleString() })}
                    <span className="ml-1 opacity-70">({t('scriptReview.insufficientShort', { amount: est - userCredits })})</span>
                  </p>
                  <button
                    onClick={() => setShowCreditShop(true)}
                    className="mt-2 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    {t('scriptReview.chargeCredits')}
                  </button>
                </div>
              )}
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleRegenerateScript}
                  disabled={isProcessingRef.current}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all border hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                >
                  {t('scriptReview.regenerateScript')}
                </button>
                <button
                  onClick={isInsufficientCredits ? () => setShowCreditShop(true) : handleApproveScript}
                  className={isInsufficientCredits
                    ? "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-black py-3 px-12 rounded-xl transition-all text-base shadow-lg shadow-red-500/40"
                    : "bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-black py-3 px-12 rounded-xl transition-all text-base shadow-lg shadow-cyan-500/40 hover:shadow-cyan-400/60 hover:scale-105 animate-pulse"
                  }
                >
                  {isInsufficientCredits ? `💳 ${t('scriptReview.chargeButton')}` : `🚀 ${t('scriptReview.startGeneration')}`}
                </button>
                <button
                  onClick={() => {
                    setStep(GenerationStep.IDLE);
                    setGeneratedData([]);
                    assetsRef.current = [];
                    pendingGenContextRef.current = null;
                    setProgressMessage('');
                  }}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:opacity-80"
                  style={{ borderColor: 'var(--border-default)', color: 'var(--text-muted)' }}
                >
                  {t('common.cancel')}
                </button>
              </div>
          </div>
          );
        })()}

        <ResultTable
            data={generatedData}
            editingIndex={editingIndex}
            onEditToggle={setEditingIndex}
            onUpdateAsset={handleUpdateAsset}
            onRegenerateAudio={handleRegenerateAudio}
            onReorderScenes={handleReorderScenes}
            onDeleteScene={handleDeleteScene}
            onAddScene={handleAddScene}
            onUploadSceneImage={handleUploadSceneImage}
            onSetCustomDuration={handleSetCustomDuration}
            onSetZoomEffect={handleSetZoomEffect}
            onSetTransition={handleSetTransition}
            onSetDefaultTransition={handleSetDefaultTransition}
            onAutoZoom={handleAutoZoom}
            onRegenerateImage={handleRegenerateImage}
            onDuplicateScene={handleDuplicateScene}
            onRegenerateFailedScenes={handleRegenerateFailedScenes}
            onExportVideo={triggerVideoExport}
            userPlan={userPlan}
            isExporting={isVideoGenerating}
            animatingIndices={animatingIndices}
            onGenerateAnimation={handleGenerateAnimation}
            bgmData={bgmData}
            bgmVolume={bgmVolume}
            onBgmChange={setBgmData}
            onBgmVolumeChange={setBgmVolume}
            bgmDuckingEnabled={bgmDuckingEnabled}
            bgmDuckingAmount={bgmDuckingAmount}
            onBgmDuckingToggle={setBgmDuckingEnabled}
            onBgmDuckingAmountChange={setBgmDuckingAmount}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onOpenThumbnail={() => setShowThumbnailGenerator(true)}
            onSaveProject={async () => {
              try {
                await pmSaveProject(currentTopic, assetsRef.current, costRef.current);
                setToastMessage(t('progress.projectSaved', { name: currentTopic })); setTimeout(() => setToastMessage(null), 3000);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                setToastMessage(t('progress.projectSaveFailed', { error: msg })); setTimeout(() => setToastMessage(null), 3000);
              }
            }}
        />
      </main>
      )}

      {/* 크레딧 충전 모달 */}
      {showCreditShop && (
        <CreditShop
          onClose={() => { setShowCreditShop(false); fetchCredits(); }}
          currentCredits={userCredits}
          currentPlan={userPlan}
        />
      )}

      {/* 사용자 프로필 모달 */}
      {showUserProfile && (
        <UserProfile
          onClose={() => { setShowUserProfile(false); fetchCredits(); }}
          currentCredits={userCredits}
          currentPlan={userPlan}
          userName={userName || ''}
          onNameChange={setUserName}
          gameState={{
            levelInfo: game.levelInfo,
            userState: game.userState,
            equipped: game.equipped,
            achievements: game.achievements,
            inventory: game.inventory,
            synced: game.synced,
          }}
        />
      )}

      {/* 결제 완료 확인 모달 */}
      {paymentOrderId && (
        <PaymentSuccess
          orderId={paymentOrderId}
          onDone={() => { setPaymentOrderId(null); fetchCredits(); }}
        />
      )}

      {/* 썸네일 생성 모달 */}
      {showThumbnailGenerator && (
        <ThumbnailGenerator
          topic={currentTopic}
          sceneImages={generatedData.filter(d => d.imageData).map(d => d.imageData!)}
          contentSummary={generatedData.slice(0, 3).map(d => d.narration).filter(Boolean).join(' ').slice(0, 400)}
          onClose={() => setShowThumbnailGenerator(false)}
        />
      )}

      {/* 로그인/회원가입 모달 (게스트용) */}
      {showAuthModal && (
        <AuthModal
          onSuccess={handleAuthSuccess}
          onAdminSuccess={handleAdminSuccess}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {/* 카운트다운 이펙트 */}
      {countdownNumber !== null && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <span key={countdownNumber} className="text-9xl font-black animate-countdown" style={{ color: '#ffffff', textShadow: '0 0 60px rgba(59,130,246,0.7), 0 0 120px rgba(59,130,246,0.3)' }}>{countdownNumber}</span>
        </div>
      )}

      {/* 완료 칭찬 + 리액션 */}
      {completionCompliment && step === GenerationStep.COMPLETED && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9998] animate-bounce-in">
          <div className="px-6 py-4 rounded-2xl shadow-2xl border text-center" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-dynamic, var(--border-default))' }}>
            <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{completionCompliment}</p>
            {showReactions && (
              <div className="flex gap-3 justify-center">
                {(['😍','🔥','👏'] as const).map(emoji => (
                  <button key={emoji} onClick={() => {
                    setShowReactions(false);
                    const colorMap: Record<string, string[]> = {'😍':['#ec4899','#f43f5e','#f97316','#fbbf24'],'🔥':['#ef4444','#f97316','#eab308','#dc2626'],'👏':['#3b82f6','#8b5cf6','#06b6d4','#10b981']};
                    launchConfetti(colorMap[emoji]);
                  }} className="text-2xl hover:scale-125 transition-transform active:scale-90">{emoji}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {/* 유휴 파티클 */}
      {showIdleParticles && (
        <>
          {[...Array(8)].map((_, i) => (
            <span key={i} className="idle-particle" style={{ left: `${10 + Math.random() * 80}%`, bottom: `${10 + Math.random() * 30}%`, animationDelay: `${i * 0.5}s`, animationDuration: `${3 + Math.random() * 2}s` }}>✨</span>
          ))}
        </>
      )}

      {/* 마일스톤/콤보 토스트 */}
      {consumablePopup && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center pointer-events-none">
          <div
            className="flex flex-col items-center gap-3 px-10 py-8 rounded-3xl shadow-2xl"
            style={{
              background: consumablePopup.type === 'credit_voucher'
                ? 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)'
                : 'linear-gradient(135deg, #2e1065 0%, #4c1d95 50%, #6d28d9 100%)',
              border: consumablePopup.type === 'credit_voucher'
                ? '2px solid rgba(52,211,153,0.5)'
                : '2px solid rgba(167,139,250,0.5)',
              boxShadow: consumablePopup.type === 'credit_voucher'
                ? '0 0 60px rgba(16,185,129,0.4), 0 20px 60px rgba(0,0,0,0.5)'
                : '0 0 60px rgba(139,92,246,0.4), 0 20px 60px rgba(0,0,0,0.5)',
              animation: 'overlay-scale-up 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards',
            }}
          >
            <span style={{ fontSize: '4rem', lineHeight: 1, filter: 'drop-shadow(0 0 16px rgba(255,255,255,0.5))' }}>
              {consumablePopup.type === 'credit_voucher' ? '💰' : '⚡'}
            </span>
            <div className="text-center">
              <div className="text-white font-black" style={{ fontSize: '1.5rem', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                {consumablePopup.type === 'credit_voucher'
                  ? `+${consumablePopup.credits} 크레딧 획득!`
                  : `XP 부스터 활성화!`}
              </div>
              <div className="mt-1" style={{ color: consumablePopup.type === 'credit_voucher' ? '#6ee7b7' : '#c4b5fd', fontSize: '1rem', fontWeight: 600 }}>
                {consumablePopup.type === 'credit_voucher'
                  ? '크레딧이 지급됐습니다'
                  : `x${consumablePopup.multiplier} XP · ${consumablePopup.until ? new Date(consumablePopup.until).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}까지`}
              </div>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] animate-toast-in">
          <div className="px-6 py-3 rounded-2xl shadow-2xl border text-sm font-bold animate-bounce-in" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
            {toastMessage}
          </div>
        </div>
      )}

      {/* ── 게이미피케이션 v2 UI ── */}

      {/* 이벤트 배너 (활성 이벤트가 있을 때 상단 표시) */}
      <EventBanner events={game.activeEvents} isDark={isDark} />

      {/* 일일 퀘스트 패널 (플로팅 버튼) */}
      {game.synced && (
        <DailyQuestPanel
          quests={game.quests}
          onClaimReward={game.claimQuestReward}
          isDark={isDark}
        />
      )}

      {/* 게임 오버레이 (레벨업/업적/뽑기/마일스톤) */}
      {(overlayLevelUp || overlayAchievement || overlayGacha || overlayMilestone) && (
        <GameOverlay
          levelUp={overlayLevelUp}
          achievementUnlock={overlayAchievement}
          gachaResult={overlayGacha}
          milestone={overlayMilestone}
          gachaSettings={game.config?.gachaSettings}
          onDismiss={() => { setOverlayLevelUp(null); setOverlayAchievement(null); setOverlayGacha(null); setOverlayMilestone(null); }}
        />
      )}

      {/* 생성 완료 결과 화면 */}
      {completionData && (
        <CompletionScreen
          {...completionData}
          onClose={() => setCompletionData(null)}
          onOpenThumbnail={() => { setCompletionData(null); setShowThumbnailGenerator(true); }}
        />
      )}

      {/* 업적 쇼케이스 모달 */}
      {showAchievements && game.achievements && (
        <AchievementShowcase
          isOpen={showAchievements}
          onClose={() => setShowAchievements(false)}
          achievements={game.achievements}
          isDark={isDark}
        />
      )}

      {/* 인벤토리 모달 */}
      {showInventory && game.inventory && (
        <InventoryModal
          isOpen={showInventory}
          onClose={() => setShowInventory(false)}
          inventory={game.inventory}
          equipped={game.equipped}
          gachaTickets={game.userState?.gachaTickets ?? 0}
          onEquipItem={game.equipItem}
          onUseConsumable={async (inventoryItemId: string) => {
            const result = await game.useConsumable(inventoryItemId);
            if (result?.success) {
              if (result.effect?.type === 'credit_voucher') {
                await fetchCredits();
                setConsumablePopup({ type: 'credit_voucher', credits: result.effect.credits });
                setTimeout(() => setConsumablePopup(null), 3500);
              } else if (result.effect?.type === 'xp_booster') {
                setConsumablePopup({ type: 'xp_booster', multiplier: result.effect.multiplier, until: result.effect.until });
                setTimeout(() => setConsumablePopup(null), 4000);
              }
            }
          }}
          onPullGacha={async () => {
            const result = await game.pullGacha();
            if (result?.item) {
              setOverlayGacha({ item: result.item, isNew: result.isNew });
              // 뽑기 퀘스트 + 상태 새로고침을 병렬 & 백그라운드 처리
              Promise.all([game.recordAction('gacha_pull', 1), game.refreshState()]).catch(() => {});
            }
          }}
          isDark={isDark}
        />
      )}

      {/* 리더보드 모달 */}
      <LeaderboardWidget
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        userLevel={game.levelInfo.level}
        userXp={game.levelInfo.currentXp}
        userStreak={game.userState?.streakCount ?? 0}
        isDark={isDark}
      />
    </div>
  );
};

const WrappedApp: React.FC = () => (
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);

export default WrappedApp;
