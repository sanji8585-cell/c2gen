import { useState, useCallback, useRef } from 'react';

export function useUserAccount() {
  const [userCredits, setUserCredits] = useState<number>(0);
  const [userPlan, setUserPlan] = useState<string>('free');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const avatarLoadedRef = useRef(false);

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

  return {
    userCredits, setUserCredits,
    userPlan, setUserPlan,
    userAvatarUrl, setUserAvatarUrl,
    fetchCredits,
  };
}
