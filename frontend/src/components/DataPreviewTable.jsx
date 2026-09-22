import React from 'react';
import { TYPE_BADGE } from './ProfileTable';

function cellDisplay(v) {
  if (v === null || v === undefined || v === '') return <span className="text-[var(--text-muted)]">—</span>;
  return String(v);
}

export default function DataPreviewTable({ preview, profile, loading }) {
  if (loading) {
    return (
      <div className="rounded-2xl border p-10 text-center text-sm text-[var(--text-muted)]" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
        Loading preview…
      </div>
    );
  }
  if (!preview || !preview.rows.length) {
    return (
      <div className="rounded-2xl border p-10 text-center text-sm text-[var(--text-muted)]" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
        No rows to preview.
      </div>
    );
  }

  const typeByCol = {};
  (profile?.columns || []).forEach((c) => { typeByCol[c.name] = c.type; });
  const flagCols = new Set(preview.columns.filter((c) => c.endsWith('_was_missing') || c.endsWith('_outlier_flag')));

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
        <h3 className="font-semibold text-[var(--text-primary)]">Data Preview</h3>
        <p className="text-xs text-[var(--text-muted)]">Showing first {preview.rows.length.toLocaleString()} row(s)</p>
      </div>
      <div className="overflow-auto max-h-[480px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0" style={{ background: 'var(--bg-app-alt)' }}>
            <tr className="text-left border-b" style={{ borderColor: 'var(--border-color)' }}>
              <th className="px-3 py-2 font-medium text-[var(--text-muted)] sticky left-0" style={{ background: 'var(--bg-app-alt)' }}>#</th>
              {preview.columns.map((c) => {
                const badge = TYPE_BADGE[typeByCol[c]] || null;
                return (
                  <th key={c} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: flagCols.has(c) ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    <div className="flex items-center gap-1.5">
                      <span>{c}</span>
                      {badge && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${badge.color}1A`, color: badge.color }}>{badge.label}</span>}
                      {flagCols.has(c) && <span className="text-[9px] italic">flag</span>}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-[var(--bg-app-alt)]" style={{ borderColor: 'var(--border-color)' }}>
                <td className="px-3 py-1.5 text-[var(--text-muted)] font-mono sticky left-0" style={{ background: 'var(--card-bg)' }}>{i + 1}</td>
                {preview.columns.map((c) => (
                  <td key={c} className="px-3 py-1.5 whitespace-nowrap font-mono" style={{ color: flagCols.has(c) ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                    {cellDisplay(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
