import { useState, useRef, useCallback } from 'react';
import { CostBreakdown } from '../types';

const INITIAL_COST: CostBreakdown = {
  images: 0, tts: 0, videos: 0, total: 0,
  imageCount: 0, ttsCharacters: 0, videoCount: 0
};

export function useCostTracker() {
  const [, setCurrentCost] = useState<CostBreakdown | null>(null);
  const costRef = useRef<CostBreakdown>({ ...INITIAL_COST });

  const addCost = useCallback((type: 'image' | 'tts' | 'video', amount: number, count: number = 1) => {
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
  }, []);

  const resetCost = useCallback(() => {
    costRef.current = { ...INITIAL_COST };
    setCurrentCost(null);
  }, []);

  return { costRef, addCost, resetCost };
}
