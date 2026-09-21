import React from 'react';
import { Link } from 'react-router-dom';

const FEATURES = [
  {
    icon: '🔍',
    title: 'Automatic profiling',
    body: 'Column types, missing %, duplicates, and outlier candidates — detected the moment you upload.',
  },
  {
    icon: '🧩',
    title: 'Gap-aware imputation',
    body: 'Short gaps get interpolated, medium gaps use a group/period median, long gaps are left missing and flagged — never fabricated.',
  },
  {
    icon: '🏷️',
    title: 'Missingness flags',
    body: 'Every filled value gets a companion flag column, so cleaned data never looks indistinguishable from what was actually observed.',
  },
  {
    icon: '📐',
    title: 'Editable outlier suggestions',
    body: 'IQR-based bounds are suggested, never auto-applied — you review and adjust before anything is flagged.',
  },
];

export default function Home() {
  return (
    <div>
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mb-4">
          Clean tabular data, without giving up control
        </h2>
        <p className="text-base sm:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-8">
          Upload a CSV, see exactly what's missing or unusual, choose how to handle it, and download the
          result — plus a report and a recipe you can re-apply. No data ever leaves this server, and
          nothing is cleaned without your say-so.
        </p>
        <Link
          to="/tool"
          className="inline-block text-sm font-semibold rounded-lg px-6 py-3 text-white"
          style={{ background: 'var(--brand)' }}
        >
          Clean my data →
        </Link>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border p-5" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
              <div className="text-2xl mb-2">{f.icon}</div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-1">{f.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="rounded-2xl border p-6" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-app-alt)' }}>
          <h3 className="font-semibold text-[var(--text-primary)] mb-2">What this tool is (and isn't)</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            These are the generic, dataset-agnostic cleaning techniques — type inference, gap-aware
            imputation, deduplication, IQR outlier suggestions. It doesn't know your domain, so it will
            never assert that a value is "wrong" — only flag what's missing or statistically unusual and
            let you decide. See the <Link to="/about" className="underline" style={{ color: 'var(--accent)' }}>About page</Link> for the full scope and limitations.
          </p>
        </div>
      </section>
    </div>
  );
}
