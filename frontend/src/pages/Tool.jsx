import React, { useState } from 'react';
import FileUpload from '../components/FileUpload';
import ProfileTable from '../components/ProfileTable';
import CleaningControls from '../components/CleaningControls';
import CleaningSummary from '../components/CleaningSummary';
import DownloadBar from '../components/DownloadBar';
import { uploadFile, getSuggestions, applyClean, resetSession, errorMessage } from '../api';

export default function Tool() {
  const [sessionId, setSessionId] = useState(null);
  const [filename, setFilename] = useState('');
  const [profile, setProfile] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [config, setConfig] = useState({ dropDuplicates: false, normalizeColumnNames: false, dateColumn: null, groupColumn: null, perColumn: {} });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (file) => {
    setLoading(true);
    setError(null);
    try {
      const data = await uploadFile(file);
      setSessionId(data.sessionId);
      setFilename(data.filename);
      setProfile(data.profile);
      setResult(null);
      setConfig({ dropDuplicates: false, normalizeColumnNames: false, dateColumn: data.profile.dateColumns[0] || null, groupColumn: null, perColumn: {} });
      const s = await getSuggestions(data.sessionId);
      setSuggestions(s);
      const perColumn = {};
      for (const sug of s) {
        perColumn[sug.column] = { missingStrategy: sug.missingStrategy };
      }
      setConfig((prev) => ({ ...prev, perColumn }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      const r = await applyClean(sessionId, config);
      setResult(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setApplying(false);
    }
  };

  const handleStartOver = async () => {
    if (sessionId) await resetSession(sessionId).catch(() => {});
    setSessionId(null);
    setFilename('');
    setProfile(null);
    setSuggestions(null);
    setResult(null);
    setConfig({ dropDuplicates: false, normalizeColumnNames: false, dateColumn: null, groupColumn: null, perColumn: {} });
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {sessionId && (
        <div className="flex justify-end">
          <button onClick={handleStartOver} className="text-sm font-semibold rounded-lg border px-3 py-1.5 text-[var(--text-secondary)]" style={{ borderColor: 'var(--border-color-strong)' }}>
            Start over
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#FCA5A5', background: '#FEF2F2', color: '#991B1B' }}>
          {error}
        </div>
      )}

      {!sessionId && <FileUpload onUpload={handleUpload} loading={loading} />}

      {sessionId && profile && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">File: <span className="font-medium text-[var(--text-primary)]">{filename}</span></p>
          </div>

          <ProfileTable profile={profile} title="Original Data Profile" />

          <CleaningControls profile={profile} suggestions={suggestions} config={config} setConfig={setConfig} />

          <div className="flex items-center gap-3">
            <button
              onClick={handleApply}
              disabled={applying}
              className="text-sm font-semibold rounded-lg px-5 py-2.5 text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {applying ? 'Applying…' : '✓ Apply Cleaning'}
            </button>
            {result && <p className="text-sm text-[var(--text-secondary)]">Re-run anytime with different options — cleaning always starts fresh from the original upload.</p>}
          </div>

          {result && (
            <>
              <CleaningSummary result={result} />
              <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--border-color)', background: 'var(--card-bg)' }}>
                <h3 className="font-semibold text-[var(--text-primary)] mb-3">Download</h3>
                <DownloadBar sessionId={sessionId} config={config} hasResult={!!result} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
