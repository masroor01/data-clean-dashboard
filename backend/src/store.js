// In-memory session store -- no accounts, no persistence, matches the
// tool's scope (upload -> clean -> download, one sitting). A session holds
// the ORIGINAL parsed data (untouched, so cleaning can always be re-run
// from scratch with different choices) and the CURRENT cleaned state.
import crypto from 'crypto';
import { SESSION_TTL_MS } from './config.js';

const sessions = new Map();

export function createSession({ rows, columns, filename }) {
  const id = crypto.randomBytes(12).toString('hex');
  const now = Date.now();
  sessions.set(id, {
    id, filename, createdAt: now, expiresAt: now + SESSION_TTL_MS,
    original: { rows, columns },
    current: { rows, columns },
    log: [],
  });
  return id;
}

export function getSession(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(id); return null; }
  return s;
}

export function updateSessionCurrent(id, { rows, columns, log }) {
  const s = getSession(id);
  if (!s) return null;
  s.current = { rows, columns };
  s.log = log;
  return s;
}

export function resetSessionToOriginal(id) {
  const s = getSession(id);
  if (!s) return null;
  s.current = { rows: s.original.rows, columns: s.original.columns };
  s.log = [];
  return s;
}

// Periodic cleanup so an abandoned session doesn't sit in memory forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now > s.expiresAt) sessions.delete(id);
}, 10 * 60 * 1000).unref();
