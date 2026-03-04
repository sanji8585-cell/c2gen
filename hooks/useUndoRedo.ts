import { useRef, useCallback, useState } from 'react';

interface UndoRedoReturn<T> {
  pushState: (state: T) => void;
  undo: (current: T) => T | null;
  redo: (current: T) => T | null;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

/**
 * Undo/Redo 커스텀 훅
 * - 얕은 복제로 메모리 효율적 (base64 문자열은 참조 공유)
 * - 디바운스로 슬라이더 등 연속 호출 대응 (첫 상태 보존, 중간 무시)
 * - 최대 히스토리 제한
 */
export function useUndoRedo<T>(
  maxHistory: number = 30,
  debounceMs: number = 300
): UndoRedoReturn<T> {
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const lastPushTimeRef = useRef<number>(0);

  // canUndo/canRedo UI 갱신용 카운터
  const [, setVersion] = useState(0);
  const bump = () => setVersion(v => v + 1);

  const pushState = useCallback((state: T) => {
    const now = Date.now();

    // 디바운스 구간 내 연속 호출 → 첫 번째 상태 유지, 중간 무시
    if (now - lastPushTimeRef.current < debounceMs && pastRef.current.length > 0) {
      // 타임스탬프만 갱신 (디바운스 윈도우 연장)
      lastPushTimeRef.current = now;
      futureRef.current = [];
      return;
    }

    pastRef.current.push(state);
    if (pastRef.current.length > maxHistory) {
      pastRef.current.shift();
    }

    lastPushTimeRef.current = now;
    futureRef.current = [];
    bump();
  }, [maxHistory, debounceMs]);

  const undo = useCallback((current: T): T | null => {
    if (pastRef.current.length === 0) return null;

    const prev = pastRef.current.pop()!;
    futureRef.current.push(current);
    bump();
    return prev;
  }, []);

  const redo = useCallback((current: T): T | null => {
    if (futureRef.current.length === 0) return null;

    const next = futureRef.current.pop()!;
    pastRef.current.push(current);
    bump();
    return next;
  }, []);

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, []);

  return {
    pushState,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    clear,
  };
}
