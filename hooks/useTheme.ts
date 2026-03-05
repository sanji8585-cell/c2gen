import { useState, useEffect, useCallback } from 'react';
import { CONFIG } from '../config';

type Theme = 'light' | 'dark';

const STORAGE_KEY = CONFIG.STORAGE_KEYS.THEME;

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('theme-transition');
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, theme);
    // 트랜지션 후 클래스 제거 (성능)
    const timer = setTimeout(() => root.classList.remove('theme-transition'), 350);
    return () => clearTimeout(timer);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
