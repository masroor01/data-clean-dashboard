import React from 'react';

const MISSING_OPTIONS = {
  numeric: [
    { value: 'none_needed', label: 'No missing values' },
    { value: 'median', label: 'Fill with column median' },
    { value: 'mean', label: 'Fill with column mean' },
    { value: 'group_median', label: 'Gap-aware (interpolate short gaps, group/period median for medium gaps, leave long gaps)' },
    { value: 'leave', label: 'Leave as missing' },
  ],
  categorical: [
    { value: 'none_needed', label: 'No missing values' },
    { value: 'mode', label: 'Fill with most common value' },
    { value: 'leave', label: 'Leave as missing' },
  ],
  boolean: [
    { value: 'none_needed', label: 'No missing values' },
    { value: 'mode', label: 'Fill with most common value' },
    { value: 'leave', label: 'Leave as missing' },
  ],
  date: [{ value: 'leave', label: 'Leave as missing' }],
  text: [{ value: 'leave', label: 'Leave as missing' }],
  empty: [{ value: 'leave', label: 'Leave as missing' }],
};

// Must match backend/src/engine.js's MAX_FUZZY_UNIQUE (pairwise comparison
// is O(k^2) there -- keeping the same cap here avoids offering an option
// that would just fail server-side).
const MAX_FUZZY_UNIQUE = 5000;

function ColumnRow({ col, suggestion, config, onChange, dateColumns, hasDateColumn }) {
  const options = MISSING_OPTIONS[col.type] || MISSING_OPTIONS.text;
  const hasMissing = col.nMissing > 0;
  const hasOutlierSuggestion = col.type === 'numeric' && col.suggestedOutlierBounds;
  const fuzzyEligible = (col.type === 'categorical' || col.type === 'text') && col.uniqueCount > 1;
  const fuzzyTooManyUnique = col.uniqueCount > MAX_FUZZY_UNIQUE;
  const outlierMethod = config.outlierMethod || 'iqr';

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-start py-3 border-b last:border-0" style={{ borderColor: 'var(--border-color)' }}>
      <div>
        <p className="font-medium text-[var(--text-primary)] text-sm">{col.name}</p>
        <p className="text-xs text-[var(--text-muted)]">{col.type}{hasMissing ? ` · ${col.pctMissing}% missing` : ''}</p>
      </div>

      <div className="flex flex-col gap-2">
        {hasMissing && (
          <select
            value={config.missingStrategy || suggestion?.missingStrategy || 'leave'}
            onChange={(e) => onChange({ ...config, missingStrategy: e.target.value })}
            className="text-sm rounded-lg border px-2.5 py-1.5 bg-[var(--card-bg)] text-[var(--text-primary)] w-full max-w-md"
            style={{ borderColor: 'var(--border-color-strong)' }}
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {config.missingStrategy === 'group_median' && dateColumns.length > 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            Uses the date column and group column selected above.
          </p>
        )}

        {fuzzyEligible && (
          <div className="flex flex-col gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={!!config.fuzzyDedup}
                disabled={fuzzyTooManyUnique}
                onChange={(e) => onChange({ ...config, fuzzyDedup: e.target.checked ? { threshold: config.fuzzyDedup?.threshold ?? 0.85 } : undefined })}
              />
              Merge near-duplicate values ({col.uniqueCount.toLocaleString()} unique) — e.g. "Apple Inc." / "Apple"
            </label>
            {fuzzyTooManyUnique && (
              <p className="text-xs text-amber-600">Too many unique values ({col.uniqueCount.toLocaleString()}) for fuzzy matching — max {MAX_FUZZY_UNIQUE.toLocaleString()}.</p>
            )}
            {config.fuzzyDedup && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[var(--text-muted)]">Similarity threshold:</span>
                <input
                  type="range" min="0.6" max="0.98" step="0.01"
                  value={config.fuzzyDedup.threshold ?? 0.85}
                  onChange={(e) => onChange({ ...config, fuzzyDedup: { threshold: Number(e.target.value) } })}
                  className="w-32"
                />
                <span className="font-mono text-[var(--text-secondary)]">{(config.fuzzyDedup.threshold ?? 0.85).toFixed(2)}</span>
                <span className="text-[var(--text-muted)]">(higher = stricter, merges less)</span>
              </div>
            )}
          </div>
        )}

        {hasOutlierSuggestion && (
          <div className="flex flex-col gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={config.outlierAction === 'flag'}
                onChange={(e) => onChange({
                  ...config,
                  outlierAction: e.target.checked ? 'flag' : 'none_needed',
                  outlierMethod: config.outlierMethod || 'iqr',
                  outlierBounds: col.suggestedOutlierBounds,
                })}
              />
              Flag outliers for review
            </label>

            {config.outlierAction === 'flag' && hasDateColumn && (
              <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                <label className="flex items-center gap-1">
                  <input type="radio" name={`outlier-method-${col.name}`} checked={outlierMethod === 'iqr'}
                    onChange={() => onChange({ ...config, outlierMethod: 'iqr', outlierBounds: config.outlierBounds || col.suggestedOutlierBounds })} />
                  Fixed IQR fence
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name={`outlier-method-${col.name}`} checked={outlierMethod === 'rolling_zscore'}
                    onChange={() => onChange({ ...config, outlierMethod: 'rolling_zscore' })} />
                  Rolling Z-score (adapts to trend over time)
                </label>
              </div>
            )}

            {config.outlierAction === 'flag' && outlierMethod === 'iqr' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[var(--text-muted)]">
                  {col.outlierCount} value(s) outside bounds (suggested via IQR):
                </span>
                <input
                  type="number"
                  value={config.outlierBounds?.low ?? col.suggestedOutlierBounds.low}
                  onChange={(e) => onChange({ ...config, outlierBounds: { ...config.outlierBounds, low: Number(e.target.value) } })}
                  className="w-24 rounded border px-1.5 py-0.5 bg-[var(--card-bg)]"
                  style={{ borderColor: 'var(--border-color-strong)' }}
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.outlierBounds?.high ?? col.suggestedOutlierBounds.high}
                  onChange={(e) => onChange({ ...config, outlierBounds: { ...config.outlierBounds, high: Number(e.target.value) } })}
                  className="w-24 rounded border px-1.5 py-0.5 bg-[var(--card-bg)]"
                  style={{ borderColor: 'var(--border-color-strong)' }}
                />
              </div>
            )}

            {config.outlierAction === 'flag' && outlierMethod === 'rolling_zscore' && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[var(--text-muted)]">Window:</span>
                <input
                  type="number" min="3" max="52"
                  value={config.rollingWindow ?? 8}
                  onChange={(e) => onChange({ ...config, rollingWindow: Number(e.target.value) })}
                  className="w-16 rounded border px-1.5 py-0.5 bg-[var(--card-bg)]"
                  style={{ borderColor: 'var(--border-color-strong)' }}
                />
                <span className="text-[var(--text-muted)]">periods</span>
                <span className="text-[var(--text-muted)] ml-2">Z threshold:</span>
                <input
                  type="number" min="1" max="10" step="0.5"
                  value={config.zThreshold ?? 3}
                  onChange={(e) => onChange({ ...config, zThreshold: Number(e.target.value) })}
                  className="w-16 rounded border px-1.5 py-0.5 bg-[var(--card-bg)]"
                  style={{ borderColor: 'var(--border-color-strong)' }}
                />
                <span className="text-[var(--text-muted)]">Uses the date/group column selected above; flag count shown after applying.</span>
              </div>
            )}
          </div>
        )}

        {!hasMissing && !hasOutlierSuggestion && !fuzzyEligible && <p className="text-xs text-[var(--text-muted)]">Nothing to clean.</p>}
      </div>
      <div />
    </div>
  );
}

