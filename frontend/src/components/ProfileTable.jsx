import React from 'react';

export const TYPE_BADGE = {
  numeric: { label: 'numeric', color: '#2563EB' },
  categorical: { label: 'categorical', color: '#7C3AED' },
  boolean: { label: 'boolean', color: '#059669' },
  date: { label: 'date', color: '#D97706' },
  text: { label: 'text', color: '#64748B' },
  empty: { label: 'empty', color: '#DC2626' },
};

export default function ProfileTable({ profile, title = 'Column Profile' }) {
  if (!profile) return null;
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
        <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          {profile.nRows.toLocaleString()} rows &times; {profile.nColumns} columns
          {profile.duplicateRowCount > 0 && (
            <span className="ml-2 text-amber-600">· {profile.duplicateRowCount} duplicate row(s)</span>
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-secondary)] border-b" style={{ borderColor: 'var(--border-color)' }}>
              <th className="px-4 py-2 font-medium">Column</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Missing</th>
              <th className="px-4 py-2 font-medium">Unique</th>
              <th className="px-4 py-2 font-medium">Outliers</th>
              <th className="px-4 py-2 font-medium">Sample values</th>
            </tr>
          </thead>
          <tbody>
            {profile.columns.map((col) => {
              const badge = TYPE_BADGE[col.type] || TYPE_BADGE.text;
              return (
                <tr key={col.name} className="border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
                  <td className="px-4 py-2 font-medium text-[var(--text-primary)]">{col.name}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: `${badge.color}1A`, color: badge.color }}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">
                    {col.nMissing > 0 ? <span className="text-amber-600 font-medium">{col.pctMissing}%</span> : '—'}
                  </td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{col.uniqueCount.toLocaleString()}</td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">
                    {col.outlierCount > 0 ? <span className="text-red-600 font-medium">{col.outlierCount}</span> : '—'}
                  </td>
                  <td className="px-4 py-2 text-[var(--text-muted)] font-mono text-xs truncate max-w-[220px]">
                    {col.sample.join(', ') || '(none)'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
