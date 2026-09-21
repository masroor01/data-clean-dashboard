import { useEffect, useState } from 'react';

function getInitialTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage unavailable -- fall through to system default
  }
  return 'system';
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    try {
      if (theme === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', theme);
    } catch {
      // ignore -- per-viewer convenience only
    }
  }, [theme]);

  const toggle = () => {
    setTheme((prev) => {
      const isDark = prev === 'dark' || (prev === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      return isDark ? 'light' : 'dark';
    });
  };

  return { theme, toggle };
}
