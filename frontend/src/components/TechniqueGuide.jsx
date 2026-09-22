import React, { useState } from 'react';

// Static catalogue of every technique the engine implements, with the
// eligibility check computed live against the uploaded file's own profile
// -- "available" isn't a fixed label, it reflects whether THIS dataset
// actually has what the technique needs (e.g. a date column, enough
// numeric columns to compute similarity from).
const CATEGORIES = [
  {
    key: 'missing',
    label: 'Missing values',
    icon: '🧩',
    techniques: [
      {
        name: 'Median / Mean fill',
        detail: 'Fills gaps in a numeric column with its overall median or mean. Simple, fast, ignores any structure in the data.',
        eligible: (p) => p.columns.some((c) => c.type === 'numeric' && c.nMissing > 0),
        need: 'A numeric column with missing values.',
      },
      {
        name: 'Gap-aware fill',
        detail: 'Short gaps are linearly interpolated, medium gaps filled from the same group/period\'s median, long gaps deliberately left missing rather than fabricated.',
        eligible: (p) => p.dateColumns.length > 0 && p.columns.some((c) => c.type === 'numeric' && c.nMissing > 0),
        need: 'A date column + a numeric column with missing values.',
      },
      {
        name: 'KNN fill',
        detail: 'Fills each missing value from the average of its k most similar rows, judged by every other numeric column — picks up multivariate structure a single-column fill can\'t see.',
        eligible: (p) => p.columns.filter((c) => c.type === 'numeric').length >= 2 && p.columns.some((c) => c.type === 'numeric' && c.nMissing > 0),
        need: 'At least 2 numeric columns (one to fill, one to compare against).',
      },
      {
        name: 'Mode fill',
        detail: 'Fills gaps in a categorical or boolean column with its single most common value.',
        eligible: (p) => p.columns.some((c) => (c.type === 'categorical' || c.type === 'boolean') && c.nMissing > 0),
        need: 'A categorical/boolean column with missing values.',
      },
    ],
  },
  {
    key: 'duplicates',
    label: 'Duplicates',
    icon: '🔁',
    techniques: [
      {
        name: 'Exact row dedup',
        detail: 'Drops rows that are byte-identical across every column.',
        eligible: (p) => p.duplicateRowCount > 0,
        need: 'At least one exact duplicate row.',
      },
      {
        name: 'Fuzzy value dedup',
        detail: 'Merges near-duplicate text VALUES within a column (e.g. "Apple Inc." / "Apple" / "APPLE INC") into one canonical label, combining edit-distance and token-overlap similarity.',
        eligible: (p) => p.columns.some((c) => (c.type === 'categorical' || c.type === 'text') && c.uniqueCount > 1),
        need: 'A categorical/text column with more than one unique value.',
      },
    ],
  },
  {
    key: 'outliers',
    label: 'Outliers',
    icon: '📐',
    techniques: [
      {
        name: 'IQR fence',
        detail: 'Flags values outside 1.5× the interquartile range — the standard, distribution-agnostic default. Always a suggestion you can adjust, never auto-applied.',
        eligible: (p) => p.columns.some((c) => c.type === 'numeric' && c.suggestedOutlierBounds),
        need: 'A numeric column.',
      },
      {
        name: 'Rolling Z-score',
        detail: 'Flags values that deviate from a trailing window\'s own mean/std, so it adapts to a trend or level shift over time instead of one fixed global fence.',
        eligible: (p) => p.dateColumns.length > 0 && p.columns.some((c) => c.type === 'numeric'),
        need: 'A date column + a numeric column.',
      },
      {
        name: 'Isolation Forest',
        detail: 'Flags a ROW as anomalous based on how easily it separates from the rest of the dataset across several numeric columns at once — catches joint anomalies that look normal in any single column checked alone (e.g. an unusual combination of otherwise-ordinary values).',
        eligible: (p) => p.columns.filter((c) => c.type === 'numeric').length >= 2,
        need: 'At least 2 numeric columns.',
      },
    ],
  },
  {
    key: 'format',
    label: 'Formatting',
    icon: '🏷️',
    techniques: [
      {
        name: 'Column name normalization',
        detail: 'Lowercases column names and replaces spaces/punctuation with underscores, for a predictable schema downstream.',
        eligible: () => true,
        need: 'Always available.',
      },
      {
        name: 'Numeric format normalization',
        detail: 'Strips currency symbols, thousands commas, %, and accounting-style parentheses-negatives down to plain numbers (e.g. "($1,234.56)" → -1234.56). Also fixes type detection so formatted numeric columns unlock the other numeric techniques in the first place.',
        eligible: (p) => p.columns.some((c) => c.type === 'numeric' && c.hasNumericFormatting),
        need: 'A numeric column with detected currency/%/comma formatting.',
      },
    ],
  },
];

function TechniqueCard({ t, eligible }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="text-left w-full rounded-xl border p-3 transition-colors"
      style={{
        borderColor: eligible ? 'var(--border-color-strong)' : 'var(--border-color)',
        background: eligible ? 'var(--card-bg)' : 'var(--bg-app-alt)',
        opacity: eligible ? 1 : 0.65,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">{t.name}</span>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={eligible
            ? { background: 'color-mix(in srgb, var(--brand) 15%, transparent)', color: 'var(--brand)' }
            : { background: 'var(--border-color)', color: 'var(--text-muted)' }}
        >
          {eligible ? 'Available' : 'Needs more'}
        </span>
      </div>
      {open && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-[var(--text-secondary)]">{t.detail}</p>
          {!eligible && <p className="text-xs italic text-[var(--text-muted)]">Requires: {t.need}</p>}
        </div>
      )}
    </button>
  );
}

export default function TechniqueGuide({ profile }) {
  if (!profile) return null;
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-[var(--text-primary)]">Techniques available for this file</h3>
      </div>
      <p className="text-xs text-[var(--text-muted)] mb-4">
        Tap a card for details. "Available" means your uploaded file has what that technique needs — pick the ones that fit below, per column.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CATEGORIES.map((cat) => (
          <div key={cat.key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
              <span>{cat.icon}</span> {cat.label}
            </p>
            <div className="space-y-2">
              {cat.techniques.map((t) => (
                <TechniqueCard key={t.name} t={t} eligible={t.eligible(profile)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