export default function CleaningControls({ profile, suggestions, config, setConfig }) {
  const dateColumns = profile.dateColumns || [];
  const hasDateColumn = !!config.dateColumn;
  const updateColumn = (name, colConfig) => {
    setConfig((prev) => ({ ...prev, perColumn: { ...prev.perColumn, [name]: colConfig } }));
  };

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
      <h3 className="font-semibold text-[var(--text-primary)] mb-4">Cleaning Options</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 pb-5 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={!!config.dropDuplicates} onChange={(e) => setConfig((p) => ({ ...p, dropDuplicates: e.target.checked }))} />
          Drop exact duplicate rows ({profile.duplicateRowCount} found)
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <input type="checkbox" checked={!!config.normalizeColumnNames} onChange={(e) => setConfig((p) => ({ ...p, normalizeColumnNames: e.target.checked }))} />
          Normalize column names (lowercase, underscores)
        </label>

        {dateColumns.length > 0 && (
          <>
            <div>
              <label className="text-sm text-[var(--text-primary)] block mb-1">Date column (for gap-aware fill / rolling outliers)</label>
              <select
                value={config.dateColumn || ''}
                onChange={(e) => setConfig((p) => ({ ...p, dateColumn: e.target.value || null }))}
                className="text-sm rounded-lg border px-2.5 py-1.5 bg-[var(--card-bg)] text-[var(--text-primary)] w-full"
                style={{ borderColor: 'var(--border-color-strong)' }}
              >
                <option value="">(none)</option>
                {dateColumns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--text-primary)] block mb-1">Group column (optional — e.g. a market/category ID)</label>
              <select
                value={config.groupColumn || ''}
                onChange={(e) => setConfig((p) => ({ ...p, groupColumn: e.target.value || null }))}
                className="text-sm rounded-lg border px-2.5 py-1.5 bg-[var(--card-bg)] text-[var(--text-primary)] w-full"
                style={{ borderColor: 'var(--border-color-strong)' }}
              >
                <option value="">(none — treat as one series)</option>
                {profile.columns.filter((c) => c.type === 'categorical').map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      <div>
        {profile.columns.map((col) => (
          <ColumnRow
            key={col.name}
            col={col}
            suggestion={suggestions?.find((s) => s.column === col.name)}
            config={config.perColumn?.[col.name] || {}}
            onChange={(c) => updateColumn(col.name, c)}
            dateColumns={dateColumns}
            hasDateColumn={hasDateColumn}
          />
        ))}
      </div>
    </div>
  );
}
