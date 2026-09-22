import React from 'react';

export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl p-1 w-fit" style={{ background: 'var(--bg-app-alt)' }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors"
            style={isActive
              ? { background: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
              : { color: 'var(--text-secondary)' }}
          >
            {t.icon && <span>{t.icon}</span>}
            {t.label}
            {t.badge !== undefined && t.badge !== null && (
              <span
                className="text-[10px] font-semibold px-1.5 rounded-full"
                style={{ background: isActive ? 'var(--brand)' : 'var(--border-color-strong)', color: isActive ? '#fff' : 'var(--text-secondary)' }}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
