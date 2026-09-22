import React from 'react';

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
      <h3 className="font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
      <div className="text-sm text-[var(--text-secondary)] space-y-2">{children}</div>
    </div>
  );
}

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">About this tool</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Data Clean Dashboard packages the generic, dataset-agnostic cleaning techniques used in the
          TOP Digital Twin agricultural price-forecasting project, so anyone can apply the same discipline
          to their own tabular data — without needing that project's domain-specific pipeline.
        </p>
      </div>

      <Section title="What it does">
        <ul className="list-disc list-inside space-y-1">
          <li>Infers column types (numeric, categorical, boolean, date, text) from the uploaded data.</li>
          <li>Profiles missingness, duplicates, and unique counts per column.</li>
          <li>Suggests outlier bounds via the standard 1.5×IQR rule, or a rolling Z-score against a
            trailing window when a date column is set (adapts to a trend/level shift over time instead
            of one fixed global fence) — always editable, never auto-applied.</li>
          <li>Fills missing values with gap-length-aware logic: short gaps are linearly interpolated,
            medium gaps use a same-group/same-period median, long gaps are left missing on purpose —
            or via KNN, filling from the average of the k most similar rows (by every other numeric
            column), which picks up multivariate structure a single-column median or mean can't see.</li>
          <li>Merges near-duplicate text values within a column (e.g. "Apple Inc." / "Apple" /
            "APPLE INC" → one canonical label) using a combination of edit-distance and token-overlap
            similarity, so both typos and abbreviation/subset variants get caught.</li>
          <li>Adds a <code>_was_missing</code> flag column for every value it fills, so a cleaned dataset
            never hides which numbers were real and which were imputed.</li>
          <li>Lets you download the cleaned CSV, a plain-text report of every change made, and a JSON
            "recipe" of the exact configuration used, so cleaning is reproducible.</li>
        </ul>
      </Section>

      <Section title="What it deliberately doesn't do">
        <p>
          The hard part of TOP Digital Twin's own data cleaning was domain knowledge — knowing that a
          rainfall value of 0mm for three straight weeks in a monsoon month is suspicious, or that a
          price outlier at a specific market on a specific date maps to a known supply shock. None of
          that generalizes to an arbitrary uploaded file, so this tool doesn't attempt it. It only
          applies structural, statistical logic that holds regardless of what your columns actually mean.
        </p>
        <p>
          It also doesn't support Excel files. The most common Node library for reading <code>.xlsx</code>{' '}
          has unpatched high-severity vulnerabilities (prototype pollution, ReDoS), and this tool accepts
          uploads from anyone — so Excel support was dropped rather than shipped insecurely. Export to
          CSV first.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          Uploaded files are held in memory only, per browser session, and expire automatically after
          2 hours of inactivity. Nothing is written to disk, logged, or shared with any other session.
          Closing the tab or starting over discards the data immediately.
        </p>
      </Section>

      <Section title="Origin">
        <p>
          Built as a spin-off of the{' '}
          <a href="https://topdigitaltwin.micskuast.in" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>
            TOP Digital Twin
          </a>{' '}
          project at SKUAST-Kashmir, which forecasts vegetable prices using satellite, climate, and
          policy data layers. The cleaning logic here mirrors that project's own preprocessing scripts,
          generalized for arbitrary tabular data.
        </p>
      </Section>
    </div>
  );
}
