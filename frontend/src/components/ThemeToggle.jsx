import React from 'react';

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label="Toggle theme"
      className="w-9 h-9 rounded-lg border flex items-center justify-center text-base"
      style={{ borderColor: 'var(--border-color-strong)', background: 'var(--card-bg)' }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
