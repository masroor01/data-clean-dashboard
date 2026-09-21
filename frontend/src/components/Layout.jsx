import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../useTheme';

const navLinkStyle = ({ isActive }) => ({
  color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
  fontWeight: isActive ? 600 : 500,
});

export default function Layout() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-app)' }}>
      <header className="border-b px-6 py-4" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: 'var(--brand)' }}>🧹</span>
            <div>
              <h1 className="font-bold text-[var(--text-primary)] leading-none">Data Clean Dashboard</h1>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Upload a CSV, profile it, clean it, download it — no data leaves this server.</p>
            </div>
          </Link>

          <div className="flex items-center gap-5">
            <nav className="hidden sm:flex items-center gap-5 text-sm">
              <NavLink to="/" end style={navLinkStyle}>Home</NavLink>
              <NavLink to="/tool" style={navLinkStyle}>Clean my data</NavLink>
              <NavLink to="/about" style={navLinkStyle}>About</NavLink>
            </nav>
            <ThemeToggle theme={theme} onToggle={toggle} />
          </div>
        </div>
        <nav className="sm:hidden max-w-5xl mx-auto flex items-center gap-4 text-sm mt-3">
          <NavLink to="/" end style={navLinkStyle}>Home</NavLink>
          <NavLink to="/tool" style={navLinkStyle}>Clean my data</NavLink>
          <NavLink to="/about" style={navLinkStyle}>About</NavLink>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="max-w-5xl mx-auto w-full px-6 py-6 text-xs text-[var(--text-muted)]">
        Implements the generic, dataset-agnostic techniques from the TOP Digital Twin project's data pipelines
        (gap-aware imputation, missingness flags, IQR outlier suggestion) — not a literal reuse of that project's
        domain-specific parsing/thresholds, which don't generalize to arbitrary data.
      </footer>
    </div>
  );
}
