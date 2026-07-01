import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'imphnen-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  const transitioning = root.classList.contains('theme-transitioning');
  if (!transitioning) root.classList.add('theme-transitioning');
  root.dataset.theme = resolved;
  if (!transitioning) {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-transitioning')));
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  });
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  const setTheme = useCallback((t: Theme) => { setThemeState(t); localStorage.setItem(STORAGE_KEY, t); }, []);
  const toggle = useCallback(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'), [resolvedTheme, setTheme]);
  useEffect(() => { applyTheme(resolvedTheme); }, [resolvedTheme]);
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(getSystemTheme());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);
  return { theme, setTheme, resolvedTheme, toggle };
}
