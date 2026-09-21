import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { buildRouter } from './routes.js';
import { PORT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// This is a public, no-account tool that accepts file uploads -- rate
// limit generously but firmly, same convention as TOP Digital Twin's
// backend (mirrors web/backend/src/server.js).
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

app.use('/api', buildRouter());

const FRONTEND_DIST = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  console.warn(`[server] ${FRONTEND_DIST} not found -- run "npm run build" in frontend/ first. API-only mode.`);
}

// Multer/JSON-parse errors (oversized upload, malformed body) land here
// rather than crashing the process or falling through to the SPA catch-all.
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large.' });
  }
  if (err) {
    console.error('[server] unhandled error:', err.message);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`[server] Data Clean Dashboard backend listening on http://localhost:${PORT}`);
});
