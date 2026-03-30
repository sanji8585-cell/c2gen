
import React, { useState, useCallback, useRef, useEffect } from 'react';
import AdminDashboard from './components/admin/AdminDashboard';
import AuthGate from './components/AuthGate';
import AuthModal from './components/AuthModal';
import Header from './components/Header';
import InputSection from './components/InputSection';
import ResultCards from './components/ResultCards';
import ScriptReviewBanner from './components/ScriptReviewBanner';
import GameUI from './components/GameUI';
import MobileNav from './components/MobileNav';
import { GeneratedAsset, GenerationStep, ScriptScene, CostBreakdown, ReferenceImages, DEFAULT_REFERENCE_IMAGES, SubtitleConfig, SceneDirectives } from './types';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useCostTracker } from './hooks/useCostTracker';
import { useSceneEditor } from './hooks/useSceneEditor';
import { useUserAccount } from './hooks/useUserAccount';
import { useTheme } from './hooks/useTheme';
import { generateScript, generateScriptChunked, findTrendingTopics, generateAudioForScene, generateMotionPrompt, analyzeMood, generateAdvancedScript } from './services/geminiService';
import { getDominantMood } from './services/prompts';
import { applySceneRoleOffset } from './services/audioTagsService';
import type { AdvancedSettings } from './components/input/HeroInput';
import ThumbnailGenerator from './components/ThumbnailGenerator';
import { generateImage, getSelectedImageModel } from './services/imageService';
import { generateAudioWithElevenLabs, generateMusicWithElevenLabs } from './services/elevenLabsService';
import { generateVideo } from './services/videoService';
import { generateVideoFromImage } from './services/falService';
import { parseDirectives, propagateSceneContext } from './services/directiveParser';
// projectService는 useProjectManagement 훅으로 이동
import { useGameState } from './hooks/useGameState';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useProjectManagement } from './hooks/useProjectManagement';
// AvatarFrame moved into Header component
import { useTranslation } from 'react-i18next';

import { SavedProject } from './types';
import { CONFIG, PRICING, formatKRW, ResolutionTier, Language, BGM_LIBRARY, LANGUAGE_CONFIG, BgmMood } from './config';
import ProjectGallery from './components/ProjectGallery';
import Playground from './components/Playground';
import CreditShop from './components/CreditShop';
import UserProfile from './components/UserProfile';
import PaymentSuccess from './components/PaymentSuccess';
import PilotDashboard from './components/PilotDashboard';
import DeepScript from './components/DeepScript';
import LandingPage from './components/landing/LandingPage';
import * as FileSaver from 'file-saver';

const saveAs = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
import { AI_PERSONALITY, PRO_TIPS, launchConfetti, getStorytellingPhase, getTimeGreeting, wait } from './constants/uiConstants';

import { GalleryErrorBoundary, GlobalErrorBoundary, setupGlobalErrorReporting } from './components/ErrorBoundaries';
setupGlobalErrorReporting();

type ViewMode = 'main' | 'gallery' | 'playground' | 'pilot' | 'deepscript';

// 인증 래퍼
const App: React.FC = () => {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <AuthProvider>
      <AppRouter isDark={isDark} onToggleTheme={toggleTheme} />
    </AuthProvider>
  );
};

