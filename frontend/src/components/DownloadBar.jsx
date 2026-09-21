import React from 'react';
import { downloadUrl } from '../api';

export default function DownloadBar({ sessionId, config, hasResult }) {
  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={downloadUrl(sessionId, 'csv')}
        className="text-sm font-semibold rounded-lg px-4 py-2 text-white"
        style={{ background: hasResult ? 'var(--brand)' : 'var(--text-muted)', pointerEvents: hasResult ? 'auto' : 'none' }}
      >
        ⬇ Download cleaned CSV
      </a>
      <a
        href={downloadUrl(sessionId, 'report')}
        className="text-sm font-semibold rounded-lg border px-4 py-2 text-[var(--text-primary)]"
        style={{ borderColor: 'var(--border-color-strong)', background: 'var(--card-bg)' }}
      >
        ⬇ Download cleaning report (.txt)
      </a>
      <a
        href={downloadUrl(sessionId, 'recipe', config)}
        className="text-sm font-semibold rounded-lg border px-4 py-2 text-[var(--text-primary)]"
        style={{ borderColor: 'var(--border-color-strong)', background: 'var(--card-bg)' }}
      >
        ⬇ Download recipe (.json)
      </a>
    </div>
  );
}
