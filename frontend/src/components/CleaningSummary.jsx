import React from 'react';

export default function CleaningSummary({ result }) {
  if (!result) return null;
  const { profileBefore, profileAfter, log, rowCountBefore, rowCountAfter } = result;
  const missingBefore = profileBefore.columns.reduce((s, c) => s + c.nMissing, 0);
  const missingAfter = profileAfter.columns.reduce((s, c) => s + c.nMissing, 0);

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
      <h3 className="font-semibold text-[var(--text-primary)] mb-4">Result</h3>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Stat label="Rows" before={rowCountBefore} after={rowCountAfter} />
        <Stat label="Columns" before={profileBefore.nColumns} after={profileAfter.nColumns} />
        <Stat label="Missing cells" before={missingBefore} after={missingAfter} lowerIsBetter />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1.5">Changes applied</p>
        {log.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No changes applied yet — configure options above and click "Apply Cleaning".</p>
        ) : (
          <ul className="text-sm text-[var(--text-secondary)] space-y-1 list-disc list-inside">
            {log.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, before, after, lowerIsBetter }) {
  const changed = before !== after;
  const good = lowerIsBetter ? after < before : after !== before;
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: 'var(--bg-app-alt)' }}>
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-1">{label}</p>
      <p className="font-mono text-lg font-semibold text-[var(--text-primary)]">
        {before.toLocaleString()} {changed && <span className={good ? 'text-emerald-600' : 'text-[var(--text-secondary)]'}>→ {after.toLocaleString()}</span>}
      </p>
    </div>
  );
}