// 라우팅 (관리자/일반/랜딩 분기)
const AppRouter: React.FC<{ isDark: boolean; onToggleTheme: () => void }> = ({ isDark, onToggleTheme }) => {
  const auth = useAuth();
  const pathname = window.location.pathname;
  const isAdminPath = pathname === '/admin';
  const isAppPath = pathname.startsWith('/app');

  if (auth.isAdmin && auth.adminToken) {
    return <AdminDashboard adminToken={auth.adminToken} onLogout={auth.handleAdminLogout} />;
  }
  if (isAdminPath) {
    return <AuthGate onSuccess={auth.handleAuthSuccess} onAdminSuccess={auth.handleAdminSuccess} mode="page" initialTab="admin" />;
  }

  // /landing 경로 → 랜딩페이지 미리보기 (임시)
  if (pathname === '/landing') {
    return (
      <>
        <LandingPage isDark={isDark} onToggleTheme={onToggleTheme} onOpenAuth={() => auth.setShowAuthModal(true)} />
        {auth.showAuthModal && (
          <AuthModal onSuccess={auth.handleAuthSuccess} onAdminSuccess={auth.handleAdminSuccess} onClose={() => auth.setShowAuthModal(false)} />
        )}
      </>
    );
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
    const tab = urlParams.get('tab');
    if (tab === 'pilot') return 'pilot';
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
  const [bgmVolume, setBgmVolume] = useState(0.6);
  const [bgmDuckingEnabled, setBgmDuckingEnabled] = useState(true);
  const [bgmDuckingAmount, setBgmDuckingAmount] = useState(0.3);

  // 크레딧 시스템 (useUserAccount hook)
  const { userCredits, setUserCredits, userPlan, setUserPlan, userAvatarUrl, setUserAvatarUrl, fetchCredits } = useUserAccount();
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);
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
  const aiBgmUsedRef = useRef(false);
  const [completionData, setCompletionData] = useState<{
    cost: any; sceneCount: number; xpGained: number; combo: number;
    elapsedSeconds: number; questProgress?: { completed: number; total: number }; gachaTickets?: number;
    bgmCost?: number;
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
  const sessionComboRef = useRef(0);
  // 항상 최신 game 상태를 ref로 유지 (stale closure 방지)
  const gameRef = useRef({ isAuthenticated, synced: game.synced, recordAction: game.recordAction, setOverlayAchievement });
  useEffect(() => {
    gameRef.current = { isAuthenticated, synced: game.synced, recordAction: game.recordAction, setOverlayAchievement };
  });
  useEffect(() => { sessionComboRef.current = sessionCombo; }, [sessionCombo]);

  // 비용 추적
  const { costRef, addCost, resetCost } = useCostTracker();

  // Undo/Redo 시스템
  const { pushState: pushUndoState, undo: undoState, redo: redoState, canUndo, canRedo, clear: clearHistory } = useUndoRedo<GeneratedAsset[]>(30, 300);

  const usedTopicsRef = useRef<string[]>([]);
  const assetsRef = useRef<GeneratedAsset[]>([]);
  const sceneDirectivesRef = useRef<Record<number, SceneDirectives>>({}); // V2.0: 씬별 디렉티브 독립 저장 (assetsRef 덮어쓰기 방어)
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

    isAbortedRef.current = false; // 마운트 시 초기화
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

  // addCost, resetCost는 useCostTracker 훅에서 제공

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
    aiBgmUsedRef.current = false;

    setStep(GenerationStep.SCRIPTING);
    setProgressMessage(t('progress.booting'));

    try {
      const hasKey = await checkApiKeyStatus();
      if (!hasKey && (window as any).aistudio) {
        await (window as any).aistudio.openSelectKey();
      }

      setGeneratedData([]);
      assetsRef.current = [];
      sceneDirectivesRef.current = {};
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
        // 수동 대본: 프로젝트명용 타이틀은 별도 보관, API에는 원래 topic 전달
        const firstLine = sourceText.split('\n').find(l => l.trim().length > 0)?.trim() || '수동 대본';
        setCurrentTopic(firstLine.slice(0, 50));
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

      const initialAssets = scriptScenes.map((scene, i) => {
        // sentiment 기반 줌 이펙트 자동 적용
        const sentiment = scene.analysis?.sentiment;
        const motionType = scene.analysis?.motion_type;
        let zoomEffect: GeneratedAsset['zoomEffect'];
        if (sentiment === 'POSITIVE') {
          zoomEffect = 'zoomIn';
        } else if (sentiment === 'NEGATIVE') {
          zoomEffect = motionType === '동적' ? (i % 2 === 0 ? 'panLeft' : 'panRight') : 'none';
        } else {
          zoomEffect = motionType === '동적' ? (i % 2 === 0 ? 'panLeft' : 'panRight') : 'zoomIn';
        }
        return {
          ...scene, imageData: null, audioData: null, audioDuration: null, subtitleData: null, videoData: null, videoDuration: null, status: 'pending' as const, zoomEffect,
        };
      });
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

  // ── Engine V2.0: 고급 대본 전용 핸들러 ──
  // Sprint 0: 수동 대본과 동일하게 동작 (래퍼)
  // Sprint 1~5에서 디렉티브 파싱, 다중 음성, 일관성 모드 등 점진적 확장
  const handleGenerateAdvanced = useCallback(async (
    topic: string,
    refImgs: ReferenceImages,
    sourceText: string,
  ) => {
    // ── 핵심: 디렉티브를 Gemini에 보내지 않는다 ──
    // 1단계: 원본 문장별로 디렉티브 추출 + 정제된 텍스트 생성
    const sourceLines = sourceText.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const parsedLines = sourceLines.map(line => parseDirectives(line));
    const cleanSourceText = parsedLines.map(p => p.cleanNarration).join('\n');

    // 2단계: 정제된 텍스트(디렉티브 제거)만 Gemini에 전달
    await handleGenerate(topic, refImgs, cleanSourceText);

    // handleGenerate가 정상 완료(SCRIPT_REVIEW)했는지 확인
    if (!pendingGenContextRef.current || assetsRef.current.length === 0) return;

    // 3단계: Gemini가 반환한 씬에 사전 추출한 디렉티브를 재합체
    console.log('[Advanced] 원본 문장:', sourceLines.length, '| Gemini 씬:', assetsRef.current.length);
    console.log('[Advanced] 추출된 디렉티브:', parsedLines.map((p, i) => ({ line: i, directives: p.directives, raw: p.rawDirectives })));
    const updated = assetsRef.current.map((asset, idx) => {
      // Gemini 응답 narration에도 혹시 남아있을 수 있는 디렉티브 정리
      const { cleanNarration, directives: geminiDirectives, rawDirectives } = parseDirectives(asset.narration);

      // 원본에서 추출한 디렉티브 (우선) + Gemini 응답에 남은 디렉티브 (보조)
      const sourceDirectives = idx < parsedLines.length ? parsedLines[idx].directives : {};
      const mergedDirectives = { ...geminiDirectives, ...sourceDirectives };
      const hasAnyDirective = Object.keys(mergedDirectives).length > 0;

      if (!hasAnyDirective) return asset;

      return {
        ...asset,
        narration: rawDirectives.length > 0 ? cleanNarration : asset.narration,
        analysis: { ...asset.analysis, directives: mergedDirectives },
      };
    });

    // 연결 디렉티브 처리 (프롬프트 레벨 일관성)
    const hasConnectionDirectives = updated.some(a =>
      a.analysis?.directives?.KEEP_PREV || a.analysis?.directives?.SAME_PLACE || a.analysis?.directives?.TIME_PASS
    );
    if (hasConnectionDirectives) {
      const propagated = propagateSceneContext(updated);
      assetsRef.current = propagated as typeof assetsRef.current;
      setGeneratedData([...propagated] as typeof assetsRef.current);
    } else {
      assetsRef.current = updated;
      setGeneratedData([...updated]);
    }

    // V2.0 디버그: 디렉티브 저장 직후 확인
    // 디렉티브를 독립 ref에도 저장 (assetsRef 덮어쓰기 방어)
    const dirMap: Record<number, SceneDirectives> = {};
    assetsRef.current.forEach((a, i) => {
      const d = a.analysis?.directives;
      if (d && Object.keys(d).length > 0) dirMap[i] = d;
    });
    sceneDirectivesRef.current = dirMap;
    console.log('[Advanced] 디렉티브 저장 완료. sceneDirectivesRef:', dirMap);
  }, [handleGenerate]);

  // ── 심층대본 → 스토리보드 직접 연결 (Gemini 재생성 없이 씬 분할만) ──
  const handleDeepScriptToStoryboard = useCallback((script: string, styleId: string) => {
    if (isProcessingRef.current) return;

    // 화풍 설정 적용
    if (styleId) localStorage.setItem('tubegen_image_style', styleId);

    // 대본을 빈 줄 기준으로 씬 분할
    const scenes = script
      .split(/\n\s*\n/)
      .map(block => block.trim())
      .filter(block => block.length > 0);

    if (scenes.length === 0) {
      setProgressMessage('대본이 비어있습니다.');
      return;
    }

    const language = (localStorage.getItem(CONFIG.STORAGE_KEYS.LANGUAGE) as Language) || 'ko';
    const firstLine = scenes[0].split('\n')[0].trim().slice(0, 50);
    setCurrentTopic(firstLine);

    // 각 씬을 ScriptScene 형태로 변환 (디렉티브 파싱 + 마크다운/잔여 괄호 정제)
    const scriptScenes: ScriptScene[] = scenes.map((sceneText, i) => {
      const { cleanNarration: parsed, directives } = parseDirectives(sceneText);
      // 추가 정제: 마크다운(**bold**, ##), 씬 번호(**S#1**), 남은 디렉티브 괄호 제거
      const cleanNarration = parsed
        .replace(/\*\*S?#?\d+\*\*/g, '')           // **S#18**, **#1** 등 씬 번호
        .replace(/\*\*(내레이션|나레이션|Narration)[:\s]?\*\*/gi, '') // **내레이션:** 라벨
        .replace(/\*\*/g, '')                       // 남은 ** 마크다운 볼드
        .replace(/\((?:배경|분위기|구도|카메라|색상|텍스트|자막|스타일|화자|이전씬유지|같은장소|시간경과)[^)]*\)/g, '') // 남은 디렉티브 괄호
        .replace(/\s{2,}/g, ' ')                    // 다중 공백 정리
        .trim();
      const sentiment = directives.MOOD === '밝음' || directives.MOOD === '따뜻함' ? 'POSITIVE' as const
        : directives.MOOD === '어두움' || directives.MOOD === '긴장' ? 'NEGATIVE' as const
        : 'NEUTRAL' as const;

      return {
        narration: cleanNarration,
        visualPrompt: '', // 이미지 생성 시 자동 생성됨
        analysis: {
          sentiment,
          motion_type: '정적' as const,
          composition_type: (directives.COMPOSITION || 'STANDARD') as any,
          directives,
          scene_role: i === 0 ? 'hook' : i === scenes.length - 1 ? 'cta' : 'build',
        },
      };
    });

    // 디렉티브 저장
    const dirMap: Record<number, any> = {};
    scriptScenes.forEach((s, i) => {
      const d = s.analysis?.directives;
      if (d && Object.keys(d).length > 0) dirMap[i] = d;
    });
    sceneDirectivesRef.current = dirMap;

    // initialAssets 생성 (기존 handleGenerate 로직과 동일)
    const initialAssets = scriptScenes.map((scene, i) => {
      const sentiment = scene.analysis?.sentiment;
      let zoomEffect: GeneratedAsset['zoomEffect'];
      if (sentiment === 'POSITIVE') zoomEffect = 'zoomIn';
      else if (sentiment === 'NEGATIVE') zoomEffect = i % 2 === 0 ? 'panLeft' : 'panRight';
      else zoomEffect = 'zoomIn';

      return {
        ...scene, imageData: null, audioData: null, audioDuration: null,
        subtitleData: null, videoData: null, videoDuration: null,
        status: 'pending' as const, zoomEffect,
      };
    });

    // 연결 디렉티브 처리
    const propagated = propagateSceneContext(initialAssets);
    assetsRef.current = propagated as typeof assetsRef.current;
    setGeneratedData([...propagated] as typeof assetsRef.current);

    // 수동 대본으로 context 설정
    const refImgs = { character: [], style: [] } as ReferenceImages;
    const hasRefImages = false;
    pendingGenContextRef.current = { targetTopic: firstLine, refImgs, language, hasRefImages, sourceText: script };

    // 스크립트 검토 단계로 진입
    setViewMode('main');
    setStep(GenerationStep.SCRIPT_REVIEW);
    setProgressMessage(`심층대본 ${initialAssets.length}씬이 로드되었습니다. 확인 후 생성을 시작하세요.`);
  }, []);

  // ── Engine V2.0: 고급 대본 전용 에셋 생성 ──
  // Sprint 4: 일관성 모드 시 의존 그래프 기반 이미지 순차 생성
  // 현재는 handleApproveScript에 위임 (Sprint 4에서 순차 로직 추가 예정)
  // Note: handleApproveScript는 이미 assetsRef를 사용하므로 디렉티브 정보가 포함됨
  // prevSceneImage 파라미터는 API/서비스 레이어에 준비 완료 — 향후 순차 렌더링 시 활용

  // ── AI Assist: 의도 → 고급 대본 생성 ──
  const [isAiAssisting, setIsAiAssisting] = useState(false);
  const [aiAssistResult, setAiAssistResult] = useState<string | null>(null);

  const handleAiAssist = useCallback(async (intent: string, settings: AdvancedSettings, assistMode: 'create' | 'refine' | 'viral' = 'create') => {
    setIsAiAssisting(true);
    try {
      const language = localStorage.getItem('tubegen_language') || 'ko';
      // 화자 이름을 CharacterVoiceManager에서 읽어서 AI에게 전달
      let characterNames: string[] = [];
      try {
        const voices = JSON.parse(localStorage.getItem('tubegen_character_voices') || '[]');
        characterNames = voices.map((v: any) => v.name).filter(Boolean);
      } catch {}
      const result = await generateAdvancedScript(intent, { ...settings, characterNames } as any, language, assistMode);
      setAiAssistResult(typeof result === 'string' ? result : (result as any).script || String(result));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[AI Assist] Failed:', msg);
      if (msg.includes('insufficient_credits') || msg.includes('402')) {
        setToastMessage('크레딧이 부족합니다. 충전 후 다시 시도하세요.');
      } else {
        setToastMessage('AI 대본 생성에 실패했습니다. 다시 시도해주세요.');
      }
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsAiAssisting(false);
    }
  }, []);

  // ── Phase 2: 스크립트 승인 → 에셋 생성 ──
  const handleApproveScript = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (!pendingGenContextRef.current) return;

    // V2.0 디버그: 디렉티브 존재 여부 확인
    console.log('[ApproveScript] 씬 수:', assetsRef.current.length);
    assetsRef.current.forEach((a, i) => {
      const d = a.analysis?.directives;
      if (d && Object.keys(d).length > 0) console.log(`[ApproveScript] 씬 ${i+1} directives:`, d);
    });
    if (!assetsRef.current.some(a => a.analysis?.directives && Object.keys(a.analysis.directives).length > 0)) {
      console.warn('[ApproveScript] ⚠️ 디렉티브가 없음! assetsRef가 덮어쓰기 된 것으로 추정');
    }

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
          const TTS_CONCURRENCY = 5; // 동시 TTS 생성 수 (ElevenLabs Scale 플랜 기준)
          const MAX_TTS_RETRIES = 2;
          let completedCount = 0;

          const generateSingleAudio = async (i: number) => {
              if (isAbortedRef.current) return;
              let success = false;

              for (let attempt = 0; attempt <= MAX_TTS_RETRIES && !success; attempt++) {
                  if (isAbortedRef.current) break;

                  try {
                      if (attempt > 0) {
                          await wait(500);
                      }

                      const elSpeed = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED) || '1.0');
                      const elStability = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY) || '0.6');

                      // V2.0: 화자별 Voice ID 매핑 (독립 ref 우선, assetsRef 폴백)
                      const speakerDirective = sceneDirectivesRef.current[i]?.SPEAKER || assetsRef.current[i].analysis?.directives?.SPEAKER;
                      let voiceIdForScene: string | undefined;
                      let matchedSpeakerName: string | undefined;
                      let matchedSpeakerColor: string | undefined;
                      if (speakerDirective) {
                        try {
                          const characterVoices = JSON.parse(localStorage.getItem('tubegen_character_voices') || '[]');
                          // 1차: 정확한 이름 매칭
                          let matched = characterVoices.find((v: any) => v.name === speakerDirective);
                          // 2차: 이름에 화자명이 포함되어 있는지 (부분 매칭)
                          if (!matched) matched = characterVoices.find((v: any) =>
                            speakerDirective.includes(v.name) || v.name.includes(speakerDirective)
                          );
                          // 3차: 성별 키워드로 매칭 (남자/남/male → gender male, 여자/여/female → gender female)
                          if (!matched) {
                            const isMale = /남자|남성|남|male|man|아빠|형|오빠|삼촌|할아버지/i.test(speakerDirective);
                            const isFemale = /여자|여성|여|female|woman|엄마|언니|누나|이모|할머니/i.test(speakerDirective);
                            if (isMale) matched = characterVoices.find((v: any) => v.gender === 'male');
                            else if (isFemale) matched = characterVoices.find((v: any) => v.gender === 'female');
                          }
                          // 4차: 순서 기반 폴백 (첫번째 ≠ 현재 → 두번째 화자)
                          if (!matched && characterVoices.length >= 2) {
                            const prevSpeaker = i > 0 ? (sceneDirectivesRef.current[i - 1]?.SPEAKER || assetsRef.current[i - 1].analysis?.directives?.SPEAKER) : null;
                            if (prevSpeaker && prevSpeaker !== speakerDirective) {
                              // 이전 씬과 다른 화자 → 이전 씬에서 안 쓴 voice 선택
                              const prevMatched = characterVoices.find((v: any) => v.name === prevSpeaker || (prevSpeaker.includes(v.name) || v.name.includes(prevSpeaker)));
                              matched = characterVoices.find((v: any) => v !== prevMatched) || characterVoices[1];
                            } else {
                              matched = characterVoices[0];
                            }
                          }
                              if (matched?.voiceId) {
                            voiceIdForScene = matched.voiceId;
                            matchedSpeakerName = matched.name;
                            matchedSpeakerColor = matched.color;
                          }
                          console.log(`[TTS] 씬 ${i + 1}: SPEAKER="${speakerDirective}" → matched=${matched?.name || 'NONE'} voiceId=${voiceIdForScene || 'DEFAULT'} speed=${matched?.speed ?? 'default'} stability=${matched?.stability ?? 'default'}`);
                        } catch (e) { console.warn('[TTS] Voice lookup error:', e); }
                      }

                      // V2.0: 화자별 speed/stability 적용 (설정 없으면 전역 기본값)
                      let speakerSpeed = elSpeed;
                      let speakerStability = elStability;
                      if (speakerDirective) {
                        try {
                          const cv = JSON.parse(localStorage.getItem('tubegen_character_voices') || '[]');
                          const m = cv.find((v: any) => v.name === speakerDirective || speakerDirective.includes(v.name) || v.name.includes(speakerDirective));
                          if (m?.speed !== undefined) speakerSpeed = m.speed;
                          if (m?.stability !== undefined) speakerStability = m.stability;
                        } catch {}
                      }
                      // scene_role 기반 감정 오프셋 적용
                      const sceneRole = assetsRef.current[i].analysis?.scene_role;
                      const adjusted = applySceneRoleOffset(speakerSpeed, speakerStability, sceneRole);
                      console.log(`[TTS] 씬 ${i + 1} 최종: speed=${adjusted.speed.toFixed(2)} stability=${adjusted.stability.toFixed(2)} (role=${sceneRole || 'none'})`);
                      const elResult = await generateAudioWithElevenLabs(
                        assetsRef.current[i].narration,
                        undefined, voiceIdForScene, undefined,
                        { speed: adjusted.speed, stability: adjusted.stability }
                      );
                      if (isAbortedRef.current) break;

                      if (elResult.audioData) {
                        updateAssetAt(i, {
                          audioData: elResult.audioData,
                          subtitleData: elResult.subtitleData,
                          audioDuration: elResult.estimatedDuration
                        });
                        // V2.0: 화자 정보 저장 (ref + React 상태 동기화)
                        if (matchedSpeakerName) {
                          updateAssetAt(i, {
                            speakerName: matchedSpeakerName,
                            speakerColor: matchedSpeakerColor,
                          });
                        }
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
                      // V2.0: 폴백 시 화자 성별/언어 전달
                      const fallbackGender = speakerDirective ? (/남자|남성|남|male|man/i.test(speakerDirective) ? 'male' : /여자|여성|여|female|woman/i.test(speakerDirective) ? 'female' : undefined) : undefined;
                      const fallbackLang = (localStorage.getItem('tubegen_language') as string) || 'ko';
                      const fallbackAudio = await generateAudioForScene(assetsRef.current[i].narration, fallbackGender, fallbackLang);
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
          const CONCURRENCY = 10; // 동시 이미지 생성 수 (Gemini 10개 가능)
          const imageModel = getSelectedImageModel();
          const imagePrice = PRICING.IMAGE[imageModel as keyof typeof PRICING.IMAGE] || 0.01;
          const renderMode = localStorage.getItem('tubegen_render_mode') || 'parallel';

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

                      // V2.0: 일관성 모드 시 이전 씬 이미지 참조 전달
                      const prevImg = (renderMode === 'consistency' && i > 0) ? assetsRef.current[i - 1]?.imageData : undefined;
                      // 톤 일관성: 전체 씬의 지배적 분위기 계산
                      const dominant = getDominantMood(assetsRef.current);
                      const img = await generateImage(assetsRef.current[i], refImgs, { prevSceneImage: prevImg, dominantMood: dominant });
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

          // V2.0 일관성 모드: 순차 생성 + 이전 씬 이미지 참조
          if (renderMode === 'consistency') {
            for (let i = 0; i < initialAssets.length; i++) {
              if (isAbortedRef.current) break;
              if (i > 0) {
                setProgressMessage(`씬 ${i + 1}/${initialAssets.length} 생성 중... (일관성 모드 — 이전 씬 참조)`);
              } else {
                setProgressMessage(`씬 ${i + 1}/${initialAssets.length} 생성 중...`);
              }
              await generateSingleImage(i);
            }
          } else {
            // 기존 병렬 처리
            const indices = initialAssets.map((_, i) => i);
            for (let start = 0; start < indices.length; start += CONCURRENCY) {
              if (isAbortedRef.current) break;
              const batch = indices.slice(start, start + CONCURRENCY);
              setProgressMessage(t('progress.generatingImages', { range: `${start + 1}~${Math.min(start + CONCURRENCY, indices.length)}`, total: indices.length }));
              await Promise.all(batch.map(i => generateSingleImage(i)));
            }
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

          // sentiment 분포 기반 BGM mood 보정
          let detectedMood = moodResult.mood as BgmMood;
          const sentiments = initialAssets.map(a => a.analysis?.sentiment).filter(Boolean);
          if (sentiments.length > 0) {
            const posRatio = sentiments.filter(s => s === 'POSITIVE').length / sentiments.length;
            const negRatio = sentiments.filter(s => s === 'NEGATIVE').length / sentiments.length;

            // POSITIVE 60%+ 인데 차가운 mood면 → inspiring으로 보정
            if (posRatio >= 0.6 && ['tech', 'dark', 'dramatic'].includes(detectedMood)) {
              detectedMood = 'inspiring';
            }
            // NEGATIVE 60%+ 인데 밝은 mood면 → dramatic으로 보정
            if (negRatio >= 0.6 && ['upbeat', 'inspiring', 'calm'].includes(detectedMood)) {
              detectedMood = 'dramatic';
            }
          }
          // 1차: ElevenLabs Music AI 생성, 2차: public/bgm/ 정적 파일
          let base64: string | null = null;

          // ElevenLabs Music 시도
          try {
            const bgmDurationMs = (localStorage.getItem('tubegen_bgm_duration') === '60' ? 60 : 30) * 1000;
            const musicResult = await generateMusicWithElevenLabs(detectedMood, bgmDurationMs);
            if (musicResult.audioBase64) { base64 = musicResult.audioBase64; aiBgmUsedRef.current = true; }
          } catch { /* ElevenLabs 실패 시 정적 파일 폴백 */ }

          // 폴백: 정적 BGM 파일
          if (!base64) {
            const matchedTrack = BGM_LIBRARY.find(t => t.mood === detectedMood) || BGM_LIBRARY[0];
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
            } catch { /* 파일 없으면 BGM 없이 진행 */ }
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
            bgmCost: aiBgmUsedRef.current ? 50 : 0,
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
            bgmCost: aiBgmUsedRef.current ? 50 : 0,
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
          bgmCost: aiBgmUsedRef.current ? 50 : 0,
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
    // 메인 생성 중(SCRIPTING/ASSETS)에만 블록, 완료 후 재생성은 허용
    if (isProcessingRef.current && step !== GenerationStep.COMPLETED) return;

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

        const img = await generateImage(assetsRef.current[idx], currentReferenceImages, { dominantMood: getDominantMood(assetsRef.current) });

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
      setToastMessage('이미지가 먼저 생성되어야 합니다.'); setTimeout(() => setToastMessage(null), 3000);
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
      let elSpeed = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_SPEED) || '1.0');
      let elStability = parseFloat(localStorage.getItem(CONFIG.STORAGE_KEYS.ELEVENLABS_STABILITY) || '0.6');
      // V2.0: 화자별 Voice ID + speed/stability 적용
      let voiceIdForRegen: string | undefined;
      const speakerDirective = sceneDirectivesRef.current[idx]?.SPEAKER || assetsRef.current[idx].analysis?.directives?.SPEAKER;
      if (speakerDirective) {
        try {
          const cv = JSON.parse(localStorage.getItem('tubegen_character_voices') || '[]');
          const matched = cv.find((v: any) => v.name === speakerDirective || speakerDirective.includes(v.name) || v.name.includes(speakerDirective))
            || cv.find((v: any) => /남자|남성|male/i.test(speakerDirective) ? v.gender === 'male' : /여자|여성|female/i.test(speakerDirective) ? v.gender === 'female' : false);
          if (matched?.voiceId) voiceIdForRegen = matched.voiceId;
          if (matched?.speed !== undefined) elSpeed = matched.speed;
          if (matched?.stability !== undefined) elStability = matched.stability;
        } catch {}
      }
      // scene_role 기반 감정 오프셋 적용
      const regenSceneRole = assetsRef.current[idx].analysis?.scene_role;
      const regenAdjusted = applySceneRoleOffset(elSpeed, elStability, regenSceneRole);
      const result = await generateAudioWithElevenLabs(
        assetsRef.current[idx].narration,
        undefined, voiceIdForRegen, undefined,
        { speed: regenAdjusted.speed, stability: regenAdjusted.stability }
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
      } else if (!isAbortedRef.current) {
        updateAssetAt(idx, { status: 'error', errorMessage: 'TTS 응답 없음 — 크레딧 또는 API 키를 확인하세요' });
        setProgressMessage(`씬 ${idx + 1} 음성 재생성 실패: 응답 없음`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      updateAssetAt(idx, { status: 'error', errorMessage: msg });
      setProgressMessage(`씬 ${idx + 1} 음성 재생성 실패: ${msg}`);
    }
  }, []);

  // 씬 편집 핸들러들 (useSceneEditor hook)
  const {
    handleReorderScenes, handleDeleteScene, handleAddScene,
    handleUploadSceneImage, handleSetCustomDuration, handleSetZoomEffect,
    handleDuplicateScene, handleAutoZoom, handleSetTransition, handleSetDefaultTransition
  } = useSceneEditor({
    assetsRef, setGeneratedData, setEditingIndex,
    pushUndoState, snapshotAssets, updateAssetAt
  });

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

      {/* C2 PILOT 뷰 */}
      {viewMode === 'pilot' && (
        isAuthenticated ? (
          <PilotDashboard onClose={() => setViewMode('main')} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-16 text-center">
            <div className="rounded-2xl border p-8" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}>
              <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>로그인이 필요합니다</h3>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>C2 PILOT을 사용하려면 로그인하세요</p>
              <button onClick={() => setShowAuthModal(true)} className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg transition-all">
                로그인 / 회원가입
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

      {/* 심층대본 뷰 (운영자 전용) */}
      {viewMode === 'deepscript' && (
        <DeepScript
          isAuthenticated={isAuthenticated}
          onShowAuthModal={() => setShowAuthModal(true)}
          onStartStoryboard={handleDeepScriptToStoryboard}
        />
      )}

      {/* 메인 뷰 */}
      {viewMode === 'main' && (
      <main className="py-8">
        <InputSection
          onGenerate={handleGenerate}
          onGenerateAdvanced={handleGenerateAdvanced}
          step={step}
          bgmData={bgmData}
          onBgmDataChange={setBgmData}
          bgmVolume={bgmVolume}
          onBgmVolumeChange={setBgmVolume}
          bgmDuckingEnabled={bgmDuckingEnabled}
          onBgmDuckingToggle={setBgmDuckingEnabled}
          bgmDuckingAmount={bgmDuckingAmount}
          onBgmDuckingAmountChange={setBgmDuckingAmount}
          onAiAssist={handleAiAssist}
          isAiAssisting={isAiAssisting}
          aiAssistResult={aiAssistResult}
          onAiAssistResultConsumed={() => setAiAssistResult(null)}
        />

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
               const total = generatedData.length;
               const imgDone = generatedData.filter(d => d.imageData).length;
               const ttsDone = generatedData.filter(d => d.audioData).length;
               const errors = generatedData.filter(d => d.status === 'error').length;
               const phase = getStorytellingPhase(imgDone, total);
               return (
                 <div className="mt-2 flex items-center justify-center gap-3 flex-wrap">
                   <span className="text-lg">{phase.icon}</span>
                   <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{phase.text}</span>
                   <span className="text-xs font-bold" style={{ color: imgDone === total ? '#22c55e' : '#60a5fa' }}>
                     🖼️ {imgDone}/{total}
                   </span>
                   <span className="text-xs font-bold" style={{ color: ttsDone === total ? '#22c55e' : '#a78bfa' }}>
                     🔊 {ttsDone}/{total}
                   </span>
                   {errors > 0 && (
                     <span className="text-xs font-bold" style={{ color: '#ef4444' }}>⚠️ {errors}</span>
                   )}
                 </div>
               );
             })()}
          </div>
        )}

        {/* 썸네일 생성 버튼 — ResultTable 툴바로 이동됨 */}

        {/* 감정곡선 에디터는 C2 PILOT 안에서만 사용 */}

        {/* 스크립트 검토 배너 */}
        {step === GenerationStep.SCRIPT_REVIEW && generatedData.length > 0 && (
          <ScriptReviewBanner
            generatedData={generatedData}
            bgmData={bgmData}
            userCredits={userCredits}
            userPlan={userPlan}
            onApprove={handleApproveScript}
            onRegenerate={handleRegenerateScript}
            onCancel={() => {
              setStep(GenerationStep.IDLE);
              setGeneratedData([]);
              assetsRef.current = [];
              pendingGenContextRef.current = null;
              setProgressMessage('');
            }}
            onOpenCreditShop={() => setShowCreditShop(true)}
            isProcessingRef={isProcessingRef}
            onUpdateNarration={(idx, narration) => {
              const updated = [...generatedData];
              updated[idx] = { ...updated[idx], narration };
              assetsRef.current[idx] = { ...assetsRef.current[idx], narration };
              setGeneratedData(updated);
            }}
          />
        )}

        <ResultCards
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
            userCredits={userCredits}
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
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] animate-toast-in pointer-events-none">
          <div className="px-6 py-3 rounded-2xl shadow-2xl border text-sm font-bold" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}>
            {toastMessage}
          </div>
        </div>
      )}

      {/* ── 게이미피케이션 v2 UI ── */}
      <GameUI
        game={game} isDark={isDark}
        overlayLevelUp={overlayLevelUp} overlayAchievement={overlayAchievement}
        overlayGacha={overlayGacha} overlayMilestone={overlayMilestone}
        setOverlayLevelUp={setOverlayLevelUp} setOverlayAchievement={setOverlayAchievement}
        setOverlayGacha={setOverlayGacha} setOverlayMilestone={setOverlayMilestone}
        completionData={completionData} setCompletionData={setCompletionData}
        setShowThumbnailGenerator={setShowThumbnailGenerator}
        showAchievements={showAchievements} setShowAchievements={setShowAchievements}
        showInventory={showInventory} setShowInventory={setShowInventory}
        showLeaderboard={showLeaderboard} setShowLeaderboard={setShowLeaderboard}
        setConsumablePopup={setConsumablePopup} fetchCredits={fetchCredits}
      />

      {/* 모바일 하단 네비게이션 */}
      <MobileNav activeView={viewMode} onChangeView={setViewMode} />
    </div>
  );
};

const WrappedApp: React.FC = () => (
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);

export default WrappedApp;
