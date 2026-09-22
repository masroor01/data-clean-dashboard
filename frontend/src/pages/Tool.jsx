import React, { useState } from 'react';
import FileUpload from '../components/FileUpload';
import ProfileTable from '../components/ProfileTable';
import CleaningControls from '../components/CleaningControls';
import CleaningSummary from '../components/CleaningSummary';
import DownloadBar from '../components/DownloadBar';
import TechniqueGuide from '../components/TechniqueGuide';
import DataPreviewTable from '../components/DataPreviewTable';
import Tabs from '../components/Tabs';
import { uploadFile, getSuggestions, applyClean, resetSession, getPreview, errorMessage } from '../api';

const EMPTY_CONFIG = { dropDuplicates: false, normalizeColumnNames: false, dateColumn: null, groupColumn: null, perColumn: {} };

export default function Tool() {
  const [sessionId, setSessionId] = useState(null);
  const [filename, setFilename] = useState('');
  const [profile, setProfile] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [originalPreview, setOriginalPreview] = useState(null);
  const [cleanedPreview, setCleanedPreview] = useState(null);
  const [previewMode, setPreviewMode] = useState('cleaned'); // 'original' | 'cleaned'
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleUpload = async (file) => {
    setLoading(true);
    setError(null);
    try {
      const data = await uploadFile(file);
      setSessionId(data.sessionId);
      setFilename(data.filename);
      setProfile(data.profile);
      setResult(null);
      setCleanedPreview(null);
      setPreviewMode('original');
      setTab('overview');
      setConfig({ ...EMPTY_CONFIG, dateColumn: data.profile.dateColumns[0] || null });
      const s = await getSuggestions(data.sessionId);
      setSuggestions(s);
      const perColumn = {};
      for (const sug of s) perColumn[sug.column] = { missingStrategy: sug.missingStrategy };
      setConfig((prev) => ({ ...prev, perColumn }));

      setPreviewLoading(true);
      const p = await getPreview(data.sessionId);
      setOriginalPreview(p);
      setPreviewLoading(false);
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
      setPreviewLoading(true);
      const p = await getPreview(sessionId);
      setCleanedPreview(p);
      setPreviewMode('cleaned');
      setPreviewLoading(false);
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
    setConfig(EMPTY_CONFIG);
    setOriginalPreview(null);
    setCleanedPreview(null);
    setTab('overview');
  };

  const activePreview = previewMode === 'cleaned' && cleanedPreview ? cleanedPreview : originalPreview;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--brand) 15%, transparent)' }}>📄</span>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{filename}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {profile.nRows.toLocaleString()} rows · {profile.nColumns} columns
                  {profile.duplicateRowCount > 0 && <span className="text-amber-600"> · {profile.duplicateRowCount} duplicate row(s)</span>}
                </p>
              </div>
            </div>
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: 'overview', label: 'Overview', icon: '📊' },
                { key: 'clean', label: 'Clean', icon: '🧹' },
                { key: 'preview', label: 'Preview', icon: '👁️' },
              ]}
            />
          </div>

          {tab === 'overview' && (
            <ProfileTable profile={profile} title="Data Profile" />
          )}

          {tab === 'clean' && (
            <>
              <TechniqueGuide profile={profile} />
              <CleaningControls profile={profile} suggestions={suggestions} config={config} setConfig={setConfig} />

              <div className="flex items-center gap-3">
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="text-sm font-semibold rounded-lg px-5 py-2.5 text-white disabled:opacity-50 transition-transform active:scale-[0.98]"
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

          {tab === 'preview' && (
            <>
              {cleanedPreview && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewMode('original')}
                    className="text-sm font-medium px-3 py-1.5 rounded-lg border"
                    style={previewMode === 'original'
                      ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                      : { borderColor: 'var(--border-color-strong)', color: 'var(--text-secondary)' }}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setPreviewMode('cleaned')}
                    className="text-sm font-medium px-3 py-1.5 rounded-lg border"
                    style={previewMode === 'cleaned'
                      ? { background: 'var(--brand)', color: '#fff', borderColor: 'var(--brand)' }
                      : { borderColor: 'var(--border-color-strong)', color: 'var(--text-secondary)' }}
                  >
                    Cleaned
                  </button>
                </div>
              )}
              <DataPreviewTable preview={activePreview} profile={profile} loading={previewLoading} />
            </>
          )}
        </>
      )}
    </div>
  );
}
